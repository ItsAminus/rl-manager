from pathlib import Path
import whisper

model = whisper.load_model('base', device='cpu')
samples = [
    ('Caster One', str(Path.home() / 'Downloads' / 'Caster One sample.mp3')),
    ('Alex Knight', str(Path.home() / 'Downloads' / 'Alex Knight sample.mp3'))
]

import soundfile as sf
import librosa
import numpy as np

for label, path in samples:
    audio, sr = sf.read(path)
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    audio = audio.astype(np.float32)
    audio_16k = librosa.resample(audio, orig_sr=sr, target_sr=16000)
    
    res = model.transcribe(audio_16k)
    print(f"=== {label} ===")
    for s in res['segments']:
        t_start = round(s['start'], 1)
        t_end = round(s['end'], 1)
        txt = s['text']
        print(f"{t_start}s - {t_end}s: {txt}")

