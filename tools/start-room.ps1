[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [switch]$PortableOnly,
    [switch]$NoBrowser,
    [switch]$Online,
    [switch]$LocalOnly,
    [ValidateSet('ask','host','join')][string]$Role = 'ask',
    [string]$BindAddress = '0.0.0.0',
    [ValidateRange(1, 65535)][int]$Port = 8003
)

$ErrorActionPreference = 'Stop'
try {
    Import-Module (Join-Path $PSScriptRoot 'lib\room-node-runtime.psm1') -Force
    $projectRoot = Split-Path -Parent $PSScriptRoot
    $runtime = Resolve-RoomNode -ProjectRoot $projectRoot -PortableOnly:$PortableOnly
    Write-Host ('Node.js {0}: {1}' -f $runtime.Version, $runtime.Path)
    $useOnline = -not $LocalOnly
    $packageInfoPath = Join-Path $projectRoot 'package-info.json'
    if (-not $Online -and (Test-Path -LiteralPath $packageInfoPath)) {
        $packageInfo = Get-Content -LiteralPath $packageInfoPath -Raw | ConvertFrom-Json
        if ($packageInfo.bundledEasyTier -eq $false) { $useOnline = $false }
    }
    if ($useOnline -and $CheckOnly) {
        Import-Module (Join-Path $PSScriptRoot 'lib/room-easytier.psm1') -Force
        $easyTierRoot = Resolve-RoomEasyTier -ProjectRoot $projectRoot
        Write-Host ('EasyTier 2.6.4: ' + $easyTierRoot)
    }
    if ($CheckOnly) { exit 0 }
    Import-Module (Join-Path $PSScriptRoot 'lib/game-process.psm1') -Force
    if ($useOnline) {
        $onlineArguments = @((Join-Path $PSScriptRoot 'room-online.js'),$Role)
        $browserTicket = ''
        if ($NoBrowser) { $onlineArguments += '--no-open' }
        else {
            $ticketDirectory = Join-Path $projectRoot '.runtime/launch'
            [IO.Directory]::CreateDirectory($ticketDirectory) | Out-Null
            $browserTicket = Join-Path $ticketDirectory (([Guid]::NewGuid().ToString('N')) + '.url')
            $onlineArguments += @('--browser-ticket', $browserTicket)
        }
        $gameExitCode = Start-OwnedGameProcess -Executable $runtime.Path -Arguments $onlineArguments -WorkingDirectory $projectRoot -BrowserTicket $browserTicket
        exit $gameExitCode
    }

    $launcher = Join-Path $PSScriptRoot 'start-room.js'
    if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) {
        throw '游戏文件不完整，缺少 tools/start-room.js。请先完整解压分享包，不要在压缩包里直接运行。'
    }
    $nodeArguments = @($launcher, '--host', $BindAddress, '--port', [string]$Port)
    # The legacy LAN server also publishes its URL to the outer launcher;
    # the browser itself must never enter the game's owned process tree.
    $nodeArguments += '--no-open'
    $browserTicket = ''
    if (-not $NoBrowser) {
        $ticketDirectory = Join-Path $projectRoot '.runtime/launch'
        [IO.Directory]::CreateDirectory($ticketDirectory) | Out-Null
        $browserTicket = Join-Path $ticketDirectory (([Guid]::NewGuid().ToString('N')) + '.url')
        $nodeArguments += @('--browser-ticket', $browserTicket)
    }
    $gameExitCode = Start-OwnedGameProcess -Executable $runtime.Path -Arguments $nodeArguments -WorkingDirectory $projectRoot -BrowserTicket $browserTicket
    exit $gameExitCode
} catch {
    Write-Host ''
    Write-Host ('启动失败：{0}' -f $_.Exception.Message) -ForegroundColor Red
    Write-Host '不需要管理员权限，也不需要运行 npm install 或修改系统环境变量。'
    exit 1
}
