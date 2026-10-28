param([string]$BridgePath = (Join-Path $env:APPDATA 'rl-manager\bridge'))
$ErrorActionPreference = 'Stop'

# Prepare and validate every edit before changing the installed bridge.
$bridge = (Resolve-Path -LiteralPath $BridgePath).Path
$payload = Join-Path $PSScriptRoot 'game_launcher.py'
if (!(Test-Path -LiteralPath $payload -PathType Leaf)) { throw 'Extract all files from the fix ZIP before running this script.' }
if (Get-Process -Name 'RL Manager','RocketLeague','RocketLeague_EAC' -ErrorAction SilentlyContinue) {
    throw 'Close RL Manager and Rocket League before applying this fix.'
}
$edits = @{}
foreach ($name in @('launcher.py', 'rocket_host.py')) {
    $path = Join-Path $bridge $name
    $source = [IO.File]::ReadAllText($path)
    if ($source.Contains('from game_launcher import launcher_preference')) {
        $source = $source.Replace('from game_launcher import launcher_preference', 'from game_launcher import configure_launcher')
        if ($name -eq 'launcher.py') {
            if (!$source.Contains('launcher_preference(rl_exe,')) { throw "Unrecognised $name; no files were changed." }
            $source = $source.Replace('launcher_preference(rl_exe,', 'configure_launcher(manager, rl_exe,')
        } else {
            if (!$source.Contains('launcher_preference(rl_path,')) { throw "Unrecognised $name; no files were changed." }
            $source = $source.Replace('launcher_preference(rl_path,', 'configure_launcher(manager,rl_path,')
        }
    }
    if (!$source.Contains('from game_launcher import configure_launcher') -or !$source.Contains('configure_launcher(manager,')) {
        throw "Unrecognised $name; no files were changed. This fix targets RLM 1.5.2."
    }
    $edits[$name] = $source
}
$backup = Join-Path $bridge ('steam-launch-backup-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $backup | Out-Null
foreach ($name in @('game_launcher.py','launcher.py','rocket_host.py')) {
    Copy-Item -LiteralPath (Join-Path $bridge $name) -Destination (Join-Path $backup $name)
}
try {
    Copy-Item -LiteralPath $payload -Destination (Join-Path $bridge 'game_launcher.py') -Force
    foreach ($name in $edits.Keys) {
        [IO.File]::WriteAllText((Join-Path $bridge $name), $edits[$name], (New-Object Text.UTF8Encoding $false))
    }
} catch {
    foreach ($name in @('game_launcher.py','launcher.py','rocket_host.py')) {
        Copy-Item -LiteralPath (Join-Path $backup $name) -Destination (Join-Path $bridge $name) -Force
    }
    throw
}
Write-Output "Steam launch fix installed. Original files: $backup"
Write-Output 'Open Steam and sign in, then open RLM and retry the match.'
Write-Output 'Check for Steam mod launch in the RLM log. In the game log, check that bAntiCheatEnabled is False.'
