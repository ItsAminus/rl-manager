"""Replay real RLBot packet structures against the prerecorded match path."""

import contextlib
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "commentary"))
from clip_broadcast import ClipBank, ClipBroadcast, ClipPlayer, audio_dependencies
from rlbot.utils.structures.game_data_struct import GameTickPacket


class Clock:
    def __init__(self):
        self.now = 10.0

    def __call__(self):
        return self.now


class FakePlayer:
    sample_rate = 48000
    stream = None

    def __init__(self):
        self.busy = False
        self.played = []
        self.cancelled = 0
        self.closed = False
        self.interruptible = False

    def play(self, pcm, interruptible=False):
        self.played.append(pcm)
        self.busy = True
        self.interruptible = interruptible

    def interrupt(self):
        if not self.busy or not self.interruptible:
            return False
        self.cancelled += 1
        self.busy = False
        return True

    def cancel(self):
        self.cancelled += 1
        self.busy = False

    def close(self):
        self.closed = True


def vector(target, values):
    target.x, target.y, target.z = values


def packet():
    p = GameTickPacket()
    p.num_teams = 2
    p.num_cars = 2
    p.game_info.is_round_active = True
    p.game_info.seconds_elapsed = 10
    p.game_info.game_time_remaining = 290
    for index in range(2):
        p.game_cars[index].team = index
        p.game_cars[index].name = ("Blue", "Orange")[index]
        p.game_cars[index].has_wheel_contact = True
        vector(p.game_cars[index].physics.location, (0, -3000 if index == 0 else 3000, 17))
    vector(p.game_ball.physics.location, (0, 0, 93))
    p.game_ball.latest_touch.player_name = "Blue"
    p.game_ball.latest_touch.player_index = 0
    p.game_ball.latest_touch.time_seconds = 10
    return p


class CommentaryTests(unittest.TestCase):
    def test_partial_previous_game_rotation_cannot_repeat_early_in_new_game(self):
        category = 'aerial'
        ids = self.b.bank.categories[category]
        self.b.bank.remaining[category] = [ids[0]]
        self.b.bank.begin_game()
        drawn = [self.b.bank.draw(category)[0] for _ in ids]
        self.assertEqual(set(drawn),set(ids))
        self.assertEqual(len(set(drawn)),len(drawn))
    def setUp(self):
        self.cache_root = (ROOT / "commentary" / "cache").resolve()
        self.cache_root.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix="clip-test-", dir=self.cache_root)
        self.clock = Clock()
        self.player = FakePlayer()
        self.logs = []
        self.modules_before = set(sys.modules)
        self.b = ClipBroadcast(bank_path=ROOT / 'commentary/voice_bank/archive/before-final-bank',
                               player=self.player, log=self.logs.append, clock=self.clock,
                               seed=5, state_file=Path(self.temp.name) / "rotation.json",
                               countdown_player=FakePlayer(),goal_player=FakePlayer())
        self.p = packet()

    def tearDown(self):
        self.b.goal_calls.clear()  # FakePlayer has no asynchronous completion.
        self.b.stop()
        self.assertTrue(Path(self.temp.name).resolve().is_relative_to(self.cache_root))
        self.temp.cleanup()

    def tick(self, seconds):
        self.clock.now = seconds
        self.p.game_info.seconds_elapsed = seconds
        self.b.process_packet(self.p)

    def touch(self, owner, seconds):
        touch = self.p.game_ball.latest_touch
        touch.player_name = self.p.game_cars[owner].name
        touch.player_index = owner
        touch.team = owner
        touch.time_seconds = seconds
        self.tick(seconds)

    def aerial(self):
        vector(self.p.game_ball.physics.location, (0, 3000, 600))
        vector(self.p.game_ball.physics.velocity, (0, 2000, 0))
        car = self.p.game_cars[0]
        car.has_wheel_contact = False
        vector(car.physics.location, (0, 2750, 450))
        vector(car.physics.velocity, (0, 2600, 600))
        self.tick(10)
        self.assertEqual(self.b.current[0], "aerial")

    def test_all_61_clips_preload_and_no_ai_modules(self):
        self.assertEqual(len(self.b.bank.clips), 61)
        self.assertEqual(self.b.bank.errors, [])
        self.assertEqual(len(self.b.bank.categories["airdribble"]), 5)
        self.assertFalse(any(m in set(sys.modules) - self.modules_before for m in
                             ("google_broadcast", "google_speech", "local_broadcast", "caster_engine")))

    def test_rotation_exhausts_variations_before_repeating_across_matches(self):
        for category, ids in self.b.bank.categories.items():
            played = [self.b.bank.draw(category)[0] for _ in ids]
            self.assertEqual(set(played), set(ids))
            if len(ids) > 1:
                self.assertNotEqual(self.b.bank.draw(category)[0], played[-1])
        self.b.bank.save_rotation()
        saved = {category: list(ids) for category, ids in self.b.bank.remaining.items()}
        restored = ClipBank(ROOT / 'commentary/voice_bank/archive/before-final-bank', 48000,
                            state_file=Path(self.temp.name) / "rotation.json")
        self.assertEqual(saved, restored.remaining)

    def test_high_ball_with_grounded_cars_is_not_an_aerial(self):
        vector(self.p.game_ball.physics.location, (0, 0, 600))
        vector(self.p.game_cars[0].physics.location, (0, 0, 17))
        vector(self.p.game_cars[0].physics.velocity, (0, 0, 1000))
        self.tick(10)
        self.touch(0, 10.1)
        self.assertEqual(self.player.played, [])

    def test_aerial_finishes_on_interception_without_a_block_clip(self):
        self.aerial()
        vector(self.p.game_ball.physics.velocity, (0, -1600, 0))
        self.touch(1, 10.02)
        self.assertTrue(self.player.busy)
        self.assertEqual(self.b.current[0], "aerial")
        self.assertEqual(len(self.player.played), 1)
        self.assertEqual(self.player.cancelled, 0)

    def test_opposing_possession_keeps_sentence_but_discards_queued_mechanics(self):
        self.aerial()
        self.assertTrue(self.b._event("airdribble", 0, 0))
        self.b.previous_ball = ((0, 0, 600), (0, 100, 0))
        self.touch(1, 10.02)
        self.assertTrue(self.player.busy)
        self.assertIsNone(self.b.pending)
        self.assertEqual(self.player.cancelled, 0)

    def test_confirmed_save_without_clip_does_not_cut_audio(self):
        self.aerial()
        self.p.game_cars[1].score_info.saves += 1
        self.tick(10.02)
        self.assertTrue(self.player.busy)
        self.assertEqual(self.player.cancelled, 0)

    def test_score_is_confirmed_not_inferred_from_ball_position(self):
        self.tick(10)
        vector(self.p.game_ball.physics.location, (0, 5200, 200))
        self.tick(10.02)
        self.assertEqual(self.player.cancelled, 0)
        self.aerial()
        self.p.teams[0].score += 1
        self.tick(10.04)
        self.assertTrue(self.player.busy)
        self.assertEqual(self.player.cancelled, 0)

    def test_joining_mid_match_does_not_replay_historical_stats(self):
        self.p.teams[0].score = 4
        self.p.game_cars[1].score_info.saves = 7
        self.tick(10)
        self.assertEqual(self.player.cancelled, 0)
        self.assertEqual(self.player.played, [])

    def test_dribble_finishes_before_queued_flick(self):
        car = self.p.game_cars[0]
        vector(car.physics.location, (0, 0, 17))
        vector(car.physics.velocity, (0, 300, 0))
        vector(self.p.game_ball.physics.location, (0, 30, 155))
        vector(self.p.game_ball.physics.velocity, (0, 300, 0))
        self.tick(10)
        self.tick(10.2)
        self.assertEqual(self.player.played, [])
        self.tick(10.35)
        self.assertEqual(self.b.current[0], "dribble")
        car.has_wheel_contact = False
        car.double_jumped = True
        vector(car.physics.location, (0, 0, 60))
        vector(self.p.game_ball.physics.location, (0, 30, 230))
        vector(self.p.game_ball.physics.velocity, (0, 1400, 850))
        self.touch(0, 10.4)
        self.assertEqual(self.b.current[0], "dribble")
        self.assertEqual(self.b.pending[0], "flick")
        self.assertEqual(len(self.player.played), 1)
        self.player.busy = False
        self.tick(12)
        self.assertEqual(self.b.current[0], "flick")
        self.assertEqual(len(self.player.played), 2)

    def test_fast_ground_touch_is_not_called_a_dribble(self):
        vector(self.p.game_cars[0].physics.location, (0, 0, 17))
        vector(self.p.game_ball.physics.location, (0, 30, 155))
        vector(self.p.game_ball.physics.velocity, (0, 1600, 0))
        self.tick(10)
        self.touch(0, 10.4)
        self.assertEqual(self.player.played, [])

    def test_wall_call_requires_real_touch_near_sidewall(self):
        self.tick(10)
        vector(self.p.game_ball.physics.location, (4000, 1000, 430))
        vector(self.p.game_cars[0].physics.location, (4000, 1000, 280))
        self.touch(0, 10.1)
        self.assertEqual(self.b.current[0], "wall")

    def test_repeated_controlled_air_touches_progress_to_air_dribble(self):
        self.tick(10)
        car = self.p.game_cars[0]
        car.has_wheel_contact = False
        vector(car.physics.location, (0, 1000, 500))
        vector(car.physics.velocity, (0, 300, 0))
        vector(self.p.game_ball.physics.location, (0, 1030, 650))
        vector(self.p.game_ball.physics.velocity, (0, 320, 0))
        self.touch(0, 10.1)
        self.assertEqual(self.b.current[0], "aerial")
        self.touch(0, 10.35)
        self.assertEqual(self.b.current[0], "aerial")
        self.assertEqual(self.b.pending[0], "airdribble")
        self.player.busy = False
        self.tick(12)
        self.assertEqual(self.b.current[0], "airdribble")

    def test_repeated_hard_air_hits_are_not_an_air_dribble(self):
        self.tick(10)
        car = self.p.game_cars[0]
        car.has_wheel_contact = False
        vector(car.physics.location, (0, 1000, 500))
        vector(self.p.game_ball.physics.location, (0, 1030, 650))
        vector(self.p.game_ball.physics.velocity, (2000, 0, 0))
        self.touch(0, 10.1)
        self.touch(0, 10.35)
        self.assertEqual(self.b.current[0], "aerial")

    def test_kickoff_plays_once_per_pause(self):
        self.p.game_info.is_kickoff_pause = True
        self.tick(10)
        for seconds in (10.1, 10.2, 10.3):
            self.tick(seconds)
        self.assertEqual(len(self.player.played), 1)
        self.assertEqual(self.b.current[0], "kickoff")

    def test_busy_ambient_events_are_discarded_and_do_not_consume_variations(self):
        self.b._event("aerial", 0, 0)
        self.assertFalse(self.b._event("wall", 1, 1))
        self.assertNotIn("wall", self.b.bank.last)
        self.player.busy = False
        self.tick(20)
        self.tick(25)
        self.assertEqual(len(self.player.played), 1)
        self.assertTrue(self.b._event("aerial", 0, 0))  # cooldown passed

    def test_breathing_gap_after_completion(self):
        self.b._event("aerial", 0, 0)
        self.player.busy = False
        self.clock.now = 14
        self.assertFalse(self.b._event("wall", 0, 0))
        self.clock.now = 17.1
        self.assertTrue(self.b._event("wall", 0, 0))

    def test_match_restart_clears_old_detection_without_resetting_rotation(self):
        self.aerial()
        last_clip = self.b.bank.last["aerial"]
        self.p.game_info.seconds_elapsed = 0
        self.p.game_info.is_round_active = False
        self.b.process_packet(self.p)
        self.assertTrue(self.player.busy)
        self.assertEqual(self.player.cancelled, 0)
        self.assertEqual(self.b.bank.last["aerial"], last_clip)
        self.assertEqual(self.b.previous_touch, None)

    def test_save_replaces_pending_block_but_never_cuts_current_sentence(self):
        # Future bank additions work through the same live terminal-event path.
        for category in ("save", "block"):
            self.b.bank.categories[category] = [category + "_01"]
            self.b.bank.clips[category + "_01"] = self.b.bank.clips["aerial_01"]
        self.aerial()
        vector(self.p.game_ball.physics.velocity, (0, -1600, 0))
        self.touch(1, 10.02)
        self.assertEqual(self.b.current[0], "aerial")
        self.assertEqual(self.b.pending[0], "block")
        self.p.game_cars[1].score_info.saves += 1
        self.tick(10.04)
        self.assertEqual(self.b.current[0], "aerial")
        self.assertEqual(self.b.pending[0], "save")
        self.assertNotIn("block", self.b.bank.last)
        self.assertNotIn("save", self.b.bank.last)
        self.player.busy = False
        self.tick(12)
        self.assertEqual(self.b.current[0], "save")
        self.assertEqual(len(self.player.played), 2)
        self.assertEqual(self.player.cancelled, 0)

    def test_expired_follow_up_is_not_played_late(self):
        self.aerial()
        self.b._event("airdribble", 0, 0)
        self.player.busy = False
        self.tick(15)
        self.assertIsNone(self.b.pending)
        self.assertEqual(len(self.player.played), 1)
        self.assertNotIn("airdribble", self.b.bank.last)

    def test_repeated_packets_do_not_refresh_follow_up_expiry(self):
        self.aerial()
        self.b._event("airdribble", 0, 0)
        original_expiry = self.b.pending[3]
        self.clock.now = 11
        self.b._event("airdribble", 0, 0)
        self.assertEqual(self.b.pending[3], original_expiry)

    def test_goal_and_pause_keep_sentence_and_clear_queued_mechanics(self):
        self.aerial()
        self.b._event("airdribble", 0, 0)
        self.p.teams[0].score = 1
        self.tick(10.2)
        self.assertIsNone(self.b.pending)
        self.assertFalse(self.b.goal_calls)
        self.assertEqual(self.b.goal_current,('goal',None,0))
        self.assertEqual(len(self.b.goal_player.played),1)
        self.p.game_info.is_round_active = False
        self.tick(10.3)
        self.assertTrue(self.player.busy)
        self.assertEqual(self.player.cancelled, 0)

    def test_final_whistle_does_not_cut_the_sentence(self):
        self.aerial()
        self.p.game_info.is_match_ended = True
        self.tick(10.1)
        self.assertTrue(self.player.busy)
        self.assertEqual(self.player.cancelled, 0)

    def test_banger_requires_final_second_and_equalizer_or_new_lead(self):
        cases = [
            ((0, 7), (1, 7), 0, 0, False, 'goal'),
            ((7, 0), (7, 1), 1, 0, False, 'goal'),
            ((1, 1), (2, 1), 0, 1, False, 'late_goal'),
            ((1, 2), (2, 2), 0, 0, False, 'late_goal'),
            ((2, 1), (2, 2), 1, -1, False, 'late_goal'),
            ((2, 2), (2, 3), 1, 0.5, False, 'late_goal'),
            ((3, 1), (4, 1), 0, 0, False, 'goal'),
            ((0, 2), (1, 2), 0, 0, False, 'goal'),
            ((1, 1), (2, 1), 0, 5, False, 'goal'),
            ((1, 1), (2, 1), 0, 0, True, 'goal'),
        ]
        for before, after, team, remaining, overtime, expected in cases:
            with self.subTest(before=before, after=after, remaining=remaining, overtime=overtime):
                self.p.game_info.game_time_remaining = remaining
                self.p.game_info.is_overtime = overtime
                self.assertEqual(self.b._goal_category(self.p.game_info, before, after, team), expected)

    def test_confirmed_last_second_goal_plays_banger_once(self):
        self.p.teams[1].score = 1
        self.p.game_info.game_time_remaining = 2
        self.tick(10)
        self.p.teams[0].score = 1
        self.p.game_info.game_time_remaining = 0
        self.tick(10.1)
        self.assertEqual(self.b.goal_current[0], 'late_goal')
        self.tick(10.2)
        self.assertEqual(len(self.b.goal_player.played), 1)

    def test_goal_starts_immediately_alongside_long_sentence_and_survives_final_whistle(self):
        self.aerial()
        self.p.teams[0].score = 1
        self.tick(10.1)
        self.assertEqual(len(self.b.goal_player.played),1)
        self.assertTrue(self.player.busy)
        self.assertEqual(self.b.current[0],'aerial')
        self.assertFalse(self.b.goal_calls)
        self.p.game_info.is_round_active = False
        self.tick(11)
        self.p.game_info.is_match_ended = True
        self.tick(20)
        self.assertEqual(len(self.player.played), 1)
        self.assertEqual(self.player.cancelled, 0)
        self.assertIn('goal', self.b.bank.last)
        self.player.busy = False
        self.tick(21)
        self.assertEqual(self.b.goal_current[0], 'goal')
        self.assertEqual(len(self.b.goal_player.played),1)

    def test_goal_variations_are_consumed_only_on_air_and_all_before_repeat(self):
        self.tick(10)
        calls = []
        for index in range(4):
            self.player.busy = False
            self.b.goal_player.busy = False
            self.p.teams[0].score += 1
            self.tick(11 + index)
            calls.append(self.b.bank.last['goal'])
        self.assertEqual(set(calls), set(self.b.bank.categories['goal']))

    def test_countdown_crossing_plays_once_without_cutting_other_recordings(self):
        self.aerial()
        self.p.game_info.game_time_remaining = 10.1
        self.tick(11)
        countdown = self.b.countdown_player
        self.assertEqual(countdown.played, [])
        for index, remaining in enumerate((9.99, 9, 8, 7, 0, -1)):
            self.p.game_info.game_time_remaining = remaining
            self.p.game_info.is_match_ended = remaining < 0
            self.tick(12 + index)
        self.assertEqual(len(countdown.played), 1)
        self.assertEqual(countdown.cancelled, 0)
        self.assertEqual(self.player.cancelled, 0)
        self.assertEqual(self.b.current[0], 'aerial')
        self.assertTrue(countdown.busy)
        self.p.game_info.is_overtime = True
        self.tick(20)
        self.assertEqual(len(countdown.played), 1)

    def test_countdown_does_not_start_in_overtime_menu_or_replay(self):
        self.p.game_info.game_time_remaining = 10
        for name in ('is_overtime', 'is_match_ended', 'is_kickoff_pause'):
            setattr(self.p.game_info, name, True)
            self.tick(10)
            setattr(self.p.game_info, name, False)
        self.p.game_info.is_round_active = False
        self.tick(10)
        self.assertEqual(self.b.countdown_player.played, [])

    def test_goal_stops_countdown_only_and_never_restarts_it_in_same_game(self):
        self.aerial()
        self.p.game_info.game_time_remaining = 9
        self.tick(11)
        self.p.teams[1].score += 1
        self.tick(12)
        countdown=self.b.countdown_player
        self.assertEqual(countdown.cancelled,1)
        self.assertFalse(countdown.busy)
        self.assertEqual(self.player.cancelled,0)
        self.assertTrue(self.player.busy)
        self.assertTrue(self.b.goal_player.busy)
        self.p.game_info.is_kickoff_pause=True
        self.tick(13)
        self.p.game_info.is_kickoff_pause=False
        self.tick(14)
        self.assertEqual(len(countdown.played),1)

    def test_goal_stops_countdown_even_without_a_goal_clip(self):
        self.p.game_info.game_time_remaining=9
        self.tick(11)
        for category in ('goal','winner','equalizer','late_goal'):
            self.b.bank.categories.pop(category,None)
        self.p.teams[0].score+=1
        self.tick(12)
        self.assertEqual(self.b.countdown_player.cancelled,1)

    def test_saves_and_final_whistle_leave_countdown_recording_intact(self):
        self.p.game_info.game_time_remaining=9
        self.tick(11)
        self.p.game_cars[0].score_info.saves+=1
        self.tick(12)
        self.p.game_info.is_match_ended=True
        self.tick(13)
        self.assertEqual(self.b.countdown_player.cancelled,0)
        self.assertTrue(self.b.countdown_player.busy)

    def test_countdown_rearms_only_for_a_new_game(self):
        self.p.game_info.game_time_remaining = 10
        self.tick(10)
        countdown = self.b.countdown_player
        countdown.busy = False
        self.p.game_info.is_kickoff_pause = True
        self.tick(11)
        self.p.game_info.is_kickoff_pause = False
        self.tick(12)
        self.assertEqual(len(countdown.played), 1)
        self.p.game_info.game_time_remaining = 300
        self.tick(0)
        self.p.game_info.game_time_remaining = 10
        self.tick(290)
        self.assertEqual(len(countdown.played), 2)

    def test_user_audio_keeps_every_frame_including_countdown_tail(self):
        import wave
        for clip_id in ('countdown_01', 'late_goal_01', 'goal_01', 'goal_02', 'goal_03', 'goal_04'):
            with self.subTest(clip_id=clip_id):
                with wave.open(str(ROOT / 'commentary/voice_bank' / (clip_id + '.wav'))) as wav:
                    frames = wav.getnframes()
                    self.assertEqual(wav.getframerate(), self.player.sample_rate)
                self.assertEqual(len(self.b.bank.clips[clip_id]), frames)
        self.assertAlmostEqual(len(self.b.bank.clips['countdown_01']) / 48000, 12.957, places=3)


class AudioTests(unittest.TestCase):
    def test_windows_resampling_preserves_entire_long_sentence_without_wrapping(self):
        import wave
        np, _ = audio_dependencies()
        cache = (ROOT / 'commentary/cache').resolve()
        with tempfile.TemporaryDirectory(dir=cache, prefix='resample-test-') as folder:
            file = Path(folder) / 'sentence.wav'
            loader = ClipBank(ROOT / 'commentary/voice_bank/archive/before-final-bank', 48000)
            original_arange = np.arange
            def windows_arange(*args, **kwargs):
                # Reproduce Windows NumPy 1.x even when run on a 64-bit-index
                # platform. Explicit floating-point coordinates stay floating.
                kwargs.setdefault('dtype', np.int32)
                return original_arange(*args, **kwargs)
            for rate, seconds in ((24000, 3.6), (24000, 10.2), (44100, 10.2)):
                with self.subTest(rate=rate, seconds=seconds):
                    source = (np.linspace(.05, .65, round(rate * seconds)) * 32767).astype('<i2')
                    with wave.open(str(file), 'wb') as wav:
                        wav.setnchannels(1)
                        wav.setsampwidth(2)
                        wav.setframerate(rate)
                        wav.writeframes(source.tobytes())
                    with patch.object(np, 'arange', side_effect=windows_arange):
                        actual = loader._load(file, 48000)
                    positions = original_arange(round(len(source) * 48000 / rate), dtype=np.float64) * (rate / 48000)
                    expected = np.interp(positions, original_arange(len(source), dtype=np.float64),
                                        source.astype(np.float32) / 32768) * .9
                    self.assertEqual(len(actual), round(seconds * 48000))
                    # Include every later word and both former overflow points;
                    # omit only the deliberate 8 ms endpoint fades.
                    np.testing.assert_allclose(actual[400:-400], expected[400:-400], atol=1e-7)
                    self.assertTrue(np.all(np.diff(actual[400:-400]) >= 0))

    def make_player(self):
        import threading
        from types import SimpleNamespace
        sink = SimpleNamespace(started=threading.Event(), release=threading.Event(),
                               played=[], closed=False)
        def play(wav, started):
            sink.played.append(wav)
            started()
            sink.started.set()
            sink.release.wait(2)
        def close():
            sink.closed = True
        sink.play, sink.close = play, close
        return ClipPlayer(sink=sink), sink

    def test_shutdown_waits_for_native_completion(self):
        import threading
        np, _ = audio_dependencies()
        player, sink = self.make_player()
        player.play(np.ones(480, dtype=np.float32))
        self.assertTrue(sink.started.wait(1))
        closer = threading.Thread(target=player.close)
        closer.start()
        self.assertTrue(closer.is_alive())
        self.assertFalse(sink.closed)
        sink.release.set()
        closer.join(1)
        self.assertFalse(closer.is_alive())
        self.assertTrue(sink.closed)
        self.assertEqual(player.completed_clips, 1)

    def test_full_pcm_sent_once_and_new_play_cannot_replace_it(self):
        import wave
        np, _ = audio_dependencies()
        player, sink = self.make_player()
        pcm = np.linspace(-.5, .5, player.sample_rate * 4, dtype=np.float32)
        try:
            self.assertTrue(player.play(pcm))
            self.assertTrue(sink.started.wait(1))
            for _ in range(20):
                self.assertFalse(player.play(np.zeros(100, dtype=np.float32)))
            self.assertTrue(player.busy)
            self.assertEqual(len(sink.played), 1)
            with wave.open(io.BytesIO(sink.played[0]), 'rb') as wav:
                self.assertEqual(wav.getnframes(), len(pcm))
                actual = np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2')
                np.testing.assert_array_equal(actual, (pcm * 32767).astype('<i2'))
        finally:
            sink.release.set()
            player.close()

    def test_audio_failure_is_reported_without_restarting_sentence(self):
        import threading
        from types import SimpleNamespace
        np, _ = audio_dependencies()
        failed = threading.Event()
        def fail(*args):
            failed.set()
            raise RuntimeError('device lost')
        player = ClipPlayer(sink=SimpleNamespace(play=fail, close=lambda: None))
        player.play(np.ones(480, dtype=np.float32))
        self.assertTrue(failed.wait(1))
        player.finished.wait(1)
        with self.assertRaisesRegex(RuntimeError, 'device lost'):
            player.play(np.ones(480, dtype=np.float32))
        self.assertEqual(player.completed_clips, 0)
        player.close()

    def test_only_opted_in_analysis_can_be_interrupted(self):
        import threading
        from types import SimpleNamespace
        np, _ = audio_dependencies()
        started, release = threading.Event(), threading.Event()
        calls = []
        def play(wav, callback, interruptible=False, cancelled=None):
            callback()
            started.set()
            release.wait(2)
            return not (cancelled and cancelled.is_set())
        def interrupt():
            calls.append('interrupt')
            release.set()
        sink = SimpleNamespace(play=play, interrupt=interrupt, close=lambda: None)
        player = ClipPlayer(sink=sink)
        try:
            player.play(np.ones(480, dtype=np.float32))
            self.assertTrue(started.wait(1))
            self.assertFalse(player.interrupt())
            self.assertEqual(calls, [])
            release.set()
            self.assertTrue(player.finished.wait(1))
            started.clear()
            release.clear()
            player.play(np.ones(480, dtype=np.float32), interruptible=True)
            self.assertTrue(started.wait(1))
            self.assertTrue(player.interrupt())
            self.assertTrue(player.finished.wait(1))
            self.assertEqual(player.interrupted_clips, 1)
            self.assertEqual(player.completed_clips, 1)
        finally:
            release.set()
            player.close()

    def test_old_provider_environment_cannot_start_ai(self):
        sys.path.insert(0, str(ROOT))
        import launcher
        for provider in ("google", "local", "rvc"):
            with patch.dict(os.environ, {"RL_COMMENTARY_PROVIDER": provider}), \
                 patch("hybrid_broadcast.HybridBroadcast", return_value="hybrid") as factory:
                self.assertEqual(launcher.create_commentary(), "hybrid")
                factory.assert_called_once()
        self.assertIsNone(launcher.create_commentary(False))

    def test_audio_initialization_failure_is_reported_and_does_not_abort_match(self):
        import launcher
        output = io.StringIO()
        with patch("hybrid_broadcast.HybridBroadcast", side_effect=RuntimeError("no speaker")), \
             contextlib.redirect_stdout(output):
            self.assertIsNone(launcher.create_commentary())
        self.assertIn("Clip commentary unavailable: no speaker", output.getvalue())


if __name__ == "__main__":
    unittest.main()
