"""Local recordings with complete sentences and one relevant follow-up call."""

import json
import os
import math
import random
import re
import sys
import time
import wave
from collections import deque
from pathlib import Path


def audio_dependencies():
    # The existing RLBot installation keeps its audio wheels here. This loads
    # only numpy/PortAudio, never the Google or voice-model engines.
    dependencies = Path(os.environ.get('RLM_AUDIO_DEPS', str(Path(os.environ.get('RLM_AI_RUNTIME',str(Path(__file__).resolve().parents[1] / 'local_runtime'))) / 'google_deps')))
    if dependencies.is_dir() and str(dependencies) not in sys.path:
        sys.path.append(str(dependencies))
    import numpy
    # PortAudio is optional. A driver/PortAudio failure must not prevent the
    # recordings from loading; the native helper has a Windows audio fallback.
    return numpy, None


class ClipBank:
    def __init__(self, folder, sample_rate, seed=None, state_file=None):
        self.np, _ = audio_dependencies()
        self.clips = {}
        self.categories = {}
        self.remaining = {}
        self.last = {}
        self.random = random.Random(seed)
        self.state_file = Path(state_file) if state_file else None
        self.errors = []
        try:
            self.manifest = json.loads((Path(folder) / 'manifest.json').read_text(encoding='utf-8'))
        except (OSError, ValueError):
            self.manifest = {}
        for file in sorted(Path(folder).glob("*.wav")):
            match = re.fullmatch(r"([a-z_]+)_\d+", file.stem)
            if not match:
                continue
            try:
                pcm = self._load(file, sample_rate,
                                 preserve_full=self.manifest.get(file.stem, {}).get('preserveFullAudio', False))
                self.clips[file.stem] = pcm
                category = self.manifest.get(file.stem, {}).get('category', match[1])
                self.categories.setdefault(category, []).append(file.stem)
            except (ValueError, wave.Error, OSError) as exc:
                self.errors.append(f"{file.name}: {exc}")
        if not self.clips:
            raise ValueError(f"No playable WAV clips in {folder}")
        if self.state_file and self.state_file.exists():
            try:
                state = json.loads(self.state_file.read_text(encoding="utf-8"))
                for category, ids in self.categories.items():
                    saved = state.get(category, {})
                    known = set(saved.get("known", []))
                    remaining = list(dict.fromkeys(i for i in saved.get("remaining", []) if i in ids))
                    remaining.extend(i for i in ids if i not in known and i not in remaining)
                    self.remaining[category] = remaining
                    self.last[category] = saved.get("last")
            except (OSError, ValueError, TypeError, AttributeError):
                pass

    def _load(self, file, sample_rate, preserve_full=False):
        np = self.np
        with wave.open(str(file), "rb") as source:
            if source.getsampwidth() != 2 or source.getcomptype() != "NONE":
                raise ValueError("Expected uncompressed PCM16")
            channels, rate = source.getnchannels(), source.getframerate()
            pcm = np.frombuffer(source.readframes(source.getnframes()), dtype="<i2").astype(np.float32)
        pcm = pcm.reshape(-1, channels).mean(axis=1) / 32768.0
        # Remove leading silence only. Preserve the entire recorded ending,
        # including quiet final consonants and the caster's natural tail.
        audible = np.flatnonzero(np.abs(pcm) > 0.003)
        if not len(audible):
            raise ValueError("Silent clip")
        margin = int(rate * 0.05)
        if not preserve_full:
            pcm = pcm[max(0, int(audible[0]) - margin):]
        if rate != sample_rate:
            # NumPy 1.x defaults to int32 indices on Windows. Multiplying those
            # by 24000 overflows after ~1.86 s at 48 kHz: negative coordinates
            # become silence, then wrapped coordinates replay the opening.
            # Build floating-point coordinates BEFORE any rate multiplication.
            positions = np.arange(round(len(pcm) * sample_rate / rate), dtype=np.float64)
            positions *= float(rate) / float(sample_rate)
            pcm = np.interp(positions, np.arange(len(pcm), dtype=np.float64), pcm).astype(np.float32)
        pcm *= 0.9  # headroom, with no pitch or timing changes
        fade = min(int(sample_rate * 0.008), len(pcm) // 2)
        pcm[:fade] *= np.linspace(0, 1, fade)
        pcm[-fade:] *= np.linspace(1, 0, fade)
        return pcm

    def draw(self, category):
        category = self.recording_category(category)
        ids = self.categories.get(category, [])
        if not ids:
            return None
        bag = self.remaining.setdefault(category, [])
        if not bag:
            bag.extend(ids)
            self.random.shuffle(bag)
            if len(bag) > 1 and bag[-1] == self.last.get(category):
                bag[0], bag[-1] = bag[-1], bag[0]
        clip_id = bag.pop()
        self.last[category] = clip_id
        return clip_id, self.clips[clip_id]

    def recording_category(self, category):
        if category in self.categories:
            return category
        return {'critical_demo': 'demo', 'mistake': 'miss'}.get(category, category)

    def save_rotation(self):
        if self.state_file:
            self.state_file.parent.mkdir(parents=True, exist_ok=True)
            state = {category: {"known": ids, "remaining": self.remaining.get(category, []),
                                "last": self.last.get(category)} for category, ids in self.categories.items()}
            temporary = self.state_file.with_suffix(".tmp")
            temporary.write_text(json.dumps(state), encoding="utf-8")
            temporary.replace(self.state_file)

    def begin_game(self):
        # Current-game rotation must start with ALL clips, even if the previous
        # match stopped halfway through its persisted category bag.
        self.remaining.clear()


from native_audio import ClipPlayer


PRIORITY = {"dribble": 30, "wall": 35, "aerial": 45, "kickoff": 50,
            "airdribble": 55, "flick": 65, "shot": 70, "block": 80,
            "save": 90, "goal": 100}
PRIORITY.update(analysis=10, intro=20, winner=100, equalizer=100, late_goal=100)
PRIORITY.update(mistake=95, critical_demo=92)
PRIORITY['pass'] = 40
PRIORITY.update(ceiling=55, reset=60, doubletouch=68, powershot=72,
                miss=75, post=78, crossbar=78, doublesave=94, triplesave=98,
                goahead=100, owngoal=100, clear=50, fifty=50, intercept=60,
                bump=50, demo=70, counter=60, pressure=25, recovery=25,
                rotation=10, boostchat=10, lowboost=25, lateclock=40,
                overtimechat=25, banter=10, matchwin=105)
GOALS = {'goal', 'winner', 'equalizer', 'late_goal', 'goahead', 'owngoal'}
REACTIONS = GOALS | {'save', 'doublesave', 'triplesave', 'mistake', 'critical_demo', 'matchwin'}
TERMINAL = {"goal", "save", "block"}
TERMINAL.update(("winner", "equalizer", "late_goal"))
TERMINAL.update(("mistake", "critical_demo"))
TERMINAL.update(REACTIONS | {'miss', 'post', 'crossbar'})


def xyz(vector):
    return (vector.x, vector.y, vector.z)


def distance(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def threatens_goal(ball, velocity, attacking_team):
    goal_y = 5120 if attacking_team == 0 else -5120
    if abs(velocity[1]) < 650:
        return False
    flight = (goal_y - ball[1]) / velocity[1]
    if not 0 < flight < 1.25:
        return False
    x = ball[0] + velocity[0] * flight
    z = max(93, ball[2] + velocity[2] * flight - 325 * flight ** 2)
    return abs(x) < 780 and z < 550


class ClipBroadcast:
    def __init__(self, bank_path=None, player=None, log=print, clock=time.monotonic, seed=None,
                 state_file=None, countdown_player=None, goal_player=None):
        self.log, self.clock = log, clock
        from native_audio import commentary_volume
        self.player = player or ClipPlayer(volume=commentary_volume())
        folder = Path(bank_path) if bank_path else Path(__file__).parent / "voice_bank"
        state_file = state_file or (Path(__file__).parent / "cache" / "clip_rotation.json")
        try:
            self.bank = ClipBank(folder, self.player.sample_rate, seed, state_file)
        except Exception:
            self.player.close()
            raise
        self.preempt_recordings = any(entry.get('audioRole') == 'commentary' for entry in self.bank.manifest.values())
        self.current = None
        self.pending = None
        self.goal_calls = deque()
        self.goal_player = goal_player
        self.goal_current = None
        if self.goal_player is None and (GOALS | {'crowd_goal', 'crowd_late_goal'}).intersection(self.bank.categories):
            try:
                # Independent WASAPI output mixes crowd reactions with a full
                # caster sentence. It never waits for the commentary queue.
                self.goal_player = ClipPlayer(continuous_output=True)
            except Exception:
                self.player.close()
                raise
        self.countdown_player = countdown_player
        if self.countdown_player is None and 'countdown' in self.bank.categories:
            try:
                self.countdown_player = ClipPlayer(continuous_output=True)
            except Exception:
                self.player.close()
                raise
        self.countdown_played = False
        self.remaining_time = None
        self.overtime = False
        self.countdown_was_busy = False
        self.last_event = {}
        self.next_ambient = 0
        self.was_busy = False
        self.scores = None
        self.stats = {}
        self.kickoff = False
        self.touch_stamp = None
        self.previous_touch = None
        self.previous_ball = None
        self.carry_owner = None
        self.carry_since = None
        self.last_carry = None
        self.air_touches = []
        self.elapsed = None
        self.closed = False
        self.reported_underruns = 0
        self.save_sequences = {0: deque(), 1: deque()}
        self.last_filler = 0
        self.pressure_since = None
        self.low_boost_since = None
        self.matchwin_called = False
        from match_incidents import IncidentTracker
        self.incident_tracker = IncidentTracker()
        self.incident_cursor = 0
        self.log(f"Clip commentary ACTIVE: {len(self.bank.clips)} clips; "
                 + ", ".join(f"{k} ({len(v)})" for k, v in self.bank.categories.items())
                 + ". Preloaded recordings; higher-priority critical calls may fade lower-priority speech.")
        for error in self.bank.errors:
            self.log(f"Clip commentary warning: skipped {error}")

    def _invalidate_pending(self, now, keep_goal=False):
        # A changed play invalidates waiting calls, never the sentence on air.
        if not keep_goal or not self.pending or self.pending[0] != "goal":
            self.pending = None
        self.next_ambient = now + 2.0

    def _refresh_finished(self, now):
        if self.was_busy and not self.player.busy:
            if self.current:
                self.log(f"Clip commentary END: {self.current[0]} (native playback completed)")
            self.current = None
            self.next_ambient = max(self.next_ambient, now + 3.0)
            self.was_busy = False

    def _start_line(self, category, owner, team, now):
        if getattr(self,'speech_muted',False):return
        clip_id, pcm = self.bank.draw(category)
        self.player.play(pcm, interruptible=self.preempt_recordings and category not in {'intro', 'postgame'})
        self.current = (category, owner, team)
        self.was_busy = True
        self.last_event[category] = now
        self.log(f"Clip commentary PLAY: {clip_id}")

    def _service_pending(self, now):
        self._refresh_finished(now)
        goal_output = self.goal_player or self.player
        if self.goal_current and not goal_output.busy:
            latency = getattr(goal_output, 'first_audio_latency_ms', None)
            self.log(f"Goal crowd END: {self.goal_current[0]}" +
                     (f"; output-worker-ack={latency:.0f}ms" if latency is not None else ''))
            self.goal_current = None
        if hasattr(goal_output, 'check_health'):
            goal_output.check_health()
        if self.goal_calls and not goal_output.busy:
            category, owner, team = self.goal_calls.popleft()
            self._start_goal(category, owner, team, now)
        if (self.goal_player and self.goal_player.busy and
                not (self.pending and self.pending[0] in REACTIONS)):
            return  # Keep new routine chatter out of the reaction's way.
        if self.pending and not self.player.busy:
            category, owner, team, expires = self.pending
            self.pending = None
            if now <= expires:
                self._start_line(category, owner, team, now)

    def _start_goal(self, category, owner, team, now):
        if not self.goal_player:
            self._start_line(category, owner, team, now)
            return
        clip_id, pcm = self.bank.draw(category)
        if self.goal_player.play(pcm) is False:
            raise RuntimeError('Goal crowd output unexpectedly busy')
        self.goal_current = (category, owner, team)
        self.last_event[category] = now
        self.log(f"Goal crowd PLAY: {clip_id} (immediate independent output)")

    def _event(self, category, owner=None, team=None):
        now = self.clock()
        self._refresh_finished(now)
        if category in GOALS:
            self._stop_countdown_for_goal()
            if 'crowd_goal' in self.bank.categories:
                crowd = ('crowd_late_goal' if category == 'late_goal' and
                         self.remaining_time is not None and self.remaining_time <= 1 and not self.overtime and
                         'crowd_late_goal' in self.bank.categories else 'crowd_goal')
                self.pending = None
                if self.goal_player and self.goal_player.busy:
                    self.goal_calls.append((crowd, owner, team))
                else:
                    self._start_goal(crowd, owner, team, now)
        if getattr(self,'speech_muted',False):return False
        if self.bank.recording_category(category) not in self.bank.categories:
            if category in TERMINAL:
                self._invalidate_pending(now)
            return False
        if category in GOALS and 'crowd_goal' not in self.bank.categories:
            # Crowd reacts on this score packet, overlapping speech rather than
            # cutting it or waiting for its remaining seconds. Only a previous
            # crowd recording can occupy this dedicated output.
            self.pending = None
            output = self.goal_player or self.player
            if output.busy or self.goal_calls:
                self.goal_calls.append((category, owner, team))
            else:
                self._start_goal(category, owner, team, now)
            return True
        if category not in REACTIONS and (self.goal_calls or (self.goal_player and self.goal_player.busy)):
            return False
        if self.countdown_player and self.countdown_player.busy and category not in TERMINAL:
            return False
        if category not in GOALS and now - self.last_event.get(category, -1000) < (2.0 if category in TERMINAL else 10.0):
            return False
        if self.player.busy:
            if self.current and self.current[0] in GOALS and category not in GOALS and category != 'matchwin':
                return False  # Do not announce a now-stale save after the goal call.
            if self.pending and now <= self.pending[3] and PRIORITY.get(self.pending[0], 0) >= PRIORITY.get(category, 0):
                return False
            if (category in REACTIONS and self.current and
                    self.current[0] not in {'intro', 'postgame'} and
                    PRIORITY.get(category, 0) > PRIORITY.get(self.current[0], 0)):
                self.pending = (category, owner, team, now + 6.0)
                if self.player.interrupt():
                    self.log(f'Clip commentary critical transition: {self.current[0]} -> {category}')
                    self._service_pending(now)
                return True
            if category not in TERMINAL:
                # Only a meaningful progression of the same play may wait.
                if not self.current or owner != self.current[1] or owner is None:
                    return False
                if PRIORITY.get(category, 0) <= PRIORITY.get(self.current[0], 0):
                    return False
            if self.pending and now > self.pending[3]:
                self.pending = None
            if self.pending and PRIORITY.get(category, 0) <= PRIORITY.get(self.pending[0], 0):
                return False
            # Keep exactly one follow-up. Repeated ticks cannot extend its age.
            self.pending = (category, owner, team, now + (6.0 if category in TERMINAL else 4.0))
            return True
        if self.pending and PRIORITY.get(self.pending[0], 0) >= PRIORITY.get(category, 0):
            return False
        if category not in TERMINAL and category != "kickoff" and now < self.next_ambient:
            return False
        self.pending = None
        self._start_line(category, owner, team, now)
        return True

    def process_confirmed_event(self, event):
        """Optional native mechanic notifications; never infer resets/own-goals from a high ball."""
        if self.closed or event.get('confirmed') is not True:
            return False
        category = event.get('category')
        if category not in PRIORITY:
            return False
        return self._event(category, event.get('owner'), event.get('team'))

    def _goal_category(self, info, before, after, team):
        # A last-second call must actually change who can win the game.
        meaningful = (before[team] <= before[1-team] and
                      after[team] >= after[1-team])
        if (not info.is_overtime and float(info.game_time_remaining) <= 1.0
                and meaningful and 'late_goal' in self.bank.categories):
            return 'late_goal'
        if info.is_overtime and 'winner' in self.bank.categories:
            return 'winner'
        if after[0] == after[1] and 'equalizer' in self.bank.categories:
            return 'equalizer'
        if before[team] <= before[1-team] and after[team] > after[1-team] and 'goahead' in self.bank.categories:
            return 'goahead'
        return 'goal'

    def _stop_countdown_for_goal(self):
        # Never stop a caster sentence or a goal reaction with this exception.
        if self.countdown_player and self.countdown_player.interrupt():
            self.countdown_was_busy = False
            self.log('Clip commentary STOP: countdown (goal scored)')

    def _countdown(self, info):
        player = self.countdown_player
        if not player:
            return
        if hasattr(player, 'check_health'):
            player.check_health()
        if self.countdown_was_busy and not player.busy:
            self.log('Clip commentary END: countdown (full recording completed)')
            self.countdown_was_busy = False
        if (not self.countdown_played and not info.is_overtime and not info.is_match_ended
                and info.is_round_active and not info.is_kickoff_pause
                and 0 < float(info.game_time_remaining) <= 10):
            clip_id, pcm = self.bank.draw('countdown')
            if player.play(pcm, interruptible=True) is not False:
                self.countdown_played = True
                self.countdown_was_busy = True
                self.pending = None
                self.log(f'Clip commentary PLAY: {clip_id} (countdown; only a goal cancels it)')

    def process_packet(self, packet):
        if self.closed:
            return
        now = self.clock()
        self._refresh_finished(now)
        underruns = getattr(self.player, "underruns", 0)
        if underruns > self.reported_underruns:
            self.reported_underruns = underruns
            if underruns == 1 or underruns % 10 == 0:
                self.log(f"Clip commentary warning: audio buffer underruns={underruns}")
        if hasattr(self.player, "check_health"):
            self.player.check_health()
        if self.player.stream is not None and not self.player.stream.active:
            raise RuntimeError("Audio output stream stopped")
        info = packet.game_info
        scores = tuple(packet.teams[i].score for i in range(min(2, packet.num_teams)))
        stats = {i: (packet.game_cars[i].score_info.saves, packet.game_cars[i].score_info.shots,
                     packet.game_cars[i].score_info.demolitions)
                 for i in range(packet.num_cars)}
        elapsed = float(info.seconds_elapsed)
        # Restart/join baselines: historical statistics are never new events.
        first = self.scores is None
        reset = self.elapsed is not None and (elapsed < self.elapsed - 0.5 or
                    any(new < old for new, old in zip(scores, self.scores)))
        if reset:
            self._invalidate_pending(now)
            self.last_event.clear()
            self.carry_since, self.last_carry = None, None
            self.air_touches.clear()
            self.touch_stamp, self.previous_touch, self.previous_ball = None, None, None
            self.kickoff = False
            self.save_sequences = {0: deque(), 1: deque()}
            self.pressure_since, self.low_boost_since = None, None
            self.matchwin_called = False
            self.incident_cursor = 0
            first = True
        old_scores, old_stats = self.scores, self.stats
        if first:
            self.bank.begin_game()
            self.goal_calls.clear()
            self.countdown_played = False
        self.scores, self.stats, self.elapsed = scores, stats, elapsed
        self.remaining_time = float(info.game_time_remaining)
        self.overtime = bool(info.is_overtime)
        self.incident_tracker.update(packet)
        goal_scored = not first and any(new > old for new, old in zip(scores, old_scores))
        if goal_scored:
            self._stop_countdown_for_goal()
        else:
            self._countdown(info)
        if goal_scored:
            team = next(i for i in range(len(scores)) if scores[i] > old_scores[i])
            self._event(self._goal_category(info, old_scores, scores, team), team=team)
            self.carry_since, self.last_carry = None, None
            self.air_touches.clear()
            for sequence in self.save_sequences.values():
                sequence.clear()
            self._service_pending(now)
            return
        if info.is_match_ended:
            self._invalidate_pending(now, keep_goal=True)
            if not self.matchwin_called and len(scores) == 2 and scores[0] != scores[1]:
                self.matchwin_called = True
                self._event('matchwin', team=0 if scores[0] > scores[1] else 1)
            self._service_pending(now)
            return
        kickoff = bool(info.is_kickoff_pause)
        if kickoff and not self.kickoff:
            self._invalidate_pending(now, keep_goal=True)
            self._event("kickoff")
        self.kickoff = kickoff
        if kickoff or not info.is_round_active:
            if not kickoff:
                self._invalidate_pending(now, keep_goal=True)
            self.carry_since, self.last_carry = None, None
            self.air_touches.clear()
            self.touch_stamp = float(packet.game_ball.latest_touch.time_seconds)
            self.previous_touch, self.previous_ball = None, None
            self._service_pending(now)
            return
        new_incidents = self.incident_tracker.events[self.incident_cursor:]
        self.incident_cursor = len(self.incident_tracker.events)
        for event in new_incidents:
            if event['type'] == 'open_net_miss':
                self._event('mistake', event['slot'], event['team'])
        if not first:
            new_saves = []
            for index, (saves, shots, demos) in stats.items():
                old = old_stats.get(index, (saves, shots, demos))
                if saves > old[0]:
                    team = int(packet.game_cars[index].team)
                    sequence = self.save_sequences[team]
                    while sequence and elapsed - sequence[0] > 5.0:
                        sequence.popleft()
                    sequence.extend([elapsed] * min(3, saves - old[0]))
                    category = 'triplesave' if len(sequence) >= 3 else 'doublesave' if len(sequence) == 2 else 'save'
                    if category not in self.bank.categories:
                        category = 'save'
                    new_saves.append((category, index, team))
            if new_saves:
                category, index, team = max(new_saves, key=lambda event: PRIORITY[event[0]])
                self._event(category, index, team)
                self._service_pending(now)
                return
            for index, (saves, shots, demos) in stats.items():
                old = old_stats.get(index, (saves, shots, demos))
                if shots > old[1]:
                    speed = math.sqrt(sum(v*v for v in xyz(packet.game_ball.physics.velocity)))
                    category = 'powershot' if speed > 2500 and 'powershot' in self.bank.categories else 'shot'
                    self._event(category, index, int(packet.game_cars[index].team))
                if demos > old[2]:
                    self._event('demo', index, int(packet.game_cars[index].team))

        ball = xyz(packet.game_ball.physics.location)
        velocity = xyz(packet.game_ball.physics.velocity)
        touch = packet.game_ball.latest_touch
        stamp = float(touch.time_seconds)
        owner = int(touch.player_index)
        valid_touch = bool(touch.player_name) and 0 <= owner < packet.num_cars
        new_touch = valid_touch and self.touch_stamp is not None and stamp > self.touch_stamp + 0.0001
        self.touch_stamp = stamp
        if new_touch:
            car = packet.game_cars[owner]
            team = int(car.team)
            previous = self.previous_touch
            opponent = previous is not None and previous[1] != team
            blocking = opponent and self.previous_ball is not None and threatens_goal(
                *self.previous_ball, previous[1])
            if self.pending and self.pending[0] not in TERMINAL and self.pending[2] != team:
                self._invalidate_pending(now)
            if blocking:
                self._event("block", owner, team)
            elif previous and previous[0] != owner and previous[1] == team and 0.2 < elapsed - previous[2] < 2.0:
                self._event('pass', owner, team)
            elif opponent and elapsed - previous[2] < .18:
                self._event('fifty', owner, team)
            self.previous_touch = (owner, team, elapsed)
            cp = xyz(car.physics.location)
            near = distance(ball, cp) < 260
            airborne = not car.has_wheel_contact and cp[2] > 200
            if airborne and ball[2] > 350 and near:
                self.air_touches = [(i, t) for i, t in self.air_touches if i == owner and elapsed - t < 1.4]
                self.air_touches.append((owner, elapsed))
            else:
                self.air_touches.clear()
            if blocking:
                self.last_carry = None
            elif (self.last_carry and self.last_carry[0] == owner and
                  elapsed - self.last_carry[1] < 0.65 and not car.has_wheel_contact and
                  car.double_jumped and ball[2] > 170 and velocity[2] > 450):
                self._event("flick", owner, team)
                self.last_carry = None
            elif (len(self.air_touches) >= 2 and ball[2] > cp[2] and
                  distance(velocity, xyz(car.physics.velocity)) < 550):
                self._event("airdribble", owner, team)
            elif cp[2] > 1750 and ball[2] > 1800 and near:
                self._event('ceiling', owner, team)
            elif abs(ball[0]) > 3700 and ball[2] > 160 and near:
                self._event("wall", owner, team)
            elif airborne and ball[2] > 350 and near:
                self._event("aerial", owner, team)
            elif threatens_goal(ball, velocity, team):
                self._event("shot", owner, team)
            elif ball[1] * (1 if team == 0 else -1) < -2500 and velocity[1] * (1 if team == 0 else -1) > 1500:
                self._event('clear', owner, team)
            if previous and previous[0] != owner:
                self.carry_since = None
        if valid_touch and self.previous_touch is None:
            self.previous_touch = (owner, int(packet.game_cars[owner].team), stamp)

        # A carry must be sustained on the hood, with matched car/ball motion.
        controlled = False
        if valid_touch and 0 <= elapsed - stamp < 3.0:
            car = packet.game_cars[owner]
            cp, cv = xyz(car.physics.location), xyz(car.physics.velocity)
            controlled = (car.has_wheel_contact and cp[2] < 80 and
                          distance(ball[:2], cp[:2]) < 145 and 105 < ball[2] - cp[2] < 200 and
                          distance(velocity[:2], cv[:2]) < 450 and abs(velocity[2]) < 220)
            if controlled:
                if self.carry_owner != owner or self.carry_since is None:
                    self.carry_owner, self.carry_since = owner, elapsed
                if elapsed - self.carry_since >= 0.3:
                    self.last_carry = (owner, elapsed)
                    self._event("dribble", owner, int(car.team))
        if not controlled:
            self.carry_since = None

        # Announce a real aerial approach, rather than calling every high ball
        # an aerial. Close airborne cars must be moving towards the ball.
        if ball[2] > 350:
            candidates = []
            for index in range(packet.num_cars):
                car = packet.game_cars[index]
                cp, cv = xyz(car.physics.location), xyz(car.physics.velocity)
                gap = distance(ball, cp)
                closing = sum((v - bv) * (b - c) for v, bv, b, c in zip(cv, velocity, ball, cp)) / max(1, gap)
                if not car.is_demolished and not car.has_wheel_contact and cp[2] > 200 and gap < 550 and closing > 150:
                    candidates.append((gap, index, int(car.team)))
            if candidates:
                _, index, team = min(candidates)
                self._event("aerial", index, team)
        self.previous_ball = (ball, velocity)
        self._service_pending(now)
        self._quiet_recording(packet, now)

    def _quiet_recording(self, packet, now):
        if getattr(self,'speech_muted',False):return
        # Filler is deliberately sparse and never queues behind live action.
        info = packet.game_info
        if info.is_kickoff_pause or not info.is_round_active or info.is_match_ended:
            return
        ball_y = float(packet.game_ball.physics.location.y)
        half = 0 if ball_y < -3000 else 1 if ball_y > 3000 else None
        if self.pressure_since is None or half != self.pressure_since[0]:
            self.pressure_since = (half, float(info.seconds_elapsed))
        if self.player.busy or self.pending or now < self.next_ambient or now - self.last_filler < 20:
            return
        low = [sum(c.boost < 15 for c in packet.game_cars[:packet.num_cars] if c.team == team and not c.is_demolished) >= 2 for team in (0, 1)]
        if info.is_overtime:
            category = 'overtimechat'
        elif 10 < info.game_time_remaining <= 30:
            category = 'lateclock'
        elif any(low):
            category = 'lowboost'
        elif half is not None and info.seconds_elapsed - self.pressure_since[1] >= 7:
            category = 'pressure'
        else:
            categories = ('rotation', 'boostchat', 'banter')
            category = categories[int(now // 20) % len(categories)]
        if self._event(category):
            self.last_filler = now

    def stop(self):
        if not self.closed:
            self.closed = True
            self.pending = None
            # Drain confirmed goals before closing the resident audio helper.
            while self.goal_calls:
                if (self.goal_player or self.player).busy:
                    time.sleep(.02)
                    continue
                self._service_pending(self.clock())
            self.player.close()
            if self.goal_player:
                self.goal_player.close()
            if self.countdown_player:
                self.countdown_player.close()  # wait even after the final whistle
            try:
                self.bank.save_rotation()
            except OSError as exc:
                self.log(f"Clip commentary warning: could not save clip rotation: {exc}")
