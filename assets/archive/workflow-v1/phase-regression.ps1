#requires -Version 7.0

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Supervisor = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\scripts\supervise.ps1'))
$TempRoot = Join-Path ([IO.Path]::GetTempPath()) ('phase-harness-' + [guid]::NewGuid().ToString('N'))

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "ASSERT: $Message" }
}

function Invoke-Control([hashtable]$Arguments) {
    & $Supervisor -Workspace $TempRoot @Arguments | Out-Null
}

function Invoke-ControlRaw([hashtable]$Arguments) {
    return (& $Supervisor -Workspace $TempRoot @Arguments | Out-String).Trim()
}

try {
    [IO.Directory]::CreateDirectory((Join-Path $TempRoot 'docs\tasks')) | Out-Null

    $taskTemplate = @'
---
task_id: {TASK}
title: PhaseTest
status: queued
next: null
completion: manual
updated_at: 2026-08-16T00:00:00+09:00
completed_at: null
blocker: null
resume_when: null
attempts: 0
---
# PhaseTest

## Work units

- [ ] `U-001` one
- [ ] `FINAL` final
'@
    [IO.File]::WriteAllText((Join-Path $TempRoot 'docs\tasks\T-P.md'), $taskTemplate.Replace('{TASK}', 'T-P'), [Text.UTF8Encoding]::new($false))

    Invoke-Control @{ Action = 'Validate' }
    Invoke-Control @{ Action = 'Activate'; TaskId = 'T-P'; Next = 'U-001' }

    # Checkpoint forward + persist fields
    $cp = Invoke-ControlRaw @{ Action = 'Checkpoint'; TaskId = 'T-P'; UnitId = 'U-001'; Phase = 'IMPLEMENT'; AcceptanceDefined = $true; ConsumerPathFound = $true; ImplementationPointFound = $true; RootCause = 'height not consumed' } | ConvertFrom-Json
    Assert-True ($cp.phase -eq 'IMPLEMENT') 'checkpoint must persist phase=IMPLEMENT'
    Assert-True ($cp.acceptance_defined -eq $true) 'acceptance_defined must persist'

    # Phase may not regress
    $regressed = $false
    try { Invoke-Control @{ Action = 'Checkpoint'; TaskId = 'T-P'; UnitId = 'U-001'; Phase = 'DISCOVER' } } catch { $regressed = $true }
    Assert-True $regressed 'phase regression must be rejected'

    # Investigate counts until closed
    $closed = $false
    for ($i = 1; $i -le 9; $i++) {
        $inv = Invoke-ControlRaw @{ Action = 'Investigate'; TaskId = 'T-P'; UnitId = 'U-001' } | ConvertFrom-Json
        if ($inv.closed) { $closed = $true }
    }
    Assert-True $closed 'investigation must close at max calls'

    # Status exposes hard state (survives compaction)
    $st = Invoke-ControlRaw @{ Action = 'Status' } | ConvertFrom-Json
    Assert-True ($st.active_unit_phase -eq 'IMPLEMENT') 'status must expose phase'
    Assert-True ($st.investigation_closed -eq $true) 'status must expose closed'

    # Complete clears unit state file
    Invoke-Control @{ Action = 'Complete'; TaskId = 'T-P'; UnitId = 'U-001'; Next = 'FINAL' }
    $statePath = Join-Path $TempRoot 'docs\tasks\state\T-P-U-001.json'
    Assert-True (-not (Test-Path -LiteralPath $statePath)) 'complete must clear unit state file'

    'PASS phase-regression'
} finally {
    $resolvedTemp = [IO.Path]::GetFullPath($TempRoot)
    $systemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolvedTemp.StartsWith($systemTemp, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolvedTemp -Leaf) -like 'phase-harness-*') {
        Remove-Item -LiteralPath $resolvedTemp -Recurse -Force -ErrorAction SilentlyContinue
    }
}
