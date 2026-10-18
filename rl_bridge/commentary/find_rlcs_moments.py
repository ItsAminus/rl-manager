import soundfile as sf
import numpy as np
import librosa
import whisper
from pathlib import Path

MATCH_MP3 = str(Path.home() / 'Downloads' / 'FULL-MATCH-Falcons-vs-SSG-RLCS-2.mp3')
OUT_DIR = Path(str(Path.home() / '.gemini' / 'antigravity' / 'scratch' / 'rl-manager' / 'rl_bridge' / 'commentary' / 'cache' / 'reflex_shouts'))
OUT_DIR.mkdir(parents=True, exist_ok=True)

print("Reading audio stream from full match MP3...")
# Read audio with soundfile
audio, sr = sf.read(MATCH_MP3)
if audio.ndim > 1:
    audio = audio.mean(axis=1)

print(f"Total audio length: {len(audio)/sr:.1f} seconds")

# Calculate RMS energy in 2.5-second windows (hop 1.0 second)
frame_len = int(2.5 * sr)
hop_len = int(1.0 * sr)

energies = []
timestamps = []

for i in range(0, len(audio) - frame_len, hop_len):
    chunk = audio[i : i + frame_len]
    rms = np.sqrt(np.mean(chunk**2))
    energies.append(rms)
    timestamps.append(i / sr)

energies = np.array(energies)
timestamps = np.array(timestamps)

# Find top energy peaks separated by at least 15 seconds
sorted_indices = np.argsort(energies)[::-1]
selected_peaks = []

for idx in sorted_indices:
    t = timestamps[idx]
    # Check if too close to already selected peaks
    if any(abs(t - p) < 15.0 for p in selected_peaks):
        continue
    selected_peaks.append(t)
    if len(selected_peaks) >= 25:
        break

selected_peaks.sort()
print(f"Found {len(selected_peaks)} high-energy commentary peaks!")

# Load Whisper to transcribe each peak
print("Loading Whisper base model...")
model = whisper.load_model('base', device='cpu')

shout_count = 0
for idx, t in enumerate(selected_peaks):
    start_sec = max(0, t - 0.2)
    end_sec = min(len(audio)/sr, t + 3.2)
    start_sample = int(start_sec * sr)
    end_sample = int(end_sec * sr)
    clip = audio[start_sample:end_sample]

    # Resample to 16k for Whisper
    clip_16k = librosa.resample(clip.astype(np.float32), orig_sr=sr, target_sr=16000)
    res = model.transcribe(clip_16k, language='en')
    text = res.get('text', '').strip()

    # Normalize audio clip to peak 0.95 and save 16-bit PCM WAV
    peak = np.max(np.abs(clip))
    if peak > 0:
        clip_norm = (clip / peak * 0.95).astype(np.float32)
    else:
        clip_norm = clip

    # Categorize into Goal, Save, Demo, or General Hype
    txt_lower = text.lower()
    cat = "general"
    if any(k in txt_lower for k in ["goal", "scores", "scores!", "in!", "buries", "crossbar", "bins", "falcon", "ssg", "lead", "finds"]):
        cat = "goal"
    elif any(k in txt_lower for k in ["save", "keeps", "line", "denied", "block", "stop", "close"]):
        cat = "save"
    elif any(k in txt_lower for k in ["zero", "clock", "seconds", "alive"]):
        cat = "zero_seconds"
    elif any(k in txt_lower for k in ["overtime", "ot", "golden"]):
        cat = "overtime"
    elif any(k in txt_lower for k in ["demo", "boom", "bump"]):
        cat = "demo"

    # Save candidate shout
    out_file = OUT_DIR / f"rlcs_{cat}_{idx}.wav"
    sf.write(str(out_file), clip_norm, sr, subtype='PCM_16')
    safe_text = text.encode('ascii', errors='ignore').decode('ascii')
    print(f"[{cat.upper()}] @ {start_sec:.1f}s: \"{safe_text}\" -> {out_file.name}")
    shout_count += 1

print(f"\nSuccessfully extracted and indexed {shout_count} authentic RLCS commentary reflex clips!")
