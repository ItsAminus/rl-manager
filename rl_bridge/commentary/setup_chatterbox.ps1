param(
    [string]$BasePython = "$env:LOCALAPPDATA\RLBotGUIX\Python311\python.exe"
)
$ErrorActionPreference = 'Stop'
$chatterRuntime = Join-Path (Split-Path $PSScriptRoot) 'local_runtime'
$chatterEnvironment = Join-Path $chatterRuntime 'chatterbox_venv'
$chatterTemporary = Join-Path $chatterRuntime 'chatterbox_install_tmp'
New-Item -ItemType Directory -Path $chatterTemporary -Force | Out-Null
$env:TMP = $chatterTemporary
$env:TEMP = $chatterTemporary
$env:NUMBA_CACHE_DIR = Join-Path $chatterTemporary 'numba'
& $BasePython -m venv --without-pip --system-site-packages $chatterEnvironment
if ($LASTEXITCODE) { throw 'Could not create the isolated Chatterbox environment' }
$chatterPython = Join-Path $chatterEnvironment 'Scripts\python.exe'
& $chatterPython -m pip install --no-cache-dir torch==2.8.0 torchaudio==2.8.0 torchvision==0.23.0 --index-url https://download.pytorch.org/whl/cu128
if ($LASTEXITCODE) { throw 'CUDA dependencies could not be installed' }
& (Join-Path $PSScriptRoot '../../scripts/compact-speech-runtime.ps1') -Confirm:$false
& $chatterPython -c 'import torch; from chatterbox.tts import Conditionals; assert torch.cuda.is_available(); print(torch.cuda.get_device_name(0))'
if ($LASTEXITCODE) { throw 'GPU speech dependencies could not be loaded' }
Write-Host 'Chatterbox GPU runtime ready. Existing cached weights and voice profiles are reused.'
