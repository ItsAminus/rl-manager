import time
from pathlib import Path
import soundfile as sf
import numpy as np
import torch
from chatterbox.tts import ChatterboxTTS, Conditionals

CACHE_DIR = Path(__file__).parent / "cache"
SHOUTS_DIR = CACHE_DIR / "reflex_shouts"
SHOUTS_DIR.mkdir(parents=True, exist_ok=True)

CORE_SHOUTS = [
    # Caster One Goals
    ("caster_one_goal_0", "caster_one", "What a hit! He buries it top bins!"),
    ("caster_one_goal_1", "caster_one", "Unbelievable strike into the top corner!"),
    ("caster_one_goal_2", "caster_one", "Off the crossbar and in! What a goal!"),
    # Caster Two Goals
    ("caster_two_goal_0", "caster_two", "Absolutely clinical finish from downtown!"),
    ("caster_two_goal_1", "caster_two", "What a touch! He sends it straight home!"),
    ("caster_two_goal_2", "caster_two", "Sensational strike! Pure class on that shot!"),
    # Caster One Saves
    ("caster_one_save_0", "caster_one", "What a save! How has he kept that out?!"),
    ("caster_one_save_1", "caster_one", "Denied on the line! Heroic defense!"),
    # Caster Two Saves
    ("caster_two_save_0", "caster_two", "Incredible goal-line stand! Outstanding reaction!"),
    ("caster_two_save_1", "caster_two", "Full stretch to keep it out! Masterclass!"),
    # Demos
    ("caster_one_demo_0", "caster_one", "Boom! He gets taken out on rotation!"),
    ("caster_two_demo_0", "caster_two", "Demolished! Savage physical play!"),
    # Zero seconds & OT
    ("caster_one_zero_seconds_0", "caster_one", "Zero seconds! Keep the ball alive!"),
    ("caster_two_overtime_0", "caster_two", "Overtime is here! Next goal wins it all!"),
]

print("Initializing ChatterboxTTS...")
model = ChatterboxTTS.from_pretrained(device="cpu")

# Load Conditionals
caster_one_conds = Conditionals.load(CACHE_DIR / "caster_one_conds.pt", map_location="cpu")
caster_two_conds = Conditionals.load(CACHE_DIR / "caster_two_conds.pt", map_location="cpu")

for filename, speaker, text in CORE_SHOUTS:
    out_file = SHOUTS_DIR / f"{filename}.wav"
    if out_file.exists() and out_file.stat().st_size > 50000:
        print(f"Skipping already synthesized: {out_file.name}")
        continue

    print(f"Synthesizing [{speaker.upper()}] \"{text}\" -> {out_file.name}...")
    model.conds = caster_one_conds if speaker == "caster_one" else caster_two_conds
    t0 = time.time()
    wav = model.generate(text, exaggeration=0.85)
    
    if not isinstance(wav, torch.Tensor):
        wav = torch.tensor(wav)
    wav_np = wav.cpu().numpy()
    if wav_np.ndim > 1:
        wav_np = wav_np.squeeze()

    # Normalize to 0.95 peak and save standard 16-bit PCM WAV
    peak = np.max(np.abs(wav_np))
    if peak > 0:
        wav_np = (wav_np / peak * 0.95).astype(np.float32)
    sf.write(str(out_file), wav_np, model.sr, subtype="PCM_16")
    duration = len(wav_np) / model.sr
    print(f"Saved {out_file.name} ({duration:.1f}s) in {time.time()-t0:.1f}s")

print("\nReflex shout soundbank successfully populated!")
