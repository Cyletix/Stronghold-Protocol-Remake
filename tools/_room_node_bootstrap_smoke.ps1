[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'lib\room-node-runtime.psm1') -Force
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('room-node-bootstrap-test-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $fixtureRoot
$checks = 0
function Assert-Condition {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
    $script:checks++
}
function Assert-Rejected {
    param([scriptblock]$Action, [string]$Message)
    $rejected = $false
    try { & $Action | Out-Null } catch { $rejected = $true }
    Assert-Condition $rejected $Message
}
function New-FixtureZip {
    param([string]$Name, [string[]]$Entries)
    $zipPath = Join-Path $fixtureRoot $Name
    $zip = [IO.Compression.ZipFile]::Open($zipPath, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($entryName in $Entries) {
            $entry = $zip.CreateEntry($entryName)
            $writer = New-Object IO.StreamWriter($entry.Open())
            try { $writer.Write('Fixture only; never executed.') } finally { $writer.Dispose() }
        }
    } finally { $zip.Dispose() }
    return $zipPath
}
try {
    $archiveRoot = 'node-v22.23.2-win-x64'
    $manifestPath = Join-Path $fixtureRoot 'SHASUMS256.txt'
    $fakeHash = 'a' * 64
    Set-Content -LiteralPath $manifestPath -Encoding ASCII -Value ($fakeHash + '  ' + $archiveRoot + '.zip')
    $release = Get-RoomNodeRelease -ManifestPath $manifestPath -Architecture x64
    Assert-Condition ($release.Version -eq 'v22.23.2' -and $release.FileName -eq ($archiveRoot + '.zip')) 'Official manifest entry was not parsed.'
    Assert-Rejected { Get-RoomNodeRelease -ManifestPath $manifestPath -Architecture arm64 } 'A missing architecture was accepted.'
    Add-Content -LiteralPath $manifestPath -Encoding ASCII -Value ($fakeHash + '  ' + $archiveRoot + '.zip')
    Assert-Rejected { Get-RoomNodeRelease -ManifestPath $manifestPath -Architecture x64 } 'A duplicate manifest entry was accepted.'
    Set-Content -LiteralPath $manifestPath -Encoding ASCII -Value ($fakeHash + '  node-v22.23.2-win-x64.zip.exe')
    Assert-Rejected { Get-RoomNodeRelease -ManifestPath $manifestPath -Architecture x64 } 'An executable disguised as a ZIP was accepted.'

    $zipPath = New-FixtureZip -Name 'valid.zip' -Entries @(($archiveRoot + '/node.exe'))
    $expectedHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
    $extractPath = Join-Path $fixtureRoot 'verified'
    $nodePath = Expand-RoomVerifiedNode -ZipPath $zipPath -ExpectedHash $expectedHash -ArchiveRoot $archiveRoot -Destination $extractPath
    Assert-Condition (Test-Path -LiteralPath $nodePath -PathType Leaf) 'A verified archive was not extracted.'
    $badHashPath = Join-Path $fixtureRoot 'bad-hash'
    Assert-Rejected { Expand-RoomVerifiedNode -ZipPath $zipPath -ExpectedHash $fakeHash -ArchiveRoot $archiveRoot -Destination $badHashPath } 'A mismatched SHA256 hash was accepted.'
    Assert-Condition (-not (Test-Path -LiteralPath $badHashPath)) 'Hash rejection wrote extracted files.'
    Assert-Rejected { Expand-RoomVerifiedNode -ZipPath (Join-Path $fixtureRoot 'missing.zip') -ExpectedHash $fakeHash -ArchiveRoot $archiveRoot -Destination $badHashPath } 'A missing ZIP was accepted.'

    $corruptPath = Join-Path $fixtureRoot 'corrupt.zip'
    Set-Content -LiteralPath $corruptPath -Value 'not a ZIP'
    $corruptHash = (Get-FileHash -LiteralPath $corruptPath -Algorithm SHA256).Hash
    Assert-Rejected { Expand-RoomVerifiedNode -ZipPath $corruptPath -ExpectedHash $corruptHash -ArchiveRoot $archiveRoot -Destination $badHashPath } 'A corrupt ZIP with a matching hash was accepted.'

    $traversalZip = New-FixtureZip -Name 'traversal.zip' -Entries @(($archiveRoot + '/node.exe'), ($archiveRoot + '/../../escape.txt'))
    $traversalHash = (Get-FileHash -LiteralPath $traversalZip -Algorithm SHA256).Hash
    $traversalDestination = Join-Path $fixtureRoot 'traversal'
    Assert-Rejected { Expand-RoomVerifiedNode -ZipPath $traversalZip -ExpectedHash $traversalHash -ArchiveRoot $archiveRoot -Destination $traversalDestination } 'ZIP traversal was accepted.'
    Assert-Condition (-not (Test-Path -LiteralPath $traversalDestination)) 'Unsafe ZIP validation extracted earlier entries.'
    Assert-Condition (-not (Test-Path -LiteralPath (Join-Path $fixtureRoot 'escape.txt'))) 'ZIP traversal wrote outside its destination.'

    $wrongRootZip = New-FixtureZip -Name 'wrong-root.zip' -Entries @('other/node.exe')
    $wrongRootHash = (Get-FileHash -LiteralPath $wrongRootZip -Algorithm SHA256).Hash
    Assert-Rejected { Expand-RoomVerifiedNode -ZipPath $wrongRootZip -ExpectedHash $wrongRootHash -ArchiveRoot $archiveRoot -Destination $badHashPath } 'An unexpected archive root was accepted.'

    $module = Get-Module room-node-runtime
    $ordinaryPath = & $module { param($path, $root) Assert-RoomContainedPath -Path $path -Root $root } (Join-Path $fixtureRoot 'ordinary') $fixtureRoot
    Assert-Condition ($ordinaryPath -eq (Join-Path $fixtureRoot 'ordinary')) 'An ordinary runtime path was rejected.'
    $junctionTarget = Join-Path $fixtureRoot 'junction-target'
    $junctionPath = Join-Path $fixtureRoot 'junction'
    $null = New-Item -ItemType Directory -Path $junctionTarget
    $null = New-Item -ItemType Junction -Path $junctionPath -Target $junctionTarget
    try {
        $junctionTag = & $module { param($path) Get-RoomReparseTag -Path $path } $junctionPath
        Assert-Condition (($junctionTag -band 0x20000000) -ne 0) 'The actual junction reparse tag was not recognized.'
        Assert-Rejected { & $module { param($path, $root) Assert-RoomContainedPath -Path $path -Root $root } (Join-Path $junctionPath 'node.exe') $fixtureRoot } 'A junction redirected a runtime path.'
    } finally {
        # Delete only the junction itself, without recursing into its target.
        [IO.Directory]::Delete($junctionPath)
    }
    $projectWeb = Join-Path (Split-Path -Parent $PSScriptRoot) 'web'
    if ((Test-Path -LiteralPath $projectWeb) -and ((Get-Item -LiteralPath $projectWeb).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        $cloudTag = & $module { param($path) Get-RoomReparseTag -Path $path } $projectWeb
        if (($cloudTag -band 0x20000000) -eq 0) {
            $cloudPath = & $module { param($path, $root) Assert-RoomContainedPath -Path $path -Root $root } (Join-Path $projectWeb 'index.html') $projectWeb
            Assert-Condition ($cloudPath -eq (Join-Path $projectWeb 'index.html')) 'OneDrive cloud metadata was mistaken for a redirecting link.'
        }
    }
    Write-Host ('Portable Node bootstrap smoke passed ({0} assertions).' -f $checks)
} finally {
    $resolvedFixtureRoot = [IO.Path]::GetFullPath($fixtureRoot)
    $resolvedTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/')
    if (-not $resolvedFixtureRoot.StartsWith($resolvedTempRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $resolvedFixtureRoot) -notmatch '^room-node-bootstrap-test-[a-f0-9]{32}$') {
        throw 'Refusing to remove an unexpected fixture path.'
    }
    Remove-Item -LiteralPath $resolvedFixtureRoot -Recurse -Force
}
