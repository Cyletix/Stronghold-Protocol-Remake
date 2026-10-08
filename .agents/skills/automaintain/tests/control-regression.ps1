#requires -Version 7.0

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Supervisor = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\scripts\supervise.ps1'))
$Ingest = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\experience\scripts\ingest-log.ps1'))
$TempRoot = Join-Path ([IO.Path]::GetTempPath()) ('kb-harness-' + [guid]::NewGuid().ToString('N'))

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "ASSERT: $Message" }
}

function Read-TaskText([string]$Name) {
    return [IO.File]::ReadAllText((Join-Path $TempRoot "assets\task\$Name"), [Text.UTF8Encoding]::new($false))
}

function Invoke-Control([hashtable]$Arguments) {
    & $Supervisor -Workspace $TempRoot @Arguments | Out-Null
}

function Expect-Failure([scriptblock]$Action, [string]$Message) {
    $failed = $false
    try { & $Action } catch { $failed = $true }
    Assert-True $failed $Message
}

try {
    [IO.Directory]::CreateDirectory((Join-Path $TempRoot 'assets\task')) | Out-Null
    [IO.Directory]::CreateDirectory((Join-Path $TempRoot 'assets\log')) | Out-Null
    [IO.Directory]::CreateDirectory((Join-Path $TempRoot 'assets\state')) | Out-Null

    $taskTemplate = @'
---
task_id: {TASK}
source: null
title: Test
status: queued
next: null
updated_at: 2026-08-16T00:00:00+09:00
completed_at: null
blocker: null
resume_when: null
attempts: 0
---

# Test

## 任务范围

- Test scope

## 执行步骤

- [ ] `U-ONE` one
- [ ] `FINAL` final
'@
    [IO.File]::WriteAllText((Join-Path $TempRoot 'assets\task\T-A.md'), $taskTemplate.Replace('{TASK}', 'T-A'), [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $TempRoot 'assets\task\T-B.md'), $taskTemplate.Replace('{TASK}', 'T-B'), [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $TempRoot 'assets\todo.md'), "# Inbox`n`n<!-- 每个事项单独写成 [ ]。自动维护分配 ID；[?] 表示等待补充，[x] 表示已生成标准任务。 -->`n- [x] user-confirmed item`n- [ ] import this task`n", [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $TempRoot 'assets\state\experience-index.json'), '{"schema_version":2,"processed_logs":[],"experiences":[]}', [Text.UTF8Encoding]::new($false))

    Invoke-Control @{ Action = 'Validate' }
    Invoke-Control @{ Action = 'SyncInbox' }
    $inboxText = [IO.File]::ReadAllText((Join-Path $TempRoot 'assets\todo.md'), [Text.UTF8Encoding]::new($false))
    Assert-True ($inboxText.Contains('[x] 仅表示用户手动验证解决')) 'SyncInbox must migrate the obsolete checkbox hint'
    $status = & $Supervisor -Workspace $TempRoot -Action Status | ConvertFrom-Json
    Assert-True ($status.inbox.Count -eq 1) 'SyncInbox must expose one pending inbox item'
    $inboxId = $status.inbox[0].id
    Assert-True ($inboxId -match '^I-\d{8}-\d{3}$') 'SyncInbox must assign a stable inbox id'
    Invoke-Control @{ Action = 'SuspendInbox'; InboxId = $inboxId; Reason = 'missing scope'; ResumeWhen = 'user adds target' }
    $status = & $Supervisor -Workspace $TempRoot -Action Status | ConvertFrom-Json
    Assert-True (@($status.inbox).Count -eq 0) 'suspended inbox item must leave the pending queue'
    Assert-True (@($status.inbox_suspended).Count -eq 1) 'suspended inbox item must remain visible'
    Invoke-Control @{ Action = 'SyncInbox' }
    $status = & $Supervisor -Workspace $TempRoot -Action Status | ConvertFrom-Json
    Assert-True (@($status.inbox).Count -eq 0) 'SyncInbox must not requeue a suspended item'
    Invoke-Control @{ Action = 'ResumeInbox'; InboxId = $inboxId }
    $status = & $Supervisor -Workspace $TempRoot -Action Status | ConvertFrom-Json
    Assert-True (@($status.inbox).Count -eq 1) 'ResumeInbox must return the item to pending'
    $imported = $taskTemplate.Replace('{TASK}', 'T-C').Replace('source: null', "source: `"$inboxId`"")
    [IO.File]::WriteAllText((Join-Path $TempRoot 'assets\task\T-C.md'), $imported, [Text.UTF8Encoding]::new($false))
    Invoke-Control @{ Action = 'SyncInbox' }
    $inboxText = [IO.File]::ReadAllText((Join-Path $TempRoot 'assets\todo.md'), [Text.UTF8Encoding]::new($false))
    $expectedInbox = "- [ ] ``$inboxId`` import this task → ``T-C``"
    Assert-True ($inboxText.Contains($expectedInbox)) 'task source must reconcile the inbox item without checking it'
    Assert-True ($inboxText.Contains('- [x] user-confirmed item')) 'user-confirmed item must remain valid without workflow metadata'
    $status = & $Supervisor -Workspace $TempRoot -Action Status | ConvertFrom-Json
    Assert-True (@($status.inbox).Count -eq 0) 'tracked unchecked item must leave the pending queue'
    Invoke-Control @{ Action = 'SyncInbox' }
    $inboxText = [IO.File]::ReadAllText((Join-Path $TempRoot 'assets\todo.md'), [Text.UTF8Encoding]::new($false))
    Assert-True (([regex]::Matches($inboxText, [regex]::Escape($expectedInbox))).Count -eq 1) 'SyncInbox must be idempotent'
    $manuallyConfirmed = $inboxText.Replace($expectedInbox, $expectedInbox.Replace('- [ ]', '- [x]'))
    [IO.File]::WriteAllText((Join-Path $TempRoot 'assets\todo.md'), $manuallyConfirmed, [Text.UTF8Encoding]::new($false))
    Invoke-Control @{ Action = 'Validate' }
    Invoke-Control @{ Action = 'SyncInbox' }
    $inboxText = [IO.File]::ReadAllText((Join-Path $TempRoot 'assets\todo.md'), [Text.UTF8Encoding]::new($false))
    Assert-True ($inboxText.Contains($expectedInbox.Replace('- [ ]', '- [x]'))) 'SyncInbox must preserve user confirmation'
    [IO.File]::WriteAllText((Join-Path $TempRoot 'assets\todo.md'), $inboxText + "- [ ] grouped one`n- [ ] grouped two`n", [Text.UTF8Encoding]::new($false))
    Invoke-Control @{ Action = 'SyncInbox' }
    $groupStatus = & $Supervisor -Workspace $TempRoot -Action Status | ConvertFrom-Json
    $groupIds = @($groupStatus.inbox | ForEach-Object id)
    $grouped = $taskTemplate.Replace('{TASK}', 'T-GROUP').Replace('source: null', ('source: ' + ($groupIds | ConvertTo-Json -Compress)))
    [IO.File]::WriteAllText((Join-Path $TempRoot 'assets\task\T-GROUP.md'), $grouped, [Text.UTF8Encoding]::new($false))
    Invoke-Control @{ Action = 'SyncInbox' }
    $groupStatus = & $Supervisor -Workspace $TempRoot -Action Status | ConvertFrom-Json
    Assert-True (@($groupStatus.inbox).Count -eq 0) 'one grouped task must reconcile multiple inbox sources'
    Invoke-Control @{ Action = 'Activate'; TaskId = 'T-A'; Next = 'U-ONE' }
    Expect-Failure { Invoke-Control @{ Action = 'Activate'; TaskId = 'T-B'; Next = 'U-ONE' } } 'second active task must be rejected'

    Invoke-Control @{ Action = 'Fail'; TaskId = 'T-A'; UnitId = 'U-ONE'; Reason = 'first' }
    $text = Read-TaskText 'T-A.md'
    Assert-True ($text -match '(?m)^status: "?active"?$') 'first failure must stay active'
    Assert-True ($text -match '(?m)^attempts: 1$') 'first failure must increment attempts'

    Invoke-Control @{ Action = 'Fail'; TaskId = 'T-A'; UnitId = 'U-ONE'; Reason = 'second'; ResumeWhen = 'dependency restored' }
    $text = Read-TaskText 'T-A.md'
    Assert-True ($text -match '(?m)^status: "?blocked"?$') 'second failure must block'
    Assert-True ($text -match '(?m)^attempts: 2$') 'blocked task must keep attempts=2'

    Invoke-Control @{ Action = 'Resume'; TaskId = 'T-A' }
    Invoke-Control @{ Action = 'Complete'; TaskId = 'T-A'; UnitId = 'U-ONE'; Next = 'FINAL' }
    Invoke-Control @{ Action = 'Complete'; TaskId = 'T-A'; UnitId = 'FINAL' }
    $text = Read-TaskText 'T-A.md'
    Assert-True ($text -match '(?m)^status: "?done"?$') 'FINAL must close task'
    Assert-True ($text -match '(?m)^next: null$') 'done task must clear next'
    Assert-True (([regex]::Matches($text, '(?m)^- \[x\]')).Count -eq 2) 'all units must be checked'

    Invoke-Control @{ Action = 'Activate'; TaskId = 'T-C'; Next = 'U-ONE' }
    Invoke-Control @{ Action = 'Block'; TaskId = 'T-C'; Reason = 'needs approval'; ResumeWhen = 'user approves' }
    $text = Read-TaskText 'T-C.md'
    Assert-True ($text -match '(?m)^status: "?blocked"?$') 'non-retryable blocker must stop immediately'
    Assert-True ($text -match '(?m)^attempts: 0$') 'direct block must not consume retry attempts'
    Invoke-Control @{ Action = 'Resume'; TaskId = 'T-C' }
    Invoke-Control @{ Action = 'Complete'; TaskId = 'T-C'; UnitId = 'U-ONE'; Next = 'FINAL' }
    Invoke-Control @{ Action = 'Complete'; TaskId = 'T-C'; UnitId = 'FINAL' }

    [IO.File]::WriteAllText((Join-Path $TempRoot 'assets\state\automaintain.lock'), '{"pid":999999,"action":"test"}', [Text.UTF8Encoding]::new($false))
    Expect-Failure { Invoke-Control @{ Action = 'Activate'; TaskId = 'T-B'; Next = 'U-ONE' } } 'existing lock must reject state mutation'
    Invoke-Control @{ Action = 'Unlock'; Reason = 'test stale lock' }
    Invoke-Control @{ Action = 'Activate'; TaskId = 'T-B'; Next = 'U-ONE' }
    Invoke-Control @{ Action = 'WriteLog'; TaskId = 'T-B'; UnitId = 'U-ONE'; Result = 'pass'; Check = 'test'; MetaJson = '[{"scope":"test","cause":"same-cause","action":"same-action","outcome":"resolved"}]' }
    $log1 = Get-ChildItem -LiteralPath (Join-Path $TempRoot 'assets\log') -Filter '*.log' | Sort-Object Name | Select-Object -Last 1
    Assert-True ($log1.Name -match '^\d{8}_\d{9}\.log$') 'log name must be pure timestamp'
    Assert-True (@([IO.File]::ReadAllLines($log1.FullName) | Where-Object { $_.Trim() }).Count -eq 1) 'log must contain one line'
    & $Ingest -Workspace $TempRoot -LogPath ('assets/log/' + $log1.Name) | Out-Null
    & $Ingest -Workspace $TempRoot -LogPath ('assets/log/' + $log1.Name) | Out-Null

    Start-Sleep -Milliseconds 2
    Invoke-Control @{ Action = 'WriteLog'; TaskId = 'T-B'; UnitId = 'U-ONE'; Result = 'pass'; Check = 'test'; MetaJson = '[{"scope":"test","cause":"same-cause","action":"same-action","outcome":"resolved"}]' }
    $logs = @(Get-ChildItem -LiteralPath (Join-Path $TempRoot 'assets\log') -Filter '*.log' | Sort-Object Name)
    & $Ingest -Workspace $TempRoot -LogPath ('assets/log/' + $logs[-1].Name) | Out-Null
    $index = [IO.File]::ReadAllText((Join-Path $TempRoot 'assets\state\experience-index.json')) | ConvertFrom-Json
    Assert-True ($index.processed_logs.Count -eq 2) 'duplicate ingest must not duplicate processed logs'
    Assert-True ($index.experiences.Count -eq 1) 'same canonical cause must merge'
    Assert-True ($index.experiences[0].seen -eq 2) 'two source logs must derive seen=2'
    Assert-True ($index.experiences[0].status -eq 'candidate') 'same task supports must stay candidate'
    Assert-True (-not [bool]$index.experiences[0].promotion_ready) 'same task supports must not be promotion-ready'

    Start-Sleep -Milliseconds 2
    Invoke-Control @{ Action = 'WriteLog'; TaskId = 'T-B'; UnitId = 'U-ONE'; Result = 'warn'; Check = 'test'; MetaJson = '[{"scope":"test","cause":"same-cause","action":"different-action","outcome":"resolved"}]' }
    $conflictLog = Get-ChildItem -LiteralPath (Join-Path $TempRoot 'assets\log') -Filter '*.log' | Sort-Object Name | Select-Object -Last 1
    & $Ingest -Workspace $TempRoot -LogPath ('assets/log/' + $conflictLog.Name) | Out-Null
    $index = [IO.File]::ReadAllText((Join-Path $TempRoot 'assets\state\experience-index.json')) | ConvertFrom-Json
    Assert-True ($index.experiences[0].status -eq 'contested') 'conflicting action must remain contested'
    Assert-True (-not [bool]$index.experiences[0].promotion_ready) 'contested experience must not be promotion-ready'

    $lockPath = Join-Path $TempRoot 'assets\state\automaintain.lock'
    [IO.File]::WriteAllText($lockPath, '{"pid":999999,"action":"external-test"}', [Text.UTF8Encoding]::new($false))
    & $Supervisor -Workspace $TempRoot -Action Status | Out-Null
    Assert-True (Test-Path -LiteralPath $lockPath) 'Status must not remove a lock owned by another action'
    & $Supervisor -Workspace $TempRoot -Action Validate | Out-Null
    Assert-True (Test-Path -LiteralPath $lockPath) 'Validate must not remove a lock owned by another action'
    Remove-Item -LiteralPath $lockPath -Force

    [IO.File]::WriteAllText((Join-Path $TempRoot 'assets\log\bad_r1.log'), '{}', [Text.UTF8Encoding]::new($false))
    Expect-Failure { Invoke-Control @{ Action = 'Validate' } } 'legacy live log name must fail validation'

    'PASS control-regression'
} finally {
    $resolvedTemp = [IO.Path]::GetFullPath($TempRoot)
    $systemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolvedTemp.StartsWith($systemTemp, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolvedTemp -Leaf) -like 'kb-harness-*') {
        Remove-Item -LiteralPath $resolvedTemp -Recurse -Force -ErrorAction SilentlyContinue
    }
}
