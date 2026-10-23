import copy
import json
import sys
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from player_introductions import introduction_plan, frozen_lineup, native_ack, run_showcase, showcase_config


def context():
    value={'gameNumber':1,'broadcast':{'series':{'gameNumber':1}}}
    for side,key in enumerate(('blue','orange')):
        players=[{'playerId':f'p{side}{i}','gamertag':f'Pro{side}{i}','isHuman':side==0 and i==0,
                  'introduction':{'age':18+i,'rlcsDebut':'2024 Split 1 Regional 1',
                      'bestWorldsResult':'7TH–8TH','sources':{'rlcsDebut':'https://example.com/debut','bestWorldsResult':'https://example.com/worlds'}}}
                 for i in range(3)]
        value['broadcast'][key]={'name':key+' club','players':players}
        value[key+'Team']={'name':key+' club','players':copy.deepcopy(players)}
    return value


class IntroductionTests(unittest.TestCase):
    def test_portraits_follow_the_presented_identity_for_all_six_cards(self):
        c=context()
        for side in ('blue','orange'):
            for p in c['broadcast'][side]['players']:
                p['photo']='C:/portrait-cache/'+p['playerId']+'.png'
        for p in introduction_plan(c):
            self.assertEqual(p['photo'],'C:/portrait-cache/'+p['playerId']+'.png')

    def test_sourced_alternate_card_rows_reach_the_native_plan_without_becoming_biography_claims(self):
        c=context()
        c['broadcast']['blue']['players'][0]['introduction']={'age':None,'sources':{},'cardRows':[
            {'label':'COMPETITION REGION','value':'OCEANIA','source':'https://www.start.gg/tournament/example'},
            {'label':'RECORDED EVENT','value':'RLCS 2026 - OCEANIA OPEN 6','source':'https://www.start.gg/tournament/example'},
            {'label':'RECORDED TEAM FINISH','value':'7TH PLACE','source':'https://www.start.gg/tournament/example'},
        ]}
        p=introduction_plan(c)[0]
        self.assertEqual(len(p['cardRows']),3)
        self.assertEqual(p['cardRows'][2]['value'],'7TH PLACE')
        self.assertIsNone(p['rlcsDebut'])
        self.assertIsNone(p['bestWorldsResult'])
        self.assertNotIn('RLCS debut',p['script'])
        self.assertNotIn('Best Worlds result',p['script'])
        c['broadcast']['blue']['players'][0]['introduction']['cardRows'][0]['source']='unverified'
        self.assertEqual(len(introduction_plan(c)[0]['cardRows']),2)

    def test_script_variants_match_audio_keys_and_are_stable_for_one_fixture(self):
        c=context();c['fixtureId']='fixture-one'
        first=introduction_plan(c)
        self.assertEqual(first,introduction_plan(copy.deepcopy(c)))
        from player_introductions import OPENERS,CLOSERS
        from introduction_voice_bank import speech_keys
        for index,p in enumerate(first):
            self.assertEqual(p['leadScript'],OPENERS[p['introClip']-1])
            self.assertEqual(p['closingScript'],CLOSERS[p['outroClip']-1])
            self.assertEqual(speech_keys(p,index)[0],f"intro/{p['introClip']:02d}")
            # Positional lines are only eligible in their own lineup slot.
            for field in ('introClip','outroClip'):
                if p[field]<=6:self.assertEqual(p[field],index+1)
        self.assertEqual(len({p['introClip'] for p in first}),6)
        c['fixtureId']='fixture-two'
        self.assertNotEqual([(p['introClip'],p['outroClip']) for p in first],
                            [(p['introClip'],p['outroClip']) for p in introduction_plan(c)])

    def test_six_personalised_scripts_have_actual_values_and_reusable_openings(self):
        plan=introduction_plan(context())
        self.assertEqual(len(plan),6)
        self.assertEqual(len({p['script'] for p in plan}),6)
        for p in plan:
            self.assertIn(p['gamertag'],p['script'])
            self.assertTrue(p['teamName'])  # The team stays on the visual card.
            self.assertIn('2024 Split 1 Regional 1',p['script'])
            self.assertIn('7TH–8TH',p['script'])
            self.assertNotIn('[NAME]',p['script'])
            self.assertNotIn(p['gamertag'],p['leadScript'])

    def test_missing_history_is_never_guessed_or_spoken(self):
        c=context();c['broadcast']['blue']['players'][0]['introduction']={'age':None,'rlcsDebut':'unverified claim'}
        p=introduction_plan(c)[0]
        self.assertIsNone(p['rlcsDebut'])
        self.assertNotIn('debut',p['script'].lower())
        self.assertNotIn('years',p['script'])
        self.assertNotIn('unverified',p['script'])

    def test_later_series_games_retry_and_partial_or_ambiguous_rosters_skip(self):
        for mutate in (
            lambda c:c['broadcast']['series'].update(gameNumber=2),
            lambda c:c.update(_playerIntroAttempted=True),
            lambda c:c['broadcast']['orange']['players'].pop(),
            lambda c:c['broadcast']['orange']['players'][0].update(playerId='p00'),
        ):
            c=context();mutate(c);self.assertEqual(introduction_plan(c),[])

    def test_car_positions_follow_identity_when_packet_slots_are_permuted(self):
        plan=introduction_plan(context())
        packet=SimpleNamespace(num_cars=6,game_cars=[SimpleNamespace(name=p['gamertag'],team=p['team']) for p in reversed(plan)])
        state=frozen_lineup(packet,plan)
        self.assertEqual(state.cars[5].physics.location.x,-950)
        self.assertEqual(state.cars[0].physics.location.x,950)
        self.assertTrue(state.game_info.paused)
        packet.game_cars[0].name='unexpected'
        with self.assertRaisesRegex(ValueError,'missing or ambiguous'):frozen_lineup(packet,plan)

    def test_showcase_uses_six_named_idle_display_cars_without_account_or_stock_names(self):
        c=context();config=showcase_config(c)
        self.assertEqual(len(config.player_configs),6)
        self.assertTrue(all(p.bot and p.rlbot_controlled for p in config.player_configs))
        self.assertTrue(c['blueTeam']['players'][0]['isHuman'])
        self.assertEqual([p.name for p in config.player_configs],[p['gamertag'] for p in introduction_plan(c)])
        # Real RLBot configuration serialization accepts the display cars
        # without any bot policy config or process being launched.
        self.assertIsNotNone(config.create_flatbuffer())

    def test_receipts_require_this_session_player_and_freshness(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);file=root/'presentation-status.json'
            file.write_text(json.dumps({'session':'current','playerId':'p00','updated':time.time(),'cameraApplied':True}))
            self.assertTrue(native_ack(root,'current','p00')['cameraApplied'])
            self.assertIsNone(native_ack(root,'old','p00'))
            self.assertIsNone(native_ack(root,'current','p01'))
            file.write_text(json.dumps({'session':'current','updated':time.time()-10}))
            self.assertIsNone(native_ack(root,'current'))

    def test_old_hud_skips_without_loading_a_fake_match_or_leaving_speech_waiting(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'data/rl-manager').mkdir(parents=True)
            (root/'data/rl-manager/plugin-status.json').write_text('{}')
            manager,dispatcher=Mock(),Mock()
            with patch('bakkesmod_startup.folder',return_value=root):
                self.assertFalse(run_showcase(manager,context(),dispatcher,Mock()))
            manager.load_match_config.assert_not_called()
            dispatcher.finish_player_showcase.assert_called_once_with(False)


if __name__=='__main__':unittest.main()
