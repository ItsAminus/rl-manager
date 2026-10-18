import soundfile as sf
import librosa
import whisper
from pathlib import Path

cand_dir = Path(__file__).parent / "voices" / "hype_candidates"
model = whisper.load_model("base")

for wav in sorted(cand_dir.glob("*.wav")):
    audio, sr = sf.read(str(wav))
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    audio_16k = librosa.resample(audio.astype("float32"), orig_sr=sr, target_sr=16000)
    res = model.transcribe(audio_16k, language="en")
    text = res["text"].strip()
    words = len(text.split())
    dur = len(audio) / sr
    wpm = int((words / dur) * 60)
    print(f"{wav.name} ({dur:.1f}s, {wpm} WPM): \"{text}\"")
