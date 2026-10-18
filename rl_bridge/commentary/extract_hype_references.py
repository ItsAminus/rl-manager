import os
import soundfile as sf
import numpy as np
from pathlib import Path

MATCH_MP3 = str(Path.home() / 'Downloads' / 'FULL-MATCH-Falcons-vs-SSG-RLCS-2.mp3')
OUT_DIR = Path(__file__).parent / "voices" / "hype_candidates"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Candidate timestamps from the peak energy scan
CANDIDATES = [
    ("peak_05m06s", 303.0, 316.0),
    ("peak_02m31s", 148.0, 160.0),
    ("peak_09m53s", 590.0, 603.0),
    ("peak_13m55s", 832.0, 845.0),
    ("peak_18m00s", 1077.0, 1090.0),
    ("peak_19m47s", 1184.0, 1197.0),
    ("peak_37m37s", 2254.0, 2267.0),
]

print("Extracting candidate hype reference clips from Grand Finals audio...")
info = sf.info(MATCH_MP3)
sr = info.samplerate

for name, start_sec, end_sec in CANDIDATES:
    start_frame = int(start_sec * sr)
    stop_frame = int(end_sec * sr)
    data, _ = sf.read(MATCH_MP3, start=start_frame, stop=stop_frame)
    if data.ndim > 1:
        data = data.mean(axis=1) # Mono
    
    # Peak normalize
    peak = np.max(np.abs(data))
    if peak > 0:
        data = (data / peak * 0.95).astype(np.float32)
        
    out_wav = OUT_DIR / f"{name}.wav"
    sf.write(str(out_wav), data, sr, subtype="PCM_16")
    print(f"Saved {out_wav.name} ({end_sec - start_sec:.1f}s)")

print("\nDone extracting candidate clips!")
