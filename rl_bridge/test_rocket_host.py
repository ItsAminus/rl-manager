import unittest
from copy import deepcopy
from tempfile import TemporaryDirectory
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlparse,parse_qs
from rocket_host import request_url,validate_join_address,HostedPacketReader,HostedEntryGate,engine_matches
from rating_bots import rating_plan
from test_bot_plan import roster
from test_rating_bots import CATALOG, ssl_roster
from host_bot_health import StalledBotsError, excluded_engines, quarantine
import rocket_host

def raw_packet(assignments):
    return {'elapsed':0,'remaining':300,'overtime':False,'ended':False,'active':False,
        'scores':[0,0],'ball':{'location':[0,0,93],'velocity':[0,0,0]},
        'players':[{'nativeId':str(100+a['slot']), 'name':a['engine'] or 'Actual human',
                    'team':a['team'],'isBot':a['type']!='Human','locallyControlled':a['type']=='Human','score':a['slot']*100,
                    'goals':a['slot'],'touches':0} for a in reversed(assignments)]}

class RocketHostTests(unittest.TestCase):
    def test_live_server_labels_keep_distinct_policy_identities(self):
        for name,engine in [('Kiyo 3.0','Kiyo3'),('Kiyo 3.0 (2)','Kiyo3'),('Kiyo 3.0 (3)','Kiyo3'),('Kiyo3','Kiyo3'),('Kiyo3 (2)','Kiyo3'),('Chronos (2)','Chronos')]:
            self.assertTrue(engine_matches(name,engine),(name,engine))
        self.assertFalse(engine_matches('Kiyo','Kiyo3'))
        self.assertFalse(engine_matches('Kiyo3','Kiyo'))
        self.assertFalse(engine_matches('Kiyo 3.0','Kiyo'))
        self.assertFalse(engine_matches('Kiyo 3.1','Kiyo3'))

    def test_reported_three_kiyo_match_releases_human_and_binds_selected_pro(self):
        context=roster()
        for p,rating in zip(context['blueTeam']['players']+context['orangeTeam']['players'],(98,99,99,99,94,93)):p['rating']=rating
        a=rating_plan(context,CATALOG)['assignments'];raw=raw_packet(a)
        raw['players']=[p for p in raw['players'] if p['isBot']]
        for slot,label in ((1,'Kiyo 3.0'),(2,'Kiyo 3.0 (2)'),(3,'Kiyo 3.0 (3)'),(4,'BonkDaddy'),(5,'Kilobyte')):
            assignment=a[slot]
            if slot==5:assignment['engine']='Byte'
            next(p for p in raw['players'] if p['nativeId']==str(100+slot))['name']=label
        reader=HostedPacketReader(a);calls=[]
        gate=HostedEntryGate(reader,lambda:calls.append('join-blue'),lambda _:None)
        self.assertFalse(gate.advance(raw,0));self.assertEqual(calls,['join-blue'])
        human=next(p for p in raw_packet(a)['players'] if not p['isBot'])
        raw['players'].append(human)
        self.assertTrue(gate.advance(raw,1))
        self.assertEqual(reader.native_ids['zen-id'],'101')
        self.assertEqual(len(set(reader.bindings.values())),6)
        for name,engine in [('Nexto+','NextoPlus'),('Opti-V2.2','Opti'),('Ripple v1.1','RippleV1.1'),('Bot_Byte (2)','Byte'),('Kilobyte','Byte'),('Kilobyte (2)','Byte'),('Astra','AstraV5'),('Astra (2)','AstraV5')]:
            self.assertTrue(engine_matches(name,engine),(name,engine))
        for name,engine in [('Nexto+','Nexto'),('Nexto','NextoPlus'),('OptiFR','Opti'),('Ripple v1.1','RippleV1'),('Astra','AstraV6'),('AstraFR','AstraV5')]:
            self.assertFalse(engine_matches(name,engine),(name,engine))

    def test_live_mixed_policies_bind_with_pro_display_names(self):
        assignments=rating_plan(roster(),CATALOG)['assignments']
        engines=['RippleV1.1','Opti','London','BonkDaddy','NextoPlus']
        labels=['Ripple v1.1','Opti-V2.2','London','BonkDaddy','Nexto+']
        for a,engine in zip(assignments[1:],engines):a['engine']=engine
        raw=raw_packet(assignments)
        for a,label in zip(assignments[1:],labels):
            p=next(p for p in raw['players'] if p['nativeId']==str(100+a['slot']))
            p['name']=label;p['displayName']=a['name']
        reader=HostedPacketReader(assignments)
        self.assertTrue(reader.bind(raw))
        self.assertEqual([c.name for c in reader.packet(raw).game_cars[:6]],
                         [a['name'] for a in assignments])
        self.assertEqual(reader.native_names[assignments[2]['playerId']],'Opti-V2.2')

    def test_official_request_contains_five_bots_and_series_map(self):
        context=roster();context['arenaUpk']='CHN_Stadium_P'
        context['orangeTeam']['players'][0]['rating']=96
        a=rating_plan(context,CATALOG)['assignments']
        url=request_url({'ip':'154.7.120.61','port':'2000'},context,a)
        q=parse_qs(urlparse(url).query)
        self.assertEqual(q['mapName'],['CHN_Stadium_P'])
        self.assertEqual(len(q['blueBots'][0].split(',')),2)
        self.assertEqual(len(q['orangeBots'][0].split(',')),3)
        self.assertEqual(q['blueBots'],['Kiyo3,BonkDaddy'])
        self.assertEqual(q['orangeBots'],['Chronos,BonkDaddy,BonkDaddy'])
        self.assertEqual(q['rlbot'],['yes'])
        self.assertNotIn('Human',url)
        self.assertEqual(validate_join_address('154.7.120.61:7777\n'),'154.7.120.61:7777')
        for address in ('127.0.0.1:7777','busy','154.7.120.61:0','154.7.120.61:70000','https://example.com'):
            with self.assertRaises(ValueError):validate_join_address(address)

    def test_duplicate_bot_instances_preserve_separate_career_roles(self):
        a=rating_plan(ssl_roster(),['Byte'])['assignments'];raw=raw_packet(a);reader=HostedPacketReader(a)
        self.assertTrue(reader.bind(raw));packet=reader.packet(raw)
        self.assertEqual([c.name for c in packet.game_cars[:6]],['Human','Zen','Support','A','B','C'])
        self.assertEqual([c.score_info.score for c in packet.game_cars[:6]],list(range(0,600,100)))
        self.assertEqual(reader.native_names['zen-id'],'Byte')
        raw['players'].reverse();packet=reader.packet(raw)
        self.assertEqual(packet.game_cars[1].score_info.goals,1)
        self.assertTrue(packet.game_info.is_kickoff_pause)
        raw['updated']=10;reader.packet(raw);raw['updated']=11
        self.assertGreater(reader.packet(raw).game_info.seconds_elapsed,0)
        raw['ball']['location']=[20,4000,93]
        self.assertFalse(reader.packet(raw).game_info.is_kickoff_pause)
        raw['players'].pop()
        with self.assertRaises(ValueError):reader.packet(raw)

    def test_missing_wrong_team_or_wrong_engine_never_counts_ready(self):
        a=rating_plan(roster(),CATALOG)['assignments']
        raw=raw_packet(a);raw['players'].pop()
        self.assertFalse(HostedPacketReader(a).bind(raw))
        raw=raw_packet(a);raw['players'][0]['team']=0
        self.assertFalse(HostedPacketReader(a).bind(raw))
        raw=raw_packet(a);raw['players'][0]['name']='Wrongbot'
        self.assertFalse(HostedPacketReader(a).bind(raw))
        raw=raw_packet(a)
        next(p for p in raw['players'] if not p['isBot'])['locallyControlled']=False
        self.assertFalse(HostedPacketReader(a).bind(raw))

    def test_spectator_stage_requires_every_requested_bot(self):
        a=rating_plan(roster(),CATALOG)['assignments'];raw=raw_packet(a)
        raw['players']=[p for p in raw['players'] if p['isBot']]
        reader=HostedPacketReader(a)
        self.assertTrue(reader.bots_present(raw))
        self.assertFalse(reader.bind(raw))  # human stays out until released
        removed=raw['players'].pop();self.assertFalse(reader.bots_present(raw))
        raw['players'].append(removed);removed['name']='WrongPolicy'
        self.assertFalse(reader.bots_present(raw))

    def test_arriving_duplicate_bots_keep_their_pregame_role_at_kickoff(self):
        a=rating_plan(ssl_roster(),['Byte'])['assignments'];raw=raw_packet(a)
        reader=HostedPacketReader(a)
        # Higher native address arrives first on blue: it must retain Zen's
        # identity when the lower-address duplicate joins later.
        first=next(p for p in raw['players'] if p['nativeId']=='102')
        staged=reader.staging_players({'players':[first]})
        self.assertEqual([(p['playerId'],p['nativeId']) for p in staged],[('zen-id','102')])
        staged=reader.staging_players(raw)
        self.assertEqual(len(staged),5)
        self.assertTrue(reader.bind(raw))
        self.assertEqual(reader.native_ids['zen-id'],'102')
        self.assertEqual(len(set(reader.bindings.values())),6)

    def test_observed_astra_and_nextoplus_labels_release_entry_without_five_second_wait(self):
        a=rating_plan(roster(),CATALOG)['assignments']
        for assignment,engine in zip(a[1:],['Byte','Opti','Fury','AstraV5','NextoPlus']):assignment['engine']=engine
        raw=raw_packet(a)
        for assignment,label in zip(a[1:],['Kilobyte','Opti-V2.2','Fury','Astra','Nexto+']):
            next(p for p in raw['players'] if p['nativeId']==str(100+assignment['slot']))['name']=label
        human=next(p for p in raw['players'] if not p['isBot'])
        raw['players'].remove(human)
        reader=HostedPacketReader(a);calls=[]
        gate=HostedEntryGate(reader,lambda:calls.append('ready'),lambda _:None)
        self.assertFalse(gate.advance(raw,10))
        self.assertTrue(gate.released);self.assertEqual(calls,['ready'])
        self.assertEqual(len(reader.staging_players(raw)),5)
        raw['players'].append(human)
        self.assertTrue(gate.advance(raw,10.1))
        self.assertEqual(reader.native_ids['zen-id'],'101')

    def test_entry_command_is_retried_until_a_locally_controlled_human_is_confirmed(self):
        a=rating_plan(roster(),CATALOG)['assignments'];raw=raw_packet(a)
        human=next(p for p in raw['players'] if not p['isBot']);human['locallyControlled']=False
        calls=[];gate=HostedEntryGate(HostedPacketReader(a),lambda:calls.append('ready'),lambda _:None)
        self.assertFalse(gate.advance(raw,100));self.assertFalse(gate.advance(raw,100.5))
        self.assertEqual(len(calls),1)
        self.assertFalse(gate.advance(raw,101));self.assertEqual(len(calls),2)
        human['locallyControlled']=True
        self.assertTrue(gate.advance(raw,101.1));self.assertEqual(len(calls),2)

    def test_missing_or_wrong_bot_keeps_spectator_lock_with_progress_diagnostics(self):
        a=rating_plan(roster(),CATALOG)['assignments'];raw=raw_packet(a);raw['players'][0]['name']='WrongPolicy'
        calls=[];messages=[];gate=HostedEntryGate(HostedPacketReader(a),lambda:calls.append('ready'),messages.append)
        self.assertFalse(gate.advance(raw,0));self.assertFalse(gate.released);self.assertEqual(calls,[])
        self.assertIn('4/5 matched',messages[0])
        with self.assertRaisesRegex(RuntimeError,'complete assigned bot roster'):gate.advance(raw,120)

    def test_entry_timeout_is_bounded_and_transient_command_failure_can_recover(self):
        a=rating_plan(roster(),CATALOG)['assignments'];raw=raw_packet(a)
        raw['players']=[p for p in raw['players'] if p['isBot']]
        calls=[]
        def send():
            calls.append('ready')
            if len(calls)==1:raise RuntimeError('temporary control timeout')
        gate=HostedEntryGate(HostedPacketReader(a),send,lambda _:None)
        self.assertFalse(gate.advance(raw,0));self.assertFalse(gate.advance(raw,1));self.assertEqual(len(calls),2)
        with self.assertRaisesRegex(RuntimeError,'locally controlled car.*15 seconds'):gate.advance(raw,15)

    def test_entry_never_records_or_releases_a_game_that_already_has_a_result(self):
        a=rating_plan(roster(),CATALOG)['assignments']
        for patch_data in ({'scores':[1,0]},{'ended':True},{'remaining':294}):
            raw=raw_packet(a);raw.update(patch_data);calls=[]
            gate=HostedEntryGate(HostedPacketReader(a),lambda:calls.append('ready'),lambda _:None)
            with self.assertRaisesRegex(RuntimeError,'before your car joined'):gate.advance(raw,0)
            self.assertEqual(calls,[])

    def test_touch_attribution_does_not_guess_ambiguous_challenges(self):
        a=rating_plan(roster(),CATALOG)['assignments'];raw=raw_packet(a);reader=HostedPacketReader(a)
        self.assertTrue(reader.bind(raw));reader.packet(raw)
        raw['elapsed']=1;raw['players'][0]['touches']=1
        self.assertEqual(reader.packet(raw).game_ball.latest_touch.player_index,5)
        raw['players'][1]['touches']=1;raw['players'][2]['touches']=1
        self.assertEqual(reader.packet(raw).game_ball.latest_touch.player_index,-1)

    def test_inactive_hosted_bot_never_silently_becomes_played_result(self):
        a=rating_plan(roster(),CATALOG)['assignments'];raw=raw_packet(a);reader=HostedPacketReader(a)
        reader.bind(raw);raw.update(active=True,updated=1)
        reader.check_activity(raw)
        for stamp in range(2,21):
            raw['updated']=stamp;reader.check_activity(raw)
        raw['updated']=21
        with self.assertRaisesRegex(RuntimeError,'All hosted bots are inactive'):reader.check_activity(raw)
        for p in raw['players']:
            p['physics']={'location':[1000,0,17],'velocity':[500,0,0]}
        reader.check_activity(raw)
        self.assertEqual(len(reader.active_bots),5)

    def test_bot_that_played_then_froze_is_detected_and_only_it_is_reported(self):
        a=rating_plan(roster(),CATALOG)['assignments'];raw=raw_packet(a);reader=HostedPacketReader(a)
        reader.bind(raw);raw.update(active=True,updated=0)
        reader.check_activity(raw)
        frozen=next(p for p in raw['players'] if p['nativeId']=='101')
        for stamp in range(1,26):
            raw['updated']=stamp
            for p in raw['players']:
                x=1000 if p is frozen else stamp*1000
                p['physics']={'location':[x,0,17],'velocity':[500,0,0] if p is not frozen or stamp==1 else [0,0,0]}
            if stamp<21:reader.check_activity(raw)
            else:
                with self.assertRaises(StalledBotsError) as error:reader.check_activity(raw)
                self.assertEqual([p['playerId'] for p in error.exception.assignments],['zen-id'])
                break
        self.assertIn('101',reader.active_bots) # Prior movement isn't a permanent pass.

    def test_replays_pauses_and_demolitions_do_not_count_as_idle_play(self):
        a=rating_plan(roster(),CATALOG)['assignments'];raw=raw_packet(a);reader=HostedPacketReader(a)
        reader.bind(raw)
        for stamp in range(60):
            raw.update(updated=stamp,active=False);reader.check_activity(raw)
        for stamp in range(60,90):
            raw.update(updated=stamp,active=True)
            for p in raw['players']:p['demolished']=True
            reader.check_activity(raw)
        for p in raw['players']:p['demolished']=False
        raw.update(updated=90,active=True);reader.check_activity(raw)
        raw['updated']=1000;reader.check_activity(raw) # Telemetry gap isn't idle evidence.

    def test_small_movements_and_touches_count_as_activity(self):
        a=rating_plan(roster(),CATALOG)['assignments'];raw=raw_packet(a);reader=HostedPacketReader(a)
        reader.bind(raw);raw.update(active=True,updated=0);reader.check_activity(raw)
        for stamp in range(1,60):
            raw['updated']=stamp
            for p in raw['players']:
                p['physics']={'location':[stamp*10,0,17],'velocity':[90,0,0]}
            reader.check_activity(raw)
        self.assertEqual(len(reader.active_bots),5)

    def test_confirmed_failures_are_excluded_from_preview_and_live_catalog(self):
        for catalog in (None,CATALOG):
            plan=rating_plan(roster(),catalog)
            self.assertFalse(any(a['engine'] in ('London','Ripple','RippleV1.1') for a in plan['assignments']))

    def test_failed_policy_is_persisted_and_replaced_with_same_tier(self):
        context=roster();context['gameNumber']=2;context['series']={'blueWins':0,'orangeWins':1}
        before=deepcopy(context)
        failed={'engine':'Byte','name':'Zen','playerId':'zen-id'}
        calls=[]
        def attempt(ctx,*args):
            calls.append(deepcopy(ctx))
            if len(calls)==1:raise StalledBotsError([failed])
            self.assertFalse(any(a['engine']=='Byte' for a in rating_plan(ctx,CATALOG)['assignments']))
            return 'completed on retry'
        test_root=Path(__file__).resolve().parent/'local_runtime'
        test_root.mkdir(exist_ok=True)
        with TemporaryDirectory(dir=test_root) as directory, patch('host_bot_health.HEALTH_PATH',Path(directory)/'health.json'), \
             patch('rocket_host._launch_once',side_effect=attempt),patch('launcher.log_event') as log:
            self.assertEqual(rocket_host.launch(context,'rl.exe','result.json',False),'completed on retry')
            self.assertIn('byte',excluded_engines())
            self.assertTrue(any(c.args[0]=='BOT_RECOVERY' for c in log.call_args_list))
        self.assertEqual(context,before)
        self.assertEqual(len(calls),2)
        self.assertTrue(all(c['gameNumber']==2 and c['series']==before['series'] for c in calls))

    def test_health_recovery_is_bounded_and_unrelated_errors_do_not_retry(self):
        failure=StalledBotsError([{'engine':'Byte','name':'Zen'}])
        with patch('rocket_host.quarantine'),patch('launcher.log_event'), \
             patch('rocket_host._launch_once',side_effect=failure) as attempt:
            with self.assertRaisesRegex(RuntimeError,'exhausted two retries'):rocket_host.launch(roster(),'rl','result')
            self.assertEqual(attempt.call_count,3)
        with patch('rocket_host._launch_once',side_effect=RuntimeError('Network down')) as attempt:
            with self.assertRaisesRegex(RuntimeError,'Network down'):rocket_host.launch(roster(),'rl','result')
            attempt.assert_called_once()

if __name__=='__main__':unittest.main()
