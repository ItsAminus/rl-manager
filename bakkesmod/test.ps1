$ErrorActionPreference='Stop'
$taskCompiler=Join-Path $env:USERPROFILE '.rlm-buildtools\VC\Auxiliary\Build\vcvars64.bat'
$taskOutput=Join-Path $PSScriptRoot 'build'
New-Item -ItemType Directory -Force -Path $taskOutput | Out-Null
$taskBuild=Join-Path $taskOutput 'test-scoreboard.cmd'
@"
@echo off
call "$taskCompiler" >nul
cl /nologo /EHsc /std:c++17 /utf-8 "$PSScriptRoot\tests\scoreboard_rows_test.cpp" /Fo"$taskOutput\scoreboard_rows_test.obj" /Fe"$taskOutput\scoreboard_rows_test.exe"
if errorlevel 1 exit /b 1
"$taskOutput\scoreboard_rows_test.exe"
if errorlevel 1 exit /b 1
cl /nologo /EHsc /std:c++17 /utf-8 "$PSScriptRoot\tests\career_comms_test.cpp" /Fo"$taskOutput\career_comms_test.obj" /Fe"$taskOutput\career_comms_test.exe"
if errorlevel 1 exit /b 1
"$taskOutput\career_comms_test.exe"
if errorlevel 1 exit /b 1
cl /nologo /EHsc /std:c++17 /utf-8 "$PSScriptRoot\tests\player_showcase_test.cpp" /Fo"$taskOutput\player_showcase_test.obj" /Fe"$taskOutput\player_showcase_test.exe"
if errorlevel 1 exit /b 1
"$taskOutput\player_showcase_test.exe"
"@ | Set-Content -LiteralPath $taskBuild -Encoding ascii
& $env:ComSpec /c $taskBuild
if($LASTEXITCODE -ne 0){throw 'Scoreboard identity/layout tests failed'}
