"""Portable distribution paths, with backwards-compatible developer fallbacks."""
from pathlib import Path
import os

def speech_pythons(runtime, environ=None):
    environ = os.environ if environ is None else environ
    runtime=Path(runtime)
    portable=runtime/'python'/'python.exe'
    default = portable if portable.is_file() else runtime/'chatterbox_venv'/'Scripts'/'python.exe'
    override = environ.get('RLM_SPEECH_PYTHON', '')
    return list(dict.fromkeys(([Path(override)] if override and Path(override).is_file() else []) + [default]))

def speech_python(runtime):
    return speech_pythons(runtime)[0]

def speech_model(runtime):
    portable=Path(runtime)/'chatterbox_model'
    if (portable/'t3_cfg.safetensors').is_file():return portable
    snapshots=Path.home()/'.cache/huggingface/hub/models--ResembleAI--chatterbox/snapshots'
    candidates=[p for p in snapshots.glob('*') if (p/'t3_cfg.safetensors').is_file()]
    if not candidates:raise FileNotFoundError('Chatterbox model is missing. Run the complete RLM setup to install its AI files.')
    return sorted(candidates)[-1]
