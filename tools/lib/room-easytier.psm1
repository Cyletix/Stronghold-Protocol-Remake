Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
# Reuse the caller's runtime module. Force-reloading it here removes its exported
# hashing helper from the packaging script's scope in Windows PowerShell 5.1.
Import-Module (Join-Path $PSScriptRoot 'room-node-runtime.psm1')

function Resolve-RoomEasyTier {
    param([string]$ProjectRoot, [string]$ArchivePath)
    $arch = Get-RoomWindowsArchitecture
    # Fixed release, checked against the official GitHub release asset digest.
    $release = if ($arch -eq 'x64') {
        @{Name='easytier-windows-x86_64-v2.6.4.zip';Root='easytier-windows-x86_64';Hash='27af91e270e554709b048bd32327fefd2dfce5062ae1e8701af7550c6f525f84'}
    } else {
        @{Name='easytier-windows-arm64-v2.6.4.zip';Root='easytier-windows-arm64';Hash='37023f8a3451c9234b17ee2089a03dc344ce90d803b5b359cb6c46682b0549b4'}
    }
    $cacheRoot = Join-Path $ProjectRoot ('.runtime/easytier-v2.6.4-' + $arch)
    $null = Assert-RoomContainedPath -Path $cacheRoot -Root $ProjectRoot
    $manifestPath = Join-Path $cacheRoot 'verified-files.json'
    $files = @('easytier-core.exe','easytier-cli.exe','Packet.dll','wintun.dll','WinDivert64.sys')
    if (Test-Path -LiteralPath $manifestPath) {
        $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        if ($manifest.archiveSha256 -ne $release.Hash) { throw 'EasyTier缓存版本不匹配，请重新解压分享包。' }
        foreach ($file in $files) {
            $filePath = Join-Path $cacheRoot $file
            $null = Assert-RoomContainedPath -Path $filePath -Root $ProjectRoot
            if (-not (Test-Path -LiteralPath $filePath) -or (Get-RoomFileSha256 -Path $filePath) -ne $manifest.files.$file) { throw "EasyTier文件校验失败：$file。请重新解压分享包。" }
        }
        return $cacheRoot
    }
    if (-not $ArchivePath) {
        foreach ($candidate in @((Join-Path $ProjectRoot $release.Name),(Join-Path $ProjectRoot ('.runtime/downloads/' + $release.Name)))) {
            if (Test-Path -LiteralPath $candidate -PathType Leaf) { $ArchivePath = $candidate; break }
        }
    }
    if (-not $ArchivePath) {
        $downloadRoot = Join-Path $ProjectRoot '.runtime/downloads'
        $null = Assert-RoomContainedPath -Path $downloadRoot -Root $ProjectRoot
        [IO.Directory]::CreateDirectory($downloadRoot) | Out-Null
        $ArchivePath = Join-Path $downloadRoot $release.Name
        $null = Assert-RoomContainedPath -Path $ArchivePath -Root $ProjectRoot
        Write-Host '首次准备 EasyTier，正在下载官方便携包……'
        $oldTls = [Net.ServicePointManager]::SecurityProtocol
        $oldProgress = $ProgressPreference
        try {
            [Net.ServicePointManager]::SecurityProtocol = $oldTls -bor [Net.SecurityProtocolType]::Tls12
            $ProgressPreference = 'SilentlyContinue'
            Invoke-WebRequest -UseBasicParsing -Uri ('https://github.com/EasyTier/EasyTier/releases/download/v2.6.4/' + $release.Name) -OutFile $ArchivePath -TimeoutSec 180
        } finally { [Net.ServicePointManager]::SecurityProtocol = $oldTls; $ProgressPreference = $oldProgress }
    }
    if ((Get-RoomFileSha256 -Path $ArchivePath) -ne $release.Hash) { throw ('EasyTier压缩包与官方SHA256不一致：' + $ArchivePath) }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Directory]::CreateDirectory($cacheRoot) | Out-Null
    $archive = [IO.Compression.ZipFile]::OpenRead($ArchivePath)
    $hashes = @{}
    try {
        # Extract exact known entries only; archive paths are never used as destinations.
        foreach ($file in $files) {
            $entry = $archive.GetEntry($release.Root + '/' + $file)
            if (-not $entry) { throw ('官方包缺少必需文件：' + $file) }
            $destination = Join-Path $cacheRoot $file
            $null = Assert-RoomContainedPath -Path $destination -Root $ProjectRoot
            if ((Test-Path -LiteralPath $destination) -and (Get-Item -LiteralPath $destination -Force).LinkType) { throw 'EasyTier运行文件不能是文件链接。' }
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$destination,$true)
            $hashes[$file] = Get-RoomFileSha256 -Path $destination
        }
    } finally { $archive.Dispose() }
    $manifest = @{version='2.6.4';archiveSha256=$release.Hash;source='https://github.com/EasyTier/EasyTier/releases/tag/v2.6.4';files=$hashes}
    [IO.File]::WriteAllText($manifestPath,($manifest | ConvertTo-Json -Depth 4),(New-Object Text.UTF8Encoding($false)))
    Write-Host 'EasyTier已准备完成；采用无虚拟网卡模式，不安装服务或驱动。'
    return $cacheRoot
}
Export-ModuleMember -Function Resolve-RoomEasyTier
