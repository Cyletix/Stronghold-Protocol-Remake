#requires -Version 7.0

[CmdletBinding()]
param(
    [ValidateSet('Status', 'Validate', 'SyncInbox', 'SuspendInbox', 'ResumeInbox', 'Activate', 'Complete', 'Fail', 'Block', 'Resume', 'Cancel', 'WriteLog', 'Unlock')]
    [string]$Action = 'Status',
    [string]$TaskId,
    [string]$InboxId,
    [string]$UnitId,
    [string]$Next,
    [string]$Reason,
    [string]$ResumeWhen,
    [ValidateSet('pass', 'warn', 'failed', 'blocked')]
    [string]$Result,
    [string]$Check = 'not-run',
    [string]$MetaJson = '[]',
    [string]$Workspace
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-WorkspaceRoot {
    if ($Workspace) { return [IO.Path]::GetFullPath($Workspace) }
    return [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..'))
}

$Root = Get-WorkspaceRoot
$TaskDir = Join-Path $Root 'assets\task'
$InboxPath = Join-Path $Root 'assets\todo.md'
$LogDir = Join-Path $Root 'assets\log'
$StateDir = Join-Path $Root 'assets\state'
$LockPath = Join-Path $StateDir 'automaintain.lock'

function ConvertFrom-TaskScalar([string]$Value) {
    $trimmed = $Value.Trim()
    if ($trimmed -eq 'null') { return $null }
    if ($trimmed -match '^"') { return ($trimmed | ConvertFrom-Json) }
    return $trimmed
}

function ConvertTo-TaskScalar($Value) {
    if ($null -eq $Value -or ($Value -is [string] -and $Value -eq '')) { return 'null' }
    if ($Value -is [int] -or $Value -is [long]) { return [string]$Value }
    return ($Value | ConvertTo-Json -Compress)
}

function Get-Field([string]$FrontMatter, [string]$Name) {
    $escaped = [regex]::Escape($Name)
    $match = [regex]::Match($FrontMatter, "(?m)^${escaped}:\s*(?<value>.*)$")
    if (-not $match.Success) { throw "Task frontmatter missing field '$Name'." }
    return ConvertFrom-TaskScalar $match.Groups['value'].Value
}

function Get-UnitsFromRaw([string]$Raw) {
    return @([regex]::Matches($Raw, '(?m)^- \[(?<mark>[ xX])\] `(?<id>[^`]+)`(?<text>.*)$') | ForEach-Object {
        [pscustomobject]@{
            Id = $_.Groups['id'].Value
            Done = $_.Groups['mark'].Value -match '[xX]'
            Text = $_.Groups['text'].Value.Trim()
        }
    })
}

function Read-Task([string]$Path) {
    $raw = [IO.File]::ReadAllText($Path, [Text.UTF8Encoding]::new($false))
    $frontMatch = [regex]::Match($raw, '\A---\r?\n(?<fm>.*?)\r?\n---\r?\n', [Text.RegularExpressions.RegexOptions]::Singleline)
    if (-not $frontMatch.Success) { throw "Invalid task frontmatter: $Path" }
    $fm = $frontMatch.Groups['fm'].Value
    $source = Get-Field $fm 'source'
    if ($source -is [string] -and $source.Trim() -match '^\[') {
        $source = $source | ConvertFrom-Json
    }
    return [pscustomobject]@{
        Path = $Path
        Raw = $raw
        FrontMatter = $fm
        TaskId = [string](Get-Field $fm 'task_id')
        Source = $source
        Sources = @($source | Where-Object { $null -ne $_ -and [string]$_ -ne '' })
        Title = [string](Get-Field $fm 'title')
        Status = [string](Get-Field $fm 'status')
        Next = Get-Field $fm 'next'
        UpdatedAt = [string](Get-Field $fm 'updated_at')
        CompletedAt = Get-Field $fm 'completed_at'
        Blocker = Get-Field $fm 'blocker'
        ResumeWhen = Get-Field $fm 'resume_when'
        Attempts = [int](Get-Field $fm 'attempts')
        Units = Get-UnitsFromRaw $raw
    }
}

function Get-Tasks {
    if (-not (Test-Path -LiteralPath $TaskDir)) { return @() }
    return @(Get-ChildItem -LiteralPath $TaskDir -Filter 'T-*.md' -File | Sort-Object Name | ForEach-Object { Read-Task $_.FullName })
}

function Get-InboxEntries {
    if (-not (Test-Path -LiteralPath $InboxPath -PathType Leaf)) { return @() }
    $lines = [IO.File]::ReadAllLines($InboxPath, [Text.UTF8Encoding]::new($false))
    $entries = [Collections.Generic.List[object]]::new()
    for ($index = 0; $index -lt $lines.Count; $index++) {
        $match = [regex]::Match($lines[$index], '^- \[(?<mark>[ xX?])\]\s+(?:`(?<id>I-\d{8}-\d{3,})`\s+)?(?<body>.+?)\s*$')
        if (-not $match.Success) { continue }
        $mark = $match.Groups['mark'].Value
        $body = $match.Groups['body'].Value.Trim()
        $taskId = $null
        $reason = $null
        $resumeWhen = $null
        $holdMatch = [regex]::Match($body, '\s+→\s+挂起：(?<reason>.+?)；恢复：(?<resume>.+)$')
        if ($holdMatch.Success) {
            $reason = $holdMatch.Groups['reason'].Value.Trim()
            $resumeWhen = $holdMatch.Groups['resume'].Value.Trim()
            $body = $body.Substring(0, $holdMatch.Index).Trim()
        }
        $taskMatch = [regex]::Match($body, '\s+→\s+`(?<task>T-[^`]+)`$')
        if ($taskMatch.Success) {
            $taskId = $taskMatch.Groups['task'].Value
            $body = $body.Substring(0, $taskMatch.Index).Trim()
        }
        $entries.Add([pscustomobject]@{
            Line = $index
            LineNumber = $index + 1
            Id = if ($match.Groups['id'].Success) { $match.Groups['id'].Value } else { $null }
            State = if ($mark -match '[xX]') { 'confirmed' } elseif ($mark -eq '?') { 'suspended' } elseif ($taskId) { 'tracked' } else { 'pending' }
            Done = $mark -match '[xX]'
            Text = $body
            TaskId = $taskId
            Reason = $reason
            ResumeWhen = $resumeWhen
        })
    }
    return @($entries)
}

function Sync-Inbox($Tasks) {
    if (-not (Test-Path -LiteralPath $InboxPath -PathType Leaf)) {
        throw "Inbox is missing: $InboxPath"
    }
    $lines = [Collections.Generic.List[string]]::new()
    $lines.AddRange([string[]][IO.File]::ReadAllLines($InboxPath, [Text.UTF8Encoding]::new($false)))
    $legacyHint = '<!-- 每个事项单独写成 [ ]。自动维护分配 ID；[?] 表示等待补充，[x] 表示已生成标准任务。 -->'
    $currentHint = '<!-- [ ] 表示尚待用户确认，[x] 仅表示用户手动验证解决，[?] 表示等待补充；自动维护不会自动勾选。 -->'
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -eq $legacyHint) { $lines[$index] = $currentHint }
    }
    $entries = Get-InboxEntries
    $today = [DateTimeOffset]::Now.ToString('yyyyMMdd')
    $sequence = 0
    foreach ($entry in $entries) {
        if ($entry.Id -match "^I-$today-(?<n>\d+)$") {
            $sequence = [Math]::Max($sequence, [int]$Matches['n'])
        }
    }

    $assigned = [Collections.Generic.List[string]]::new()
    $reconciled = [Collections.Generic.List[string]]::new()
    foreach ($entry in $entries) {
        if ($entry.State -ne 'pending') { continue }
        $id = $entry.Id
        if (-not $id) {
            $sequence++
            $id = 'I-{0}-{1:D3}' -f $today, $sequence
            $lines[$entry.Line] = '- [ ] `{0}` {1}' -f $id, $entry.Text
            $assigned.Add($id)
        }
        $matches = @($Tasks | Where-Object { $_ -and $_.Sources -contains $id })
        if ($matches.Count -gt 1) { throw "Inbox item '$id' is used by more than one task." }
        if ($matches.Count -eq 1) {
            $lines[$entry.Line] = '- [ ] `{0}` {1} → `{2}`' -f $id, $entry.Text, $matches[0].TaskId
            $reconciled.Add($id)
        }
    }
    [IO.File]::WriteAllLines($InboxPath, $lines, [Text.UTF8Encoding]::new($false))
    return [pscustomobject]@{
        assigned = @($assigned)
        reconciled = @($reconciled)
        pending = @((Get-InboxEntries | Where-Object State -eq 'pending') | ForEach-Object { [pscustomobject]@{ id = $_.Id; text = $_.Text } })
    }
}

function Set-InboxState([string]$Id, [ValidateSet('suspended', 'pending')][string]$State, [string]$Why, [string]$RecoverWhen) {
    if (-not $Id) { throw 'Inbox transition requires InboxId.' }
    $entries = @(Get-InboxEntries | Where-Object Id -eq $Id)
    if ($entries.Count -ne 1) { throw "Inbox item '$Id' was not found exactly once." }
    $entry = $entries[0]
    if ($State -eq 'suspended') {
        if ($entry.State -ne 'pending') { throw 'Only pending inbox items can be suspended.' }
        if (-not $Why -or -not $RecoverWhen) { throw 'SuspendInbox requires Reason and ResumeWhen.' }
        $replacement = '- [?] `{0}` {1} → 挂起：{2}；恢复：{3}' -f $Id, $entry.Text, $Why.Trim(), $RecoverWhen.Trim()
    } else {
        if ($entry.State -ne 'suspended') { throw 'Only suspended inbox items can be resumed.' }
        $replacement = '- [ ] `{0}` {1}' -f $Id, $entry.Text
    }
    $lines = [IO.File]::ReadAllLines($InboxPath, [Text.UTF8Encoding]::new($false))
    $lines[$entry.Line] = $replacement
    [IO.File]::WriteAllLines($InboxPath, $lines, [Text.UTF8Encoding]::new($false))
}

function Set-TaskField([string]$Raw, [string]$Name, $Value) {
    $encoded = ConvertTo-TaskScalar $Value
    $escaped = [regex]::Escape($Name)
    $pattern = "(?m)^${escaped}:\s*.*$"
    if (-not [regex]::IsMatch($Raw, $pattern)) { throw "Task is missing writable field '$Name'." }
    return [regex]::Replace($Raw, $pattern, "${Name}: $encoded", 1)
}

function Set-TaskUnit([string]$Raw, [string]$Unit, [bool]$Done) {
    $escaped = [regex]::Escape($Unit)
    $pattern = '(?m)^- \[[ xX]\] `{0}`(?<tail>.*)$' -f $escaped
    $match = [regex]::Match($Raw, $pattern)
    if (-not $match.Success) { throw "Unknown unit '$Unit'." }
    $mark = if ($Done) { 'x' } else { ' ' }
    return [regex]::Replace($Raw, $pattern, { param($m) ('- [{0}] `{1}`{2}' -f $mark, $Unit, $m.Groups['tail'].Value) }, 1)
}

function Write-Task([string]$Path, [string]$Raw) {
    [IO.File]::WriteAllText($Path, $Raw, [Text.UTF8Encoding]::new($false))
}

function Test-Contracts {
    $errors = [Collections.Generic.List[string]]::new()
    $tasks = @()
    try { $tasks = Get-Tasks } catch { $errors.Add($_.Exception.Message) }

    $allowedStatus = @('queued', 'active', 'blocked', 'done', 'cancelled')
    $ids = @{}
    $sources = @{}

    foreach ($task in $tasks) {
        if ($ids.ContainsKey($task.TaskId)) { $errors.Add("Duplicate task_id: $($task.TaskId)") } else { $ids[$task.TaskId] = $true }
        if ($task.TaskId -notmatch '^T-[A-Z0-9][A-Z0-9-]*$') { $errors.Add("Invalid task_id: $($task.TaskId)") }
        if ([IO.Path]::GetFileNameWithoutExtension($task.Path) -ne $task.TaskId) { $errors.Add("$($task.TaskId): filename must match task_id.") }
        if (-not $task.Title.Trim()) { $errors.Add("$($task.TaskId): title is empty.") }
        foreach ($source in $task.Sources) {
            if ($source -notmatch '^I-\d{8}-\d{3,}$') { $errors.Add("$($task.TaskId): invalid source '$source'.") }
            elseif ($sources.ContainsKey($source)) { $errors.Add("Duplicate task source: $source") }
            else { $sources[$source] = $true }
        }
        if ($task.Status -notin $allowedStatus) { $errors.Add("$($task.TaskId): invalid status '$($task.Status)'.") }
        if ($task.Attempts -lt 0 -or $task.Attempts -gt 2) { $errors.Add("$($task.TaskId): attempts must be 0..2.") }
        if ($task.Units.Count -eq 0) { $errors.Add("$($task.TaskId): no work units.") }
        foreach ($unit in $task.Units) {
            if ($unit.Id -ne 'FINAL' -and $unit.Id -notmatch '^U-[A-Z0-9][A-Z0-9-]*$') { $errors.Add("$($task.TaskId): invalid unit id '$($unit.Id)'.") }
            if (-not $unit.Text) { $errors.Add("$($task.TaskId): unit '$($unit.Id)' has no description.") }
        }
        if (@($task.Units | Group-Object Id | Where-Object Count -gt 1).Count -gt 0) { $errors.Add("$($task.TaskId): duplicate unit id.") }
        if ($task.Raw -notmatch '(?m)^## 任务范围\s*$') { $errors.Add("$($task.TaskId): missing task scope section.") }
        if ($task.Raw -notmatch '(?m)^## 执行步骤\s*$') { $errors.Add("$($task.TaskId): missing work units section.") }

        $final = @($task.Units | Where-Object Id -eq 'FINAL')
        if ($final.Count -ne 1) { $errors.Add("$($task.TaskId): exactly one FINAL unit is required.") }

        $nextUnit = @($task.Units | Where-Object Id -eq $task.Next)
        if ($task.Status -in @('active', 'blocked')) {
            if (-not $task.Next) { $errors.Add("$($task.TaskId): $($task.Status) task requires next.") }
            elseif ($nextUnit.Count -ne 1) { $errors.Add("$($task.TaskId): next '$($task.Next)' does not identify one unit.") }
            elseif ($nextUnit[0].Done) { $errors.Add("$($task.TaskId): next '$($task.Next)' is already complete.") }
        } elseif ($task.Next) {
            $errors.Add("$($task.TaskId): $($task.Status) task must have next: null.")
        }

        if ($task.Status -eq 'blocked') {
            if (-not $task.Blocker -or -not $task.ResumeWhen) { $errors.Add("$($task.TaskId): blocked task requires blocker and resume_when.") }
        }
        if ($task.Status -eq 'done') {
            if (@($task.Units | Where-Object { -not $_.Done }).Count -gt 0) { $errors.Add("$($task.TaskId): done task has unchecked units.") }
            if ($final.Count -eq 1 -and -not $final[0].Done) { $errors.Add("$($task.TaskId): FINAL is not complete.") }
            if (-not $task.CompletedAt) { $errors.Add("$($task.TaskId): done task requires completed_at.") }
        }
    }

    if (@($tasks | Where-Object Status -eq 'active').Count -gt 1) { $errors.Add('More than one active task exists.') }

    $inboxEntries = Get-InboxEntries
    $inboxIds = @{}
    foreach ($entry in $inboxEntries) {
        $sourceTasks = @(if ($entry.Id) { $tasks | Where-Object { $_.Sources -contains $entry.Id } })
        if ($entry.State -eq 'suspended') {
            if (-not $entry.Id -or -not $entry.Reason -or -not $entry.ResumeWhen) { $errors.Add('Suspended inbox item requires id, reason, and resume condition.') }
            if ($entry.TaskId) { $errors.Add("Suspended inbox item '$($entry.Id)' may not reference a task.") }
            if ($sourceTasks.Count -gt 0) { $errors.Add("Suspended inbox item '$($entry.Id)' may not already have a task.") }
        }
        if ($entry.State -ne 'suspended' -and ($entry.Reason -or $entry.ResumeWhen)) { $errors.Add("Inbox item '$($entry.Id)' has hold metadata without suspended state.") }
        if ($entry.State -eq 'tracked' -and (-not $entry.Id -or -not $entry.TaskId)) {
            $errors.Add('Tracked inbox item requires id and task reference.')
        }
        if ($entry.TaskId -and -not $entry.Id) { $errors.Add('Inbox task reference requires an inbox id.') }
        if (-not $entry.Id) { continue }
        if ($inboxIds.ContainsKey($entry.Id)) { $errors.Add("Duplicate inbox id: $($entry.Id)") }
        else { $inboxIds[$entry.Id] = $true }
        if ($entry.TaskId) {
            $linked = @($tasks | Where-Object TaskId -eq $entry.TaskId)
            if ($linked.Count -ne 1 -or $linked[0].Sources -notcontains $entry.Id) {
                $errors.Add("Inbox item '$($entry.Id)' does not match task '$($entry.TaskId)'.")
            }
        }
    }

    if (Test-Path -LiteralPath $LogDir) {
        foreach ($log in Get-ChildItem -LiteralPath $LogDir -Filter '*.log' -File) {
            if ($log.Name -notmatch '^\d{8}_\d{9}\.log$') { $errors.Add("Legacy or invalid live log name: $($log.Name)"); continue }
            $lines = @([IO.File]::ReadAllLines($log.FullName, [Text.UTF8Encoding]::new($false)) | Where-Object { $_.Trim() })
            if ($lines.Count -ne 1) { $errors.Add("$($log.Name): log must contain exactly one non-empty line."); continue }
            try { $record = $lines[0] | ConvertFrom-Json } catch { $errors.Add("$($log.Name): invalid JSON."); continue }
            foreach ($field in @('time', 'task', 'unit', 'result', 'check', 'meta')) {
                if ($null -eq $record.PSObject.Properties[$field]) { $errors.Add("$($log.Name): missing '$field'.") }
            }
            if ($null -ne $record.PSObject.Properties['next']) { $errors.Add("$($log.Name): logs may not contain next.") }
        }
    }

    return [pscustomobject]@{ Tasks = $tasks; Errors = @($errors) }
}

function Assert-Valid {
    $validation = Test-Contracts
    if ($validation.Errors.Count -gt 0) { throw ($validation.Errors -join [Environment]::NewLine) }
    return $validation.Tasks
}

function Get-TaskById($Tasks, [string]$Id) {
    $found = @($Tasks | Where-Object TaskId -eq $Id)
    if ($found.Count -ne 1) { throw "Task '$Id' was not found exactly once." }
    return $found[0]
}

function Test-LockOwnerAlive($LockInfo) {
    if (-not $LockInfo.pid) { return $false }
    $proc = Get-Process -Id ([int]$LockInfo.pid) -ErrorAction SilentlyContinue
    if (-not $proc) { return $false }
    $startProp = $LockInfo.PSObject.Properties['process_started_at']
    if (-not $startProp -or [string]::IsNullOrEmpty([string]$startProp.Value)) { return $true }
    try {
        $recorded = [DateTimeOffset]::Parse([string]$startProp.Value)
        return ([Math]::Abs(($recorded - $proc.StartTime).TotalSeconds) -le 2)
    } catch {
        return $true
    }
}

function Acquire-Lock {
    [IO.Directory]::CreateDirectory($StateDir) | Out-Null
    try {
        $stream = [IO.File]::Open($LockPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    } catch {
        throw "Supervisor is already locked: $LockPath"
    }
    $procStart = try { (Get-Process -Id $PID -ErrorAction Stop).StartTime.ToString('o') } catch { '' }
    $payload = [Text.Encoding]::UTF8.GetBytes(([ordered]@{
        token = [guid]::NewGuid().ToString('N')
        pid = $PID
        process_started_at = $procStart
        action = $Action
        created_at = [DateTimeOffset]::Now.ToString('o')
    } | ConvertTo-Json -Compress))
    $stream.Write($payload, 0, $payload.Length)
    $stream.Flush()
    return $stream
}

function Release-Lock($Stream) {
    if (-not $Stream) { return }
    $Stream.Dispose()
    if (Test-Path -LiteralPath $LockPath) { Remove-Item -LiteralPath $LockPath -Force }
}

function Show-Status($Tasks, [bool]$IgnoreCurrentLock = $false) {
    $taskList = @($Tasks | Where-Object { $_ })
    $active = @($taskList | Where-Object Status -eq 'active')
    $entries = Get-InboxEntries
    $pending = @($entries | Where-Object State -eq 'pending')
    $suspended = @($entries | Where-Object State -eq 'suspended')
    return [pscustomobject]@{
        valid = $true
        locked = if ($IgnoreCurrentLock) { $false } else { Test-Path -LiteralPath $LockPath }
        active_task = if ($active.Count -eq 1) { $active[0].TaskId } else { $null }
        next = if ($active.Count -eq 1) { $active[0].Next } else { $null }
        queued = @($taskList | Where-Object Status -eq 'queued' | ForEach-Object TaskId)
        blocked = @($taskList | Where-Object Status -eq 'blocked' | ForEach-Object TaskId)
        done = @($taskList | Where-Object Status -eq 'done' | ForEach-Object TaskId)
        inbox = @($pending | Where-Object Id | ForEach-Object { [pscustomobject]@{ id = $_.Id; text = $_.Text } })
        inbox_unassigned = @($pending | Where-Object { -not $_.Id }).Count
        inbox_suspended = @($suspended | ForEach-Object { [pscustomobject]@{ id = $_.Id; text = $_.Text; reason = $_.Reason; resume_when = $_.ResumeWhen } })
    }
}

$mutating = $Action -in @('SyncInbox', 'SuspendInbox', 'ResumeInbox', 'Activate', 'Complete', 'Fail', 'Block', 'Resume', 'Cancel', 'WriteLog')
$lock = $null

try {
    if ($Action -eq 'Unlock') {
        if (-not $Reason) { throw 'Unlock requires a recovery reason.' }
        if (-not (Test-Path -LiteralPath $LockPath -PathType Leaf)) {
            [pscustomobject]@{ unlocked = $false; reason = 'no-lock' } | ConvertTo-Json -Compress
            return
        }
        try { $lockInfo = [IO.File]::ReadAllText($LockPath) | ConvertFrom-Json } catch { throw 'Lock file is unreadable; inspect it manually before removal.' }
        if (Test-LockOwnerAlive $lockInfo) {
            throw "Lock owner process $($lockInfo.pid) is still running."
        }
        Remove-Item -LiteralPath $LockPath -Force
        [pscustomobject]@{ unlocked = $true; stale_pid = $lockInfo.pid; reason = $Reason } | ConvertTo-Json -Compress
        return
    }

    if ($mutating) { $lock = Acquire-Lock }

    if ($Action -eq 'Validate') {
        $validation = Test-Contracts
        if ($validation.Errors.Count -gt 0) { throw ($validation.Errors -join [Environment]::NewLine) }
        [pscustomobject]@{
            valid = $true
            tasks = @($validation.Tasks).Count
            live_logs = @(Get-ChildItem -LiteralPath $LogDir -Filter '*.log' -File -ErrorAction SilentlyContinue).Count
        } | ConvertTo-Json -Compress
        return
    }

    if ($Action -eq 'Status') {
        Show-Status (Assert-Valid) | ConvertTo-Json -Depth 4
        return
    }

    if ($Action -eq 'SyncInbox') {
        $tasks = Assert-Valid
        Sync-Inbox $tasks | ConvertTo-Json -Depth 4
        return
    }

    if ($Action -in @('SuspendInbox', 'ResumeInbox')) {
        $tasks = Assert-Valid
        if ($Action -eq 'SuspendInbox') { Set-InboxState $InboxId 'suspended' $Reason $ResumeWhen }
        else { Set-InboxState $InboxId 'pending' $null $null }
        $updatedTasks = Assert-Valid
        Show-Status $updatedTasks $true | ConvertTo-Json -Depth 5
        return
    }

    if ($Action -eq 'WriteLog') {
        if (-not $TaskId -or -not $UnitId -or -not $Result) { throw 'WriteLog requires TaskId, UnitId, and Result.' }
        $tasks = Assert-Valid
        $logTask = Get-TaskById $tasks $TaskId
        if (@($logTask.Units | Where-Object Id -eq $UnitId).Count -ne 1) { throw "WriteLog unit '$UnitId' does not belong to task '$TaskId'." }
        try { $parsedMeta = $MetaJson | ConvertFrom-Json } catch { throw 'MetaJson must be a JSON array.' }
        $meta = @($parsedMeta)
        foreach ($event in $meta) {
            foreach ($field in @('scope', 'cause', 'action', 'outcome')) {
                if ($null -eq $event.PSObject.Properties[$field]) { throw "Each meta event requires '$field'." }
            }
        }
        [IO.Directory]::CreateDirectory($LogDir) | Out-Null
        do {
            $now = [DateTimeOffset]::Now
            $name = $now.ToString('yyyyMMdd_HHmmssfff') + '.log'
            $path = Join-Path $LogDir $name
        } while (Test-Path -LiteralPath $path)
        $record = [ordered]@{ time = $now.ToString('o'); task = $TaskId; unit = $UnitId; result = $Result; check = $Check; meta = $meta }
        [IO.File]::WriteAllText($path, ($record | ConvertTo-Json -Depth 8 -Compress), [Text.UTF8Encoding]::new($false))
        $path
        return
    }

    $tasks = Assert-Valid
    $task = Get-TaskById $tasks $TaskId
    $nowText = [DateTimeOffset]::Now.ToString('o')

    switch ($Action) {
        'Activate' {
            if ($task.Status -ne 'queued') { throw 'Only queued tasks can be activated.' }
            if (@($tasks | Where-Object Status -eq 'active').Count -gt 0) { throw 'Another task is already active.' }
            $unit = @($task.Units | Where-Object Id -eq $Next)
            if ($unit.Count -ne 1 -or $unit[0].Done) { throw 'Next must identify one unchecked unit.' }
            $raw = Set-TaskField $task.Raw 'status' 'active'
            $raw = Set-TaskField $raw 'next' $Next
            $raw = Set-TaskField $raw 'updated_at' $nowText
            Write-Task $task.Path $raw
        }
        'Complete' {
            if ($task.Status -ne 'active') { throw 'Only active tasks can complete a unit.' }
            if ($task.Next -ne $UnitId) { throw "Current next is '$($task.Next)', not '$UnitId'." }
            $current = @($task.Units | Where-Object Id -eq $UnitId)
            if ($current.Count -ne 1 -or $current[0].Done) { throw 'Unit is missing or already complete.' }
            $raw = Set-TaskUnit $task.Raw $UnitId $true
            $remaining = @(Get-UnitsFromRaw $raw | Where-Object { -not $_.Done })
            if ($remaining.Count -eq 0) {
                $raw = Set-TaskField $raw 'status' 'done'
                $raw = Set-TaskField $raw 'next' $null
                $raw = Set-TaskField $raw 'completed_at' $nowText
            } else {
                if (-not $Next) { throw 'Complete requires -Next while unchecked units remain.' }
                $nextUnit = @($remaining | Where-Object Id -eq $Next)
                if ($nextUnit.Count -ne 1) { throw 'Next must identify one remaining unchecked unit.' }
                $raw = Set-TaskField $raw 'next' $Next
            }
            $raw = Set-TaskField $raw 'attempts' 0
            $raw = Set-TaskField $raw 'blocker' $null
            $raw = Set-TaskField $raw 'resume_when' $null
            $raw = Set-TaskField $raw 'updated_at' $nowText
            Write-Task $task.Path $raw
        }
        'Fail' {
            if ($task.Status -ne 'active' -or $task.Next -ne $UnitId) { throw 'Fail applies only to the active next unit.' }
            if (-not $Reason) { throw 'Fail requires Reason.' }
            $attempts = $task.Attempts + 1
            $raw = Set-TaskField $task.Raw 'attempts' $attempts
            $raw = Set-TaskField $raw 'blocker' $Reason
            $raw = Set-TaskField $raw 'updated_at' $nowText
            if ($attempts -ge 2) {
                if (-not $ResumeWhen) { throw 'The second failure requires ResumeWhen.' }
                $raw = Set-TaskField $raw 'status' 'blocked'
                $raw = Set-TaskField $raw 'resume_when' $ResumeWhen
            }
            Write-Task $task.Path $raw
        }
        'Block' {
            if ($task.Status -ne 'active') { throw 'Only active tasks can be blocked.' }
            if (-not $Reason -or -not $ResumeWhen) { throw 'Block requires Reason and ResumeWhen.' }
            $raw = Set-TaskField $task.Raw 'status' 'blocked'
            $raw = Set-TaskField $raw 'blocker' $Reason
            $raw = Set-TaskField $raw 'resume_when' $ResumeWhen
            $raw = Set-TaskField $raw 'updated_at' $nowText
            Write-Task $task.Path $raw
        }
        'Resume' {
            if ($task.Status -ne 'blocked') { throw 'Only blocked tasks can resume.' }
            $target = if ($Next) { $Next } else { $task.Next }
            $unit = @($task.Units | Where-Object Id -eq $target)
            if ($unit.Count -ne 1 -or $unit[0].Done) { throw 'Resume target must be one unchecked unit.' }
            if (@($tasks | Where-Object Status -eq 'active').Count -gt 0) { throw 'Another task is already active.' }
            $raw = Set-TaskField $task.Raw 'status' 'active'
            $raw = Set-TaskField $raw 'next' $target
            $raw = Set-TaskField $raw 'attempts' 0
            $raw = Set-TaskField $raw 'blocker' $null
            $raw = Set-TaskField $raw 'resume_when' $null
            $raw = Set-TaskField $raw 'updated_at' $nowText
            Write-Task $task.Path $raw
        }
        'Cancel' {
            if ($task.Status -notin @('queued', 'blocked')) { throw 'Only queued or blocked tasks can be cancelled.' }
            if (-not $Reason) { throw 'Cancel requires Reason.' }
            $raw = Set-TaskField $task.Raw 'status' 'cancelled'
            $raw = Set-TaskField $raw 'next' $null
            $raw = Set-TaskField $raw 'blocker' $Reason
            $raw = Set-TaskField $raw 'updated_at' $nowText
            Write-Task $task.Path $raw
        }
    }

    $updatedTasks = Assert-Valid
    Show-Status $updatedTasks $true | ConvertTo-Json -Depth 4
} finally {
    Release-Lock $lock
}
