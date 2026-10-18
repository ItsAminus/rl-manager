import base64
from collections import deque
import io
import json
import threading
import time
from types import SimpleNamespace as NS
import unittest
from unittest.mock import Mock, patch
import wave
import urllib.error

from google_speech import GoogleSpeech, GoogleError, pcm_audio, spoken_clock, quota_delay
from google_broadcast import GoogleBroadcast, StreamPlayer


class GoogleTests(unittest.TestCase):
    def test_stream_keeps_style_out_of_spoken_text(self):
        client = GoogleSpeech({'GEMINI_API_KEY': 'test'})
        data = {'candidates': [{'content': {'parts': [{'inlineData': {
            'data': base64.b64encode(b'\x01\x00' * 20).decode(),
            'mimeType': 'audio/L16;codec=pcm;rate=24000'}}]}}]}
        client.request = Mock(return_value=io.BytesIO(b'data: '+json.dumps(data).encode()+b'\n\n'))
        self.assertEqual(b''.join(client.stream('A goal!', 'excited')), b'\x01\x00' * 20)
        body = client.request.call_args.args[1]
        part = body['contents'][0]['parts'][0]
        self.assertEqual(part, {'text': 'A goal!', 'speechMetadata': {'style': 'excited'}})
        self.assertTrue(client.request.call_args.kwargs['stream'])

    def test_cancelled_stream_does_not_emit_audio(self):
        client = GoogleSpeech({'GEMINI_API_KEY': 'test'})
        client.request = Mock(return_value=io.BytesIO(b'data: {}\n'))
        self.assertEqual(list(client.stream('goal', cancelled=lambda: True)), [])

    def test_wav_header_is_removed_and_bad_format_rejected(self):
        data = io.BytesIO()
        with wave.open(data, 'wb') as wav:
            wav.setparams((1, 2, 24000, 0, 'NONE', 'not compressed'))
            wav.writeframes(b'\0\1' * 20)
        self.assertEqual(pcm_audio(data.getvalue(), 'audio/wav'), b'\0\1' * 20)
        with self.assertRaises(GoogleError):
            pcm_audio(b'abc', 'audio/mp3')

    def test_playback_cannot_accept_cancelled_generation(self):
        player = StreamPlayer.__new__(StreamPlayer)
        player.lock = threading.Lock()
        player.buffer = bytearray()
        player.reset(2)
        player.feed(1, b'\0\0' * 5000)
        self.assertEqual(len(player.buffer), 0)
        player.feed(2, b'\1\0' * 5000)
        out = bytearray(960)
        player._callback(out, 480, None, None)
        self.assertEqual(out, b'\1\0' * 480)

    def detector(self):
        b = GoogleBroadcast.__new__(GoogleBroadcast)
        b.lock = threading.RLock()
        b.previous = None
        b.teams = ('Falcons', 'SSG')
        b.events = deque(maxlen=6)
        b.version = 0
        b.player = Mock()
        b.busy = False
        b.pending_event = None
        b.last_snapshot = 0
        b.snapshot = None
        b.last_touch_time = 0
        b.career_context = {}
        b.speech = Mock()
        b.speech.ready_in.return_value = 0
        b.player.buffered_seconds.return_value = 0
        return b

    def packet(self, blue=0, orange=0, y=0, saves=0):
        return NS(num_teams=2, num_cars=1, teams=[NS(score=blue), NS(score=orange)],
            game_info=NS(is_overtime=False, game_time_remaining=100, is_round_active=True, is_match_ended=False),
            game_cars=[NS(name='Zen', score_info=NS(goals=0, saves=saves))],
            game_ball=NS(physics=NS(location=NS(y=y))))

    def test_only_confirmed_goals_and_no_startup_or_reset_goal(self):
        b = self.detector()
        b.process_packet(self.packet(blue=2))
        b.process_packet(self.packet(blue=2, y=5300))
        self.assertIsNone(b.pending_event)
        b.process_packet(self.packet(blue=3))
        self.assertEqual(b.pending_event[0][0], 'goal')
        self.assertIn('Falcons 3, SSG 0', b.pending_event[0][1])
        b.pending_event = None
        b.process_packet(self.packet())
        self.assertIsNone(b.pending_event)

    def test_confirmed_save(self):
        b = self.detector()
        b.process_packet(self.packet())
        b.process_packet(self.packet(saves=1))
        self.assertIsNone(b.pending_event)
        self.assertEqual(b.events[-1]['fact'], 'Zen makes the save!')

    def test_goal_bypasses_script_error_backoff(self):
        b = self.detector()
        b.process_packet(self.packet())
        b.process_packet(self.packet(blue=1))
        b.next_turn = time.monotonic() + 60
        b.jobs = []
        b.executor = Mock()
        b.stopped = Mock()
        b.stopped.wait.side_effect = [False, True]
        b._loop()
        b.executor.submit.assert_called_once()
        self.assertIsNone(b.pending_event)

    def test_expired_goal_not_synthesized(self):
        b = self.detector()
        b.stopped = threading.Event()
        b.speech = Mock()
        b.next_turn = 0
        b._turn(0, {}, (('goal', 'A goal!'), time.monotonic()-4))
        b.speech.stream.assert_not_called()

    def test_clock_units_and_overtime(self):
        self.assertEqual(spoken_clock(136), '2 minutes and 16 seconds remaining')
        self.assertEqual(spoken_clock(60), '1 minute remaining')
        self.assertEqual(spoken_clock(9), '9 seconds remaining')
        self.assertEqual(spoken_clock(61, True), '1 minute and 1 second into overtime')

    def test_google_retry_and_daily_quota(self):
        body = {'error': {'details': [{'retryDelay': '92.5s'}]}}
        self.assertEqual(quota_delay({}, body, 0)[0], 92.5)
        body['error']['details'].append({'violations': [{'quotaId': 'RequestsPerDay'}]})
        self.assertGreaterEqual(quota_delay({}, body, 0)[0], 86400)

    def test_daily_quota_blocks_further_network_requests(self):
        client = GoogleSpeech({'GEMINI_API_KEY': 'secret-test-key'})
        body = {'error': {'message': 'secret-test-key', 'details': [
            {'violations': [{'quotaId': 'GenerateRequestsPerDayPerProjectPerModel-FreeTier'}]}]}}
        error = urllib.error.HTTPError('https://example.invalid', 429, 'quota', {},
                                       io.BytesIO(json.dumps(body).encode()))
        with patch('urllib.request.urlopen', side_effect=error) as request:
            for _ in range(3):
                with self.assertRaises(GoogleError) as raised:
                    client.request(client.model, {})
                self.assertNotIn('secret-test-key', str(raised.exception))
            self.assertEqual(request.call_count, 1)

    def test_script_receives_form_and_readable_clock(self):
        client = GoogleSpeech({'GEMINI_API_KEY': 'test'})
        response = {'candidates': [{'content': {'parts': [{'text': 'The pressure is building.'}]}}]}
        client.request = Mock(return_value=io.BytesIO(json.dumps(response).encode()))
        client.script({'seconds_remaining': 136, 'career_context': {'recentSeries': ['win']}}, [])
        prompt = client.request.call_args.args[1]['contents'][0]['parts'][0]['text']
        self.assertIn('2 minutes and 16 seconds remaining', prompt)
        self.assertIn('recentSeries', prompt)
        self.assertNotIn('seconds_remaining', prompt)

    def test_goal_does_not_bypass_voice_quota(self):
        b = self.detector()
        b.process_packet(self.packet())
        b.process_packet(self.packet(blue=1))
        b.next_turn = 0
        b.jobs = []
        b.executor = Mock()
        b.speech.ready_in.return_value = 45
        b.stopped = Mock()
        b.stopped.wait.side_effect = [False, True]
        b._loop()
        b.executor.submit.assert_not_called()

    def test_prefetch_starts_before_previous_audio_finishes(self):
        b = self.detector()
        b.process_packet(self.packet())
        b.player.buffered_seconds.return_value = 4
        b.jobs = []
        b.next_turn = 0
        b.executor = Mock()
        b.stopped = Mock()
        b.stopped.wait.side_effect = [False, True]
        b._loop()
        b.executor.submit.assert_called_once()
        b.player.reset.assert_not_called()

    def test_prefetch_is_bounded(self):
        b = self.detector()
        b.process_packet(self.packet())
        b.player.buffered_seconds.return_value = 10
        b.jobs = []
        b.next_turn = 0
        b.executor = Mock()
        b.stopped = Mock()
        b.stopped.wait.side_effect = [False, True]
        b._loop()
        b.executor.submit.assert_not_called()

    def test_five_minute_continuity_with_simulated_service(self):
        # Exercise the actual scheduler and audio callback for five simulated minutes,
        # including 1 second of network latency per new turn. No API quota is spent.
        b = self.detector()
        player = StreamPlayer.__new__(StreamPlayer)
        player.lock = threading.Lock()
        player.buffer = bytearray()
        player.reset(0)
        b.player = player
        b.jobs, b.history = [], deque(maxlen=10)
        b.next_turn = 0
        b.log = Mock()
        clock = [0.0]
        coverage = [0, 0]
        def advance(seconds):
            for _ in range(round(seconds / .02)):
                out = bytearray(960)
                player._callback(out, 480, None, None)
                coverage[0] += int(any(out))
                coverage[1] += 1
                clock[0] += .02
        def script(*args):
            advance(.3)
            return 'Fresh generated commentary'
        def stream(*args):
            advance(.7)
            yield b'\1\0' * (24000 * 16)
        b.speech.script.side_effect = script
        b.speech.stream.side_effect = stream
        b.stopped = Mock()
        b.stopped.is_set.return_value = False
        def wait(_):
            advance(.04)
            return clock[0] >= 300
        b.stopped.wait.side_effect = wait
        b.executor = Mock()
        def submit(fn, *args):
            fn(*args)
            return NS(done=lambda: True)
        b.executor.submit.side_effect = submit
        with patch('time.monotonic', side_effect=lambda: clock[0]):
            b.process_packet(self.packet())
            # Initial snapshot throttle needs one elapsed sample.
            advance(.24)
            b.process_packet(self.packet())
            b._loop()
        self.assertGreater(coverage[0] / coverage[1], .98)
        self.assertGreaterEqual(b.speech.stream.call_count, 18)
        self.assertLessEqual(b.speech.stream.call_count, 21)


if __name__ == '__main__':
    unittest.main()
