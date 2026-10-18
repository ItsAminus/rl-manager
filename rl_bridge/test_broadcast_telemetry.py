import json,time,unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace as Obj
from unittest.mock import Mock
from broadcast_telemetry import BroadcastTelemetry

def packet(ended=False):
    return Obj(num_teams=2,num_cars=1,teams=[Obj(score=2),Obj(score=1)],
        game_info=Obj(game_time_remaining=235,is_overtime=False,is_kickoff_pause=False,is_match_ended=ended),
        game_cars=[Obj(name='Actual account name',team=0,is_bot=False,
            score_info=Obj(score=350,goals=2,assists=1,saves=3,shots=4),boost=42)])

class FullscreenHUDTelemetryTests(unittest.TestCase):
    def test_zen_title_is_pinned_across_stale_launch_titles_and_bot_changes(self):
        registry=json.loads((Path(__file__).resolve().parents[1]/'data/player-titles.json').read_text(encoding='utf-8'))
        expected=registry['player_1']['title']
        for supplied in ('RLCS Regional Champion','S23 Supersonic Legend'):
            context={'blue':{'players':[{'playerId':'player_1','gamertag':'zen','title':supplied}]},
                     'orange':{'players':[{'playerId':'not-verified','gamertag':'Unknown','title':supplied}]}}
            hud=BroadcastTelemetry(Mock(),context)
            try:
                self.assertEqual(hud.context['blue']['players'][0]['title'],expected)
                self.assertEqual(hud.context['orange']['players'][0]['title'],'')
                self.assertEqual(context['blue']['players'][0]['title'],supplied)
            finally:hud.close()

    def test_partial_hosted_roster_can_show_names_before_team_entry(self):
        with TemporaryDirectory(dir=Path(__file__).resolve().parent) as folder:
            emit=Mock();hud=BroadcastTelemetry(emit,{'nativeStatePath':str(Path(folder)/'state.json')})
            try:
                hud.update_staging({'scores':[0,0],'remaining':300,'overtime':False},
                                   [{'playerId':'zen-id','nativeId':'102','gamertag':'zen','is_bot':True}])
                self.assertTrue(hud.latest['staging'])
                self.assertFalse(hud.latest['ended'])
                self.assertEqual(hud.latest['players'][0]['gamertag'],'zen')
                self.assertEqual(hud.latest['players'][0]['nativeId'],'102')
                emit.assert_not_called()  # Display-only; no fake match-start event.
            finally:hud.close()

    def test_native_state_is_atomic_and_does_not_send_desktop_overlay_packets(self):
        # Workspace temp directory avoids Windows sandbox's virtual temp mount.
        with TemporaryDirectory(dir=Path(__file__).resolve().parent) as folder:
            target=Path(folder)/'state.json';emit=Mock()
            hud=BroadcastTelemetry(emit,{'nativeStatePath':str(target),'blue':{'name':'Tést'}})
            try:
                hud.update(packet())
                limit=time.monotonic()+2
                while not target.exists() and time.monotonic()<limit:time.sleep(.01)
                data=json.loads(target.read_text(encoding='utf-8'))
                self.assertEqual((data['blue'],data['orange'],data['remaining']),(2,1,235))
                self.assertEqual(data['players'][0]['goals'],2)
                self.assertEqual(data['players'][0]['name'],'Actual account name')
                self.assertEqual(data['players'][0]['team'],0)
                self.assertFalse(data['players'][0]['is_bot'])
                self.assertEqual(data['context']['blue']['name'],'Tést')
                self.assertLess(abs(time.time()-data['updated']),2)
                self.assertTrue(data['session']);emit.assert_not_called()
                hud.last=0;hud.update(packet(True));hud.close()
                self.assertTrue(json.loads(target.read_text(encoding='utf-8'))['ended'])
            finally:hud.close()
            self.assertFalse(hud.writer.is_alive())

    def test_bot_identity_is_the_current_role_not_its_engine(self):
        emit=Mock();hud=BroadcastTelemetry(emit);hud.window=lambda:{}
        first=packet();first.game_cars[0].name='zen';first.game_cars[0].is_bot=True
        hud.update(first)
        self.assertEqual(emit.call_args.kwargs['players'][0]['name'],'zen')
        hud.last=0
        second=packet();second.game_cars[0].name='nass';second.game_cars[0].is_bot=True
        hud.update(second)
        self.assertEqual(emit.call_args.kwargs['players'][0]['name'],'nass')
        hud.close()

    def test_human_and_bots_keep_their_career_roles_when_packet_slots_change(self):
        roster={'blue':{'players':[
            {'playerId':'zen-id','gamertag':'zen','isHuman':False},
            {'playerId':'nass-id','gamertag':'nass','isHuman':False},
            {'playerId':'vatira-id','gamertag':'Vatira','isHuman':True},
        ]},'orange':{'players':[]}}
        emit=Mock();hud=BroadcastTelemetry(emit,roster);hud.window=lambda:{}
        data=packet();data.num_cars=3
        human=data.game_cars[0]
        zen=Obj(**vars(human));zen.name='zen';zen.is_bot=True
        nass=Obj(**vars(human));nass.name='nass';nass.is_bot=True
        data.game_cars=[human,nass,zen]
        hud.update(data)
        mapped=emit.call_args.kwargs['players']
        self.assertEqual([p['playerId'] for p in mapped],['vatira-id','nass-id','zen-id'])
        self.assertEqual([p['slot'] for p in mapped],[0,1,2])
        self.assertEqual(mapped[0]['gamertag'],'Vatira')
        # Same engine with a different role next game does not reuse the old face.
        self.assertEqual(hud.career_role(zen)['playerId'],'zen-id')
        hud.native_names={'zen-id':'Byte (2)'};hud.native_ids={'zen-id':'123'}
        hud.last=0;hud.update(data)
        mapped=emit.call_args.kwargs['players'][2]
        self.assertEqual((mapped['name'],mapped['gamertag'],mapped['nativeId']),('Byte (2)','zen','123'))
        zen.name='nass';self.assertEqual(hud.career_role(zen)['playerId'],'nass-id')
        hud.context['blue']['players'].append({'playerId':'impostor-id','gamertag':'nass'})
        self.assertEqual(hud.career_role(zen),{})
        hud.close()

    def test_without_native_context_preserves_legacy_output(self):
        emit=Mock();hud=BroadcastTelemetry(emit);hud.window=lambda:{'foreground':True}
        hud.update(packet());emit.assert_called_once()
        self.assertEqual(emit.call_args.args,('BROADCAST',))
        self.assertEqual(emit.call_args.kwargs['remaining'],235)
        hud.close()

if __name__=='__main__':unittest.main()
