"""
High-Energy Player Shout Bank for Caster One & Caster Two.
Maintains pre-synthesized, player-specific high-hype lines for in-match plays:
Goals, Saves, Clears, Shots, Dribbles, Aerials, and Demolitions.
Guarantees 0ms retrieval and seamless fallback.
"""

import os
import random
import wave
import time
from pathlib import Path
from collections import deque
from typing import Optional, Dict, List, Tuple

try:
    from .reflex_shout_cache import get_bank as get_core_bank
except (ImportError, ValueError):
    from reflex_shout_cache import get_bank as get_core_bank

CACHE_DIR = Path(__file__).parent / "cache"
PLAYER_SHOUTS_DIR = CACHE_DIR / "player_shouts"
PLAYER_SHOUTS_DIR.mkdir(parents=True, exist_ok=True)

# Templates for player-specific high-hype commentary
PLAYER_TEMPLATES = {
    "goal": [
        ("caster_one", "{player} strikes! An absolute rocket into the top corner from {player}!"),
        ("caster_two", "{player} buries it top bins! Sensational finish from {player}!"),
    ],
    "save": [
        ("caster_one", "What a save by {player}! Heroic goal line defense, denying a certain goal!"),
        ("caster_two", "{player} robs them on the doorstep! Outrageous reflex stop from {player}!"),
    ],
    "clear": [
        ("caster_one", "Booming clear by {player} up the pitch, relieving all the defensive pressure!"),
        ("caster_two", "{player} clears it out of danger with authority! Textbook recovery!"),
    ],
    "shot": [
        ("caster_one", "{player} fires on net! Dangerous venomous strike testing the keeper!"),
        ("caster_two", "{player} with a rocket on target, forcing the defense into emergency mode!"),
    ],
    "dribble": [
        ("caster_one", "{player} controlling the dribble through the midfield, brilliant ball control!"),
        ("caster_two", "{player} carries it forward with supreme confidence and poise!"),
    ],
    "aerial": [
        ("caster_one", "{player} skying high into the rafters! Reaches that aerial before anyone else!"),
        ("caster_two", "{player} wins the high aerial contest! Fantastic challenge up near the ceiling!"),
    ],
    "demo": [
        ("caster_two", "Demolished by {player}! Savage physical statement on the rotation!"),
        ("caster_one", "Boom! {player} takes them clean out of the play with the demolition!"),
    ]
}

class PlayerShoutBank:
    def __init__(self):
        self.player_clips: Dict[str, Dict[str, List[Path]]] = {} # player -> { action -> [paths] }
        self.clip_durations: Dict[str, float] = {}
        self.history = deque(maxlen=25)
        self.scan_all()

    def scan_all(self):
        """Scans all existing player shout packs on disk."""
        if not PLAYER_SHOUTS_DIR.exists():
            return
        
        self.player_clips.clear()
        for player_dir in PLAYER_SHOUTS_DIR.iterdir():
            if not player_dir.is_dir():
                continue
            player_name = player_dir.name
            self.player_clips[player_name] = {}
            for wav_file in player_dir.glob("*.wav"):
                # e.g. goal_0_caster_one.wav -> action = goal
                parts = wav_file.stem.split("_")
                action = parts[0]
                self.player_clips[player_name].setdefault(action, []).append(wav_file)
                
                # Cache duration
                if str(wav_file) not in self.clip_durations:
                    try:
                        with wave.open(str(wav_file), "rb") as wf:
                            self.clip_durations[str(wav_file)] = wf.getnframes() / float(wf.getframerate())
                    except Exception:
                        self.clip_durations[str(wav_file)] = 3.0

    def get_player_clip(self, player_name: str, action: str) -> Optional[Tuple[Path, float, str]]:
        """
        Retrieves a 0ms pre-synthesized audio clip for a specific player and action.
        Returns (path, duration, speaker) or None if not cached.
        """
        clean_name = player_name.strip()
        # Case-insensitive lookup
        matched_player = None
        for p in self.player_clips:
            if p.lower() == clean_name.lower():
                matched_player = p
                break

        if not matched_player:
            return None

        action_clips = self.player_clips[matched_player].get(action, [])
        if not action_clips:
            return None

        # Filter recently played
        candidates = [p for p in action_clips if str(p) not in self.history]
        if not candidates:
            candidates = action_clips

        chosen = random.choice(candidates)
        self.history.append(str(chosen))
        duration = self.clip_durations.get(str(chosen), 3.0)
        speaker = "caster_one" if "caster_one" in chosen.stem.lower() else "caster_two"
        return (chosen, duration, speaker)

    def has_player(self, player_name: str) -> bool:
        clean_name = player_name.strip().lower()
        return any(p.lower() == clean_name for p in self.player_clips)

# Singleton instance
_player_bank: Optional[PlayerShoutBank] = None

def get_player_bank() -> PlayerShoutBank:
    global _player_bank
    if _player_bank is None:
        _player_bank = PlayerShoutBank()
    return _player_bank
