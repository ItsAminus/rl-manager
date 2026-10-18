"""
Reflex Shout & Broadcast Audio Bank Cache for Caster One & Caster Two.
Maintains an indexed library of pre-synthesized studio-quality AI lines
for instant, zero-latency playback with zero repetition.
"""

import os
import random
import wave
from pathlib import Path
from collections import deque
from typing import Optional, Dict, List, Tuple

CACHE_DIR = Path(__file__).parent / "cache"
SHOUTS_DIR = CACHE_DIR / "reflex_shouts"
RVC_SHOUTS_DIR = CACHE_DIR / "rvc_shouts"
CLEAN_SHOUTS_DIR = CACHE_DIR / "clean_shouts"

class SoundBank:
    """
    Manages pre-synthesized WAV files for Caster One & Caster Two commentary.
    Features:
    - 0ms instant retrieval
    - Exact audio duration caching
    - Category & speaker indexing
    - Smart history tracking (no repetition within last 25 lines)
    - Casters alternating naturally
    """
    def __init__(self):
        self.clips_by_category: Dict[str, List[Path]] = {}
        self.clip_durations: Dict[str, float] = {}
        self.history = deque(maxlen=40)
        self.last_speaker = "caster_one"
        self._scan_bank()

    def _scan_bank(self):
        """Scans and categorizes all available WAV files, prioritizing RVC converted audio or clean 48k studio audio."""
        if RVC_SHOUTS_DIR.exists() and any(RVC_SHOUTS_DIR.glob("*.wav")):
            target_dir = RVC_SHOUTS_DIR
        elif CLEAN_SHOUTS_DIR.exists() and any(CLEAN_SHOUTS_DIR.glob("*.wav")):
            target_dir = CLEAN_SHOUTS_DIR
        else:
            target_dir = SHOUTS_DIR
        if not target_dir.exists():
            return

        self.clips_by_category.clear()
        for wav_path in target_dir.glob("*.wav"):
            name = wav_path.stem.lower()

            # Determine category
            cat = "yap"
            if "intro" in name:
                cat = "intro"
            elif "yap" in name:
                cat = "yap"
            elif "pass" in name:
                cat = "pass"
            elif "aerial" in name:
                cat = "aerial"
            elif "bump" in name:
                cat = "bump"
            elif "goal" in name:
                cat = "goal"
            elif "save" in name:
                cat = "save"
            elif "demo" in name:
                cat = "demo"
            elif "clock" in name:
                cat = "clock"
            elif "zero_seconds" in name:
                cat = "zero_seconds"
            elif "overtime" in name:
                cat = "overtime"

            speaker = "caster_one" if name.startswith("caster_one") else "caster_two"
            sp_cat = f"{cat}:{speaker}"

            self.clips_by_category.setdefault(cat, []).append(wav_path)
            self.clips_by_category.setdefault(sp_cat, []).append(wav_path)

            # Also index specific clock milestones
            for milestone in ["clock_120", "clock_60", "clock_30", "clock_10"]:
                if milestone in name:
                    self.clips_by_category.setdefault(milestone, []).append(wav_path)

            # Compute and cache exact duration
            if str(wav_path) not in self.clip_durations:
                try:
                    with wave.open(str(wav_path), "rb") as wf:
                        frames = wf.getnframes()
                        rate = wf.getframerate()
                        self.clip_durations[str(wav_path)] = frames / float(rate)
                except Exception:
                    self.clip_durations[str(wav_path)] = 2.5

    def get_duration(self, wav_path: Path) -> float:
        return self.clip_durations.get(str(wav_path), 2.5)

    def get_clip(self, category: str, preferred_speaker: Optional[str] = None) -> Optional[Tuple[Path, float, str]]:
        """
        Retrieves an unplayed clip for the given category with smart speaker alternation
        and zero repetition.
        Returns: (wav_path, duration_seconds, speaker)
        """
        self._scan_bank()

        pool = []
        if preferred_speaker:
            pool = self.clips_by_category.get(f"{category}:{preferred_speaker}", [])

        if not pool:
            pool = self.clips_by_category.get(category, [])

        if not pool and category != "yap":
            pool = self.clips_by_category.get("yap", [])

        if not pool:
            return None

        # Filter out recently played clips
        candidates = [p for p in pool if str(p) not in self.history]

        # If all candidate clips were recently played, clear oldest half of history
        if not candidates:
            half = max(1, len(self.history) // 2)
            for _ in range(half):
                if self.history:
                    self.history.popleft()
            candidates = [p for p in pool if str(p) not in self.history]
            if not candidates:
                candidates = pool

        chosen = random.choice(candidates)
        self.history.append(str(chosen))

        speaker = "caster_one" if chosen.stem.lower().startswith("caster_one") else "caster_two"
        self.last_speaker = speaker
        duration = self.get_duration(chosen)
        return (chosen, duration, speaker)

    def get_reflex_pair(self, event_type: str) -> Tuple[Optional[Tuple[Path, float, str]], Optional[Tuple[Path, float, str]]]:
        """
        For high-energy moments like goals and saves, returns:
        (scream_reaction, follow_up_analysis)
        E.g. Caster One yells the goal -> Caster Two delivers immediate tactical follow-up.
        """
        first = self.get_clip(event_type, preferred_speaker="caster_one")
        second_speaker = "caster_two" if (first and first[2] == "caster_one") else "caster_one"
        second = self.get_clip(event_type, preferred_speaker=second_speaker)
        return (first, second)

# Global singleton
_sound_bank: Optional[SoundBank] = None

def get_bank() -> SoundBank:
    global _sound_bank
    if _sound_bank is None:
        _sound_bank = SoundBank()
    return _sound_bank

def get_random_shout(event_type: str) -> Optional[Path]:
    """Backward compatibility helper for quick 0ms shouts."""
    clip = get_bank().get_clip(event_type)
    return clip[0] if clip else None
