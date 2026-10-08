param(
    [Parameter(Mandatory = $true)][string]$BasePath,
    [Parameter(Mandatory = $true)][string]$NewPath,
    [string]$OutputPath
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$distRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'dist')).TrimEnd('\', '/')
try {
    Import-Module (Join-Path $PSScriptRoot 'lib/room-node-runtime.psm1') -Force -DisableNameChecking
    function Resolve-UpdateDirectory([string]$Value) {
        $full = Assert-RoomContainedPath -Path $Value -Root $distRoot
        if (-not (Test-Path -LiteralPath $full -PathType Container)) { throw "包目录不存在：$full" }
        return $full.TrimEnd('\', '/')
    }
    function Test-PrivateUpdateFile([string]$Relative) {
        $parts = $Relative.Replace('\','/').Split('/')
        foreach ($part in $parts) {
            if ($part -in @('.git','.agents','.codex','user-config.json','online-room.json','room-session.json') -or $part -like '.user-config.*' -or $part -like '*.log') { return $true }
        }
        return $false
    }
    function Read-UpdateFiles([string]$Folder) {
        $files = @{}
        $directories = New-Object 'System.Collections.Generic.Stack[string]'
        $directories.Push($Folder)
        while ($directories.Count -gt 0) {
            $current = $directories.Pop()
            foreach ($entry in Get-ChildItem -LiteralPath $current -Force) {
                # Validate before recursion: never enumerate through a junction.
                $checked = Assert-RoomContainedPath -Path $entry.FullName -Root $distRoot
                $relative = $checked.Substring($Folder.Length).TrimStart([char[]]'\/').Replace('\','/')
                if (Test-PrivateUpdateFile $relative) { continue }
                if ($entry.PSIsContainer) { $directories.Push($checked); continue }
                $files[$relative] = [pscustomobject]@{ Path=$checked; Length=$entry.Length; Hash=(Get-RoomFileSha256 -Path $checked).ToLowerInvariant() }
            }
        }
        return $files
    }
    $baseRoot = Resolve-UpdateDirectory $BasePath
    $newRoot = Resolve-UpdateDirectory $NewPath
    if ($baseRoot -eq $newRoot) { throw '旧包和新包必须是两个不同的目录。' }
    foreach ($folder in @($baseRoot,$newRoot)) {
        if (-not (Test-Path -LiteralPath (Join-Path $folder 'package-info.json') -PathType Leaf)) { throw "缺少 package-info.json，不能确认通用包：$folder" }
        $null = Assert-RoomContainedPath -Path (Join-Path $folder 'package-info.json') -Root $distRoot
    }
    $baseMeta = [IO.File]::ReadAllText((Join-Path $baseRoot 'package-info.json')) | ConvertFrom-Json
    $newMeta = [IO.File]::ReadAllText((Join-Path $newRoot 'package-info.json')) | ConvertFrom-Json
    if ($baseMeta.role -ne 'universal' -or $newMeta.role -ne 'universal' -or $baseMeta.architecture -ne $newMeta.architecture -or $baseMeta.platform -ne $newMeta.platform) { throw '只支持相同平台、架构的通用包覆盖更新；此情况请使用完整新版包。' }
    Write-Host '正在比较旧包和新版文件……'
    $baseFiles = Read-UpdateFiles $baseRoot
    $newFiles = Read-UpdateFiles $newRoot
    $entryProperty = $newMeta.PSObject.Properties['entry']
    $entryName = if ($entryProperty -and $entryProperty.Value) { [string]$entryProperty.Value } elseif ($newFiles.ContainsKey('开始游戏.cmd')) { '开始游戏.cmd' } else { 'Start-Room.cmd' }
    if ($entryName -notin @('开始游戏.cmd', 'Start-Room.cmd') -or -not $newFiles.ContainsKey($entryName)) { throw '新包的游戏启动入口缺失或不受支持，请使用完整新版包。' }
    $removed = @($baseFiles.Keys | Where-Object { -not $newFiles.ContainsKey($_) } | Sort-Object)
    if ($removed.Count -gt 0) { throw ('新版删除了旧包文件，覆盖更新无法安全表达。请发送完整新版包。缺少：' + ($removed -join '、')) }
    $changed = @($newFiles.Keys | Where-Object { -not $baseFiles.ContainsKey($_) -or $baseFiles[$_].Hash -ne $newFiles[$_].Hash } | Sort-Object)
    if ($changed.Count -eq 0) { throw '两个包没有内容差异，不需要生成更新包。' }
    $readmeName = '卫戍协议-覆盖更新说明.txt'
    if ($newFiles.ContainsKey($readmeName) -or $baseFiles.ContainsKey($readmeName)) { throw "包内已有保留的更新说明文件 $readmeName，请使用原始发行目录作比较。" }
    if (-not $OutputPath) {
        $batch = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + ([Guid]::NewGuid().ToString('N').Substring(0,6))
        $OutputPath = Join-Path $distRoot ('Arknights-Room-Update-Windows-' + $newMeta.architecture + '-' + $batch + '.zip')
    }
    $zipPath = Assert-RoomContainedPath -Path $OutputPath -Root $distRoot
    if ([IO.Path]::GetExtension($zipPath) -ne '.zip') { throw '更新包输出必须是 .zip 文件。' }
    if (-not (Test-Path -LiteralPath ([IO.Path]::GetDirectoryName($zipPath)) -PathType Container)) { throw '输出目录不存在。' }
    if ($zipPath.StartsWith($baseRoot + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or $zipPath.StartsWith($newRoot + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw '输出不能写入旧包或新包目录。' }
    if ((Test-Path -LiteralPath $zipPath) -or (Test-Path -LiteralPath ($zipPath + '.sha256'))) { throw '输出文件已存在，请换一个新文件名。' }
    $lines = @(
        '卫戍协议 · 覆盖更新',
        '',
        ('适用旧包：' + [IO.Path]::GetFileName($baseRoot)),
        ('更新目标：' + [IO.Path]::GetFileName($newRoot)),
        ('本次更新文件：' + $changed.Count + ' 个'),
        '',
        '1. 先结束当前对局，关闭旧游戏页面及启动程序。',
        '2. 将这个更新 ZIP 的全部内容解压到原游戏文件夹，选择覆盖同名文件。',
        ('   应当直接覆盖原来的 ' + $entryName + '、tools、web 等位置，不要另外套一层文件夹。'),
        '3. 不要删除原来的游戏资源和 user-config.json；本次更新不会包含或覆盖昵称、头像等本机配置。',
        ('4. 房主和加入者双方都完成更新后，重新双击 ' + $entryName + '，创建新同盟并分享新的分享码。'),
        '',
        '这个 ZIP 不是完整游戏，不能单独运行。它仅适用于上面注明的旧通用包。',
        '正在进行的对局不会随程序重启保留。其它版本、缺失文件或文件版本不一致，请改用完整新版包。',
        '',
        '更新文件：'
    ) + $changed
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $stream = [IO.File]::Open($zipPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    $archive = $null
    try {
        $archive = New-Object IO.Compression.ZipArchive($stream,[IO.Compression.ZipArchiveMode]::Create,$false)
        foreach ($relative in $changed) {
            $null = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$newFiles[$relative].Path,$relative,[IO.Compression.CompressionLevel]::Optimal)
        }
        $entry = $archive.CreateEntry($readmeName,[IO.Compression.CompressionLevel]::Optimal)
        $writer = New-Object IO.StreamWriter($entry.Open(),(New-Object Text.UTF8Encoding($true)))
        try { $writer.Write(($lines -join [Environment]::NewLine) + [Environment]::NewLine) } finally { $writer.Dispose() }
    } finally {
        if ($archive) { $archive.Dispose() } else { $stream.Dispose() }
    }
    $zipHash = (Get-RoomFileSha256 -Path $zipPath).ToLowerInvariant()
    [IO.File]::WriteAllText(($zipPath + '.sha256'),($zipHash + '  ' + [IO.Path]::GetFileName($zipPath) + [Environment]::NewLine),(New-Object Text.UTF8Encoding($false)))
    Write-Host ('已生成：' + $zipPath)
    Write-Host ('文件数：' + $changed.Count + '；大小：' + [Math]::Round((Get-Item -LiteralPath $zipPath).Length / 1KB,1) + ' KiB')
    Write-Host '旧包和新包保持不变；双方关闭旧窗口、解压覆盖后重开。'
} catch {
    Write-Host ('更新包生成失败：' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
