#requires -Version 7.0

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Ingest = [IO.Path]::GetFullPath(
    (Join-Path $PSScriptRoot '..\scripts\ingest-log.ps1')
)
$Manage = [IO.Path]::GetFullPath(
    (Join-Path $PSScriptRoot '..\scripts\manage-experience.ps1')
)
$TempRoot = Join-Path ([IO.Path]::GetTempPath()) (
    'kb-exp-reg-' + [guid]::NewGuid().ToString('N')
)

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "ASSERT: $Message" }
}

function Expect-Failure([scriptblock]$Action, [string]$Message) {
    $failed = $false
    try { & $Action } catch { $failed = $true }
    Assert-True $failed $Message
}

function New-Scenario([string]$Name) {
    $dir = Join-Path $TempRoot $Name

    [IO.Directory]::CreateDirectory(
        (Join-Path $dir 'assets\log')
    ) | Out-Null
    [IO.Directory]::CreateDirectory(
        (Join-Path $dir 'assets\state')
    ) | Out-Null

    $initial = [ordered]@{
        schema_version = 2
        processed_logs = @()
        experiences = @()
    }

    [IO.File]::WriteAllText(
        (Join-Path $dir 'assets\state\experience-index.json'),
        ($initial | ConvertTo-Json -Depth 8),
        [Text.UTF8Encoding]::new($false)
    )

    return $dir
}

function Write-ExpLog(
    [string]$Dir,
    [string]$Name,
    [string]$Task,
    [string]$Outcome
) {
    $payload = [ordered]@{
        time = '2026-08-16T00:00:00+09:00'
        task = $Task
        unit = 'U-ONE'
        result = 'pass'
        check = 'regression'
        meta = @([ordered]@{
            scope = 'reg'
            cause = 'same-cause'
            action = 'reg-action'
            outcome = $Outcome
        })
    }

    $json = $payload | ConvertTo-Json -Depth 6 -Compress

    [IO.File]::WriteAllText(
        (Join-Path $Dir "assets\log\$Name"),
        $json,
        [Text.UTF8Encoding]::new($false)
    )
}

function Ingest([string]$Dir, [string]$Name) {
    & $Ingest -Workspace $Dir -LogPath ("assets/log/$Name") | Out-Null
}

function Read-Index([string]$Dir) {
    return [IO.File]::ReadAllText(
        (Join-Path $Dir 'assets\state\experience-index.json'),
        [Text.UTF8Encoding]::new($false)
    ) | ConvertFrom-Json
}

function Manage([string]$Dir, [hashtable]$Arguments) {
    & $Manage -Workspace $Dir @Arguments | Out-Null
}

function Publish-TwoSupportExperience([string]$Dir) {
    # 两个不同 task 的支持日志 → active + promotion_ready，然后 Approve 发布。
    Write-ExpLog $Dir '20260816_000000001.log' 'T-1' 'resolved'
    Ingest $Dir '20260816_000000001.log'
    Write-ExpLog $Dir '20260816_000000002.log' 'T-2' 'resolved'
    Ingest $Dir '20260816_000000002.log'

    $index = Read-Index $Dir
    $entry = $index.experiences[0]

    Assert-True ($entry.status -eq 'active') 'two different tasks must activate'
    Assert-True ([bool]$entry.promotion_ready) 'active uncodified must be promotion_ready'

    Manage $Dir @{
        Action = 'Approve'
        ExperienceId = $entry.id
        Text = 'regression published experience'
    }

    Assert-True (
        Test-Path -LiteralPath (
            Join-Path $Dir '.clinerules\Experience.md'
        ) -PathType Leaf
    ) 'Approve must publish to .clinerules/Experience.md'
    Assert-True (
        -not (Test-Path -LiteralPath (
            Join-Path $Dir '.agents\skills\experience\EXPERIENCE.md'
        ))
    ) 'Approve must not create the retired publication path'

    return $entry.id
}

try {
    # 场景 0a：fresh-schema2-pending-is-read-only
    $dir = New-Scenario 'fresh-schema2-pending'
    $indexPath = Join-Path $dir 'assets\state\experience-index.json'
    $beforePending = [IO.File]::ReadAllText(
        $indexPath,
        [Text.UTF8Encoding]::new($false)
    )
    $pending = & $Manage -Workspace $dir -Action Pending |
        ConvertFrom-Json
    $afterPending = [IO.File]::ReadAllText(
        $indexPath,
        [Text.UTF8Encoding]::new($false)
    )

    Assert-True (
        @($pending.promotion_ready).Count -eq 0 -and
        @($pending.review_required).Count -eq 0
    ) 'fresh schema-2 Pending must return empty queues'
    Assert-True (
        $beforePending -ceq $afterPending
    ) 'schema-2 Pending must not mutate the index'

    # 场景 0b：schema1-pending-migrates-without-a-log
    $dir = New-Scenario 'schema1-pending-migration'
    $indexPath = Join-Path $dir 'assets\state\experience-index.json'
    $legacy = [ordered]@{
        schema_version = 1
        processed_logs = @(
            'assets/log/legacy-1.log',
            'assets/log/legacy-2.log'
        )
        experiences = @([ordered]@{
            id = 'exp-123456789abc'
            scope = 'reg'
            cause = 'legacy-cause'
            action = 'legacy-action'
            evidence = @(
                [ordered]@{
                    source = 'assets/log/legacy-1.log'
                    task = 'T-1'
                    unit = 'U-ONE'
                    time = '2026-08-16T00:00:00+09:00'
                    relation = 'support'
                    outcome = 'success'
                },
                [ordered]@{
                    source = 'assets/log/legacy-2.log'
                    task = 'T-2'
                    unit = 'U-ONE'
                    time = '2026-08-16T00:00:01+09:00'
                    relation = 'support'
                    outcome = 'success'
                }
            )
        })
    }

    [IO.File]::WriteAllText(
        $indexPath,
        ($legacy | ConvertTo-Json -Depth 12),
        [Text.UTF8Encoding]::new($false)
    )

    $pending = & $Manage -Workspace $dir -Action Pending |
        ConvertFrom-Json
    $index = Read-Index $dir
    $entry = $index.experiences[0]

    Assert-True (
        $index.schema_version -eq 2
    ) 'schema-1 Pending must atomically migrate the index to schema 2'
    Assert-True (
        $entry.status -eq 'active' -and
        [bool]$entry.promotion_ready
    ) 'schema-1 Pending migration must recompute derived state'
    Assert-True (
        @($entry.evidence | Where-Object outcome -eq 'resolved').Count -eq 2
    ) 'schema-1 Pending migration must normalize legacy outcomes'
    Assert-True (
        @($pending.promotion_ready).Count -eq 1
    ) 'schema-1 Pending must return migrated pending candidates'

    # 场景 1：same-task-two-supports
    # 同 task 的两条支持日志不构成独立来源，不得 promotion。
    $dir = New-Scenario 'same-task'
    Write-ExpLog $dir '20260816_000000001.log' 'T-1' 'resolved'
    Ingest $dir '20260816_000000001.log'
    Write-ExpLog $dir '20260816_000000002.log' 'T-1' 'resolved'
    Ingest $dir '20260816_000000002.log'

    $index = Read-Index $dir
    $entry = $index.experiences[0]

    Assert-True ($entry.seen -eq 2) 'same task two logs must derive seen=2'
    Assert-True ($entry.independent_sources -eq 1) 'same task two logs must derive one independent source'
    Assert-True ($entry.status -eq 'candidate') 'same task two supports must stay candidate'
    Assert-True (-not [bool]$entry.promotion_ready) 'same task experience must not be promotion-ready'

    # 场景 2：different-task-two-supports
    # 两个不同 task 的支持日志构成独立来源，允许 promotion。
    $dir = New-Scenario 'different-task'
    Write-ExpLog $dir '20260816_000000001.log' 'T-1' 'resolved'
    Ingest $dir '20260816_000000001.log'
    Write-ExpLog $dir '20260816_000000002.log' 'T-2' 'resolved'
    Ingest $dir '20260816_000000002.log'

    $index = Read-Index $dir
    $entry = $index.experiences[0]

    Assert-True ($entry.independent_sources -eq 2) 'two different tasks must derive two independent sources'
    Assert-True ($entry.status -eq 'active') 'two different task supports must activate'
    Assert-True ([bool]$entry.promotion_ready) 'two different task supports must be promotion-ready'

    # 场景 3：keep-consumes-known-contradiction
    # Keep 把人工审查水位线推进到当前 evidence 数后，
    # 已看过的反例不得反复触发 review_required。
    $dir = New-Scenario 'keep-consumes'
    $id = Publish-TwoSupportExperience $dir

    Write-ExpLog $dir '20260816_000000003.log' 'T-3' 'failed'
    Ingest $dir '20260816_000000003.log'

    $index = Read-Index $dir
    $entry = $index.experiences[0]
    Assert-True ([bool]$entry.review_required) 'new contradict on published experience must require review'

    Manage $dir @{ Action = 'Keep'; ExperienceId = $id }

    $index = Read-Index $dir
    $entry = $index.experiences[0]
    Assert-True (-not [bool]$entry.review_required) 'Keep must clear the review flag'
    Assert-True ($entry.reviewed_evidence_count -eq 3) 'Keep must advance reviewed_evidence_count to evidence count'

    Write-ExpLog $dir '20260816_000000004.log' 'T-4' 'resolved'
    Ingest $dir '20260816_000000004.log'

    $index = Read-Index $dir
    $entry = $index.experiences[0]
    Assert-True (-not [bool]$entry.review_required) 'Keep must consume the known counterexample'

    # 场景 4：contradiction-after-keep
    # Keep 之后出现的新反例必须重新触发 review。
    $dir = New-Scenario 'contradiction-after-keep'
    $id = Publish-TwoSupportExperience $dir

    Write-ExpLog $dir '20260816_000000003.log' 'T-3' 'failed'
    Ingest $dir '20260816_000000003.log'
    Manage $dir @{ Action = 'Keep'; ExperienceId = $id }

    Write-ExpLog $dir '20260816_000000005.log' 'T-5' 'failed'
    Ingest $dir '20260816_000000005.log'

    $index = Read-Index $dir
    $entry = $index.experiences[0]
    Assert-True ([bool]$entry.review_required) 'fresh counterexample after Keep must re-trigger review'

    # 场景 5：retired-never-repromotes
    # Retire 后即使后续 evidence 重新满足 active，
    # 也不能再次 promotion。
    $dir = New-Scenario 'retired'
    $id = Publish-TwoSupportExperience $dir

    Manage $dir @{ Action = 'Retire'; ExperienceId = $id; Reason = 'superseded' }

    $index = Read-Index $dir
    $entry = $index.experiences[0]
    Assert-True ([bool]$entry.retired) 'Retire must mark the entry retired'
    Assert-True (
        [string]::IsNullOrWhiteSpace([string]$entry.codified_into)
    ) 'Retire must clear codified_into'

    Write-ExpLog $dir '20260816_000000003.log' 'T-3' 'resolved'
    Ingest $dir '20260816_000000003.log'

    $index = Read-Index $dir
    $entry = $index.experiences[0]
    Assert-True ($entry.status -eq 'active') 'evidence alone would satisfy active'
    Assert-True (-not [bool]$entry.promotion_ready) 'retired experience must never re-promote'

    # 场景 6：failed-lock-acquisition-does-not-delete-owner-lock
    # 锁竞争失败者不得删除锁持有者的锁（token 校验兜底）。
    $dir = New-Scenario 'lock-competition'
    $lockPath = Join-Path $dir 'assets\state\experience.lock'
    $proc = Get-Process -Id $PID

    $ownerLock = [ordered]@{
        token = 'owner-lock-token'
        pid = $PID
        process_started_at = $proc.StartTime.ToString('o')
        created_at = [DateTimeOffset]::Now.ToString('o')
    }

    [IO.File]::WriteAllText(
        $lockPath,
        ($ownerLock | ConvertTo-Json -Compress),
        [Text.UTF8Encoding]::new($false)
    )

    Write-ExpLog $dir '20260816_000000001.log' 'T-1' 'resolved'

    Expect-Failure {
        & $Ingest -Workspace $dir -LogPath 'assets/log/20260816_000000001.log' | Out-Null
    } 'ingest must fail while another process holds the lock'

    Assert-True (
        Test-Path -LiteralPath $lockPath -PathType Leaf
    ) 'ingest failure must not delete the owner lock'

    $after = (
        [IO.File]::ReadAllText(
            $lockPath,
            [Text.UTF8Encoding]::new($false)
        ) | ConvertFrom-Json
    )
    Assert-True (
        [string]$after.token -eq 'owner-lock-token'
    ) 'ingest failure must not alter the owner lock token'

    Expect-Failure {
        & $Manage -Workspace $dir -Action Pending | Out-Null
    } 'manage must fail while another process holds the lock'

    Assert-True (
        Test-Path -LiteralPath $lockPath -PathType Leaf
    ) 'manage failure must not delete the owner lock'

    $after = (
        [IO.File]::ReadAllText(
            $lockPath,
            [Text.UTF8Encoding]::new($false)
        ) | ConvertFrom-Json
    )
    Assert-True (
        [string]$after.token -eq 'owner-lock-token'
    ) 'manage failure must not alter the owner lock token'

    'PASS experience-regression'
} finally {
    $resolvedTemp = [IO.Path]::GetFullPath($TempRoot)
    $systemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())

    if (
        $resolvedTemp.StartsWith(
            $systemTemp,
            [StringComparison]::OrdinalIgnoreCase
        ) -and
        (Split-Path $resolvedTemp -Leaf) -like 'kb-exp-reg-*'
    ) {
        Remove-Item `
            -LiteralPath $resolvedTemp `
            -Recurse `
            -Force `
            -ErrorAction SilentlyContinue
    }
}
