import unittest
import tempfile
from copy import deepcopy
from unittest.mock import patch
from pathlib import Path
from rating_bots import rating_plan,flatten_catalog,resolve_hosted,TIERS
from host_bot_health import KNOWN_BROKEN, family_key
from test_bot_plan import roster
from launcher import build_match_config

CATALOG=['Kiyo3','Chronos','BonkDaddy','RippleV1','RippleV1.1','Ordis','London','Byte','OptiGP','OptiFR','Opti','Nexto','NextoPlus','Ducky','Daizen','Fury','AstraV5','Zeus','Necto']

def ssl_roster():
    context=roster()
    for side in ('blueTeam','orangeTeam'):
        for player in context[side]['players']:player['rating']=94
    return context

class RatingTests(unittest.TestCase):
    def setUp(self):
        test_root=Path(__file__).resolve().parent/'runtime'/'tests';test_root.mkdir(parents=True,exist_ok=True)
        self.temp=tempfile.TemporaryDirectory(dir=test_root)
        def cleanup():
            assert Path(self.temp.name).resolve().is_relative_to(test_root.resolve())
            self.temp.cleanup()
        self.addCleanup(cleanup)
        root=patch('rating_bots.SERIES_ROOT',Path(self.temp.name));root.start();self.addCleanup(root.stop)
        health=patch('rating_bots.excluded_engines',side_effect=lambda context:KNOWN_BROKEN|{family_key(e) for e in context.get('_excludedHostedBots',[])})
        health.start();self.addCleanup(health.stop)

    def test_hard_hierarchy_uses_the_requested_policy_for_each_pro(self):
        context=roster()
        for player,rating in zip(context['blueTeam']['players']+context['orangeTeam']['players'],(100,99,98,97,96,95)):
            player['rating']=rating
        result=rating_plan(context,CATALOG)
        self.assertEqual([a['engine'] for a in result['assignments']],
                         [None,'Kiyo3','Chronos','BonkDaddy','Byte',unittest.mock.ANY])
        context['orangeTeam']['players'][2]['rating']=94
        self.assertIn(rating_plan(context,CATALOG)['assignments'][5]['engine'],('OptiGP','Opti','RippleV1'))

    def test_rebalanced_hard_boundaries_and_opti_fr_only_at_89(self):
        pools={79:{'Necto'},85:{'Necto'},86:{'AstraV5','Daizen','Zeus'},88:{'AstraV5','Daizen','Zeus'},
               89:{'AstraV5','Daizen','Zeus','OptiFR'},90:{'NextoPlus','Ducky'},92:{'NextoPlus','Ducky'},
               93:{'OptiGP','Opti','RippleV1'},95:{'OptiGP','Opti','RippleV1'},96:{'Byte'},97:{'BonkDaddy'},98:{'Chronos'},99:{'Kiyo3'}}
        for rating,allowed in pools.items():
            engines=set()
            for series in range(40):
                context=roster();context['fixtureId']='balance-'+str(series)
                for side in ('blueTeam','orangeTeam'):
                    for p in context[side]['players']:p['rating']=rating
                result=rating_plan(context,CATALOG)
                engines.update(a['engine'] for a in result['assignments'] if a['type']!='Human')
            self.assertEqual(engines,allowed,(rating,engines))

    def test_ripple_versions_are_distinct_and_never_upgrade_to_v11(self):
        self.assertEqual(resolve_hosted('RippleV1',['RippleV1','RippleV1.1']),'RippleV1')
        self.assertIsNone(resolve_hosted('RippleV1',['RippleV1.1']))
        self.assertNotEqual(family_key('RippleV1'),family_key('RippleV1.1'))
        context=ssl_roster();context['_excludedHostedBots']=['RippleV1.1']
        self.assertTrue(all(a['engine']=='RippleV1' for a in rating_plan(context,['RippleV1','RippleV1.1'])['assignments'][1:]))

    def test_hosted_necto_is_not_misrepresented_as_local_diamond(self):
        context=roster()
        for side in ('blueTeam','orangeTeam'):
            for p in context[side]['players']:p['rating']=85
        hosted=rating_plan(context,CATALOG)
        self.assertEqual(hosted['assignments'][1]['engine'],'Necto')
        self.assertIn('Champ',hosted['assignments'][1]['availableLevel'])
        self.assertIn('cannot be mixed',hosted['notice'])
        for side in ('blueTeam','orangeTeam'):
            for p in context[side]['players']:p['rating']=83
        local=rating_plan(context,CATALOG)
        self.assertEqual(local['route'],'Local');self.assertEqual(local['assignments'][1]['availableLevel'],'Diamond')

    def test_failed_top_policy_uses_next_best_and_discloses_replacement(self):
        for rating,engine,replacement in ((99,'Kiyo3','Chronos'),(98,'Chronos','BonkDaddy'),(97,'BonkDaddy','Byte')):
            context=ssl_roster();context['blueTeam']['players'][1]['rating']=rating
            assignment=rating_plan(context,[e for e in CATALOG if e!=engine])['assignments'][1]
            if replacement:self.assertEqual(assignment['engine'],replacement)
            else:self.assertIn(assignment['engine'],('OptiGP','Opti','RippleV1'))
            self.assertIn(engine,assignment['fallbackFrom'])
            self.assertLess(assignment['actualTierCutoff'],assignment['tierCutoff'])
            context['_excludedHostedBots']=[engine]
            self.assertEqual(rating_plan(context,CATALOG)['assignments'][1]['engine'],assignment['engine'])

    def test_new_top_policies_survive_series_lock_and_new_series_uses_new_rating(self):
        context=roster();context['careerId']='new-top-lock'
        first=rating_plan(context,CATALOG,lock_series=True)
        self.assertEqual(first['assignments'][1]['engine'],'Kiyo3')
        context['gameNumber']=2;context['blueTeam']['players'][1]['rating']=96
        self.assertEqual(rating_plan(context,CATALOG)['assignments'][1]['engine'],'Kiyo3')
        context['fixtureId']='next-series'
        self.assertEqual(rating_plan(context,CATALOG)['assignments'][1]['engine'],'Byte')

    def test_every_rating_boundary_and_stable_identity(self):
        for rating in (0,68,69,73,74,78,79,83,84,88,89,90,93,94,95,96,97,98,99,100):
            context=roster()
            for side in ('blueTeam','orangeTeam'):
                for p in context[side]['players']:p['rating']=rating
            before=deepcopy(context);plan=rating_plan(context)
            tier=next(t for t in TIERS if rating>=t[0])
            for a in plan['assignments'][1:]:self.assertIn(a['engine'],tier[1])
            self.assertEqual(plan['route'],'Rocket Host' if rating>=84 else 'Local')
            self.assertEqual(plan,rating_plan(context))
            self.assertEqual(context,before)

    def test_easy_and_medium_stay_local_even_for_elite_players(self):
        for mode,allowed in [('Medium',{'Necto','Element'}),('Easy',{'Stick','Codename Cryo'})]:
            context=roster();context['difficulty']=mode
            for side in ('blueTeam','orangeTeam'):
                for p in context[side]['players']:p['rating']=99
            plan=rating_plan(context,CATALOG)
            self.assertEqual(plan['route'],'Local')
            self.assertEqual(plan['difficulty'],mode)
            self.assertTrue(all(a['engine'] in allowed for a in plan['assignments'] if a['type']!='Human'))
            self.assertTrue(all(a['rating']==99 for a in plan['assignments']))

    def test_explicit_difficulty_change_gets_its_own_series_assignments(self):
        context=roster();hard=rating_plan(context,CATALOG,lock_series=True)
        context['difficulty']='Medium';medium=rating_plan(context,lock_series=True)
        context['gameNumber']=2
        self.assertEqual([a['engine'] for a in medium['assignments']],[a['engine'] for a in rating_plan(context)['assignments']])
        context['difficulty']='Hard'
        self.assertEqual([a['engine'] for a in hard['assignments']],[a['engine'] for a in rating_plan(context,CATALOG)['assignments']])

    def test_easy_low_rated_players_use_actual_rookie_skill(self):
        context=roster();context['difficulty']='Easy'
        for side in ('blueTeam','orangeTeam'):
            for p in context[side]['players']:p['rating']=50
        profile=rating_plan(context)['assignments'][1]
        self.assertEqual(profile['engine'],'Career Rookie')
        from bot_assignment import engine_config
        from rlbot.utils.class_importer import import_agent
        from rlbot.parsing.bot_config_bundle import get_bot_config_bundle
        cfg=engine_config(Path(self.temp.name),profile['engine'])
        self.assertTrue(cfg.is_file())
        agent=import_agent(get_bot_config_bundle(str(cfg)).python_file).get_loaded_class()('rookie',0,0)
        from test_local_performance import packet
        controls=agent.get_output(packet());self.assertFalse(controls.boost);self.assertFalse(controls.jump)

    def test_local_difficulty_config_keeps_human_role_names_and_replays(self):
        context=roster();context['difficulty']='Medium';context['botRouting']='ratings-v2'
        with patch('launcher.select_bot_cfg',return_value=(Path('verified-local.cfg'),1.0)):
            config=build_match_config(context,Path(self.temp.name))
        self.assertFalse(config.skip_replays)
        self.assertFalse(config.player_configs[0].bot)
        self.assertEqual([p.name for p in config.player_configs],[p['gamertag'] for side in ('blueTeam','orangeTeam') for p in context[side]['players']])

    def test_all_starters_count_towards_the_highest_rating_route(self):
        context=roster()
        for side in ('blueTeam','orangeTeam'):
            for p in context[side]['players']:p['rating']=79
        context['blueTeam']['players'][0]['rating']=100
        self.assertEqual(rating_plan(context)['route'],'Rocket Host')
        context['blueTeam']['players'][0]['rating']=83
        self.assertEqual(rating_plan(context)['route'],'Local')

    def test_each_allowed_family_can_be_drawn_and_zen_is_not_pinned(self):
        for rating in (99,98,97,96,95,93,90,89,86,84):
            context=roster()
            for side in ('blueTeam','orangeTeam'):
                for player in context[side]['players']:player['rating']=rating
            engines=set()
            for game in range(1,301):
                context['fixtureId']=f'fixture-{game}'
                engines.add(rating_plan(context)['assignments'][1]['engine'])
            self.assertEqual(engines,{f for f in next(t[1] for t in TIERS if rating>=t[0]) if family_key(f) not in KNOWN_BROKEN})
        context=roster()
        first=rating_plan(context)
        context['gameNumber']=2
        second=rating_plan(context)
        self.assertEqual([a['engine'] for a in first['assignments']], [a['engine'] for a in second['assignments']])
        self.assertEqual(second,rating_plan(context))

    def test_catalog_versions_and_same_tier_fallback(self):
        self.assertEqual(flatten_catalog([{'versions':['RippleV1.1 (SSL)']},'Necto (Champ)']),['RippleV1.1','Necto'])
        self.assertEqual(resolve_hosted('Ripple',CATALOG),'RippleV1.1')
        self.assertEqual(resolve_hosted('Astra',CATALOG),'AstraV5')
        self.assertEqual(resolve_hosted('NextoPlus',CATALOG),'NextoPlus')
        self.assertEqual(resolve_hosted('Kiyo3',CATALOG),'Kiyo3')
        self.assertEqual(resolve_hosted('Chronos',CATALOG),'Chronos')
        self.assertIsNone(resolve_hosted('Kiyo3',['Kiyo']))
        context=ssl_roster()
        self.assertTrue(all(a['engine']=='Opti' for a in rating_plan(context,['Opti'])['assignments'][1:]))
        fallback=rating_plan(context,['Necto'])['assignments'][1]
        self.assertEqual(fallback['engine'],'Necto')
        self.assertEqual(fallback['actualTierCutoff'],79)

    def test_exhausted_host_retains_partial_preview_and_cannot_launch(self):
        context=ssl_roster()
        context['orangeTeam']['players'][2]['rating']=79
        context['_excludedHostedBots']=[e for e in CATALOG if e!='Kiyo3' and e!='Necto']
        partial=rating_plan(context,[],allow_partial=True,lock_series=True)
        self.assertFalse(partial['success'])
        self.assertEqual(len(partial['assignments']),6)
        self.assertEqual(partial['assignments'][0]['type'],'Human')
        self.assertTrue(partial['assignments'][1]['assignmentError'])
        self.assertFalse(list(Path(self.temp.name).glob('*.json')))
        with self.assertRaises(ValueError):rating_plan(context,[],lock_series=True)

    def test_stronger_replacement_prevents_an_unnecessary_partial_failure(self):
        context=ssl_roster()
        context['orangeTeam']['players'][2]['rating']=79
        partial=rating_plan(context,['Opti'],allow_partial=True)
        self.assertTrue(partial['success'])
        self.assertEqual([a['engine'] for a in partial['assignments'][1:5]],['Opti']*4)
        self.assertEqual(partial['assignments'][5]['engine'],'Opti')
        self.assertIn('temporarily',partial['assignments'][5]['fallbackReason'])

    def test_primary_hierarchy_recovers_down_the_entire_hosted_ladder(self):
        context=ssl_roster();context['blueTeam']['players'][1]['rating']=99
        ladder=[('Kiyo3',99),('Chronos',98),('BonkDaddy',97),('Byte',96),
                ('Opti',93),('NextoPlus',90),('OptiFR',89),('Necto',79)]
        for index,(engine,cutoff) in enumerate(ladder):
            catalog=[name for name,_ in ladder[index:]]
            assignment=rating_plan(context,catalog)['assignments'][1]
            self.assertEqual(assignment['engine'],engine)
            self.assertEqual(assignment['actualTierCutoff'],cutoff)
            self.assertEqual(assignment['rating'],99)
        with self.assertRaises(ValueError):rating_plan(context,[])

    def test_public_preview_substitutes_a_higher_healthy_tier_when_needed(self):
        from bot_plan import plan
        context=ssl_roster()
        context['orangeTeam']['players'][2]['rating']=79
        context['_excludedHostedBots']=['Necto','Element']
        result=plan(context)
        self.assertTrue(result['success'])
        self.assertEqual(len(result['assignments']),6)
        self.assertTrue(all(a['engine'] for a in result['assignments'][1:5]))
        self.assertNotEqual(result['assignments'][5]['engine'],'Necto')
        self.assertGreater(result['assignments'][5]['actualTierCutoff'],79)

    def test_higher_fallback_does_not_bypass_path_promotion_caps(self):
        context=roster();context['gameMode']='Path To Glory';context['pathHostedUnlocked']=True
        for side in ('blueTeam','orangeTeam'):
            for player in context[side]['players']:
                player['rating']=79;player['pathTierCap']=79
        result=rating_plan(context,['Kiyo3'],allow_partial=True)
        self.assertFalse(result['success'])
        self.assertTrue(all(a.get('assignmentError') for a in result['assignments'] if a['type']!='Human'))

    def test_fallback_is_temporary_and_original_policy_returns_when_healthy(self):
        context=ssl_roster();context['careerId']='fallback-lock'
        context['blueTeam']['players'][1]['rating']=99
        first=rating_plan(context,CATALOG,lock_series=True)
        context['_excludedHostedBots']=['Kiyo3']
        second=rating_plan(context,CATALOG,lock_series=True)
        self.assertEqual(second['assignments'][1]['engine'],'Chronos')
        self.assertEqual([a['engine'] for a in first['assignments'][2:]],[a['engine'] for a in second['assignments'][2:]])
        context['_excludedHostedBots']=[]
        self.assertEqual(rating_plan(context,CATALOG)['assignments'][1]['engine'],'Kiyo3')
        context['_excludedHostedBots']=['Kiyo3','Chronos']
        third=rating_plan(context,CATALOG,lock_series=True)['assignments'][1]
        self.assertEqual(third['engine'],'BonkDaddy')
        self.assertEqual(third['fallbackFrom'],'Kiyo3')

    def test_elite_families_are_shuffled_before_reuse_and_refresh_redraws(self):
        context=ssl_roster();context['careerId']='career-1'
        first=rating_plan(context,CATALOG)
        engines=[a['engine'] for a in first['assignments'] if a['type']!='Human']
        self.assertEqual(len(set(engines[:3])),3)
        self.assertEqual(first,rating_plan(context,CATALOG))
        refreshed=[]
        for revision in range(1,6):
            context['botSelectionRevision']=revision
            result=rating_plan(context,CATALOG)
            refreshed.append(tuple(a['engine'] for a in result['assignments'][1:]))
            self.assertEqual(result,rating_plan(context,CATALOG))
            self.assertEqual(len(set(refreshed[-1][:3])),3)
        self.assertGreater(len(set(refreshed)),1)
        self.assertTrue(any(draw!=tuple(engines) for draw in refreshed))

    def test_small_advertised_pool_only_repeats_after_it_is_exhausted(self):
        context=ssl_roster()
        plan=rating_plan(context,['OptiGP','Opti'])
        engines=[a['engine'] for a in plan['assignments'][1:]]
        self.assertEqual(set(engines[:2]),{'OptiGP','Opti'})
        self.assertEqual(set(engines[2:4]),{'OptiGP','Opti'})
        self.assertTrue(all(engine in ('OptiGP','Opti') for engine in engines))

    def test_launched_series_survives_restart_refresh_and_slot_changes(self):
        context=ssl_roster();context['careerId']='lock-test'
        first=rating_plan(context,CATALOG,lock_series=True)
        wanted={a['playerId']:a['engine'] for a in first['assignments'] if a['engine']}
        context['gameNumber']=5;context['botSelectionRevision']=37
        context['orangeTeam']['players'].reverse()
        second=rating_plan(context,CATALOG)
        self.assertEqual(wanted,{a['playerId']:a['engine'] for a in second['assignments'] if a['engine']})
        context['fixtureId']='another-series'
        self.assertNotEqual(wanted,{a['playerId']:a['engine'] for a in rating_plan(context,CATALOG)['assignments'] if a['engine']})

    def test_failed_policy_replaces_only_affected_players_for_rest_of_series(self):
        context=ssl_roster();context['careerId']='recovery-test'
        first=rating_plan(context,CATALOG,lock_series=True)
        failed=first['assignments'][1]['engine'];context['_excludedHostedBots']=[failed]
        second=rating_plan(context,CATALOG,lock_series=True)
        for a,b in zip(first['assignments'],second['assignments']):
            if a['engine']==failed:self.assertNotEqual(b['engine'],failed)
            else:self.assertEqual(a['engine'],b['engine'])
        context['gameNumber']=3
        self.assertEqual([a['engine'] for a in second['assignments']],[a['engine'] for a in rating_plan(context,CATALOG)['assignments']])

    def test_rating_changes_do_not_reassign_a_healthy_policy_mid_series(self):
        context=ssl_roster();context['careerId']='form-test'
        first=rating_plan(context,['Opti'],lock_series=True)
        for side in ('blueTeam','orangeTeam'):
            for player in context[side]['players']:player['rating']=83
        context['gameNumber']=2
        second=rating_plan(context,['Opti'])
        self.assertEqual(second['route'],'Rocket Host')
        self.assertEqual([a['engine'] for a in first['assignments']],[a['engine'] for a in second['assignments']])

    def test_mixed_low_players_use_explicit_hosted_minimum(self):
        context=roster();context['blueTeam']['players'][1]['rating']=60
        context['orangeTeam']['players'][0]['rating']=79
        result=rating_plan(context,CATALOG)
        self.assertEqual(result['assignments'][1]['engine'],'Necto')
        self.assertTrue(result['assignments'][1]['hostedMinimum'])
        self.assertEqual(result['assignments'][3]['engine'],'Necto')
        self.assertIn('lower-rated',result['notice'])

    def test_local_launcher_uses_the_same_engines_as_preview(self):
        context=roster();context['botRouting']='ratings-v2'
        for side in ('blueTeam','orangeTeam'):
            for p in context[side]['players']:p['rating']=79
        expected=rating_plan(context)
        with patch('launcher.select_bot_cfg',return_value=(Path('bot.cfg'),1)),patch('launcher.log_event'):
            match=build_match_config(context,Path('.'))
        for a,pc in zip(expected['assignments'],match.player_configs):
            if a['type']!='Human':self.assertEqual(a['engine'],pc.manager_profile['engine'])

    def test_all_83_and_lower_launch_without_contacting_rocket_host(self):
        import json
        from types import SimpleNamespace
        import launcher
        context=roster();context['botRouting']='ratings-v2'
        for side in ('blueTeam','orangeTeam'):
            for p in context[side]['players']:p['rating']=83
        match=SimpleNamespace(player_configs=[SimpleNamespace(name=p['gamertag'],team=team)
            for team,side in enumerate(('blueTeam','orangeTeam')) for p in context[side]['players']])
        with patch('sys.argv',['launcher.py','--config',json.dumps(context),'--no-commentary']), \
             patch('launcher.os.path.exists',return_value=False),patch('launcher.Path.exists',return_value=True), \
             patch('launcher.build_match_config',return_value=match),patch('launcher.launch_match') as local, \
             patch('launcher.log_event'),patch('rocket_host.launch') as hosted,patch('rocket_host.read_url') as network:
            launcher.main()
        local.assert_called_once();hosted.assert_not_called();network.assert_not_called()

    def test_easy_and_medium_elite_matches_use_local_launcher_and_keep_broadcast_context(self):
        import json
        from types import SimpleNamespace
        import launcher
        for mode in ('Easy','Medium'):
            context=roster();context.update(botRouting='ratings-v2',difficulty=mode,broadcast={'event':'RLCS Major','series':{'gameNumber':2,'bestOf':5}})
            for side in ('blueTeam','orangeTeam'):
                for player in context[side]['players']:player['rating']=99
            match=SimpleNamespace(player_configs=[])
            with patch('sys.argv',['launcher.py','--config',json.dumps(context),'--no-commentary']), \
                 patch('launcher.os.path.exists',return_value=False),patch('launcher.Path.exists',return_value=True), \
                 patch('launcher.build_match_config',return_value=match),patch('launcher.launch_match') as local, \
                 patch('launcher.log_event'),patch('rocket_host.launch') as hosted,patch('rocket_host.read_url') as network:
                launcher.main()
            local.assert_called_once();hosted.assert_not_called();network.assert_not_called()
            self.assertEqual(local.call_args.kwargs['broadcast_context'],context['broadcast'])

    def test_locked_local_engine_refreshes_condition_for_each_game(self):
        context=roster();context.update(careerId='condition-lock',difficulty='Medium')
        first=rating_plan(context,lock_series=True)
        for side in ('blueTeam','orangeTeam'):
            for player in context[side]['players']:
                player['condition']={'form':5,'morale':5,'fatigue':95,'chemistry':5,'trust':5}
                player['traits']={'confidence':5}
        context['gameNumber']=2
        second=rating_plan(context,lock_series=True)
        self.assertEqual([a['engine'] for a in first['assignments']],[a['engine'] for a in second['assignments']])
        for a,b in zip(first['assignments'][1:],second['assignments'][1:]):
            self.assertGreater(a['performance']['quality'],b['performance']['quality'])
            self.assertLess(a['performance']['reactionSeconds'],b['performance']['reactionSeconds'])

if __name__=='__main__':unittest.main()
