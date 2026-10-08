param([switch]$NoRuntime, [switch]$LocalOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
try {
    $required = @('开始游戏.cmd','联机使用说明.txt','tools/start-room.ps1','tools/start-room.js','tools/room-online.js','tools/room-launcher.js','tools/room_server.js','tools/lib/game-process.psm1','tools/lib/launcher-windows.js','tools/lib/room-share-code.js','tools/lib/room-profile.js','tools/lib/room-web-client.js','tools/lib/room-node-runtime.psm1','tools/lib/room-easytier.psm1','tools/lib/room-game-runtime.js','tools/lib/room-battle-session.js','tools/vendor/EasyTier-LICENSE.txt','tools/vendor/EasyTier-NOTICE.txt')
    $required += 'tools/lib/listen-port.js'
    foreach ($relative in ($required + @('web/index.html','web/room-lab.html','web/source_battles.json','web/garrison_data.json'))) {
        if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $relative) -PathType Leaf)) { throw "缺少文件：$relative" }
    }
    Import-Module (Join-Path $PSScriptRoot 'lib/room-node-runtime.psm1') -Force -DisableNameChecking
    $runtimeArch = Get-RoomWindowsArchitecture
    $runtime = Resolve-RoomNode -ProjectRoot $projectRoot -PortableOnly:(-not $NoRuntime)
    if (-not $LocalOnly) {
        Import-Module (Join-Path $PSScriptRoot 'lib/room-easytier.psm1') -Force
        $easyRoot = Resolve-RoomEasyTier -ProjectRoot $projectRoot
    }
    $outputRoot = Join-Path $projectRoot 'dist'
    [IO.Directory]::CreateDirectory($outputRoot) | Out-Null
    $batch = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + ([Guid]::NewGuid().ToString('N').Substring(0,6))
    function Copy-ShareFile([string]$Source, [string]$Relative) {
        $destination = [IO.Path]::GetFullPath((Join-Path $shareRoot $Relative))
        if (-not $destination.StartsWith($shareRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw '分享文件路径越界。' }
        # Most files need no PowerShell provider lookup. Keep the original link
        # check for reparse points, including OneDrive files which are not links.
        if ((([IO.File]::GetAttributes($Source) -band [IO.FileAttributes]::ReparsePoint) -ne 0) -and (Get-Item -LiteralPath $Source -Force).LinkType) { throw '分享源文件不能是链接。' }
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
        [IO.File]::Copy($Source,$destination,$false)
    }
    function Copy-ShareTree([string]$Relative) {
        $sourceRoot = Join-Path $projectRoot $Relative
        if ((Get-Item -LiteralPath $sourceRoot -Force).LinkType) { throw "分享目录不能是链接：$sourceRoot" }
        foreach ($entry in Get-ChildItem -LiteralPath $sourceRoot -Recurse -Force) {
            if ($entry.LinkType) { throw "分享目录含链接：$($entry.FullName)" }
            if (-not $entry.PSIsContainer) {
                $suffix = $entry.FullName.Substring($sourceRoot.Length).TrimStart([char[]]'\/')
                Copy-ShareFile $entry.FullName (Join-Path $Relative $suffix)
            }
        }
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $roles = if ($LocalOnly) { @('Local') } else { @('Universal') }
    foreach ($packageRole in $roles) {
        $packageName = 'Arknights-Game-' + $packageRole + '-Windows-' + $runtimeArch + '-' + $batch
        $shareRoot = Join-Path $outputRoot $packageName
        [IO.Directory]::CreateDirectory($shareRoot) | Out-Null
        Write-Host ('正在生成 ' + $packageRole + ' 包……')
        foreach ($relative in $required) { Copy-ShareFile (Join-Path $projectRoot $relative) $relative }
        Copy-ShareTree 'web'
        if (-not $NoRuntime) {
            # Node built-ins only: npm and its thousands of files are unnecessary.
            foreach ($file in @('node.exe','LICENSE')) {
                $relative = '.runtime/node-win-' + $runtimeArch + '/' + $file
                Copy-ShareFile (Join-Path $projectRoot $relative) $relative
            }
        }
        if (-not $LocalOnly) {
            foreach ($file in @('easytier-core.exe','easytier-cli.exe','Packet.dll','wintun.dll','WinDivert64.sys','verified-files.json')) {
                Copy-ShareFile (Join-Path $easyRoot $file) ('.runtime/easytier-v2.6.4-' + $runtimeArch + '/' + $file)
            }
        }
        $metadata = [ordered]@{createdAt=(Get-Date).ToString('o');platform='Windows';architecture=$runtimeArch;bundledNode=(-not [bool]$NoRuntime);bundledEasyTier=(-not [bool]$LocalOnly);role=$packageRole.ToLowerInvariant();entry='开始游戏.cmd';scope='universal room runtime and full game assets'}
        [IO.File]::WriteAllText((Join-Path $shareRoot 'package-info.json'),($metadata | ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
        $zipPath = $shareRoot + '.zip'
        # Most game assets are already compressed. Frequent milestone builds
        # favor compression speed while preserving every file and ZIP checksums.
        [IO.Compression.ZipFile]::CreateFromDirectory($shareRoot,$zipPath,[IO.Compression.CompressionLevel]::Fastest,$false)
        $hash = (Get-RoomFileSha256 -Path $zipPath).ToLowerInvariant()
        [IO.File]::WriteAllText(($zipPath + '.sha256'),($hash + '  ' + [IO.Path]::GetFileName($zipPath) + [Environment]::NewLine),(New-Object Text.UTF8Encoding($false)))
        Write-Host ('已生成：' + $zipPath)
    }
    Write-Host '所有人使用这一个通用包，解压后双击 开始游戏.cmd。'
    Write-Host '创建同盟时生成分享码；朋友只需输入分享码，自动连接并入席。'
} catch {
    Write-Host ('打包失败：' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
