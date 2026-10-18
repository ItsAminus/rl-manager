"""
Continuous High-Fidelity Broadcast Audio Dispatcher for Caster One & Caster Two.
Emulates an authentic, non-stop RLCS broadcast casting desk.
Features:
- Non-Stop Yapping: Casters talk continuously from kickoff to 0:00 with natural ~0.28s breaths.
- Zero Latency (< 1ms): Sudden goals & saves instantly cut off casual banter mid-sentence.
- Co-Host Breakdown: Explosive goal scream is followed immediately by tactical color analysis.
- Smart Non-Repetition: 40-clip history buffer prevents repeated lines throughout the entire match.
- Zero Match GPU Load: Runs asynchronously on Windows audio without starving game FPS.
"""

import os
import time
import random
import threading
import winsound
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

try:
    from .reflex_shout_cache import get_bank, get_random_shout
    from .caster_engine import CasterEngine
except (ImportError, ValueError):
    from reflex_shout_cache import get_bank, get_random_shout
    from caster_engine import CasterEngine

CACHE_DIR = Path(__file__).parent / "cache"

class AudioDispatcher:
    def __init__(self, tts_model=None, enabled: bool = True):
        self.tts_model = tts_model
        self.enabled = enabled
        self.caster = CasterEngine()
        self.bank = get_bank()

        # Telemetry & match state
        self.match_time_left = 300
        self.blue_score = 0
        self.orange_score = 0
        self.is_overtime = False

        # Milestone announcement flags
        self.clock_120_announced = False
        self.clock_60_announced = False
        self.clock_30_announced = False
        self.clock_10_announced = False
        self.zero_announced = False
        self.ot_announced = False

        # Speaker & playback tracking
        self.last_speaker = "caster_two"  # Caster One starts the broadcast
        self.current_sound_end_time = 0.0
        self.current_sound_path: Optional[str] = None
        self._lock = threading.Lock()
        self._stop_event = threading.Event()

        # Queued events
        self.priority_event: Optional[Dict[str, Any]] = None
        self.micro_event: Optional[Dict[str, Any]] = None
        self.micro_event_time = 0.0

        # Dedicated Continuous Broadcast Streamer Thread
        self.streamer_thread = threading.Thread(target=self._streamer_worker, daemon=True)
        self.streamer_thread.start()

    def is_speaking(self) -> bool:
        """Returns True if commentary is currently playing."""
        return time.time() < self.current_sound_end_time

    def stop(self):
        """Halts the broadcast streamer cleanly and purges audio."""
        self.enabled = False
        self._stop_event.set()
        try:
            winsound.PlaySound(None, winsound.SND_PURGE)
        except Exception:
            pass

    def play_wav_instant(self, wav_path: str, duration: float, interrupt: bool = False, speaker: str = "caster_one"):
        """Plays a WAV file immediately using low-latency asynchronous Windows audio."""
        if not self.enabled or not os.path.exists(wav_path):
            return

        with self._lock:
            if interrupt:
                try:
                    winsound.PlaySound(None, winsound.SND_PURGE)
                except Exception:
                    pass

            try:
                winsound.PlaySound(wav_path, winsound.SND_ASYNC | winsound.SND_FILENAME)
                self.current_sound_end_time = time.time() + duration
                self.current_sound_path = wav_path
                self.last_speaker = speaker
            except Exception as e:
                print(f"[AudioDispatcher] Audio error: {e}")

    # =========================================================================
    # INSTANT TELEMETRY EVENT HANDLERS (< 1ms LATENCY)
    # =========================================================================
    def on_goal_event(self, scorer: str, team: str, speed_kph: float, blue_score: int, orange_score: int, time_left: int):
        """Instant explosive goal scream with co-caster follow-up breakdown."""
        self.blue_score = blue_score
        self.orange_score = orange_score
        self.match_time_left = time_left

        pair = self.bank.get_reflex_pair("goal")
        if pair[0]:
            shout_path, dur, spk = pair[0]
            print(f"[Commentary] INSTANT GOAL REFLEX ({spk.upper()}): {shout_path.name}")
            self.play_wav_instant(str(shout_path), duration=dur, interrupt=True, speaker=spk)

            # Queue immediate tactical breakdown follow-up
            if pair[1]:
                self.priority_event = {
                    "clip": pair[1],
                    "label": "GOAL BREAKDOWN"
                }

    def on_save_event(self, defender: str, team: str):
        """Instant heroic save shout with co-caster follow-up analysis."""
        pair = self.bank.get_reflex_pair("save")
        if pair[0]:
            shout_path, dur, spk = pair[0]
            print(f"[Commentary] INSTANT SAVE REFLEX ({spk.upper()}): {shout_path.name}")
            self.play_wav_instant(str(shout_path), duration=dur, interrupt=True, speaker=spk)

            if pair[1]:
                self.priority_event = {
                    "clip": pair[1],
                    "label": "SAVE BREAKDOWN"
                }

    def on_demo_event(self, attacker: str, victim: str):
        """Physical demolition reaction."""
        clip = self.bank.get_clip("demo")
        if clip:
            shout_path, dur, spk = clip
            print(f"[Commentary] DEMO REACTION ({spk.upper()}): {shout_path.name}")
            if not self.is_speaking():
                self.play_wav_instant(str(shout_path), duration=dur, interrupt=False, speaker=spk)
            else:
                self.priority_event = {"clip": clip, "label": "DEMO"}

    def on_bump_event(self, bumper: str, victim: str):
        self.micro_event = {"type": "bump", "time": time.time()}

    def on_pass_event(self, passer: str, receiver: str, team: str):
        self.micro_event = {"type": "pass", "time": time.time()}

    def on_aerial_event(self, player: str, team: str):
        self.micro_event = {"type": "aerial", "time": time.time()}

    def on_shot_event(self, shooter: str, team: str):
        self.micro_event = {"type": "yap", "time": time.time()}

    def on_clear_event(self, defender: str, team: str):
        self.micro_event = {"type": "yap", "time": time.time()}

    def on_dribble_event(self, player: str, team: str):
        self.micro_event = {"type": "aerial", "time": time.time()}

    def on_fifty_fifty_event(self, winner: str, loser: str):
        self.micro_event = {"type": "bump", "time": time.time()}

    def on_ambient_yap(self, blue_score: int, orange_score: int, time_left: int, notable_player: str):
        self.blue_score = blue_score
        self.orange_score = orange_score
        self.match_time_left = time_left

    def on_zero_seconds(self):
        if not self.zero_announced:
            self.zero_announced = True
            clip = self.bank.get_clip("zero_seconds")
            if clip:
                self.play_wav_instant(str(clip[0]), duration=clip[1], interrupt=True, speaker=clip[2])

    def on_overtime(self):
        if not self.ot_announced:
            self.ot_announced = True
            clip = self.bank.get_clip("overtime")
            if clip:
                self.play_wav_instant(str(clip[0]), duration=clip[1], interrupt=True, speaker=clip[2])

    # =========================================================================
    # CONTINUOUS BROADCAST STREAMER LOOP
    # =========================================================================
    def _catch_breath(self, pause_seconds: float) -> bool:
        """Brief pause to simulate natural caster breathing. Returns False if interrupted."""
        deadline = time.time() + pause_seconds
        while time.time() < deadline and not self._stop_event.is_set():
            if self.priority_event:
                return False
            time.sleep(0.01)
        return True

    def _wait_for_current_sound(self):
        """Waits for current audio to finish playing."""
        while time.time() < self.current_sound_end_time and not self._stop_event.is_set():
            if self.priority_event:
                break
            time.sleep(0.02)

    def _play_and_wait(self, clip: Tuple[Path, float, str], label: str = "CAST"):
        """Plays a clip and waits for its duration."""
        wav_path, dur, spk = clip
        print(f"[Commentary] {label} ({spk.upper()}): {wav_path.name} ({dur:.1f}s)")
        self.play_wav_instant(str(wav_path), duration=dur, interrupt=False, speaker=spk)
        self._wait_for_current_sound()

    def _streamer_worker(self):
        """
        Main Broadcast Streamer Thread:
        Executes continuous non-stop commentary throughout the whole match,
        catching breath briefly (0.24 - 0.32s), alternating Caster One and Caster Two.
        """
        # Brief startup buffer for Rocket League window initialization
        time.sleep(0.5)

        # ---------------------------------------------------------------------
        # 1. BROADCAST OPENING & KICKOFF
        # ---------------------------------------------------------------------
        if not self.priority_event:
            intro_caster_one = self.bank.get_clip("intro", preferred_speaker="caster_one")
            if intro_caster_one:
                self._play_and_wait(intro_caster_one, label="INTRO")
                self._catch_breath(0.28)

        if not self.priority_event:
            intro_caster_two = self.bank.get_clip("intro", preferred_speaker="caster_two")
            if intro_caster_two:
                self._play_and_wait(intro_caster_two, label="INTRO")
                self._catch_breath(0.28)

        # ---------------------------------------------------------------------
        # 2. CONTINUOUS NON-STOP CASTING LOOP
        # ---------------------------------------------------------------------
        while not self._stop_event.is_set() and self.enabled:
            # Check high-priority event (Goal or Save tactical breakdown)
            if self.priority_event:
                pe = self.priority_event
                self.priority_event = None
                clip = pe.get("clip")
                if clip:
                    self._play_and_wait(clip, label=pe.get("label", "ANALYSIS"))
                    self._catch_breath(0.32)
                continue

            # Wait if audio is currently playing
            if time.time() < self.current_sound_end_time:
                time.sleep(0.02)
                continue

            # Natural breathing pause (0.24 - 0.32s)
            breath_pause = random.uniform(0.24, 0.32)
            if not self._catch_breath(breath_pause):
                continue  # Interrupted by goal/save during breath

            # Check clock pressure milestones
            if self.match_time_left <= 120 and not self.clock_120_announced:
                self.clock_120_announced = True
                clip = self.bank.get_clip("clock_120") or self.bank.get_clip("clock")
                if clip:
                    self._play_and_wait(clip, label="CLOCK (120s)")
                    continue

            if self.match_time_left <= 60 and not self.clock_60_announced:
                self.clock_60_announced = True
                clip = self.bank.get_clip("clock_60") or self.bank.get_clip("clock")
                if clip:
                    self._play_and_wait(clip, label="CLOCK (60s)")
                    continue

            if self.match_time_left <= 30 and not self.clock_30_announced:
                self.clock_30_announced = True
                clip = self.bank.get_clip("clock_30") or self.bank.get_clip("clock")
                if clip:
                    self._play_and_wait(clip, label="CLOCK (30s)")
                    continue

            if self.match_time_left <= 10 and not self.clock_10_announced:
                self.clock_10_announced = True
                clip = self.bank.get_clip("clock_10") or self.bank.get_clip("clock")
                if clip:
                    self._play_and_wait(clip, label="CLOCK (10s)")
                    continue

            # Check micro-events (Pass, Aerial, Bump within last 2.2 seconds)
            now = time.time()
            if self.micro_event and (now - self.micro_event.get("time", 0.0) < 2.2):
                me = self.micro_event
                self.micro_event = None
                next_spk = "caster_two" if self.last_speaker == "caster_one" else "caster_one"
                clip = self.bank.get_clip(me["type"], preferred_speaker=next_spk)
                if clip:
                    self._play_and_wait(clip, label=me["type"].upper())
                    continue

            # CONTINUOUS YAPPING / TACTICAL BANTER:
            next_spk = "caster_two" if self.last_speaker == "caster_one" else "caster_one"
            clip = self.bank.get_clip("yap", preferred_speaker=next_spk)
            if clip:
                self._play_and_wait(clip, label="MIDFIELD YAPPING")
            else:
                time.sleep(0.1)

        print("[AudioDispatcher] Match ended. Broadcast stream finished.")
