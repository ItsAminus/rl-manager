"""
High-Energy Player Pack Pre-Warmer.
Uses the 10/10 Peak Hype voice profiles (Caster One & Caster Two Hype Caster)
to pre-synthesize complete player shout packs for in-match players.
"""

import os
import sys
import time
from pathlib import Path
import soundfile as sf
import numpy as np
import torch
from chatterbox.tts import ChatterboxTTS, Conditionals

try:
    from .player_shout_bank import PLAYER_TEMPLATES, PLAYER_SHOUTS_DIR
except (ImportError, ValueError):
    from player_shout_bank import PLAYER_TEMPLATES, PLAYER_SHOUTS_DIR

CACHE_DIR = Path(__file__).parent / "cache"

DEFAULT_PLAYERS = [
    "Gimmick",
    "RelatingWave",
    "Metsanauris",
    "Marc_by_8",
    "Extra",
]

def prewarm_players(player_names=None, device="cuda"):
    if player_names is None:
        player_names = DEFAULT_PLAYERS

    caster_one_hype_path = CACHE_DIR / "caster_one_hype_conds.pt"
    caster_two_hype_path = CACHE_DIR / "caster_two_hype_conds.pt"

    if not caster_one_hype_path.exists() or not caster_two_hype_path.exists():
        print("[PlayerPrewarmer] Hype conditionals missing! Generating them first...")
        from test_hype_voice_profile import caster_one_hype_conds, caster_two_hype_conds
    else:
        caster_one_hype_conds = Conditionals.load(caster_one_hype_path, map_location=device)
        caster_two_hype_conds = Conditionals.load(caster_two_hype_path, map_location=device)

    print(f"[PlayerPrewarmer] Initializing ChatterboxTTS on {device} (RTX 5060)...")
    model = ChatterboxTTS.from_pretrained(device=device)

    for player in player_names:
        player_clean = player.strip()
        player_dir = PLAYER_SHOUTS_DIR / player_clean
        player_dir.mkdir(parents=True, exist_ok=True)
        print(f"\n[PlayerPrewarmer] === PREWARMING SHOUT PACK FOR: {player_clean} ===")

        for action, templates in PLAYER_TEMPLATES.items():
            for idx, (speaker, tmpl) in enumerate(templates):
                filename = f"{action}_{idx}_{speaker}.wav"
                out_path = player_dir / filename
                if out_path.exists() and out_path.stat().st_size > 40000:
                    print(f"  [Skip] Already cached: {filename}")
                    continue

                text = tmpl.format(player=player_clean)
                print(f"  [{speaker.upper()} - {action.upper()}] \"{text}\" -> {filename}...")
                model.conds = caster_one_hype_conds if speaker == "caster_one" else caster_two_hype_conds

                t0 = time.time()
                with torch.inference_mode():
                    wav = model.generate(text, exaggeration=0.95)

                if not isinstance(wav, torch.Tensor):
                    wav = torch.tensor(wav)
                wav_np = wav.cpu().numpy().squeeze()
                peak = np.max(np.abs(wav_np))
                if peak > 0:
                    wav_np = (wav_np / peak * 0.95).astype(np.float32)

                sf.write(str(out_path), wav_np, model.sr, subtype="PCM_16")
                dur = len(wav_np) / model.sr
                print(f"    -> Saved {filename} ({dur:.1f}s) in {time.time()-t0:.2f}s")

    print("\n[PlayerPrewarmer] All player shout packs successfully pre-warmed!")

if __name__ == "__main__":
    players = sys.argv[1:] if len(sys.argv) > 1 else None
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    prewarm_players(players, device=dev)
