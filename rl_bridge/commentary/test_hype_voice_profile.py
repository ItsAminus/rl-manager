import time
import soundfile as sf
import numpy as np
import torch
from pathlib import Path
from chatterbox.tts import ChatterboxTTS, Conditionals

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Loading ChatterboxTTS on {device}...")
model = ChatterboxTTS.from_pretrained(device=device)

hype_dir = Path(__file__).parent / "voices" / "hype_candidates"
cache_dir = Path(__file__).parent / "cache"

# Caster One Hype Reference: 18m00s (207 WPM, peak esports adrenaline)
caster_one_hype_wav = hype_dir / "peak_18m00s.wav"
# Caster Two Hype Reference: 09m53s (explosive goal build-up and reaction)
caster_two_hype_wav = hype_dir / "peak_09m53s.wav"

print(f"Profiling Caster One Hype from {caster_one_hype_wav.name}...")
model.prepare_conditionals(str(caster_one_hype_wav), exaggeration=0.95)
caster_one_hype_conds = model.conds
caster_one_hype_conds.save(cache_dir / "caster_one_hype_conds.pt")

print(f"Profiling Caster Two Hype from {caster_two_hype_wav.name}...")
model.prepare_conditionals(str(caster_two_hype_wav), exaggeration=0.95)
caster_two_hype_conds = model.conds
caster_two_hype_conds.save(cache_dir / "caster_two_hype_conds.pt")

test_lines = [
    ("caster_one", "Gimmick strikes! An absolute rocket into the top corner from Gimmick!"),
    ("caster_two", "What a save by Gimmick! Heroic goal line defense, shutting the door completely!"),
    ("caster_one", "RelatingWave with the booming clear up the pitch, relieving all the pressure!"),
    ("caster_two", "Metsanauris fires on net! Venomous strike testing the keeper!"),
    ("caster_one", "Gimmick controlling the dribble through the midfield, brilliant ball control!"),
]

out_test_dir = cache_dir / "test_hype_samples"
out_test_dir.mkdir(parents=True, exist_ok=True)

for i, (speaker, text) in enumerate(test_lines):
    model.conds = caster_one_hype_conds if speaker == "caster_one" else caster_two_hype_conds
    t0 = time.time()
    with torch.inference_mode():
        wav = model.generate(text, exaggeration=0.95)
    gen_time = time.time() - t0
    
    if not isinstance(wav, torch.Tensor):
        wav = torch.tensor(wav)
    wav_np = wav.cpu().numpy().squeeze()
    peak = np.max(np.abs(wav_np))
    if peak > 0:
        wav_np = (wav_np / peak * 0.95).astype(np.float32)
        
    out_file = out_test_dir / f"sample_{i}_{speaker}.wav"
    sf.write(str(out_file), wav_np, model.sr, subtype="PCM_16")
    dur = len(wav_np) / model.sr
    print(f"[{speaker.upper()}] \"{text}\" -> {out_file.name} ({dur:.1f}s) in {gen_time:.2f}s")

print("\nHype voice profiling & test synthesis complete!")
