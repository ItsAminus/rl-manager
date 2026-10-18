"""Hybrid director tests without loading a GPU model or launching Rocket League."""
import sys
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "commentary"))
from hybrid_broadcast import HybridBroadcast
from match_story import MatchStory, spoken_clock
from story_lines import discussion_lines
from test_clip_broadcast import FakePlayer, Clock, packet, vector

CONTEXT = {"blueTeam": {"name": "Blue Club", "players": [{"gamertag": "Zen", "rating": 99}]},
           "orangeTeam": {"name": "Orange Club", "players": [{"gamertag": "Vatira", "rating": 97}]}}


class HybridTests(unittest.TestCase):
    def setUp(self):
        self.cache = (ROOT / "commentary" / "cache").resolve()
        self.temp = tempfile.TemporaryDirectory(prefix="hybrid-test-", dir=self.cache)
        self.clock, self.player = Clock(), FakePlayer()
        self.logs = []
        self.b = HybridBroadcast(context=CONTEXT, player=self.player, clock=self.clock,
                                 bank_path=ROOT / 'commentary/voice_bank/archive/before-final-bank',
                                 start_background=False, log=self.logs.append,
                                 state_file=Path(self.temp.name) / "rotation.json",
                                 countdown_player=FakePlayer(),goal_player=FakePlayer())
        self.p = packet()

    def tearDown(self):
        self.b.goal_calls.clear()
        self.b.stop()
        assert Path(self.temp.name).resolve().is_relative_to(self.cache)
        self.temp.cleanup()

    def ready(self, text="Verified analysis.", version=None, expires=30):
        self.b.ready_line = ("analysis", "caster_two", text, self.b.bank.clips["aerial_01"],
                             self.b.generation if version is None else version, expires)

    def test_analysis_never_overwrites_a_live_clip(self):
        self.b._event("aerial", 0, 0)
        self.ready()
        self.b.process_packet(self.p)
        self.assertEqual(self.b.current[0], "aerial")
        self.assertEqual(len(self.player.played), 1)
        self.assertIsNotNone(self.b.ready_line)

    def test_goal_discards_waiting_analysis_and_preserves_sentence(self):
        self.b.process_packet(self.p)
        self.b._event("aerial", 0, 0)
        self.ready()
        self.p.teams[1].score += 1
        self.b.process_packet(self.p)
        self.assertIsNone(self.b.ready_line)
        self.assertEqual(self.b.generation, 1)
        self.assertTrue(self.player.busy)
        self.assertEqual(self.player.cancelled, 0)

    def test_stale_generation_version_and_age_do_not_play(self):
        self.ready(version=-1)
        self.b._play_ready(10)
        self.assertIsNone(self.b.ready_line)
        self.ready(expires=9)
        self.b._play_ready(10)
        self.assertEqual(self.player.played, [])

    def test_analysis_plays_in_quiet_gap_and_speakers_alternate(self):
        self.ready()
        self.b._play_ready(10)
        self.assertEqual(self.b.current[0], "analysis")
        self.assertEqual(self.b.next_speaker, "caster_one")
        self.assertIn("Verified analysis.", self.b.history)

    def test_intro_is_not_announced_late_after_live_gameplay(self):
        self.b.intro_done = True
        self.b.ready_line = ("intro", "caster_one", "Welcome!", self.b.bank.clips["aerial_01"], 0, None)
        self.b._play_ready(10)
        self.assertEqual(self.player.played, [])
        self.assertIsNone(self.b.ready_line)

    def test_first_touch_does_not_cut_kickoff_sentence(self):
        self.p.game_info.is_kickoff_pause = True
        self.b.process_packet(self.p)
        self.assertEqual(self.b.current[0], "kickoff")
        self.p.game_info.is_kickoff_pause = False
        self.p.game_ball.latest_touch.player_name = "Orange"
        self.p.game_ball.latest_touch.player_index = 1
        self.p.game_ball.latest_touch.time_seconds = 10.1
        self.b.process_packet(self.p)
        self.assertTrue(self.player.busy)
        self.assertEqual(self.b.current[0], "kickoff")
        self.assertEqual(self.player.cancelled, 0)

    def test_missing_reaction_category_does_not_use_unrelated_clip(self):
        self.assertFalse(self.b._event("mistake"))
        self.assertEqual(self.player.played, [])

    def test_clock_phase_change_discards_analysis_generated_for_old_phase(self):
        self.p.game_info.game_time_remaining = 61
        self.b.process_packet(self.p)
        self.ready()
        self.p.game_info.game_time_remaining = 59
        self.b.process_packet(self.p)
        self.assertIsNone(self.b.ready_line)
        self.assertEqual(self.b.generation, 1)

    def test_unconfirmed_shot_does_not_silence_analysis(self):
        self.ready()
        self.b.previous_ball = ((0, 4000, 150), (0, 1600, 0))
        self.b._play_ready(10)
        self.assertIsNone(self.b.ready_line)
        self.assertEqual(self.b.current[0], 'analysis')

    def test_changed_statistics_discard_prepared_analysis_before_playback(self):
        self.p.game_cars[0].score_info.saves = 5
        self.b.process_packet(self.p)
        fact = next(f for f in self.b.story.facts(self.b.snapshot) if '5 saves' in f)
        self.ready(text=fact)
        self.b.ready_line = (*self.b.ready_line, (fact,))
        self.p.game_cars[0].score_info.saves = 6
        self.b.process_packet(self.p)
        self.assertIsNone(self.b.ready_line)
        self.assertEqual(self.player.played, [])

    def reaction(self, category):
        self.b.bank.categories[category] = [f'{category}_01']
        self.b.bank.clips[f'{category}_01'] = self.b.bank.clips['aerial_01']

    def test_critical_recording_interrupts_only_generated_analysis(self):
        for category in ('save', 'mistake', 'critical_demo'):
            with self.subTest(category=category):
                self.b.pending = None
                self.b.next_ambient = 0
                self.ready()
                self.b._play_ready(10)
                self.reaction(category)
                before = self.player.cancelled
                self.assertTrue(self.b._event(category))
                self.assertEqual(self.player.cancelled, before + 1)
                self.b._service_pending(10)
                self.assertEqual(self.b.current[0], category)
                self.assertFalse(self.player.interruptible)
                self.player.busy = False
                self.b._refresh_finished(10)

    def test_crowd_reacts_on_same_packet_without_cutting_or_waiting_for_analysis(self):
        self.b.process_packet(self.p)
        self.ready();self.b._play_ready(10)
        self.assertEqual(self.b.current[0],'analysis')
        self.p.teams[1].score=1
        self.b.process_packet(self.p)
        self.assertEqual(len(self.b.goal_player.played),1)
        self.assertTrue(self.player.busy)
        self.assertEqual(self.player.cancelled,0)
        self.assertEqual(self.b.goal_current[0],'goal')
        self.assertFalse(self.b.goal_calls)

    def test_routine_events_and_missing_critical_recording_cannot_cut_analysis(self):
        self.ready()
        self.b._play_ready(10)
        for category in ('aerial', 'dribble', 'kickoff', 'shot', 'block', 'mistake', 'save', 'critical_demo'):
            self.assertFalse(self.b._event(category, 0, 0))
        self.assertTrue(self.player.busy)
        self.assertEqual(self.player.cancelled, 0)
        self.assertIsNone(self.b.pending)

    def test_critical_event_cannot_cut_a_recording_or_intro(self):
        self.reaction('save')
        self.b._event('aerial', 0, 0)
        self.b._event('save', 1, 1)
        self.assertEqual(self.player.cancelled, 0)
        self.assertEqual(self.b.current[0], 'aerial')
        self.assertEqual(self.b.pending[0], 'save')
        self.player.busy = False
        self.b.pending = None
        self.b.was_busy = False
        self.b.ready_line = ('intro', 'caster_one', 'Welcome!', self.b.bank.clips['aerial_01'], 0, None)
        self.b._play_ready(10)
        self.b._event('save', 1, 1)
        self.assertEqual(self.b.current[0], 'intro')
        self.assertTrue(self.player.busy)
        self.assertEqual(self.player.cancelled, 0)

    def test_reaction_cooldown_does_not_cut_analysis_into_silence(self):
        self.reaction('save')
        self.b.last_event['save'] = self.clock()
        self.ready()
        self.b._play_ready(10)
        self.assertFalse(self.b._event('save'))
        self.assertTrue(self.player.busy)
        self.assertEqual(self.player.cancelled, 0)

    def test_performance_paragraph_survives_unrelated_goal_and_extra_save(self):
        self.p.game_cars[0].score_info.saves = 2
        self.b.process_packet(self.p)
        card = next(c for c in discussion_lines(self.b.story, self.b.snapshot, 10) if c.key == 'defender:Blue')
        self.b.ready_line = ('analysis', 'caster_two', card.text, self.b.bank.clips['aerial_01'],
                             self.b.generation, card.expires, (), card)
        self.p.teams[1].score = 1
        self.p.game_cars[1].score_info.goals = 1
        self.p.game_cars[0].score_info.saves = 3
        self.b.process_packet(self.p)
        self.assertIsNotNone(self.b.ready_line)
        self.assertEqual(self.b.goal_current[0], 'goal')
        self.b.goal_player.busy = False
        self.b._refresh_finished(self.clock())
        self.clock.now += .6
        self.b.process_packet(self.p)
        self.assertEqual(self.b.current[0], 'analysis')
        self.assertIn('two saves', self.b.history[-1])

    def test_last_second_consolation_cannot_be_remapped_to_banger(self):
        self.p.teams[1].score = 7
        self.p.game_info.game_time_remaining = 2
        self.b.process_packet(self.p)
        self.p.teams[0].score = 1
        self.p.game_info.game_time_remaining = 0
        self.b.process_packet(self.p)
        self.assertEqual(self.b.goal_current[0], 'goal')
        self.assertNotIn('late_goal', self.b.bank.last)

    def test_countdown_reserves_analysis_turn_but_goal_can_react(self):
        self.p.game_info.game_time_remaining = 10
        self.b.process_packet(self.p)
        self.ready()
        self.b._play_ready(10)
        self.assertTrue(self.b.countdown_player.busy)
        self.assertFalse(self.player.busy)
        self.p.teams[0].score = 1
        self.b.process_packet(self.p)
        self.assertEqual(self.b.goal_current[0], 'goal')
        self.assertEqual(self.b.countdown_player.cancelled, 1)

    def test_postgame_drains_queued_goal_before_review(self):
        self.b._event('aerial', 0, 0)
        self.b._event('late_goal', team=0)
        self.player.busy = False
        self.b.postgame_complete.set()
        seen = []
        def complete_audio(_):
            seen.append(self.b.goal_current[0])
            self.player.busy = False
            self.b.goal_player.busy = False
            return False
        with patch.object(self.b.stopped, 'wait', side_effect=complete_audio):
            self.assertTrue(self.b._play_script('postgame', self.b.postgame_complete, 1))
        self.assertEqual(seen, ['late_goal'])
        self.assertFalse(self.b.goal_calls)

    def test_postgame_waits_for_countdown_even_when_no_script_is_pending(self):
        self.b.countdown_player.busy = True
        self.b.postgame_complete.set()
        def complete_countdown(_):
            self.b.countdown_player.busy = False
            return False
        with patch.object(self.b.stopped, 'wait', side_effect=complete_countdown) as wait:
            self.assertTrue(self.b._play_script('postgame', self.b.postgame_complete, 1))
        wait.assert_called_once()

    def test_next_paragraph_can_be_generated_while_audio_is_busy(self):
        from types import SimpleNamespace
        self.b.process_packet(self.p)
        self.b._event('aerial', 0, 0)
        candidates = self.b._discussion_candidates(self.b.snapshot, 10)
        card = candidates[0]
        self.b.speech = SimpleNamespace(synthesize=lambda *args, **kw: ROOT / 'commentary/voice_bank/aerial_01.wav')
        self.b._make_line('caster_two', card.text, 'analysis', 0, card.expires, card=card)
        self.assertIsNotNone(self.b.ready_line)
        self.assertEqual(self.b.current[0], 'aerial')
        self.b.speech = None

    def test_producer_does_not_wait_for_playback_to_finish(self):
        self.b.process_packet(self.p)
        self.b._event('aerial', 0, 0)
        self.b.intro_enabled = False
        with patch('hybrid_broadcast.SpeechWorker'), \
                patch('local_fact_selector.LocalFactSelector') as selector, \
                patch.object(self.b, '_make_line') as make, \
                patch.object(self.b.stopped, 'wait', side_effect=[False, True]):
            selector.return_value.choose.return_value = [0]
            self.b._generate()
        self.assertEqual([c.args[2] for c in make.call_args_list],
                         ['result_opening', 'result_opening', 'analysis'])
        self.assertEqual(make.call_args.args[2], 'analysis')
        self.assertGreater(len(make.call_args.args[1].split()), 25)
        self.b.speech = None
        self.b.selector = None

    def test_producer_does_not_synthesize_new_postgame_after_final_packet(self):
        self.p.game_info.is_match_ended = True
        self.p.teams[0].score = 2
        self.b.process_packet(self.p)
        self.b.intro_enabled = False
        with patch('hybrid_broadcast.SpeechWorker'), \
                patch('local_fact_selector.LocalFactSelector'), \
                patch.object(self.b, '_make_line') as make, \
                patch.object(self.b.stopped, 'wait', side_effect=[False, True]):
            self.b._generate()
        self.assertFalse(any(c.args[2]=='postgame' for c in make.call_args_list))
        self.assertTrue(self.b.postgame_complete.is_set())
        self.b.speech = self.b.selector = None

    def test_final_packet_seals_review_even_while_producer_is_busy(self):
        self.b.process_packet(self.p);self.script_speech()
        self.b.snapshot['players'][0]['goals']=2
        self.b.snapshot['remaining']=45
        for _ in range(3):self.b._prepare_review_turn(self.b.snapshot,0)
        self.b._make_line('caster_one',self.b._opening_text(0),'result_opening',0,None)
        self.p.game_cars[0].score_info.goals=3  # late third goal doesn't stale milestone
        self.p.teams[0].score=3;self.p.game_info.is_match_ended=True
        with patch.object(self.b,'_make_line',side_effect=AssertionError('No TTS at final whistle')):
            self.b.process_packet(self.p)
        self.assertTrue(self.b.postgame_complete.is_set())
        self.assertTrue(any('already put away 2 goals' in l[2] for l in self.b.postgame_lines))
        before=list(self.b.postgame_lines)
        self.b.process_packet(self.p)
        self.assertEqual(list(self.b.postgame_lines),before)
        self.b.speech=None

    def test_last_45_seconds_prepare_review_instead_of_long_live_analysis(self):
        self.b.process_packet(self.p);self.b.snapshot['remaining']=45
        self.b.intro_enabled=False
        with patch('hybrid_broadcast.SpeechWorker'),patch('local_fact_selector.LocalFactSelector'),\
                patch.object(self.b,'_make_line') as make,\
                patch.object(self.b,'_prepare_review_turn',return_value=False) as prepare,\
                patch.object(self.b.stopped,'wait',side_effect=[False,True]):
            self.b._generate()
        prepare.assert_called_once()
        self.assertFalse(any(c.args[2]=='analysis' for c in make.call_args_list))
        self.b.speech=self.b.selector=None

    def test_prepared_review_rejects_counter_reset_and_wrong_roster(self):
        self.b.process_packet(self.p);self.b.snapshot['players'][0]['saves']=4
        card=self.b.story.review_milestones(self.b.snapshot)[0]
        self.assertTrue(self.b.story.valid_milestone(card,self.b.snapshot))
        final={**self.b.snapshot,'players':[{**p,'saves':0} for p in self.b.snapshot['players']]}
        self.assertFalse(self.b.story.valid_milestone(card,final))
        self.b.story.epoch+=1
        self.assertFalse(self.b.story.valid_milestone(card,self.b.snapshot))

    def test_result_chooses_actual_winner_and_skips_wrong_predicted_final_score(self):
        from series_story import SeriesStory
        self.b.story.series=SeriesStory({'series':{'bestOf':5,'blueWins':2,'orangeWins':2,
                                        'gameNumber':5,'history':[]}},self.b.story.teams)
        self.b.process_packet(self.p);self.script_speech()
        self.b.snapshot['score']=(2,0)
        for _ in range(30):self.b._prepare_review_turn(self.b.snapshot,0)
        self.p.teams[0].score=2;self.p.teams[1].score=4
        self.p.game_info.is_match_ended=True
        with patch.object(self.b,'_make_line',side_effect=AssertionError('No final synthesis')):
            self.b.process_packet(self.p)
        texts=[l[2] for l in self.b.postgame_lines]
        self.assertIn('Orange Club win the series 3 to 2!',texts)
        self.assertFalse(any('Blue Club win the series' in s for s in texts))
        self.assertFalse(any('The final score is' in s for s in texts))
        self.b.speech=None

    def test_inflight_preview_cannot_append_to_sealed_result_queue(self):
        self.b.process_packet(self.p);self.script_speech()
        self.p.teams[0].score=1;self.p.game_info.is_match_ended=True
        self.b.process_packet(self.p)
        before=list(self.b.postgame_lines)
        self.b._make_line('caster_two','A delayed prepared sentence.','review_preview',0,None)
        self.assertEqual(list(self.b.postgame_lines),before)
        self.assertNotIn(('caster_two','A delayed prepared sentence.'),self.b.prepared_review)
        self.b.speech=None

    def test_short_breath_between_analytical_turns(self):
        self.ready()
        self.b._play_ready(10)
        self.player.busy = False
        self.b._refresh_finished(10)
        self.assertAlmostEqual(self.b.next_ambient, 10.28)

    def script_speech(self):
        from types import SimpleNamespace
        self.b.speech = SimpleNamespace(synthesize=lambda *args, **kw:
            ROOT / 'commentary/voice_bank/aerial_01.wav')

    def test_background_scripts_obey_gameplay_budget_until_result_desk(self):
        from unittest.mock import Mock
        speech=Mock();speech.synthesize.return_value=ROOT / 'commentary/voice_bank/aerial_01.wav'
        self.b.speech=speech
        for category,expected in [('intro',True),('result_opening',True),('analysis',True),
                                  ('review_preview',True),('postgame',False)]:
            self.b._make_line('caster_one',f'A complete {category} sentence.',category,0,None)
            self.assertEqual(speech.synthesize.call_args.kwargs['style']['gameplay_budget'],expected)
        self.b.speech=None

    def test_prepared_result_audio_is_reused_without_gpu_request_and_not_played_early(self):
        from unittest.mock import Mock
        speech=Mock();speech.synthesize.return_value=ROOT/'commentary/voice_bank/aerial_01.wav'
        self.b.speech=speech
        self.b._make_line('caster_two','The support spacing needs review.','review_preview',0,None)
        self.assertFalse(self.b.postgame_lines);self.assertFalse(self.player.played)
        self.b._make_line('caster_two','The support spacing needs review.','postgame',0,None)
        self.assertEqual(speech.synthesize.call_count,1)
        self.assertEqual(self.b.postgame_lines[0][2],'The support spacing needs review.')
        self.b._make_line('caster_two','A different final statistic.','postgame',0,None)
        self.assertEqual(speech.synthesize.call_count,2)
        self.assertFalse(speech.synthesize.call_args.kwargs['style']['gameplay_budget'])
        self.b.speech=None

    def test_outcomes_prepared_during_play_are_selected_using_final_series_winner(self):
        from types import SimpleNamespace
        from series_story import SeriesStory
        self.b.story.series=SeriesStory({'series':{'bestOf':5,'blueWins':2,'orangeWins':2,'gameNumber':5,'history':[]}},self.b.story.teams)
        self.b.process_packet(self.p);self.script_speech()
        for _ in range(45):self.b._prepare_review_turn(self.b.snapshot,0)
        self.assertIn(('caster_one','Blue Club win the series 3 to 2!'),self.b.prepared_review)
        self.assertIn(('caster_one','Orange Club win the series 3 to 2!'),self.b.prepared_review)
        self.assertFalse(self.b.postgame_lines)
        final={**self.b.snapshot,'score':(0,2),'ended':True}
        self.b._make_script('caster_one',self.b.story.postgame(final),'postgame',0)
        self.assertTrue(any('Orange Club win the series 3 to 2!'==line[2] for line in self.b.postgame_lines))
        self.assertFalse(any('Blue Club win' in line[2] for line in self.b.postgame_lines))
        self.b.speech=None

    def finish_audio_immediately(self):
        original = self.player.play
        def play(pcm, interruptible=False):
            original(pcm, interruptible)
            self.player.busy = False
        self.player.play = play

    def test_intro_sentences_have_a_separate_queue_and_all_play(self):
        self.script_speech()
        self.ready()
        self.b._make_script('caster_one', 'Welcome to game two! Blue Club lead the series.', 'intro', 0)
        self.b.intro_prepared.set()
        self.assertEqual(len(self.b.intro_lines), 2)
        self.assertEqual(self.b.ready_line[0], 'analysis')
        self.finish_audio_immediately()
        self.b.prepare_intro(timeout=.5)
        self.b.loading_thread.join(timeout=1)
        self.assertEqual(len(self.player.played), 2)
        self.assertEqual(self.player.cancelled, 0)
        self.assertFalse(self.player.interruptible)
        self.assertTrue(self.b.intro_done)
        self.assertEqual(len(self.b.intro_lines), 0)
        self.b.speech = None

    def test_postgame_plays_every_sentence_before_shutdown(self):
        self.p.game_info.is_match_ended = True
        self.p.teams[0].score = 2
        self.b.process_packet(self.p)
        self.script_speech()
        self.ready()
        self.b._make_script('caster_one', 'Blue Club take the game! The series is level!',
                            'postgame', self.b.generation)
        self.b.postgame_complete.set()
        self.finish_audio_immediately()
        with patch.object(self.b.generation_thread, 'is_alive', return_value=True):
            self.b.finish_match(timeout=.5)
        self.assertEqual(len(self.player.played), 2)
        self.assertEqual(self.player.cancelled, 0)
        self.assertEqual(self.b.current, None)
        self.assertEqual(len(self.b.postgame_lines), 0)
        self.assertIsNone(self.b.ready_line)
        self.b.speech = None

    def test_cached_result_call_starts_without_waiting_for_producer(self):
        self.script_speech()
        self.b._make_line('caster_one', 'Blue Club take the game!', 'result_opening', 0, None)
        self.p.game_info.is_match_ended = True
        self.p.teams[0].score = 2
        self.b.process_packet(self.p)
        self.assertTrue(self.b.postgame_complete.is_set())
        original = self.player.play
        def play(pcm, interruptible=False):
            original(pcm, interruptible)
            self.player.busy = False
            self.b.postgame_complete.set()
        self.player.play = play
        with patch.object(self.b.generation_thread, 'is_alive', return_value=True):
            self.b.finish_match(timeout=.5)
        self.assertEqual(len(self.player.played), 1)
        self.assertTrue(any('Blue Club take the game!' in log for log in self.logs))
        self.b.speech = None

    def test_menu_or_next_match_packet_cannot_change_final_result(self):
        self.p.game_info.is_match_ended = True
        self.p.teams[1].score = 5
        self.b.process_packet(self.p)
        self.p.teams[0].score = self.p.teams[1].score = 0
        self.p.game_info.is_match_ended = False
        self.b.process_packet(self.p)
        self.assertEqual(self.b.final_snapshot['score'], (0,5))
        self.assertEqual(self.b.snapshot['score'], (0,5))

    def test_gamertag_period_does_not_split_name_from_predicate(self):
        self.script_speech()
        self.b._make_script('caster_one', 'ajg. has the highest rating. The next game matters!', 'intro', 0)
        self.assertEqual([line[2] for line in self.b.intro_lines],
                         ['ajg. has the highest rating.', 'The next game matters!'])
        self.b.speech = None

    def test_result_review_uses_actual_player_and_team_totals(self):
        self.p.teams[1].score = 5
        self.p.game_info.is_match_ended = True
        self.p.game_cars[0].score_info.saves = 6
        self.p.game_cars[1].score_info.goals = 5
        self.p.game_cars[1].score_info.shots = 8
        self.p.game_cars[1].score_info.assists = 2
        self.b.process_packet(self.p)
        text = self.b.story.analysis_review(self.b.snapshot)
        self.assertIn('5 of those goals', text)
        self.assertIn('6 saves', text)
        self.assertIn('8 for Orange Club', text)
        self.assertIn('did not register a shot', text)

    def test_one_bad_intro_sentence_does_not_remove_other_sentences(self):
        def synth(speaker, text, category, *args):
            if text == 'First sentence.':
                raise RuntimeError('temporary synthesis error')
            self.b.intro_lines.append((category, speaker, text, self.b.bank.clips['aerial_01'], 0, None))
        with patch.object(self.b, '_make_line', side_effect=synth):
            self.b._make_script('caster_one', 'First sentence. Second sentence.', 'intro', 0)
        self.assertEqual(self.b.intro_lines[0][2], 'Second sentence.')
        self.assertTrue(any('could not be generated' in line for line in self.logs))


class StoryTests(unittest.TestCase):
    def test_player_discussion_connects_measured_performance_to_tactics(self):
        p, story = packet(), MatchStory(CONTEXT)
        p.game_cars[0].score_info.goals = 2
        p.game_cars[1].score_info.assists = 1
        cards = discussion_lines(story, story.update(p, 10), 10)
        goal = next(c for c in cards if c.key == 'finisher:Blue')
        assist = next(c for c in cards if c.key == 'creator:Orange')
        self.assertIn('two goals', goal.text)
        self.assertIn('defending', goal.text)
        self.assertIn('one assist!', assist.text)
        self.assertNotIn('one assists', assist.text)

    def test_no_shots_is_not_assumed_to_be_a_bad_game_or_missed_chances(self):
        p, story = packet(), MatchStory()
        p.game_info.seconds_elapsed = 100
        p.game_cars[0].score_info.saves = 4
        snap = story.update(p, 10)
        quiet = next(c for c in discussion_lines(story, snap, 10) if c.key == 'quiet:Blue')
        self.assertIn('contribution elsewhere', quiet.text)
        self.assertNotIn('missed', quiet.text)
        p.game_cars[0].score_info.shots = 1
        self.assertFalse(quiet.valid(story.update(p, 11), 11, story.epoch))

    def test_match_restart_invalidates_old_paragraphs(self):
        p, story = packet(), MatchStory()
        snap = story.update(p, 10)
        card = discussion_lines(story, snap, 10)[0]
        p.game_info.seconds_elapsed = 0
        new = story.update(p, 11)
        self.assertFalse(card.valid(new, 11, story.epoch))
        self.assertEqual(story.epoch, 1)

    def test_late_chase_discussion_expires_when_team_equalizes(self):
        p, story = packet(), MatchStory(CONTEXT)
        p.teams[0].score = 1
        p.game_info.game_time_remaining = 40
        snap = story.update(p, 10)
        card = next(c for c in discussion_lines(story, snap, 10) if c.key.startswith('late-chase:'))
        self.assertIn('Orange Club', card.text)
        self.assertEqual(card.energy, 'hype')
        p.teams[1].score = 1
        self.assertFalse(card.valid(story.update(p, 11), 11, story.epoch))

    def test_boost_and_territory_require_sustained_telemetry(self):
        p, story = packet(), MatchStory()
        vector(p.game_ball.physics.location, (0, -2000, 93))
        first = story.update(p, 10)
        self.assertFalse(any(c.key.startswith(('boost:', 'territory:')) for c in discussion_lines(story, first, 10)))
        for i in range(1, 15):
            p.game_info.seconds_elapsed += .5
            snap = story.update(p, 10 + i*.5)
        self.assertTrue(any(c.key == 'boost:0' for c in discussion_lines(story, snap, 18)))
        self.assertTrue(any(c.key == 'territory:0' for c in discussion_lines(story, snap, 18)))

    def test_demo_requires_last_defender_and_a_real_goal_threat(self):
        p, story = packet(), MatchStory()
        vector(p.game_cars[1].physics.location, (0, 5000, 17))
        vector(p.game_ball.physics.location, (0, 4000, 150))
        vector(p.game_ball.physics.velocity, (0, 1600, 0))
        story.update(p, 10)
        p.game_cars[1].is_demolished = True
        story.update(p, 11)
        self.assertEqual(story.events[-1]['type'], 'critical_demo')
        story.update(p, 12)
        self.assertEqual(len(story.events), 1)
        p, story = packet(), MatchStory()
        story.update(p, 10)
        p.game_cars[1].is_demolished = True
        story.update(p, 11)
        self.assertEqual(len(story.events), 0)
    def test_intro_uses_real_roster_and_rating_not_invented_form(self):
        intro = MatchStory(CONTEXT).intro()
        for fact in ("Blue Club", "Orange Club", "Zen", "Vatira", "99"):
            self.assertIn(fact, intro)
        self.assertNotIn("unstoppable", intro)
        self.assertNotIn("warmups", intro)

    def test_spoken_clock_uses_minutes_and_handles_overtime(self):
        self.assertEqual(spoken_clock(120), "2 minutes remaining")
        self.assertEqual(spoken_clock(90), "1 minute and 30 seconds remaining")
        self.assertEqual(spoken_clock(10), "10 seconds remaining")
        self.assertEqual(spoken_clock(-10, True), "overtime")

    def test_history_attributes_scorer_only_on_goal_counter_change(self):
        p, story = packet(), MatchStory(CONTEXT)
        story.update(p, 10)
        p.teams[1].score = 1
        p.game_cars[1].score_info.goals = 1
        story.update(p, 11)
        self.assertEqual(story.events[-1]["scorer"], "Orange")
        self.assertEqual(story.score_version, 1)
        p.teams[0].score = 1
        story.update(p, 12)
        self.assertIsNone(story.events[-1]["scorer"])

    def test_analysis_has_only_measured_statistics_and_saved_career_form(self):
        p, story = packet(), MatchStory(CONTEXT)
        p.game_cars[0].score_info.saves = 5
        p.game_cars[1].score_info.shots = 3
        facts = story.facts(story.update(p, 10))
        self.assertTrue(any("5 saves" in f for f in facts))
        self.assertTrue(any("3 shots" in f for f in facts))
        self.assertFalse(any("missed" in f or "top corner" in f for f in facts))


if __name__ == "__main__":
    unittest.main()
