$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskSdk=Join-Path $env:APPDATA 'bakkesmod\bakkesmod\bakkesmodsdk'
$taskCompiler=Join-Path $env:USERPROFILE '.rlm-buildtools\VC\Auxiliary\Build\vcvars64.bat'
$taskOutput=Join-Path $PSScriptRoot 'build'
New-Item -ItemType Directory -Force -Path $taskOutput | Out-Null
if(!(Test-Path -LiteralPath $taskCompiler)){throw 'Microsoft C++ build tools are unavailable'}
$taskBuild=Join-Path $taskOutput 'compile.cmd'
@"
@echo off
call "$taskCompiler" >nul
cl /nologo /experimental:deterministic /pathmap:"$env:USERPROFILE"=C:\RLM-Build /LD /MD /EHsc /std:c++17 /O2 /utf-8 /I"$taskSdk\include" /I"$PSScriptRoot\vendor" "$PSScriptRoot\RLManagerHUD.cpp" /Fo"$taskOutput\RLManagerHUD.obj" /link "$taskSdk\lib\pluginsdk.lib" user32.lib /OUT:"$taskOutput\RLManagerHUD.dll"
"@ | Set-Content -LiteralPath $taskBuild -Encoding ascii
& $env:ComSpec /c $taskBuild
if($LASTEXITCODE -ne 0){throw 'Native HUD compilation failed'}
