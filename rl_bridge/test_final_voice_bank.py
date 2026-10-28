"""Final-bank audio integrity and live priority dispatch without launching the game."""
import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'commentary'))
from clip_broadcast import ClipBank, ClipBroadcast, PRIORITY
from hybrid_broadcast import HybridBroadcast
from test_clip_broadcast import FakePlayer, Clock, packet, vector


class FinalBankTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.loaded = ClipBank(ROOT / 'commentary/voice_bank', 48000, seed=27)

    def setUp(self):
        bank = copy.copy(self.loaded)
        bank.remaining, bank.last, bank.state_file = {}, {}, None
        self.player, self.crowd, self.countdown = FakePlayer(), FakePlayer(), FakePlayer()
        self.clock, self.logs = Clock(), []
        with patch('clip_broadcast.ClipBank', return_value=bank):
            self.b = HybridBroadcast(player=self.player, goal_player=self.crowd, countdown_player=self.countdown,
                                     clock=self.clock, start_background=False, log=self.logs.append)
        self.p = packet()
        self.b.process_packet(self.p)

    def tearDown(self):
        self.b.goal_calls.clear()
        self.b.stop()

    def idle(self):
        self.player.busy = self.crowd.busy = False
        self.clock.now += 12
        self.b._refresh_finished(self.clock())
        self.b.next_ambient = 0

    def test_all_400_source_files_are_imported_or_reused_with_no_bad_audio(self):
        report = json.loads((ROOT / 'commentary/voice_bank/final-bank-import.json').read_text())
        self.assertEqual(report['sourceFiles'], 400)
        self.assertEqual(report['imported'] + report['reused'], 400)
        self.assertEqual(len(self.loaded.clips), report['totalPlayableFiles'])
        self.assertEqual(self.loaded.errors, [])
        for category in self.loaded.categories:
            self.assertTrue(category in PRIORITY or category in ('countdown', 'crowd_goal', 'crowd_late_goal'), category)
        for category in ('goal', 'save', 'doublesave', 'triplesave', 'winner', 'equalizer', 'goahead', 'late_goal', 'pass', 'powershot', 'demo'):
            self.assertGreaterEqual(len(self.loaded.categories[category]), 10)
        # Old scream/countdown files still exist; spoken goals do not enter the crowd lane.
        self.assertEqual(self.loaded.categories['crowd_goal'], ['goal_01', 'goal_02', 'goal_03', 'goal_04'])
        self.assertEqual(len(self.loaded.categories['crowd_late_goal']), 1)
        self.assertNotIn('goal_01', self.loaded.categories['goal'])

    def test_muted_caster_lane_keeps_crowd_without_spoken_goal_calls(self):
        # The muted launcher uses ClipBroadcast, never the AI speech worker.
        self.b.speech_muted=True
        self.idle();self.player.played.clear();self.crowd.played.clear()
        ClipBroadcast._event(self.b,'goal',0,0)
        self.assertEqual(len(self.player.played),0)
        self.assertGreater(len(self.crowd.played),0)

    def test_confirmed_goal_cuts_save_and_plays_crowd_and_one_spoken_call(self):
        self.b._event('save', 0, 0)
        self.assertTrue(self.player.interruptible)
        self.p.teams[1].score = 1
        self.b.process_packet(self.p)
        self.assertEqual(self.player.cancelled, 1)
        self.assertEqual(self.b.current[0], 'goahead')
        self.assertEqual(len(self.crowd.played), 1)
        self.assertEqual(self.b.goal_current[0], 'crowd_goal')
        self.assertIsNone(self.b.pending)

    def test_goal_waits_for_native_fade_ack_then_starts_without_a_breathing_delay(self):
        self.b._event('save', 0, 0)
        def fading():
            self.player.cancelled += 1
            return True  # native output is still draining its fade
        self.player.interrupt = fading
        self.b._event('goal', team=1)
        self.assertEqual(self.b.pending[0], 'goal')
        self.assertEqual(self.b.current[0], 'save')
        self.player.busy = False
        self.b._service_pending(self.clock())
        self.assertEqual(self.b.current[0], 'goal')
        self.assertIsNone(self.b.pending)

    def test_routine_action_and_save_cannot_interrupt_a_goal(self):
        self.b._event('goal', team=0)
        self.assertFalse(self.b._event('aerial', 0, 0))
        self.b._event('save', 1, 1)
        self.assertEqual(self.player.cancelled, 0)
        self.assertEqual(self.b.current[0], 'goal')
        self.assertIsNone(self.b.pending)

    def test_critical_save_interrupts_routine_speech_but_not_intro(self):
        self.b._event('aerial', 0, 0)
        self.b._event('save', 1, 1)
        self.assertEqual(self.player.cancelled, 1)
        self.assertEqual(self.b.current[0], 'save')
        self.idle()
        self.b.intro_done = False
        self.b.ready_line = ('intro', 'caster_one', 'Welcome!', self.loaded.clips['aerial_01'], 0, None)
        self.b._play_ready(self.clock())
        self.b._event('goal', team=0)
        self.assertEqual(self.b.current[0], 'intro')
        self.assertEqual(self.player.cancelled, 1)

    def test_goal_cuts_ai_analysis_and_preserves_ai_for_the_next_turn(self):
        self.b.ready_line = ('analysis', 'caster_two', 'A verified observation.', self.loaded.clips['aerial_01'], 0, 100)
        self.b._play_ready(self.clock())
        self.b._event('goal', team=0)
        self.assertEqual(self.player.cancelled, 1)
        self.assertEqual(self.b.current[0], 'goal')
        self.assertEqual(self.b.next_speaker, 'caster_one')

    def test_double_and_triple_saves_require_new_confirmed_counters(self):
        self.p.game_cars[0].score_info.saves = 1
        self.b.process_packet(self.p)
        self.assertEqual(self.b.current[0], 'save')
        for count, category in ((2, 'doublesave'), (3, 'triplesave')):
            self.clock.now += .3
            self.p.game_info.seconds_elapsed += .3
            self.p.game_cars[0].score_info.saves = count
            self.b.process_packet(self.p)
            self.assertEqual(self.b.current[0], category)
        self.assertEqual(self.player.cancelled, 2)
        played = len(self.player.played)
        self.b.process_packet(self.p)
        self.assertEqual(len(self.player.played), played)

    def test_save_sequence_expires_and_goal_clears_it(self):
        self.p.game_cars[0].score_info.saves = 1
        self.b.process_packet(self.p)
        self.idle()
        self.p.game_info.seconds_elapsed += 6
        self.p.game_cars[0].score_info.saves = 2
        self.b.process_packet(self.p)
        self.assertEqual(self.b.current[0], 'save')
        self.p.teams[1].score = 1
        self.b.process_packet(self.p)
        self.assertFalse(self.b.save_sequences[0])

    def test_special_goal_selection_uses_score_and_clock(self):
        info = self.p.game_info
        self.assertEqual(self.b._goal_category(info, (1, 2), (2, 2), 0), 'equalizer')
        self.assertEqual(self.b._goal_category(info, (2, 2), (3, 2), 0), 'goahead')
        info.is_overtime = True
        self.assertEqual(self.b._goal_category(info, (2, 2), (3, 2), 0), 'winner')
        info.is_overtime = False
        info.game_time_remaining = .4
        self.assertEqual(self.b._goal_category(info, (2, 2), (3, 2), 0), 'late_goal')
        self.assertEqual(self.b._goal_category(info, (0, 7), (1, 7), 0), 'goal')

    def test_goal_stops_countdown_and_last_second_consolation_uses_no_banger(self):
        self.p.teams[1].score = 7
        self.p.game_info.game_time_remaining = 9
        self.b.scores = (0, 7)
        self.b.process_packet(self.p)
        self.p.game_info.game_time_remaining = .1
        self.p.teams[0].score = 1
        self.b.process_packet(self.p)
        self.assertEqual(self.countdown.cancelled, 1)
        self.assertEqual(self.b.current[0], 'goal')
        self.assertEqual(self.b.goal_current[0], 'crowd_goal')

    def test_registered_fast_shot_and_demo_use_their_categories(self):
        vector(self.p.game_ball.physics.velocity, (0, 2700, 0))
        self.p.game_cars[0].score_info.shots += 1
        self.b.process_packet(self.p)
        self.assertEqual(self.b.current[0], 'powershot')
        self.idle()
        self.p.game_cars[1].score_info.demolitions += 1
        self.b.process_packet(self.p)
        self.assertEqual(self.b.current[0], 'demo')

    def test_each_category_exhausts_all_variations_before_repeating(self):
        for category, ids in self.b.bank.categories.items():
            heard = [self.b.bank.draw(category)[0] for _ in ids]
            self.assertEqual(set(heard), set(ids), category)
            self.assertEqual(len(heard), len(set(heard)), category)
            self.assertNotEqual(heard[-1], self.b.bank.draw(category)[0]) if len(ids) > 1 else None

    def test_rare_mechanics_only_accept_explicitly_confirmed_notifications(self):
        self.assertFalse(self.b.process_confirmed_event({'category': 'reset', 'owner': 0, 'team': 0}))
        self.assertEqual(self.player.played, [])
        self.assertTrue(self.b.process_confirmed_event({'category': 'reset', 'owner': 0, 'team': 0, 'confirmed': True}))
        self.assertEqual(self.b.current[0], 'reset')

    def test_critical_demo_uses_recorded_demo_pool_without_resetting_rotation(self):
        self.assertEqual(self.b.bank.recording_category('critical_demo'), 'demo')
        self.b._event('aerial', 0, 0)
        self.b._event('critical_demo', 0, 0)
        self.assertEqual(self.b.current[0], 'critical_demo')
        self.assertEqual(self.player.cancelled, 1)
        self.assertIn(self.b.bank.last['demo'], self.b.bank.categories['demo'])


if __name__ == '__main__':
    unittest.main()
