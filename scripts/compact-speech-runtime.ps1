# Inference-only Windows runtime slimming. No model weights or DLLs are deleted.
[CmdletBinding(SupportsShouldProcess=$true)]
param()
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$taskLib=[IO.Path]::GetFullPath((Join-Path $taskRoot 'rl_bridge/local_runtime/chatterbox_venv/Lib/site-packages/torch/lib'))
if(!$taskLib.StartsWith($taskRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){
    throw 'Speech library path must stay within this checkout'
}
if(!(Test-Path -LiteralPath $taskLib -PathType Container)){throw 'Set up the CUDA speech environment first'}
if((Get-Item -LiteralPath $taskLib).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing linked runtime directory'}
# PyTorch itself excludes these third-party static archives from current wheels:
# https://github.com/pytorch/pytorch/blob/main/pyproject.toml
# Keep torch/c10 import libs and every dynamic library.
foreach($taskName in @('dnnl.lib','kineto.lib','libprotobuf.lib','libprotobuf-lite.lib','libprotoc.lib')){
    $taskFile=Join-Path $taskLib $taskName
    if((Test-Path -LiteralPath $taskFile -PathType Leaf) -and $PSCmdlet.ShouldProcess($taskFile,'Remove inference-unused compiler archive')){
        Remove-Item -LiteralPath $taskFile -Force
    }
}
foreach($taskDirectory in @($taskLib,(Join-Path $taskRoot 'node_modules/electron/dist'),
    (Join-Path $taskRoot 'rl_bridge/local_runtime/tools'),(Join-Path $taskRoot 'rl_bridge/local_runtime/llama'))){
    $taskDirectory=[IO.Path]::GetFullPath($taskDirectory)
    if(!$taskDirectory.StartsWith($taskRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected compression path'}
    if((Test-Path -LiteralPath $taskDirectory -PathType Container) -and $PSCmdlet.ShouldProcess($taskDirectory,'Apply Windows lossless executable compression')){
        & "$env:SystemRoot/System32/compact.exe" /c /q /exe:lzx "/s:$taskDirectory" *.dll *.exe *.bin *.pak
        if($LASTEXITCODE -ne 0){throw "Runtime compression did not complete: $taskDirectory"}
    }
}
