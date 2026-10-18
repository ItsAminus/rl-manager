# Removes only explicit project-local disposable paths. Never touches AppData saves.
[CmdletBinding(SupportsShouldProcess=$true)]
param([switch]$RetiredVoiceTraining, [switch]$BuildOutputs)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$taskPrefix=$taskRoot+[IO.Path]::DirectorySeparatorChar
$taskPaths=[Collections.Generic.List[string]]::new()
if($BuildOutputs){foreach($taskName in @('dist','dist-electron','release')){$taskPaths.Add($taskName)}}
foreach($taskItem in @(if(Test-Path -LiteralPath (Join-Path $taskRoot 'scratch')){Get-ChildItem -LiteralPath (Join-Path $taskRoot 'scratch') -Force})){
    if($taskItem.Name -ne 'generate_data.js'){$taskPaths.Add('scratch/'+$taskItem.Name)}
}
if($RetiredVoiceTraining){
    # Current Chatterbox, llama, text_model, audio dependencies and bot tools stay.
    foreach($taskName in @('training_v2','alex_recovery_v2','alex_clarity_v2',
        'audio_diagnostics','chatterbox_install_tmp','ecapa','hf_cache','whisper',
        'GPT-SoVITS','venv','buildtools-setup')){$taskPaths.Add('rl_bridge/local_runtime/'+$taskName)}
    foreach($taskName in @('rvc_models','prepared_audio','reports')){$taskPaths.Add('rl_bridge/commentary/'+$taskName)}
    foreach($taskName in @('clean_shouts','old_muffled_rvc_shouts','reflex_shouts','player_shouts','test_hype_samples','bot_startup','chatterbox_tmp')){
        $taskPaths.Add('rl_bridge/commentary/cache/'+$taskName)
    }
    foreach($taskItem in @(if(Test-Path -LiteralPath (Join-Path $taskRoot 'rl_bridge/commentary/cache')){Get-ChildItem -LiteralPath (Join-Path $taskRoot 'rl_bridge/commentary/cache') -File -Force})){
        if($taskItem.Name -like 'dyn_*.wav' -or $taskItem.Name -like 'test_*.wav' -or $taskItem.Extension -eq '.log'){
            $taskPaths.Add('rl_bridge/commentary/cache/'+$taskItem.Name)
        }
    }
    $taskPaths.Add('rl_bridge/local_runtime/llama.zip')
    $taskPaths.Add('GPT_SoVITS')
    # Preserve the sole FFmpeg executable before retiring its old training home.
    $taskFFmpeg=Join-Path $taskRoot 'rl_bridge/local_runtime/tools/ffmpeg.exe'
    if(!(Test-Path -LiteralPath $taskFFmpeg -PathType Leaf)){throw 'Copy FFmpeg to local_runtime/tools before retiring GPT-SoVITS.'}
}
# Build products are reproducible. Keep the installed-ready DLL and font atlas.
foreach($taskItem in @(if(Test-Path -LiteralPath (Join-Path $taskRoot 'bakkesmod/build')){Get-ChildItem -LiteralPath (Join-Path $taskRoot 'bakkesmod/build') -Force})){
    if($taskItem.Name -like 'backup-*' -or $taskItem.Extension -in @('.obj','.exe','.cmd')){
        $taskPaths.Add('bakkesmod/build/'+$taskItem.Name)
    }
}
foreach($taskName in @('RLManagerHUD.lib','RLManagerHUD.exp','match_result.json','scratch_test_config.py')){$taskPaths.Add($taskName)}
$taskReport=[Collections.Generic.List[object]]::new()
foreach($taskRelative in $taskPaths){
    $taskTarget=[IO.Path]::GetFullPath((Join-Path $taskRoot $taskRelative))
    if(!$taskTarget.StartsWith($taskPrefix,[StringComparison]::OrdinalIgnoreCase)){throw "Unsafe cleanup target: $taskTarget"}
    if(!(Test-Path -LiteralPath $taskTarget)){continue}
    $taskItem=Get-Item -LiteralPath $taskTarget -Force
    if(($taskItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw "Refusing linked target: $taskTarget"}
    if($taskItem.PSIsContainer){
        $taskLinks=@(Get-ChildItem -LiteralPath $taskTarget -Recurse -Force -Attributes ReparsePoint)
        if($taskLinks.Count){throw "Refusing linked subtree: $taskTarget"}
        $taskBytes=(Get-ChildItem -LiteralPath $taskTarget -Recurse -File -Force | Measure-Object -Property Length -Sum).Sum
    }else{$taskBytes=$taskItem.Length}
    if($PSCmdlet.ShouldProcess($taskTarget,'Delete disposable project files')){
        Remove-Item -LiteralPath $taskTarget -Recurse -Force
        $taskReport.Add([pscustomobject]@{path=$taskRelative;bytes=[long]$taskBytes})
        Write-Output ('Removed {0} ({1:N2} GiB)' -f $taskRelative,($taskBytes/1GB))
    }
}
if(!$WhatIfPreference){
    $taskTotal=($taskReport | Measure-Object -Property bytes -Sum).Sum
    [pscustomobject]@{date=(Get-Date -Format o);root=$taskRoot;removedBytes=[long]$taskTotal;removed=$taskReport} |
        ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskRoot '.cleanup-report.json') -Encoding utf8
    Write-Output ('Total removed: {0:N2} GiB' -f ($taskTotal/1GB))
}
