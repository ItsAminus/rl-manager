"""
Voice Profiler for Caster One & Caster Two using Resemble AI's Chatterbox.
Pre-extracts and caches PyTorch conditioning tensors (speaker embeddings,
speech prompt tokens, and emotion exaggeration) so runtime speech generation
has ZERO preprocessing overhead.
"""

import os
import sys
import time
from pathlib import Path
import soundfile as sf
import torch

VOICES_DIR = Path(__file__).parent / "voices"
CACHE_DIR = Path(__file__).parent / "cache"

def profile_voices(device: str = "cpu"):
    from chatterbox.tts import ChatterboxTTS, Conditionals
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    print(f"[VoiceProfiler] Loading ChatterboxTTS on {device}...")
    t0 = time.time()
    model = ChatterboxTTS.from_pretrained(device=device)
    print(f"[VoiceProfiler] ChatterboxTTS ready in {time.time() - t0:.2f}s")

    profiles = [
        ("caster_one", VOICES_DIR / "caster_one_reference.wav", CACHE_DIR / "caster_one_conds.pt", 0.7),
        ("caster_two", VOICES_DIR / "caster_two_reference.wav", CACHE_DIR / "caster_two_conds.pt", 0.7),
    ]

    for name, ref_wav, out_pt, default_exaggeration in profiles:
        if not ref_wav.exists():
            print(f"[VoiceProfiler] Warning: Reference WAV not found at {ref_wav}")
            continue

        print(f"[VoiceProfiler] Extracting voice conditioning profile for '{name}' from {ref_wav.name}...")
        t_prof = time.time()
        model.prepare_conditionals(str(ref_wav), exaggeration=default_exaggeration)
        model.conds.save(out_pt)
        print(f"[VoiceProfiler] Saved cached profile to {out_pt} in {time.time() - t_prof:.2f}s")

    return model

def test_synthesis(model, voice: str = "caster_one", text: str = "What a save by Gimmick! Incredible defense on the goal line!"):
    from chatterbox.tts import Conditionals
    conds_path = CACHE_DIR / f"{voice}_conds.pt"
    if not conds_path.exists():
        raise FileNotFoundError(f"Cached conditionals not found: {conds_path}")

    print(f"[VoiceProfiler] Generating test speech for '{voice}': \"{text}\"")
    model.conds = Conditionals.load(conds_path, map_location=model.device)
    
    t0 = time.time()
    wav = model.generate(text, exaggeration=0.7)
    gen_time = time.time() - t0
    
    import torchaudio as ta
    if not isinstance(wav, torch.Tensor):
        wav = torch.tensor(wav)
    if wav.ndim == 1:
        wav = wav.unsqueeze(0)
    out_file = CACHE_DIR / f"test_{voice}.wav"
    ta.save(str(out_file), wav.cpu(), model.sr)
    duration = wav.shape[-1] / model.sr
    print(f"[VoiceProfiler] Generated {duration:.2f}s of audio in {gen_time:.2f}s (RTF: {gen_time/duration:.2f}x) -> {out_file}")
    return out_file

if __name__ == "__main__":
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = profile_voices(device=device)
    test_synthesis(model, "caster_one", "What a hit by Gimmick! He buries it top bins!")
    test_synthesis(model, "caster_two", "Elevate take a 2-1 lead in the series, absolute clinical finish!")
