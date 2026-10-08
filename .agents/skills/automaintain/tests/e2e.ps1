#requires -Version 7.0

# 端到端冒烟测试：一个完整维护回合串起「收件箱摄取 → 任务状态机 → 运行日志 → 经验提炼」。
# 覆盖跨组件接口契约：supervise 生成的日志能被 ingest 消费。
# 场景为通用项目（源文件 + 测试 + 文档），不依赖具体领域。
# 内容类检查器属于领域 profile，在各自 skill 的测试中验证，不在此处耦合。

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Supervisor = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\scripts\supervise.ps1'))
$Ingest = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\experience\scripts\ingest-log.ps1'))
$TempRoot = Join-Path ([IO.Path]::GetTempPath()) ('e2e-' + [guid]::NewGuid().ToString('N'))

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "ASSERT: $Message" }
}

function Write-Utf8([string]$RelativePath, [string]$Text) {
    $path = Join-Path $TempRoot $RelativePath
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path)) | Out-Null
    [IO.File]::WriteAllText($path, $Text, [Text.UTF8Encoding]::new($false))
}

try {
    # 1. 建通用 workspace 结构（无 git，走 fallback 枚举）
    [IO.Directory]::CreateDirectory((Join-Path $TempRoot 'assets\task')) | Out-Null
    [IO.Directory]::CreateDirectory((Join-Path $TempRoot 'assets\log')) | Out-Null
    [IO.Directory]::CreateDirectory((Join-Path $TempRoot 'assets\state')) | Out-Null
    [IO.File]::WriteAllText((Join-Path $TempRoot 'assets\state\experience-index.json'), '{"schema_version":2,"processed_logs":[],"experiences":[]}', [Text.UTF8Encoding]::new($false))

    Write-Utf8 'src/lib.js' "export function add(a, b) { return a + b; }`n"
    Write-Utf8 'tests/lib.test.js' "// placeholder: assert add(1, 2) === 3`n"
    Write-Utf8 'docs/README.md' "# Demo`n`nUsage: add(a, b)`n"

    Write-Utf8 'assets/todo.md' "# Inbox`n`n- [ ] 实现 add 并补测试与文档`n"
    & $Supervisor -Workspace $TempRoot -Action SyncInbox | Out-Null
    $inboxStatus = & $Supervisor -Workspace $TempRoot -Action Status | ConvertFrom-Json
    $sourceId = $inboxStatus.inbox[0].id

    $task = @'
---
task_id: T-E2E
source: "{SOURCE}"
title: E2E
status: queued
next: null
updated_at: 2026-08-16T00:00:00+09:00
completed_at: null
blocker: null
resume_when: null
attempts: 0
---

# E2E

## 目标

- src 提供可验证的实现，测试与文档同步。

## 任务范围

- src
- tests
- docs

## 验收条件

- 实现、测试与文档一致。

## 依赖与约束

- 无。

## 执行步骤

- [ ] `U-CODE` 实现 src/lib.js
- [ ] `U-TEST` 补充 tests/lib.test.js
- [ ] `U-DOC` 更新 docs/README.md
- [ ] `FINAL` 变更集最终验收
'@
    Write-Utf8 'assets/task/T-E2E.md' $task.Replace('{SOURCE}', $sourceId)
    & $Supervisor -Workspace $TempRoot -Action SyncInbox | Out-Null

    # 2. 状态机：激活 → 完成多个步骤 → 任务 done
    & $Supervisor -Workspace $TempRoot -Action Validate | Out-Null
    & $Supervisor -Workspace $TempRoot -Action Activate -TaskId T-E2E -Next U-CODE | Out-Null
    & $Supervisor -Workspace $TempRoot -Action Complete -TaskId T-E2E -UnitId U-CODE -Next U-TEST | Out-Null
    & $Supervisor -Workspace $TempRoot -Action Complete -TaskId T-E2E -UnitId U-TEST -Next U-DOC | Out-Null
    & $Supervisor -Workspace $TempRoot -Action Complete -TaskId T-E2E -UnitId U-DOC -Next FINAL | Out-Null
    & $Supervisor -Workspace $TempRoot -Action Complete -TaskId T-E2E -UnitId FINAL | Out-Null
    $taskText = [IO.File]::ReadAllText((Join-Path $TempRoot 'assets\task\T-E2E.md'), [Text.UTF8Encoding]::new($false))
    Assert-True ($taskText -match '(?m)^status: "?done"?$') 'FINAL 完成必须把任务置为 done'
    Assert-True ($taskText -notmatch '(?m)^- \[ \]') 'done 任务不得残留未勾选执行步骤'

    # 3. 写日志 → 提炼经验（跨组件接口契约）
    $logPath = & $Supervisor -Workspace $TempRoot -Action WriteLog -TaskId T-E2E -UnitId U-CODE -Result pass -Check 'e2e' -MetaJson '[{"scope":"testing/e2e","cause":"cross-component-log","action":"ingest-runtime-log","outcome":"observed"}]'
    Assert-True (Test-Path -LiteralPath ($logPath.Trim()) -PathType Leaf) 'WriteLog 必须生成日志文件'
    $logName = [IO.Path]::GetFileName($logPath.Trim())
    Assert-True ($logName -match '^\d{8}_\d{9}\.log$') '日志文件名必须是纯时间戳'
    & $Ingest -Workspace $TempRoot -LogPath ('assets/log/' + $logName) | Out-Null
    $index = [IO.File]::ReadAllText((Join-Path $TempRoot 'assets\state\experience-index.json'), [Text.UTF8Encoding]::new($false)) | ConvertFrom-Json
    Assert-True (@($index.processed_logs).Count -eq 1) '日志必须被经验处理脚本登记'
    Assert-True (@($index.experiences).Count -eq 1) 'meta 事件必须提炼为经验依据'

    'PASS e2e'
} finally {
    $resolvedTemp = [IO.Path]::GetFullPath($TempRoot)
    $systemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolvedTemp.StartsWith($systemTemp, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolvedTemp -Leaf) -like 'e2e-*') {
        Remove-Item -LiteralPath $resolvedTemp -Recurse -Force -ErrorAction SilentlyContinue
    }
}
