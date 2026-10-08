Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Get-RoomFileSha256 {
    param([string]$Path)
    $stream = [IO.File]::OpenRead([IO.Path]::GetFullPath($Path))
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','') }
    finally { $sha.Dispose(); $stream.Dispose() }
}

function Get-RoomWindowsArchitecture {
    if (-not [Environment]::Is64BitOperatingSystem) {
        throw '不支持 32 位 Windows。请使用 Windows 10/11 的 x64 或 ARM64 主机。'
    }
    $architecture = $null
    $registryKey = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SYSTEM\CurrentControlSet\Control\Session Manager\Environment')
    if ($registryKey) {
        try { $architecture = [string]$registryKey.GetValue('PROCESSOR_ARCHITECTURE') }
        finally { $registryKey.Dispose() }
    }
    if (-not $architecture) { $architecture = $env:PROCESSOR_ARCHITEW6432 }
    if (-not $architecture) { $architecture = $env:PROCESSOR_ARCHITECTURE }
    switch ($architecture.ToUpperInvariant()) {
        'AMD64' { return 'x64' }
        'ARM64' { return 'arm64' }
        default { throw ('不支持此 Windows 架构：{0}' -f $architecture) }
    }
}

function Get-RoomNodeVersion {
    param([Parameter(Mandatory = $true)][string]$NodePath)
    if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { return $null }
    try {
        $versionText = (& $NodePath --version 2>$null | Out-String).Trim()
        if ($LASTEXITCODE -eq 0 -and $versionText -match '^v(\d+)\.(\d+)\.(\d+)$' -and [int]$Matches[1] -ge 22) {
            return $versionText
        }
    } catch { }
    return $null
}

function Get-RoomReparseTag {
    param([string]$Path)
    if (-not ('RoomRuntime.NativeFileInfo' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
namespace RoomRuntime {
    public static class NativeFileInfo {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct FindData {
            public uint Attributes;
            public System.Runtime.InteropServices.ComTypes.FILETIME CreationTime;
            public System.Runtime.InteropServices.ComTypes.FILETIME LastAccessTime;
            public System.Runtime.InteropServices.ComTypes.FILETIME LastWriteTime;
            public uint FileSizeHigh, FileSizeLow, ReparseTag, Reserved;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string FileName;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 14)] public string AlternateFileName;
        }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr FindFirstFileW(string path, out FindData data);
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool FindClose(IntPtr handle);
        public static uint ReparseTag(string path) {
            FindData data;
            IntPtr handle = FindFirstFileW(path, out data);
            if (handle == new IntPtr(-1)) throw new Win32Exception(Marshal.GetLastWin32Error());
            try { return (data.Attributes & 0x400u) == 0 ? 0u : data.ReparseTag; }
            finally { FindClose(handle); }
        }
    }
}
'@
    }
    return [RoomRuntime.NativeFileInfo]::ReparseTag([IO.Path]::GetFullPath($Path).TrimEnd('\', '/'))
}

function Assert-RoomContainedPath {
    param([string]$Path, [string]$Root)
    $fullRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    $fullPath = [IO.Path]::GetFullPath($Path)
    if (-not $fullPath.StartsWith($fullRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw ('Refusing to write outside the runtime directory: {0}' -f $fullPath)
    }
    # Name-surrogate tags redirect paths; OneDrive cloud placeholders do not.
    # https://learn.microsoft.com/en-us/windows/win32/fileio/reparse-point-tags
    $currentPath = $fullPath
    while ($currentPath.Length -ge $fullRoot.Length) {
        if (Test-Path -LiteralPath $currentPath) {
            $item = Get-Item -LiteralPath $currentPath -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                $reparseTag = Get-RoomReparseTag -Path $currentPath
                if (($reparseTag -band 0x20000000) -ne 0) {
                    throw ('Runtime paths must not contain junctions or symbolic links: {0}' -f $currentPath)
                }
            }
        }
        if ($currentPath -eq $fullRoot) { break }
        $currentPath = Split-Path -Parent $currentPath
    }
    return $fullPath
}

function Get-RoomNodeRelease {
    param([string]$ManifestPath, [ValidateSet('x64', 'arm64')][string]$Architecture)
    if ((Get-Item -LiteralPath $ManifestPath).Length -gt 1MB) { throw 'The official Node.js checksum manifest is unexpectedly large.' }
    $pattern = '^([a-fA-F0-9]{64})\s+(node-(v22\.\d+\.\d+)-win-' + $Architecture + '\.zip)$'
    $releases = @(Get-Content -LiteralPath $ManifestPath | ForEach-Object {
        if ($_ -match $pattern) {
            [pscustomobject]@{ Hash = $Matches[1].ToUpperInvariant(); FileName = $Matches[2]; Version = $Matches[3] }
        }
    })
    if ($releases.Count -ne 1) { throw ('No unique official Node.js 22 Windows {0} ZIP was found in the checksum manifest.' -f $Architecture) }
    return $releases[0]
}

function Receive-RoomOfficialFile {
    param([string]$Uri, [string]$Destination, [int]$TimeoutSeconds = 180)
    $downloadUri = [Uri]$Uri
    if ($downloadUri.Scheme -ne 'https' -or $downloadUri.Host -ne 'nodejs.org' -or $downloadUri.Port -ne 443) {
        throw 'Runtime downloads must use HTTPS from nodejs.org.'
    }
    $oldProgressPreference = $ProgressPreference
    $ProgressPreference = 'SilentlyContinue'
    try {
        for ($attempt = 1; $attempt -le 3; $attempt++) {
            try {
                Invoke-WebRequest -UseBasicParsing -Uri $Uri -OutFile $Destination -TimeoutSec $TimeoutSeconds -MaximumRedirection 0
                return
            } catch {
                if ($attempt -eq 3) { throw ('官方下载重试 3 次仍失败（{0}）。请让分享者发送包含 .runtime 的离线包，或自行从 https://nodejs.org/ 安装 Node.js 22 后重试。详细原因：{1}' -f $Uri, $_.Exception.Message) }
                Write-Host ('下载中断，正在重试（{0}/3）……' -f ($attempt + 1))
                Start-Sleep -Seconds (2 * $attempt)
            }
        }
    } finally { $ProgressPreference = $oldProgressPreference }
}

function Expand-RoomVerifiedNode {
    param([string]$ZipPath, [string]$ExpectedHash, [string]$ArchiveRoot, [string]$Destination)
    $actualHash = Get-RoomFileSha256 -Path $ZipPath
    if ($ExpectedHash -notmatch '^[a-fA-F0-9]{64}$' -or $actualHash -ne $ExpectedHash) {
        throw 'Node.js 下载文件的 SHA256 校验失败，未执行其中的程序。请重新运行启动器。'
    }
    if ($ArchiveRoot -notmatch '^node-v22\.\d+\.\d+-win-(x64|arm64)$') { throw 'Invalid Node.js archive name.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        # Validate every path before extracting any executable, including ZIP traversal and symlinks.
        foreach ($entry in $archive.Entries) {
            $entryName = $entry.FullName.Replace('\', '/')
            if ($entryName -ne ($ArchiveRoot + '/') -and -not $entryName.StartsWith($ArchiveRoot + '/', [StringComparison]::Ordinal)) {
                throw ('Unexpected file in the Node.js archive: {0}' -f $entryName)
            }
            if ($entryName -match '(^|/)\.\.(/|$)|:|(^|/)\.(/|$)' -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) {
                throw ('Unsafe path in the Node.js archive: {0}' -f $entryName)
            }
            $targetPath = Join-Path $Destination $entryName
            $null = Assert-RoomContainedPath -Path $targetPath -Root $Destination
        }
        [IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $Destination)
    } finally { $archive.Dispose() }
    $nodePath = Join-Path (Join-Path $Destination $ArchiveRoot) 'node.exe'
    if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf)) { throw 'The verified Node.js archive does not contain node.exe.' }
    return $nodePath
}

function Resolve-RoomNode {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$ProjectRoot, [switch]$PortableOnly)
    $architecture = Get-RoomWindowsArchitecture
    if (-not $PortableOnly) {
        $installedNode = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($installedNode) {
            $installedVersion = Get-RoomNodeVersion -NodePath $installedNode.Source
            if ($installedVersion) { return [pscustomobject]@{ Path = $installedNode.Source; Version = $installedVersion; Portable = $false; Architecture = $architecture } }
        }
    }
    $runtimeRoot = Join-Path ([IO.Path]::GetFullPath($ProjectRoot)) '.runtime'
    $portableRoot = Assert-RoomContainedPath -Path (Join-Path $runtimeRoot ('node-win-' + $architecture)) -Root $runtimeRoot
    $portableNode = Assert-RoomContainedPath -Path (Join-Path $portableRoot 'node.exe') -Root $runtimeRoot
    $portableVersion = Get-RoomNodeVersion -NodePath $portableNode
    if ($portableVersion) { return [pscustomobject]@{ Path = $portableNode; Version = $portableVersion; Portable = $true; Architecture = $architecture } }
    if (Test-Path -LiteralPath $portableRoot) {
        throw ('现有便携运行时不完整或版本过旧：{0}。请先将该文件夹改名后重试，或让分享者重新打包。' -f $portableRoot)
    }
    $null = New-Item -ItemType Directory -Path $runtimeRoot -Force
    $lockPath = Assert-RoomContainedPath -Path (Join-Path $runtimeRoot 'node-bootstrap.lock') -Root $runtimeRoot
    try { $bootstrapLock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
    catch { throw '另一个窗口正在安装运行时，或当前文件夹不可写。请等待安装结束，并在完整解压、可写入的游戏目录中重试。' }
    $temporaryRoot = Join-Path $runtimeRoot ('.node-install-' + [Guid]::NewGuid().ToString('N'))
    try {
        # Another launcher may have completed while this process was acquiring the lock.
        $portableVersion = Get-RoomNodeVersion -NodePath $portableNode
        if ($portableVersion) { return [pscustomobject]@{ Path = $portableNode; Version = $portableVersion; Portable = $true; Architecture = $architecture } }
        $null = Assert-RoomContainedPath -Path $temporaryRoot -Root $runtimeRoot
        $null = New-Item -ItemType Directory -Path $temporaryRoot
        Write-Host ('正在准备 Windows {0} 的便携 Node.js 22，仅首次需要下载。' -f $architecture)
        $oldSecurityProtocol = [Net.ServicePointManager]::SecurityProtocol
        try {
            [Net.ServicePointManager]::SecurityProtocol = $oldSecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
            $manifestPath = Join-Path $temporaryRoot 'SHASUMS256.txt'
            Receive-RoomOfficialFile -Uri 'https://nodejs.org/download/release/latest-v22.x/SHASUMS256.txt' -Destination $manifestPath -TimeoutSeconds 60
            $release = Get-RoomNodeRelease -ManifestPath $manifestPath -Architecture $architecture
            $zipPath = Join-Path $temporaryRoot $release.FileName
            Write-Host ('正在从 nodejs.org 下载 {0}……' -f $release.FileName)
            Receive-RoomOfficialFile -Uri ('https://nodejs.org/download/release/{0}/{1}' -f $release.Version, $release.FileName) -Destination $zipPath
        } finally { [Net.ServicePointManager]::SecurityProtocol = $oldSecurityProtocol }
        $extractionRoot = Join-Path $temporaryRoot 'extracted'
        $null = New-Item -ItemType Directory -Path $extractionRoot
        $archiveRoot = $release.FileName.Substring(0, $release.FileName.Length - 4)
        $verifiedNode = Expand-RoomVerifiedNode -ZipPath $zipPath -ExpectedHash $release.Hash -ArchiveRoot $archiveRoot -Destination $extractionRoot
        $verifiedVersion = Get-RoomNodeVersion -NodePath $verifiedNode
        if ($verifiedVersion -ne $release.Version) { throw 'The downloaded Node.js executable version does not match its official manifest.' }
        $payloadRoot = Assert-RoomContainedPath -Path (Join-Path $extractionRoot $archiveRoot) -Root $temporaryRoot
        $null = Assert-RoomContainedPath -Path $portableRoot -Root $runtimeRoot
        Move-Item -LiteralPath $payloadRoot -Destination $portableRoot
        Write-Host '便携 Node.js 已就绪。本游戏不需要安装 npm 依赖包。'
        return [pscustomobject]@{ Path = $portableNode; Version = $verifiedVersion; Portable = $true; Architecture = $architecture }
    } finally {
        try {
            if (Test-Path -LiteralPath $temporaryRoot) {
                $safeTemporaryRoot = Assert-RoomContainedPath -Path $temporaryRoot -Root $runtimeRoot
                Remove-Item -LiteralPath $safeTemporaryRoot -Recurse -Force
            }
        } finally { $bootstrapLock.Dispose() }
    }
}

Export-ModuleMember -Function Resolve-RoomNode, Get-RoomWindowsArchitecture, Get-RoomNodeRelease, Expand-RoomVerifiedNode, Assert-RoomContainedPath, Get-RoomFileSha256
