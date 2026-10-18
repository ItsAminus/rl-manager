param(
    [Parameter(Mandatory=$true)][string]$BasePython,
    [Parameter(Mandatory=$true)][string]$Samples
)
$ErrorActionPreference = 'Stop'
$runtimePath = Join-Path (Split-Path $PSScriptRoot) 'local_runtime'
New-Item -ItemType Directory -Force -Path $runtimePath | Out-Null
$sourcePath = Join-Path $runtimePath 'GPT-SoVITS'
if (!(Test-Path -LiteralPath $sourcePath)) {
    git clone https://github.com/RVC-Boss/GPT-SoVITS.git $sourcePath
    if ($LASTEXITCODE) { throw 'Could not download GPT-SoVITS' }
    git -C $sourcePath checkout e7cd61ec3dcc9a34089f50ed169e3103a16ad675
    if ($LASTEXITCODE) { throw 'Could not select tested GPT-SoVITS version' }
}
$pythonPath = Join-Path $runtimePath 'venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $pythonPath)) {
    & $BasePython -m venv --system-site-packages (Join-Path $runtimePath 'venv')
    if ($LASTEXITCODE) { throw 'Could not create isolated Python environment' }
}
& $pythonPath -m pip install --no-cache-dir -r (Join-Path $PSScriptRoot 'requirements-local.txt')
if ($LASTEXITCODE) { throw 'Dependency installation failed' }
& $pythonPath (Join-Path $PSScriptRoot 'download_local_models.py')
if ($LASTEXITCODE) { throw 'Model download failed' }
$llamaZip = Join-Path $runtimePath 'llama.zip'
$llamaPath = Join-Path $runtimePath 'llama'
if (!(Test-Path (Join-Path $llamaPath 'llama-server.exe'))) {
    Invoke-WebRequest 'https://github.com/ggml-org/llama.cpp/releases/download/b11483/llama-b11483-bin-win-cpu-x64.zip' -OutFile $llamaZip
    Expand-Archive -LiteralPath $llamaZip -DestinationPath $llamaPath -Force
}
$env:RL_COMMENTARY_RUNTIME = $runtimePath
& $pythonPath -c 'import os,pathlib,shutil,nltk,imageio_ffmpeg; from huggingface_hub import hf_hub_download; p=pathlib.Path(os.environ["RL_COMMENTARY_RUNTIME"]); r=p/"GPT-SoVITS/runtime"; r.mkdir(exist_ok=True); shutil.copyfile(imageio_ffmpeg.get_ffmpeg_exe(),r/"ffmpeg.exe"); [nltk.download(n,download_dir=str(r/"nltk_data"),raise_on_error=True) for n in ["cmudict","averaged_perceptron_tagger","averaged_perceptron_tagger_eng"]]; hf_hub_download("Qwen/Qwen2.5-1.5B-Instruct-GGUF","qwen2.5-1.5b-instruct-q4_k_m.gguf",local_dir=p/"text_model")'
if ($LASTEXITCODE) { throw 'Local resources could not be installed' }
& $pythonPath (Join-Path $PSScriptRoot 'prepare_references.py') --samples $Samples
if ($LASTEXITCODE) { throw 'Voice reference preparation failed' }
Write-Host 'Local commentary installed. Run benchmark_local.py --warmup to measure this machine.'
