"""Live Puck commentary, with streamed playback and bounded, replaceable work."""
from collections import deque
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import sys
import threading
import time

try:
    from .google_speech import GoogleSpeech, GoogleError, ROOT, STYLE, spoken_clock
except ImportError:
    from google_speech import GoogleSpeech, GoogleError, ROOT, STYLE, spoken_clock


class StreamPlayer:
    def __init__(self):
        sys.path.insert(0, str(ROOT / 'rl_bridge/local_runtime/google_deps'))
        try:
            import sounddevice as sd
        except ImportError:
            raise GoogleError('Install commentary/requirements-google.txt into local_runtime/google_deps.') from None
        self.lock = threading.Lock()
        self.buffer = bytearray()
        self.token = 0
        self.ready = False
        self.finished = False
        self.underruns = 0
        self.first_played = None
        self.stream = sd.RawOutputStream(samplerate=24000, channels=1, dtype='int16',
                                         blocksize=480, callback=self._callback)
        self.stream.start()

    def _callback(self, outdata, frames, timing, status):
        with self.lock:
            outdata[:] = b'\0' * len(outdata)
            if not self.ready:
                return
            count = min(len(outdata), len(self.buffer))
            if count:
                outdata[:count] = self.buffer[:count]
                del self.buffer[:count]
                if self.first_played is None:
                    self.first_played = time.monotonic()
            if count < len(outdata) and not self.finished:
                self.underruns += 1
                self.ready = False  # Rebuffer instead of repeated tiny glitches.

    def reset(self, token):
        with self.lock:
            self.token = token
            self.buffer.clear()
            self.ready = self.finished = False
            self.first_played = None
            self.underruns = 0

    def feed(self, token, pcm):
        with self.lock:
            if token != self.token:
                return
            self.buffer.extend(pcm)
            if len(self.buffer) >= 8640:  # 180 ms at 24 kHz PCM16.
                self.ready = True

    def finish(self, token):
        with self.lock:
            if token == self.token:
                self.finished = self.ready = True

    def pending(self, token):
        with self.lock:
            return token == self.token and bool(self.buffer)

    def buffered_seconds(self):
        with self.lock:
            return len(self.buffer) / 48000

    def close(self):
        self.stream.abort()
        self.stream.close()


class GoogleBroadcast:
    def __init__(self, team_names, log=lambda message: None, career_context=None):
        self.speech = GoogleSpeech()
        self.player = StreamPlayer()
        self.teams = team_names
        self.career_context = career_context or {}
        self.last_touch_time = 0
        self.log = log
        self.lock = threading.RLock()
        self.stopped = threading.Event()
        self.executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix='google-caster')
        self.jobs = []
        self.version = 0
        self.busy = False
        self.snapshot = None
        self.previous = None
        self.last_snapshot = 0
        self.next_turn = 0
        self.history = deque(maxlen=10)
        self.events = deque(maxlen=6)
        self.pending_event = None
        self.worker = threading.Thread(target=self._loop, daemon=True)
        self.worker.start()

    def process_packet(self, packet):
        if packet.num_teams < 2 or packet.num_cars == 0:
            return
        now = time.monotonic()
        info = packet.game_info
        scores = [int(packet.teams[i].score) for i in range(2)]
        stats = {str(i): {'name': str(packet.game_cars[i].name),
                         'team': self.teams[int(getattr(packet.game_cars[i], 'team', 0))],
                         'goals': int(packet.game_cars[i].score_info.goals),
                         'saves': int(packet.game_cars[i].score_info.saves),
                         'shots': int(getattr(packet.game_cars[i].score_info, 'shots', 0)),
                         'assists': int(getattr(packet.game_cars[i].score_info, 'assists', 0))}
                 for i in range(packet.num_cars)}
        with self.lock:
            previous = self.previous
            self.previous = {'scores': scores, 'stats': stats, 'overtime': bool(info.is_overtime)}
            event = None
            if previous and not any(a < b for a, b in zip(scores, previous['scores'])):
                for i in range(2):
                    if scores[i] > previous['scores'][i]:
                        # Confirmed scoreboard goal; do not guess scorer from last touch.
                        event = ('goal', f'{self.teams[i]} score! {self.teams[0]} {scores[0]}, {self.teams[1]} {scores[1]}!')
                if not event and info.is_overtime and not previous['overtime']:
                    event = ('overtime', 'We are into overtime! Next goal wins!')
                if not event:
                    for slot, stat in stats.items():
                        old = previous['stats'].get(slot)
                        if old and old['name'] == stat['name'] and stat['saves'] > old['saves']:
                            event = ('save', f"{stat['name']} makes the save!")
                            break
            if event:
                self.events.append({'type': event[0], 'fact': event[1], 'at': now})
                # Saves feed the next flowing turn instead of spending a TTS call each.
                if event[0] in ('goal', 'overtime'):
                    self.version += 1
                    self.player.reset(self.version)
                    self.busy = False
                    self.pending_event = (event, now)
            touch = getattr(packet.game_ball, 'latest_touch', None)
            if touch and touch.time_seconds > self.last_touch_time:
                self.last_touch_time = touch.time_seconds
                self.events.append({'type': 'touch', 'fact': f'{touch.player_name} touched the ball', 'at': now})
            if now - self.last_snapshot >= 0.2:
                ball = packet.game_ball.physics.location
                self.snapshot = {'teams': list(self.teams), 'score': scores,
                    'clock_spoken': spoken_clock(info.game_time_remaining, bool(info.is_overtime)),
                    'overtime': bool(info.is_overtime),
                    'active': bool(info.is_round_active) and not bool(info.is_match_ended),
                    'ended': bool(info.is_match_ended),
                    'phase': 'live play' if info.is_round_active else 'between plays / kickoff preparation',
                    'ball_area': 'midfield' if abs(ball.y) < 1200 else ('blue half' if ball.y < 0 else 'orange half'),
                    'players': list(stats.values()),
                    'career_context': self.career_context,
                    'recent_events': [{'type': e['type'], 'fact': e['fact']} for e in self.events if now-e['at'] < 8]}
                self.last_snapshot = now

    def _loop(self):
        while not self.stopped.wait(0.05):
            with self.lock:
                self.jobs = [j for j in self.jobs if not j.done()]
                if len(self.jobs) >= 2 or self.busy or self.snapshot is None:
                    continue
                # A goal can bypass text-service backoff, never the voice quota.
                if self.speech.ready_in(self.speech.model) > 0:
                    continue
                if self.pending_event is None and time.monotonic() < self.next_turn:
                    continue
                event = self.pending_event
                if self.snapshot.get('ended'):
                    continue
                # Generate one continuation before playback drains; never queue many turns.
                if not event and self.player.buffered_seconds() > 4.5:
                    continue
                self.pending_event = None
                self.busy = True
                token = self.version
                snapshot = json.loads(json.dumps(self.snapshot))
                self.jobs.append(self.executor.submit(self._turn, token, snapshot, event))

    def _turn(self, token, snapshot, event):
        start = time.monotonic()
        cancelled = lambda: self.stopped.is_set() or token != self.version
        deadline = (event[1] + 3) if event else (start + 6)
        first = None
        try:
            if event:
                text = event[0][1]  # Fresh score/stat text; no clip bank or extra text-model round trip.
                style = STYLE
            else:
                with self.lock:
                    recent = list(self.history)
                text = self.speech.script(snapshot, recent)
                style = 'Passionate high-energy esports casting; animated inflection, rapid flowing delivery, natural breaths, rising excitement and emphatic reactions'
            if cancelled() or time.monotonic() > deadline:
                return
            remainder = b''
            for chunk in self.speech.stream(text, style, cancelled):
                if cancelled() or (first is None and time.monotonic() > deadline):
                    return
                if first is None:
                    first = time.monotonic()
                chunk = remainder + chunk
                usable = len(chunk) - len(chunk) % 2
                self.player.feed(token, chunk[:usable])
                remainder = chunk[usable:]
            if remainder:
                raise GoogleError('Incomplete PCM sample in Google audio.')
            self.player.finish(token)
            if not cancelled():
                with self.lock:
                    self.history.append(text)
                origin = event[1] if event else start
                self.log('Google Puck: ' + json.dumps({'first_audio_s': round(first-origin, 3) if first else None,
                    'buffered_audio_s': round(self.player.buffered_seconds(), 2),
                    'underrun_blocks': self.player.underruns, 'text': text}))
        except Exception as exc:
            with self.lock:
                if cancelled() and isinstance(exc, GoogleError) and exc.status == 429:
                    # Even a replaced request can reveal a project-wide quota block.
                    self.log(str(exc))
                if not cancelled():
                    # Keep already-generated audio playing during quota/service failures.
                    self.player.finish(token)
                    self.log(str(exc) if isinstance(exc, GoogleError) else 'Google commentary playback failed (' + type(exc).__name__ + ').')
                    self.next_turn = time.monotonic() + (exc.retry_after if isinstance(exc, GoogleError) and exc.retry_after else 5)
        finally:
            with self.lock:
                if token == self.version:
                    self.busy = False
                    self.next_turn = max(self.next_turn, time.monotonic() + 0.05)

    def stop(self):
        self.stopped.set()
        with self.lock:
            self.version += 1
            self.player.reset(self.version)
        self.worker.join(timeout=1)
        self.executor.shutdown(wait=False, cancel_futures=True)
        self.player.close()


def demo():
    """Exercise the real API/player with clearly synthetic match telemetry."""
    from types import SimpleNamespace as NS
    broadcast = GoogleBroadcast(('Falcons', 'SSG'), log=lambda message: print(message, flush=True))
    packet = NS(num_teams=2, num_cars=1, teams=[NS(score=0), NS(score=0)],
        game_info=NS(is_overtime=False, game_time_remaining=180, is_round_active=True, is_match_ended=False),
        game_cars=[NS(name='Example player', score_info=NS(goals=0, saves=0))],
        game_ball=NS(physics=NS(location=NS(y=0))))
    try:
        print('Synthetic match demo: commentary, then an interrupting goal.', flush=True)
        for tick in range(500):
            if tick == 175:
                packet.teams[0].score = 1
                packet.game_info.is_round_active = False
                print('Synthetic confirmed goal triggered.', flush=True)
            broadcast.process_packet(packet)
            time.sleep(0.04)
    finally:
        broadcast.stop()


if __name__ == '__main__':
    demo()
