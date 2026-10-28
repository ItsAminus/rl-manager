$ErrorActionPreference='Stop'
if(Get-Process RocketLeague -ErrorAction SilentlyContinue){throw 'Close Rocket League before updating the native HUD'}
$taskDestination=Join-Path $env:APPDATA 'bakkesmod\bakkesmod'
$taskDll=Join-Path $PSScriptRoot 'build\RLManagerHUD.dll'
if(!(Test-Path -LiteralPath $taskDll)){throw 'Compile the native HUD first'}
if(!(Test-Path -LiteralPath $taskDestination)){throw 'BakkesMod is not installed'}
$taskFonts=Join-Path $PSScriptRoot 'build\fonts'
if(!(Test-Path -LiteralPath (Join-Path $taskFonts 'glyphs.json'))){throw 'Prepare cached HUD fonts with prepare_fonts.py before installing'}
$taskData=Join-Path $taskDestination 'data\rl-manager'
New-Item -ItemType Directory -Force -Path $taskData | Out-Null
Copy-Item -LiteralPath $taskFonts -Destination $taskData -Recurse -Force
$taskPlugin=Join-Path $taskDestination 'plugins\RLManagerHUD.dll'
$taskConfig=Join-Path $taskDestination 'cfg\plugins.cfg'
$taskBackup=Join-Path $PSScriptRoot ('build\backup-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force -Path $taskBackup | Out-Null
foreach($taskFile in @($taskPlugin,$taskConfig)){if(Test-Path -LiteralPath $taskFile){Copy-Item -LiteralPath $taskFile -Destination $taskBackup}}
Copy-Item -LiteralPath $taskDll -Destination $taskPlugin -Force
$taskConfigText=if(Test-Path -LiteralPath $taskConfig){[IO.File]::ReadAllText($taskConfig)}else{''}
if($taskConfigText -notmatch '(?im)^\s*plugin\s+load\s+RLManagerHUD\s*$'){
    [IO.File]::WriteAllText($taskConfig,$taskConfigText.TrimEnd()+"`r`nplugin load RLManagerHUD`r`n")
}
# User requested exclusive fullscreen. Preserve other graphics settings and INI sections.
$taskSettings=Join-Path $env:USERPROFILE 'Documents\My Games\Rocket League\TAGame\Config\TASystemSettings.ini'
if(Test-Path -LiteralPath $taskSettings){
    Copy-Item -LiteralPath $taskSettings -Destination $taskBackup
    $taskContent=[IO.File]::ReadAllText($taskSettings)
    $taskSection=[regex]::Match($taskContent,'(?ms)^\[SystemSettings\]\r?\n.*?(?=^\[|\z)')
    if($taskSection.Success){
        $taskReplacement=[regex]::Replace($taskSection.Value,'(?m)^Borderless=.*$','Borderless=False')
        $taskReplacement=[regex]::Replace($taskReplacement,'(?m)^Fullscreen=.*$','Fullscreen=True')
        [IO.File]::WriteAllText($taskSettings,$taskContent.Substring(0,$taskSection.Index)+$taskReplacement+$taskContent.Substring($taskSection.Index+$taskSection.Length))
    }
}
Write-Output 'Native career HUD installed and autoload enabled; Rocket League set to Fullscreen. Game was not launched.'
$taskAllowed=Join-Path $taskDestination 'data\rcon_commands.cfg'
$taskRules=if(Test-Path -LiteralPath $taskAllowed){[IO.File]::ReadAllText($taskAllowed)}else{''}
foreach($taskCommand in @('ws_inventory','sendback','rcon_password','plugin','cl_settings_refreshplugins','rcon_refresh_allowed','disconnect','unreal_command','open','rlm_host_arm','rlm_host_stop','rlm_host_ready','rlm_hud_enabled','rlm_scoreboard_enabled')){
    if($taskRules.Split("`n").Trim() -notcontains $taskCommand){$taskRules=$taskRules.TrimEnd()+"`r`n"+$taskCommand+"`r`n"}
}
[IO.File]::WriteAllText($taskAllowed,$taskRules)
