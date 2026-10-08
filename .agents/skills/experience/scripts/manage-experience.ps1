#requires -Version 7.0

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet(
        'Pending',
        'Approve',
        'Keep',
        'Revise',
        'Retire'
    )]
    [string]$Action,

    [string]$ExperienceId,

    # Approve / Revise 时写入 EXPERIENCE.md 的单句经验。
    [string]$Text,

    # Revise 时如果用户同时确认了新的稳定 action key，可显式提供。
    [string]$ActionKey,

    # Retire 时建议填写。
    [string]$Reason,

    [string]$Workspace
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

if ($Workspace) {
    $Root = [IO.Path]::GetFullPath($Workspace)
} else {
    $Root = [IO.Path]::GetFullPath(
        (Join-Path $PSScriptRoot '..\..\..\..')
    )
}

$StateDir = Join-Path $Root 'assets\state'
$IndexPath = Join-Path $StateDir 'experience-index.json'
$LogDir = Join-Path $Root 'assets\log'

$ExperienceDir = Join-Path $Root '.clinerules'
$ExperiencePath = Join-Path $ExperienceDir 'Experience.md'
# 与 ingest-log.ps1 共用同一把锁，
# 防止 ingestion 和人工审批同时修改 experience state。
$LockPath = Join-Path $StateDir 'experience.lock'

$SupportedSchemaVersion = 2
$MachineKeyPattern = '^[a-z0-9][a-z0-9._/-]*$'

$SupportOutcomes = @('resolved', 'improved', 'avoided')
$ContradictOutcomes = @('failed', 'worse', 'invalid')
$ObservationOutcomes = @('observed')
$AllowedOutcomes = @(
    $SupportOutcomes +
    $ContradictOutcomes +
    $ObservationOutcomes
)

$ManagedStart = '<!-- experience-managed:start -->'
$ManagedEnd   = '<!-- experience-managed:end -->'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Add-MissingProperty {
    param(
        [Parameter(Mandatory)]
        [object]$Object,

        [Parameter(Mandatory)]
        [string]$Name,

        $Value
    )

    if ($null -eq $Object.PSObject.Properties[$Name]) {
        $Object |
            Add-Member `
                -NotePropertyName $Name `
                -NotePropertyValue $Value
    }
}

function Normalize-MachineKey {
    param(
        [Parameter(Mandatory)]
        [string]$Value,

        [Parameter(Mandatory)]
        [string]$FieldName
    )

    $normalized = $Value.Trim().ToLowerInvariant()

    if ([string]::IsNullOrWhiteSpace($normalized)) {
        throw "$FieldName must not be empty."
    }

    if ($normalized -notmatch $MachineKeyPattern) {
        throw (
            "$FieldName must be a stable lowercase machine key " +
            "matching $MachineKeyPattern; got '$Value'."
        )
    }

    return $normalized
}

function Get-RelationFromOutcome {
    param(
        [Parameter(Mandatory)]
        [string]$Outcome
    )

    if ($Outcome -in $SupportOutcomes) {
        return 'support'
    }

    if ($Outcome -in $ContradictOutcomes) {
        return 'contradict'
    }

    if ($Outcome -in $ObservationOutcomes) {
        return 'observation'
    }

    throw "Unsupported outcome '$Outcome'."
}

function Read-LogIdentity {
    param(
        [Parameter(Mandatory)]
        [string]$Source
    )

    if ($Source -notmatch '^assets/log/(?<name>[^/\\]+\.log)$') {
        return $null
    }

    $candidate = Join-Path $LogDir $Matches['name']

    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        return $null
    }

    try {
        $sourceLines = @(
            [IO.File]::ReadAllLines(
                $candidate,
                [Text.UTF8Encoding]::new($false)
            ) |
                Where-Object { $_.Trim() }
        )

        if ($sourceLines.Count -ne 1) {
            return $null
        }

        $sourceRecord = $sourceLines[0] | ConvertFrom-Json

        if (
            $null -eq $sourceRecord.PSObject.Properties['task'] -or
            $null -eq $sourceRecord.PSObject.Properties['unit']
        ) {
            return $null
        }

        return [pscustomobject]@{
            task = ([string]$sourceRecord.task).Trim()
            unit = ([string]$sourceRecord.unit).Trim()
        }
    } catch {
        return $null
    }
}

function Update-DerivedFields {
    param(
        [Parameter(Mandatory)]
        [object]$Entry,

        [bool]$ActionConflict = $false
    )

    Add-MissingProperty $Entry 'independent_sources' 0
    Add-MissingProperty $Entry 'review_required' $false
    Add-MissingProperty $Entry 'codified_into' $null

    $Entry.seen = @(
        $Entry.evidence |
            Where-Object {
                -not [string]::IsNullOrWhiteSpace([string]$_.source)
            } |
            Select-Object -ExpandProperty source -Unique
    ).Count

    $Entry.independent_sources = @(
        $Entry.evidence |
            Where-Object {
                -not [string]::IsNullOrWhiteSpace([string]$_.task)
            } |
            Select-Object -ExpandProperty task -Unique
    ).Count

    $Entry.support = @(
        $Entry.evidence | Where-Object relation -eq 'support'
    ).Count

    $Entry.contradict = @(
        $Entry.evidence | Where-Object relation -eq 'contradict'
    ).Count

    $hasCodifiedExperience = -not [string]::IsNullOrWhiteSpace(
        [string]$Entry.codified_into
    )

    $hasEvidenceConflict = (
        $Entry.support -gt 0 -and
        $Entry.contradict -gt 0
    )

    if ($ActionConflict -or $hasEvidenceConflict) {
        $Entry.status = 'contested'
    } elseif ($Entry.contradict -gt 0) {
        $Entry.status = 'contested'
    } elseif (
        $Entry.independent_sources -ge 2 -and
        $Entry.support -ge 1 -and
        $Entry.contradict -eq 0
    ) {
        $Entry.status = 'active'
    } else {
        $Entry.status = 'candidate'
    }

    Add-MissingProperty $Entry 'reviewed_evidence_count' 0
    Add-MissingProperty $Entry 'retired' $false

    $reviewedCount = [int]$Entry.reviewed_evidence_count

    if ($reviewedCount -lt 0) {
        $reviewedCount = 0
    }

    $allEvidence = @($Entry.evidence)

    if ($reviewedCount -gt $allEvidence.Count) {
        $reviewedCount = 0
    }

    $newEvidence = @(
        $allEvidence | Select-Object -Skip $reviewedCount
    )

    $newContradiction = (
        @($newEvidence | Where-Object relation -eq 'contradict').Count -gt 0
    )

    $newActionConflict = (
        @(
            $newEvidence |
                Where-Object {
                    -not [string]::IsNullOrWhiteSpace([string]$_.action) -and
                    [string]$_.action -ne [string]$Entry.action
                }
        ).Count -gt 0
    )

    if (
        $hasCodifiedExperience -and
        ($newContradiction -or $newActionConflict)
    ) {
        $Entry.review_required = $true
    }

    $Entry.promotion_ready = (
        $Entry.status -eq 'active' -and
        -not $hasCodifiedExperience -and
        -not $Entry.review_required -and
        -not $Entry.retired
    )
}

function Convert-IndexV1ToV2 {
    param(
        [Parameter(Mandatory)]
        [object]$Index
    )

    $migratedExperiences =
        [Collections.Generic.List[object]]::new()

    foreach ($oldEntry in @($Index.experiences)) {
        Add-MissingProperty $oldEntry 'status' 'candidate'
        Add-MissingProperty $oldEntry 'tier' 'cold'
        Add-MissingProperty $oldEntry 'seen' 0
        Add-MissingProperty $oldEntry 'support' 0
        Add-MissingProperty $oldEntry 'contradict' 0
        Add-MissingProperty $oldEntry 'promotion_ready' $false
        Add-MissingProperty $oldEntry 'codified_into' $null
        Add-MissingProperty $oldEntry 'review_required' $false
        Add-MissingProperty $oldEntry 'independent_sources' 0
        Add-MissingProperty $oldEntry 'reviewed_at' $null
        Add-MissingProperty $oldEntry 'reviewed_evidence_count' 0
        Add-MissingProperty $oldEntry 'published_text' $null
        Add-MissingProperty $oldEntry 'published_at' $null
        Add-MissingProperty $oldEntry 'published_order' $null
        Add-MissingProperty $oldEntry 'retired' $false
        Add-MissingProperty $oldEntry 'retired_at' $null
        Add-MissingProperty $oldEntry 'retire_reason' $null

        $scope = Normalize-MachineKey `
            -Value ([string]$oldEntry.scope) `
            -FieldName 'scope'
        $cause = Normalize-MachineKey `
            -Value ([string]$oldEntry.cause) `
            -FieldName 'cause'
        $action = Normalize-MachineKey `
            -Value ([string]$oldEntry.action) `
            -FieldName 'action'

        $oldEntry.scope = $scope
        $oldEntry.cause = $cause
        $oldEntry.action = $action

        $evidenceList = [Collections.Generic.List[object]]::new()

        foreach ($oldEvidence in @($oldEntry.evidence)) {
            Add-MissingProperty $oldEvidence 'task' $null
            Add-MissingProperty $oldEvidence 'unit' $null
            Add-MissingProperty $oldEvidence 'action' $action

            if (
                [string]::IsNullOrWhiteSpace([string]$oldEvidence.task) -or
                [string]::IsNullOrWhiteSpace([string]$oldEvidence.unit)
            ) {
                $identity = Read-LogIdentity `
                    -Source ([string]$oldEvidence.source)

                if ($identity) {
                    $oldEvidence.task = $identity.task
                    $oldEvidence.unit = $identity.unit
                }
            }

            if (
                -not [string]::IsNullOrWhiteSpace(
                    [string]$oldEvidence.outcome
                )
            ) {
                $oldOutcome = (
                    [string]$oldEvidence.outcome
                ).Trim().ToLowerInvariant()

                switch ($oldOutcome) {
                    'success' { $oldOutcome = 'resolved' }
                    'contradicted' { $oldOutcome = 'invalid' }
                }

                if ($oldOutcome -notin $AllowedOutcomes) {
                    $oldOutcome = 'observed'
                }

                $oldEvidence.outcome = $oldOutcome
                $oldEvidence.relation =
                    Get-RelationFromOutcome -Outcome $oldOutcome
            }

            $evidenceList.Add($oldEvidence)
        }

        $oldEntry.evidence = $evidenceList

        $actionConflict = (
            @(
                $oldEntry.evidence |
                    Where-Object {
                        -not [string]::IsNullOrWhiteSpace([string]$_.action)
                    } |
                    Select-Object -ExpandProperty action -Unique
            ).Count -gt 1
        )

        Update-DerivedFields `
            -Entry $oldEntry `
            -ActionConflict $actionConflict

        $migratedExperiences.Add($oldEntry)
    }

    return [pscustomobject][ordered]@{
        schema_version = 2
        processed_logs = @($Index.processed_logs)
        experiences = @($migratedExperiences)
    }
}

function Write-IndexAtomic {
    param(
        [Parameter(Mandatory)]
        [object]$Value
    )

    $json = $Value | ConvertTo-Json -Depth 16
    $tempPath = $IndexPath + '.tmp.' + [guid]::NewGuid().ToString('N')

    try {
        [IO.File]::WriteAllText(
            $tempPath,
            $json,
            [Text.UTF8Encoding]::new($false)
        )

        Move-Item `
            -LiteralPath $tempPath `
            -Destination $IndexPath `
            -Force
    } finally {
        if (Test-Path -LiteralPath $tempPath) {
            Remove-Item -LiteralPath $tempPath -Force
        }
    }
}

function Validate-PublishedText {
    param(
        [Parameter(Mandatory)]
        [string]$Value
    )

    $normalized = $Value.Trim()

    if ([string]::IsNullOrWhiteSpace($normalized)) {
        throw 'Published experience text must not be empty.'
    }

    if ($normalized -match '[\r\n]') {
        throw (
            'Published experience must be one concise line. ' +
            'Do not include line breaks.'
        )
    }

    if ($normalized.Length -gt 500) {
        throw (
            'Published experience is too long. ' +
            'Keep it at or below 500 characters.'
        )
    }

    if (
        $normalized.Contains($ManagedStart) -or
        $normalized.Contains($ManagedEnd) -or
        $normalized -match '<!--\s*experience:'
    ) {
        throw 'Published experience contains reserved management markers.'
    }

    return $normalized
}

function Clear-StaleLock {
    if (
        -not (Test-Path -LiteralPath $LockPath -PathType Leaf)
    ) {
        return
    }

    $stale = $false

    try {
        $old = (
            [IO.File]::ReadAllText(
                $LockPath,
                [Text.UTF8Encoding]::new($false)
            ) |
                ConvertFrom-Json
        )

        if (-not $old.pid) {
            $stale = $true
        } else {
            $proc = Get-Process `
                -Id ([int]$old.pid) `
                -ErrorAction SilentlyContinue

            if (-not $proc) {
                $stale = $true
            } else {
                $startProp =
                    $old.PSObject.Properties['process_started_at']

                if (
                    $startProp -and
                    -not [string]::IsNullOrWhiteSpace(
                        [string]$startProp.Value
                    )
                ) {
                    try {
                        $recorded = [DateTimeOffset]::Parse(
                            [string]$startProp.Value
                        )

                        if (
                            [Math]::Abs(
                                (
                                    $recorded -
                                    $proc.StartTime
                                ).TotalSeconds
                            ) -gt 2
                        ) {
                            $stale = $true
                        }
                    } catch {
                        # PID 仍存活但启动时间无法可靠解析时，
                        # 不冒险删除锁。
                        $stale = $false
                    }
                }
            }
        }
    } catch {
        $stale = $true
    }

    if ($stale) {
        Remove-Item -LiteralPath $LockPath -Force
    }
}

function Load-Index {
    if (-not (Test-Path -LiteralPath $IndexPath -PathType Leaf)) {
        throw "Experience index not found: $IndexPath"
    }

    try {
        $index = (
            [IO.File]::ReadAllText(
                $IndexPath,
                [Text.UTF8Encoding]::new($false)
            ) |
                ConvertFrom-Json
        )
    } catch {
        throw "Experience index contains invalid JSON: $IndexPath"
    }

    if ($null -eq $index.PSObject.Properties['schema_version']) {
        throw 'Experience index is missing schema_version.'
    }

    Add-MissingProperty $index 'processed_logs' @()
    Add-MissingProperty $index 'experiences' @()

    if ($index.schema_version -eq 1) {
        $index = Convert-IndexV1ToV2 -Index $index
        Write-IndexAtomic -Value $index
    } elseif ($index.schema_version -ne $SupportedSchemaVersion) {
        throw (
            "Unsupported experience schema: " +
            "$($index.schema_version)."
        )
    }

    foreach ($entry in @($index.experiences)) {
        Add-MissingProperty $entry 'promotion_ready' $false
        Add-MissingProperty $entry 'review_required' $false
        Add-MissingProperty $entry 'codified_into' $null

        Add-MissingProperty $entry 'published_text' $null
        Add-MissingProperty $entry 'published_at' $null
        Add-MissingProperty $entry 'published_order' $null

        Add-MissingProperty $entry 'reviewed_at' $null
        Add-MissingProperty $entry 'reviewed_evidence_count' 0

        Add-MissingProperty $entry 'retired' $false
        Add-MissingProperty $entry 'retired_at' $null
        Add-MissingProperty $entry 'retire_reason' $null
    }

    return $index
}

function Get-Entry {
    param(
        [Parameter(Mandatory)]
        [object]$Index,

        [Parameter(Mandatory)]
        [string]$Id
    )

    $matches = @(
        $Index.experiences |
            Where-Object id -eq $Id
    )

    if ($matches.Count -eq 0) {
        throw "Experience not found: $Id"
    }

    if ($matches.Count -gt 1) {
        throw "Duplicate experience id in index: $Id"
    }

    return $matches[0]
}

function Get-NextPublishedOrder {
    param(
        [Parameter(Mandatory)]
        [object]$Index
    )

    $orders = @(
        $Index.experiences |
            Where-Object {
                $null -ne $_.published_order
            } |
            ForEach-Object {
                [int]$_.published_order
            }
    )

    if ($orders.Count -eq 0) {
        return 1
    }

    return (
        ($orders | Measure-Object -Maximum).Maximum + 1
    )
}

function Get-ManagedSection {
    param(
        [Parameter(Mandatory)]
        [object]$Index
    )

    $published = @(
        $Index.experiences |
            Where-Object {
                -not $_.retired -and
                -not [string]::IsNullOrWhiteSpace(
                    [string]$_.codified_into
                ) -and
                -not [string]::IsNullOrWhiteSpace(
                    [string]$_.published_text
                )
            } |
            Sort-Object `
                @{ Expression = {
                    if ($null -eq $_.published_order) {
                        [int]::MaxValue
                    } else {
                        [int]$_.published_order
                    }
                }},
                @{ Expression = { [string]$_.id }}
    )

    $lines = [Collections.Generic.List[string]]::new()

    $lines.Add($ManagedStart)
    $lines.Add(
        '<!-- Managed by manage-experience.ps1 after explicit user approval. -->'
    )

    if ($published.Count -eq 0) {
        $lines.Add('')
        $lines.Add('_暂无已确认常用经验。_')
    } else {
        foreach ($entry in $published) {
            $text = ([string]$entry.published_text).Trim()

            $lines.Add(
                "- $text <!-- experience:$($entry.id) -->"
            )
        }
    }

    $lines.Add($ManagedEnd)

    return ($lines -join [Environment]::NewLine)
}

function Get-NewExperienceDocument {
    param(
        [Parameter(Mandatory)]
        [object]$Index
    )

    $managed = Get-ManagedSection -Index $Index

    if (
        Test-Path -LiteralPath $ExperiencePath -PathType Leaf
    ) {
        $current = [IO.File]::ReadAllText(
            $ExperiencePath,
            [Text.UTF8Encoding]::new($false)
        )
    } else {
        $current = @"
# 常用经验

本文件只保存经用户明确确认的少量跨任务经验。
"@
    }

    $startIndex = $current.IndexOf(
        $ManagedStart,
        [StringComparison]::Ordinal
    )

    $endIndex = $current.IndexOf(
        $ManagedEnd,
        [StringComparison]::Ordinal
    )

    if ($startIndex -ge 0 -and $endIndex -lt 0) {
        throw (
            'EXPERIENCE.md contains the managed start marker ' +
            'but not the matching end marker.'
        )
    }

    if ($startIndex -lt 0 -and $endIndex -ge 0) {
        throw (
            'EXPERIENCE.md contains the managed end marker ' +
            'but not the matching start marker.'
        )
    }

    if ($startIndex -ge 0 -and $endIndex -ge 0) {
        if ($endIndex -lt $startIndex) {
            throw 'EXPERIENCE.md managed markers are reversed.'
        }

        $afterEnd =
            $endIndex + $ManagedEnd.Length

        $before = $current.Substring(
            0,
            $startIndex
        ).TrimEnd()

        $after = $current.Substring(
            $afterEnd
        ).TrimStart()

        $parts = [Collections.Generic.List[string]]::new()

        if (-not [string]::IsNullOrWhiteSpace($before)) {
            $parts.Add($before)
        }

        $parts.Add($managed)

        if (-not [string]::IsNullOrWhiteSpace($after)) {
            $parts.Add($after)
        }

        return (
            ($parts -join (
                [Environment]::NewLine +
                [Environment]::NewLine
            )).TrimEnd() +
            [Environment]::NewLine
        )
    }

    return (
        $current.TrimEnd() +
        [Environment]::NewLine +
        [Environment]::NewLine +
        $managed +
        [Environment]::NewLine
    )
}

function Write-TextTemp {
    param(
        [Parameter(Mandatory)]
        [string]$Destination,

        [Parameter(Mandatory)]
        [string]$Content
    )

    $directory = Split-Path -Parent $Destination

    [IO.Directory]::CreateDirectory($directory) |
        Out-Null

    $temp = (
        $Destination +
        '.tmp.' +
        [guid]::NewGuid().ToString('N')
    )

    [IO.File]::WriteAllText(
        $temp,
        $Content,
        [Text.UTF8Encoding]::new($false)
    )

    return $temp
}

function Commit-State {
    param(
        [Parameter(Mandatory)]
        [object]$Index
    )

    $indexJson = (
        $Index |
            ConvertTo-Json -Depth 20
    )

    $experienceText =
        Get-NewExperienceDocument -Index $Index

    $indexTemp = $null
    $experienceTemp = $null

    $indexBackup = $null
    $experienceBackup = $null

    $experienceExistedBefore =
        Test-Path -LiteralPath $ExperiencePath -PathType Leaf

    $indexExistedBefore =
        Test-Path -LiteralPath $IndexPath -PathType Leaf

    try {
        $indexTemp = Write-TextTemp `
            -Destination $IndexPath `
            -Content $indexJson

        $experienceTemp = Write-TextTemp `
            -Destination $ExperiencePath `
            -Content $experienceText

        if (Test-Path -LiteralPath $IndexPath) {
            $indexBackup = (
                $IndexPath +
                '.bak.' +
                [guid]::NewGuid().ToString('N')
            )

            Copy-Item `
                -LiteralPath $IndexPath `
                -Destination $indexBackup
        }

        if (Test-Path -LiteralPath $ExperiencePath) {
            $experienceBackup = (
                $ExperiencePath +
                '.bak.' +
                [guid]::NewGuid().ToString('N')
            )

            Copy-Item `
                -LiteralPath $ExperiencePath `
                -Destination $experienceBackup
        }

        # EXPERIENCE.md 由 index 当前状态重新渲染。
        # 两个文件都已先写入 temp，再进行最终替换。
        Move-Item `
            -LiteralPath $experienceTemp `
            -Destination $ExperiencePath `
            -Force

        $experienceTemp = $null

        Move-Item `
            -LiteralPath $indexTemp `
            -Destination $IndexPath `
            -Force

        $indexTemp = $null
    } catch {
        # 尽最大努力恢复两个文件到操作前状态。
        if (
            $experienceBackup -and
            (Test-Path -LiteralPath $experienceBackup)
        ) {
            Copy-Item `
                -LiteralPath $experienceBackup `
                -Destination $ExperiencePath `
                -Force
        } elseif (
            -not $experienceExistedBefore -and
            (Test-Path -LiteralPath $ExperiencePath -PathType Leaf)
        ) {
            # 操作前文件不存在：回滚必须删除本次新创建的文件。
            Remove-Item `
                -LiteralPath $ExperiencePath `
                -Force `
                -ErrorAction SilentlyContinue
        }

        if (
            $indexBackup -and
            (Test-Path -LiteralPath $indexBackup)
        ) {
            Copy-Item `
                -LiteralPath $indexBackup `
                -Destination $IndexPath `
                -Force
        } elseif (
            -not $indexExistedBefore -and
            (Test-Path -LiteralPath $IndexPath -PathType Leaf)
        ) {
            Remove-Item `
                -LiteralPath $IndexPath `
                -Force `
                -ErrorAction SilentlyContinue
        }

        throw
    } finally {
        foreach ($path in @(
            $indexTemp,
            $experienceTemp,
            $indexBackup,
            $experienceBackup
        )) {
            if (
                $path -and
                (Test-Path -LiteralPath $path)
            ) {
                Remove-Item `
                    -LiteralPath $path `
                    -Force `
                    -ErrorAction SilentlyContinue
            }
        }
    }
}

function Get-PendingResult {
    param(
        [Parameter(Mandatory)]
        [object]$Index
    )

    $promotion = @(
        $Index.experiences |
            Where-Object {
                $_.promotion_ready -and
                -not $_.retired
            } |
            Sort-Object id |
            ForEach-Object {
                [pscustomobject][ordered]@{
                    id = $_.id
                    type = 'promotion'
                    scope = $_.scope
                    cause = $_.cause
                    action = $_.action
                    independent_sources =
                        $_.independent_sources
                    seen = $_.seen
                    support = $_.support
                    contradict = $_.contradict
                    current_text = $_.published_text
                }
            }
    )

    $review = @(
        $Index.experiences |
            Where-Object {
                $_.review_required -and
                -not $_.retired
            } |
            Sort-Object id |
            ForEach-Object {
                [pscustomobject][ordered]@{
                    id = $_.id
                    type = 'review'
                    scope = $_.scope
                    cause = $_.cause
                    action = $_.action
                    independent_sources =
                        $_.independent_sources
                    seen = $_.seen
                    support = $_.support
                    contradict = $_.contradict
                    current_text = $_.published_text
                    codified_into = $_.codified_into
                }
            }
    )

    return [pscustomobject][ordered]@{
        promotion_ready = $promotion
        review_required = $review
    }
}

# ---------------------------------------------------------------------------
# Validate action parameters before taking the lock
# ---------------------------------------------------------------------------

if ($Action -ne 'Pending') {
    if ([string]::IsNullOrWhiteSpace($ExperienceId)) {
        throw "Action '$Action' requires -ExperienceId."
    }

    $ExperienceId = $ExperienceId.Trim().ToLowerInvariant()

    if ($ExperienceId -notmatch '^exp-[a-f0-9]{12}$') {
        throw "Invalid experience id '$ExperienceId'."
    }
}

if ($Action -in @('Approve', 'Revise')) {
    if ([string]::IsNullOrWhiteSpace($Text)) {
        throw "Action '$Action' requires -Text."
    }

    $Text = Validate-PublishedText -Value $Text
}

if (-not [string]::IsNullOrWhiteSpace($ActionKey)) {
    $ActionKey = Normalize-MachineKey `
        -Value $ActionKey `
        -FieldName 'ActionKey'
}

# ---------------------------------------------------------------------------
# Lock
# ---------------------------------------------------------------------------

[IO.Directory]::CreateDirectory($StateDir) |
    Out-Null

[IO.Directory]::CreateDirectory($ExperienceDir) |
    Out-Null

$lock = $null
$lockAcquired = $false
$lockToken = [guid]::NewGuid().ToString('N')

try {
    Clear-StaleLock

    try {
        $lock = [IO.File]::Open(
            $LockPath,
            [IO.FileMode]::CreateNew,
            [IO.FileAccess]::Write,
            [IO.FileShare]::None
        )

        $lockAcquired = $true
    } catch {
        throw (
            "Experience state is already locked: $LockPath"
        )
    }

    $procStart = try {
        (
            Get-Process -Id $PID -ErrorAction Stop
        ).StartTime.ToString('o')
    } catch {
        ''
    }

    $lockPayload = [ordered]@{
        token = $lockToken
        pid = $PID
        process_started_at = $procStart
        action = $Action
        experience_id = $ExperienceId
        created_at = [DateTimeOffset]::Now.ToString('o')
    }

    $bytes = [Text.Encoding]::UTF8.GetBytes(
        ($lockPayload | ConvertTo-Json -Compress)
    )

    $lock.Write(
        $bytes,
        0,
        $bytes.Length
    )

    $lock.Flush()

    # -----------------------------------------------------------------------
    # Load state
    # -----------------------------------------------------------------------

    $index = Load-Index

    # Pending is read-only on schema v2. Loading a legacy schema-v1 index may
    # perform the one-time atomic compatibility migration above.
    if ($Action -eq 'Pending') {
        Get-PendingResult -Index $index |
            ConvertTo-Json -Depth 12

        return
    }

    $entry = Get-Entry `
        -Index $index `
        -Id $ExperienceId

    $now = [DateTimeOffset]::Now.ToString('o')
    $evidenceCount = @($entry.evidence).Count

    # -----------------------------------------------------------------------
    # Approve
    # -----------------------------------------------------------------------

    if ($Action -eq 'Approve') {
        if (-not $entry.promotion_ready) {
            throw (
                "Experience '$ExperienceId' is not promotion_ready."
            )
        }

        if ($entry.review_required) {
            throw (
                "Experience '$ExperienceId' requires review and " +
                'cannot be approved as a fresh promotion.'
            )
        }

        if (
            -not [string]::IsNullOrWhiteSpace(
                [string]$entry.codified_into
            )
        ) {
            throw (
                "Experience '$ExperienceId' is already published."
            )
        }

        if ($entry.retired) {
            throw (
                "Experience '$ExperienceId' is retired and " +
                'cannot be approved as a fresh candidate.'
            )
        }

        $entry.published_text = $Text
        $entry.published_at = $now

        if ($null -eq $entry.published_order) {
            $entry.published_order =
                Get-NextPublishedOrder -Index $index
        }

        $entry.codified_into = (
            '.clinerules/Experience.md' +
            "#$ExperienceId"
        )

        $entry.promotion_ready = $false
        $entry.review_required = $false

        $entry.reviewed_at = $now
        $entry.reviewed_evidence_count = $evidenceCount

        $entry.retired = $false
        $entry.retired_at = $null
        $entry.retire_reason = $null

        $entry.tier = 'hot'

        Commit-State -Index $index

        [pscustomobject][ordered]@{
            action = 'Approve'
            id = $ExperienceId
            published_text = $entry.published_text
            codified_into = $entry.codified_into
            reviewed_evidence_count =
                $entry.reviewed_evidence_count
        } |
            ConvertTo-Json -Compress

        return
    }

    # -----------------------------------------------------------------------
    # Keep
    # -----------------------------------------------------------------------

    if ($Action -eq 'Keep') {
        if (
            [string]::IsNullOrWhiteSpace(
                [string]$entry.codified_into
            )
        ) {
            throw (
                "Experience '$ExperienceId' is not currently published."
            )
        }

        if (-not $entry.review_required) {
            throw (
                "Experience '$ExperienceId' does not currently " +
                'require review.'
            )
        }

        $entry.review_required = $false
        $entry.reviewed_at = $now
        $entry.reviewed_evidence_count = $evidenceCount

        # Keep 明确表示用户已经看过现有反例，
        # 但选择暂时继续保留当前经验。
        $entry.tier = 'hot'

        Commit-State -Index $index

        [pscustomobject][ordered]@{
            action = 'Keep'
            id = $ExperienceId
            published_text = $entry.published_text
            reviewed_evidence_count =
                $entry.reviewed_evidence_count
        } |
            ConvertTo-Json -Compress

        return
    }

    # -----------------------------------------------------------------------
    # Revise
    # -----------------------------------------------------------------------

    if ($Action -eq 'Revise') {
        if (
            [string]::IsNullOrWhiteSpace(
                [string]$entry.codified_into
            )
        ) {
            throw (
                "Experience '$ExperienceId' is not currently published."
            )
        }

        $entry.published_text = $Text

        if (-not [string]::IsNullOrWhiteSpace($ActionKey)) {
            $entry.action = $ActionKey
        }

        $entry.review_required = $false
        $entry.promotion_ready = $false

        $entry.reviewed_at = $now
        $entry.reviewed_evidence_count = $evidenceCount

        $entry.retired = $false
        $entry.retired_at = $null
        $entry.retire_reason = $null

        $entry.tier = 'hot'

        Commit-State -Index $index

        [pscustomobject][ordered]@{
            action = 'Revise'
            id = $ExperienceId
            published_text = $entry.published_text
            preferred_action = $entry.action
            reviewed_evidence_count =
                $entry.reviewed_evidence_count
        } |
            ConvertTo-Json -Compress

        return
    }

    # -----------------------------------------------------------------------
    # Retire
    # -----------------------------------------------------------------------

    if ($Action -eq 'Retire') {
        if (
            [string]::IsNullOrWhiteSpace(
                [string]$entry.codified_into
            )
        ) {
            throw (
                "Experience '$ExperienceId' is not currently published."
            )
        }

        $entry.codified_into = $null
        $entry.promotion_ready = $false
        $entry.review_required = $false

        $entry.reviewed_at = $now
        $entry.reviewed_evidence_count = $evidenceCount

        $entry.retired = $true
        $entry.retired_at = $now

        if ([string]::IsNullOrWhiteSpace($Reason)) {
            $entry.retire_reason = 'user-retired'
        } else {
            $entry.retire_reason = $Reason.Trim()
        }

        # published_text 保留在 index 中作为历史记录，
        # 但因为 codified_into=null 且 retired=true，
        # 不再渲染到 EXPERIENCE.md。
        $entry.tier = 'cold'

        Commit-State -Index $index

        [pscustomobject][ordered]@{
            action = 'Retire'
            id = $ExperienceId
            retired = $true
            retired_at = $entry.retired_at
            reason = $entry.retire_reason
        } |
            ConvertTo-Json -Compress

        return
    }

    throw "Unsupported action '$Action'."
}
finally {
    if ($lock) {
        $lock.Dispose()
    }

    if (
        $lockAcquired -and
        (Test-Path -LiteralPath $LockPath)
    ) {
        try {
            $currentLock = (
                [IO.File]::ReadAllText(
                    $LockPath,
                    [Text.UTF8Encoding]::new($false)
                ) |
                    ConvertFrom-Json
            )

            if (
                [string]$currentLock.token -eq
                [string]$lockToken
            ) {
                Remove-Item `
                    -LiteralPath $LockPath `
                    -Force
            }
        } catch {
            # 锁归属无法确认时不删除，避免误删其他进程新取得的锁。
        }
    }
}
