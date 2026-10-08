#requires -Version 7.0

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$LogPath,

    [string]$Workspace
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# ---------------------------------------------------------------------------
# Workspace paths
# ---------------------------------------------------------------------------

if ($Workspace) {
    $Root = [IO.Path]::GetFullPath($Workspace)
} else {
    $Root = [IO.Path]::GetFullPath(
        (Join-Path $PSScriptRoot '..\..\..\..')
    )
}

$LogDir = [IO.Path]::GetFullPath(
    (Join-Path $Root 'assets\log')
)

$StateDir = Join-Path $Root 'assets\state'
$IndexPath = Join-Path $StateDir 'experience-index.json'
$LockPath = Join-Path $StateDir 'experience.lock'

$FullLogPath = [IO.Path]::GetFullPath(
    (Join-Path $Root $LogPath)
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

$SupportedSchemaVersion = 2

$SupportOutcomes = @(
    'resolved',
    'improved',
    'avoided'
)

$ContradictOutcomes = @(
    'failed',
    'worse',
    'invalid'
)

$ObservationOutcomes = @(
    'observed'
)

$AllowedOutcomes = @(
    $SupportOutcomes +
    $ContradictOutcomes +
    $ObservationOutcomes
)

# Stable machine keys only.
#
# Examples:
#   tooling/powershell
#   pwsh5.1-utf8
#   use-pwsh7
#
# Intentionally excludes spaces and natural-language punctuation.
$MachineKeyPattern = '^[a-z0-9][a-z0-9._/-]*$'

# ---------------------------------------------------------------------------
# Basic log validation
# ---------------------------------------------------------------------------

if (
    -not $FullLogPath.StartsWith(
        $LogDir + [IO.Path]::DirectorySeparatorChar,
        [StringComparison]::OrdinalIgnoreCase
    )
) {
    throw 'Only a live log under assets/log may be ingested.'
}

if (
    [IO.Path]::GetFileName($FullLogPath) -notmatch
    '^\d{8}_\d{9}\.log$'
) {
    throw 'Log filename must be a pure timestamp: YYYYMMDD_HHmmssfff.log.'
}

if (
    -not (Test-Path -LiteralPath $FullLogPath -PathType Leaf)
) {
    throw "Log not found: $FullLogPath"
}

$lines = @(
    [IO.File]::ReadAllLines(
        $FullLogPath,
        [Text.UTF8Encoding]::new($false)
    ) |
        Where-Object { $_.Trim() }
)

if ($lines.Count -ne 1) {
    throw 'A log must contain exactly one non-empty JSON line.'
}

try {
    $record = $lines[0] | ConvertFrom-Json
} catch {
    throw 'Log contains invalid JSON.'
}

foreach ($field in @(
    'time',
    'task',
    'unit',
    'result',
    'check',
    'meta'
)) {
    if ($null -eq $record.PSObject.Properties[$field]) {
        throw "Log is missing '$field'."
    }
}

$recordTask = ([string]$record.task).Trim()
$recordUnit = ([string]$record.unit).Trim()

if ([string]::IsNullOrWhiteSpace($recordTask)) {
    throw "Log field 'task' must not be empty."
}

if ([string]::IsNullOrWhiteSpace($recordUnit)) {
    throw "Log field 'unit' must not be empty."
}

if ($recordTask -notmatch '^T-[A-Z0-9][A-Z0-9-]*$') {
    throw "Log contains invalid task id '$recordTask'."
}

if (
    $recordUnit -ne 'FINAL' -and
    $recordUnit -notmatch '^U-[A-Z0-9][A-Z0-9-]*$'
) {
    throw "Log contains invalid unit id '$recordUnit'."
}

$recordTime = if ($record.time -is [DateTime]) {
    $record.time.ToString('o')
} elseif ($record.time -is [DateTimeOffset]) {
    $record.time.ToString('o')
} else {
    [string]$record.time
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Normalize-MachineKey {
    param(
        [Parameter(Mandatory)]
        [string]$Value,

        [Parameter(Mandatory)]
        [string]$FieldName
    )

    $normalized = $Value.Trim().ToLowerInvariant()

    if ([string]::IsNullOrWhiteSpace($normalized)) {
        throw "Meta field '$FieldName' must not be empty."
    }

    if ($normalized -notmatch $MachineKeyPattern) {
        throw (
            "Meta field '$FieldName' must be a stable lowercase machine key " +
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

function Get-ExperienceId {
    param(
        [Parameter(Mandatory)]
        [string]$Scope,

        [Parameter(Mandatory)]
        [string]$Cause
    )

    $canonical = "$Scope|$Cause"

    $hash = [Security.Cryptography.SHA256]::HashData(
        [Text.Encoding]::UTF8.GetBytes($canonical)
    )

    return (
        'exp-' +
        [Convert]::ToHexString($hash).
            Substring(0, 12).
            ToLowerInvariant()
    )
}

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
                -not [string]::IsNullOrWhiteSpace(
                    [string]$_.source
                )
            } |
            Select-Object -ExpandProperty source -Unique
    ).Count

    $Entry.independent_sources = @(
        $Entry.evidence |
            Where-Object {
                -not [string]::IsNullOrWhiteSpace(
                    [string]$_.task
                )
            } |
            Select-Object -ExpandProperty task -Unique
    ).Count

    $Entry.support = @(
        $Entry.evidence |
            Where-Object relation -eq 'support'
    ).Count

    $Entry.contradict = @(
        $Entry.evidence |
            Where-Object relation -eq 'contradict'
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
        # A pure contradict-only record is also contested. There is no
        # successful reusable strategy to promote.
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
        # index 出现不可能的 baseline 时采取保守策略：
        # 从头重新视为尚未人工审查。
        $reviewedCount = 0
    }

    $newEvidence = @(
        $allEvidence |
            Select-Object -Skip $reviewedCount
    )

    $newContradiction = (
        @(
            $newEvidence |
                Where-Object relation -eq 'contradict'
        ).Count -gt 0
    )

    $newActionConflict = (
        @(
            $newEvidence |
                Where-Object {
                    -not [string]::IsNullOrWhiteSpace(
                        [string]$_.action
                    ) -and
                    [string]$_.action -ne [string]$Entry.action
                }
        ).Count -gt 0
    )

    if (
        $hasCodifiedExperience -and
        (
            $newContradiction -or
            $newActionConflict
        )
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
                    -not [string]::IsNullOrEmpty(
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
                        # A live PID with an unreadable start time is not
                        # safe to declare stale.
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

        $evidenceList =
            [Collections.Generic.List[object]]::new()

        foreach ($oldEvidence in @($oldEntry.evidence)) {
            Add-MissingProperty $oldEvidence 'task' $null
            Add-MissingProperty $oldEvidence 'unit' $null
            Add-MissingProperty $oldEvidence 'action' $action

            if (
                [string]::IsNullOrWhiteSpace(
                    [string]$oldEvidence.task
                ) -or
                [string]::IsNullOrWhiteSpace(
                    [string]$oldEvidence.unit
                )
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

                # Migration only:
                # normalize legacy values emitted by schema v1.
                switch ($oldOutcome) {
                    'success' {
                        $oldOutcome = 'resolved'
                    }

                    'contradicted' {
                        $oldOutcome = 'invalid'
                    }
                }

                if ($oldOutcome -notin $AllowedOutcomes) {
                    # Unknown legacy outcomes cannot safely be classified as
                    # support or contradiction.
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
                        -not [string]::IsNullOrWhiteSpace(
                            [string]$_.action
                        )
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

    $tempPath = (
        $IndexPath +
        '.tmp.' +
        [guid]::NewGuid().ToString('N')
    )

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

# ---------------------------------------------------------------------------
# Lock + ingest
# ---------------------------------------------------------------------------

[IO.Directory]::CreateDirectory($StateDir) | Out-Null

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
        throw "Experience ingest is already locked: $LockPath"
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
        source = $FullLogPath
        created_at = [DateTimeOffset]::Now.ToString('o')
    }

    $lockBytes = [Text.Encoding]::UTF8.GetBytes(
        ($lockPayload | ConvertTo-Json -Compress)
    )

    $lock.Write(
        $lockBytes,
        0,
        $lockBytes.Length
    )

    $lock.Flush()

    # -----------------------------------------------------------------------
    # Load / migrate index
    # -----------------------------------------------------------------------

    if (-not (Test-Path -LiteralPath $IndexPath)) {
        $initialIndex = [ordered]@{
            schema_version = 2
            processed_logs = @()
            experiences = @()
        }

        Write-IndexAtomic -Value $initialIndex
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

    if ($index.schema_version -eq 1) {
        $index = Convert-IndexV1ToV2 -Index $index
        Write-IndexAtomic -Value $index
    } elseif ($index.schema_version -ne $SupportedSchemaVersion) {
        throw (
            "Unsupported experience schema: " +
            "$($index.schema_version)"
        )
    }

    Add-MissingProperty $index 'processed_logs' @()
    Add-MissingProperty $index 'experiences' @()

    # -----------------------------------------------------------------------
    # Idempotence
    # -----------------------------------------------------------------------

    $source = (
        'assets/log/' +
        [IO.Path]::GetFileName($FullLogPath)
    )

    if (@($index.processed_logs) -contains $source) {
        [pscustomobject]@{
            processed = $false
            reason = 'already-processed'
            source = $source
        } |
            ConvertTo-Json -Compress

        return
    }

    # Validate every event before mutating the in-memory index.
    $validatedEvents =
        [Collections.Generic.List[object]]::new()

    foreach ($event in @($record.meta)) {
        foreach ($field in @(
            'scope',
            'cause',
            'action',
            'outcome'
        )) {
            if (
                $null -eq $event.PSObject.Properties[$field] -or
                [string]::IsNullOrWhiteSpace(
                    [string]$event.$field
                )
            ) {
                throw (
                    "Each meta event requires a non-empty " +
                    "'$field'."
                )
            }
        }

        $scope = Normalize-MachineKey `
            -Value ([string]$event.scope) `
            -FieldName 'scope'

        $cause = Normalize-MachineKey `
            -Value ([string]$event.cause) `
            -FieldName 'cause'

        $action = Normalize-MachineKey `
            -Value ([string]$event.action) `
            -FieldName 'action'

        $outcome = (
            [string]$event.outcome
        ).Trim().ToLowerInvariant()

        if ($outcome -notin $AllowedOutcomes) {
            throw (
                "Unsupported meta outcome '$outcome'. " +
                "Allowed values: " +
                ($AllowedOutcomes -join ', ')
            )
        }

        $validatedEvents.Add(
            [pscustomobject][ordered]@{
                scope = $scope
                cause = $cause
                action = $action
                outcome = $outcome
                relation = Get-RelationFromOutcome `
                    -Outcome $outcome
            }
        )
    }

    # -----------------------------------------------------------------------
    # Mutable experience collection
    # -----------------------------------------------------------------------

    $experiences =
        [Collections.Generic.List[object]]::new()

    foreach ($existing in @($index.experiences)) {
        Add-MissingProperty $existing 'review_required' $false
        Add-MissingProperty $existing 'independent_sources' 0
        Add-MissingProperty $existing 'codified_into' $null
        Add-MissingProperty $existing 'promotion_ready' $false

        Add-MissingProperty $existing 'reviewed_at' $null
        Add-MissingProperty $existing 'reviewed_evidence_count' 0

        Add-MissingProperty $existing 'published_text' $null
        Add-MissingProperty $existing 'published_at' $null
        Add-MissingProperty $existing 'published_order' $null

        Add-MissingProperty $existing 'retired' $false
        Add-MissingProperty $existing 'retired_at' $null
        Add-MissingProperty $existing 'retire_reason' $null

        $evidenceList =
            [Collections.Generic.List[object]]::new()

        foreach ($oldEvidence in @($existing.evidence)) {
            Add-MissingProperty $oldEvidence 'task' $null
            Add-MissingProperty $oldEvidence 'unit' $null
            Add-MissingProperty `
                $oldEvidence `
                'action' `
                ([string]$existing.action)

            $evidenceList.Add($oldEvidence)
        }

        $existing.evidence = $evidenceList

        $experiences.Add($existing)
    }

    # -----------------------------------------------------------------------
    # Consume validated events
    # -----------------------------------------------------------------------

    foreach ($event in $validatedEvents) {
        $id = Get-ExperienceId `
            -Scope $event.scope `
            -Cause $event.cause

        $matches = @(
            $experiences |
                Where-Object id -eq $id
        )

        $actionConflict = $false

        if ($matches.Count -eq 0) {
            $entry = [pscustomobject][ordered]@{
                id = $id
                status = 'candidate'
                tier = 'cold'

                scope = $event.scope
                cause = $event.cause
                action = $event.action

                evidence =
                    [Collections.Generic.List[object]]::new()

                seen = 0
                independent_sources = 0
                support = 0
                contradict = 0

                promotion_ready = $false
                codified_into = $null
                review_required = $false

                reviewed_at = $null
                reviewed_evidence_count = 0

                published_text = $null
                published_at = $null
                published_order = $null

                retired = $false
                retired_at = $null
                retire_reason = $null
            }

            $experiences.Add($entry)
        } elseif ($matches.Count -eq 1) {
            $entry = $matches[0]

            $evidenceList =
                [Collections.Generic.List[object]]::new()

            foreach ($oldEvidence in @($entry.evidence)) {
                $evidenceList.Add($oldEvidence)
            }

            $entry.evidence = $evidenceList

            if (
                [string]$entry.action -ne
                [string]$event.action
            ) {
                $actionConflict = $true
            }
        } else {
            throw "Duplicate experience id in index: $id"
        }

        # A single log is a single evidence source for a given experience.
        # Re-ingestion of the same log is prevented globally by processed_logs.
        if (
            @(
                $entry.evidence |
                    Where-Object source -eq $source
            ).Count -eq 0
        ) {
            $entry.evidence.Add(
                [pscustomobject][ordered]@{
                    source = $source
                    task = $recordTask
                    unit = $recordUnit
                    time = $recordTime
                    action = $event.action
                    relation = $event.relation
                    outcome = $event.outcome
                }
            )
        }

        # Detect action conflicts from the complete evidence history rather
        # than only from the current event.
        $distinctActions = @(
            $entry.evidence |
                Where-Object {
                    -not [string]::IsNullOrWhiteSpace(
                        [string]$_.action
                    )
                } |
                Select-Object -ExpandProperty action -Unique
        )

        if ($distinctActions.Count -gt 1) {
            $actionConflict = $true
        }

        Update-DerivedFields `
            -Entry $entry `
            -ActionConflict $actionConflict
    }

    # -----------------------------------------------------------------------
    # Commit index
    # -----------------------------------------------------------------------

    $processed =
        [Collections.Generic.List[string]]::new()

    foreach ($oldSource in @($index.processed_logs)) {
        $processed.Add([string]$oldSource)
    }

    $processed.Add($source)

    $output = [ordered]@{
        schema_version = 2

        processed_logs = @(
            $processed |
                Sort-Object -Unique
        )

        experiences = @(
            $experiences |
                Sort-Object id
        )
    }

    Write-IndexAtomic -Value $output

    # -----------------------------------------------------------------------
    # Machine-readable result
    # -----------------------------------------------------------------------

    [pscustomobject]@{
        processed = $true
        source = $source
        task = $recordTask
        unit = $recordUnit
        events = @($validatedEvents).Count

        promotion_ready = @(
            $experiences |
                Where-Object promotion_ready |
                ForEach-Object id
        )

        review_required = @(
            $experiences |
                Where-Object review_required |
                ForEach-Object id
        )
    } |
        ConvertTo-Json -Depth 6 -Compress
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