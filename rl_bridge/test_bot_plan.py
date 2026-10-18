import unittest
import json
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import Mock, patch
import launcher
from bot_plan import plan
from bot_assignment import player_assignment
from player_style import style_profile
from team_play import TeamPlay
from test_clip_broadcast import packet, vector
from rlbot.agents.base_agent import SimpleControllerState


def roster():
    return {'fixtureId': 'test', 'gameNumber': 1,
            'blueTeam': {'players': [{'playerId': 'human', 'gamertag': 'Human', 'rating': 94, 'isHuman': True},
                                     {'playerId': 'zen-id', 'gamertag': 'Zen', 'rating': 99},
                                     {'playerId': 'support', 'gamertag': 'Support', 'rating': 94}]},
            'orangeTeam': {'players': [{'playerId': name, 'gamertag': name, 'rating': 94}
                                      for name in ('A', 'B', 'C')]}}


class BotPlanTests(unittest.TestCase):
    def test_elite_match_launches_local_and_keeps_commentary_context(self):
        context = roster()
        context['series'] = {'format': 'BO5', 'blueWins': 2, 'orangeWins': 1}
        match = SimpleNamespace(player_configs=[
            SimpleNamespace(name=p['gamertag'], team=team)
            for team, side in enumerate(('blueTeam', 'orangeTeam'))
            for p in context[side]['players']])
        commentary = Mock()
        with patch('sys.argv', ['launcher.py', '--config', json.dumps(context)]), \
             patch('launcher.Path.exists', return_value=True), \
             patch('launcher.os.path.exists', return_value=False), \
             patch('launcher.build_match_config', return_value=match) as build, \
             patch('launcher.create_commentary', return_value=commentary) as prepare, \
             patch('launcher.launch_match') as launch, patch('launcher.log_event'):
            launcher.main()
        self.assertEqual(build.call_args.args[0], context)
        self.assertIs(launch.call_args.args[0], match)
        self.assertIs(launch.call_args.kwargs['commentary'], commentary)
        self.assertEqual(prepare.call_args.kwargs['context']['series'], context['series'])
        self.assertEqual(prepare.call_args.kwargs['context']['blueTeam']['players'],
                         context['blueTeam']['players'])
        commentary.stop.assert_called_once()

    def test_elite_roster_uses_hosted_bots_and_preserves_career_context(self):
        context = roster()
        original = deepcopy(context)
        result = plan(context)
        self.assertEqual(result['route'], 'Rocket Host')
        self.assertEqual(len(result['assignments']), 6)
        self.assertEqual(context, original)
        human, *bots = result['assignments']
        self.assertEqual(human['type'], 'Human')
        self.assertIsNone(human['engine'])
        self.assertFalse(human['styleApplied'])
        self.assertTrue(all(p['type'] == 'Rocket Host' for p in bots))
        self.assertEqual(bots[0]['engine'], 'Kiyo3')
        self.assertTrue(all(not p['styleApplied'] for p in bots))
        self.assertEqual([p['slot'] for p in result['assignments']], list(range(6)))
        self.assertIn('Private bot policies', result['notice'])

    def test_preview_matches_launcher_assignment_for_each_player(self):
        context = roster()
        for p, rating in zip(context['orangeTeam']['players'], (60, 78, 89)):
            p['rating'] = rating
        result = plan(context)
        context['botRouting']='ratings-v2'
        with patch('rocket_host.launch') as hosted, patch('launcher.log_event'), \
             patch('sys.argv',['launcher.py','--config',json.dumps(context)]), \
             patch('launcher.Path.exists',return_value=True):
            launcher.main()
        self.assertEqual(plan(hosted.call_args.args[0]), result)

    def test_actual_career_style_values_change_ground_support(self):
        self.assertEqual(style_profile({'tendency': 'MECHANICAL_CARRY'}),
                         style_profile({'tendency': 'Mechanical Carry'}))
        anchor = style_profile({'tendency': 'Defensive Anchor'})
        attack = style_profile({'tendency': 'Aggressive First Man'})
        self.assertGreater(anchor['supportDistance'], attack['supportDistance'])
        p = packet()
        p.game_cars[1].team = 0
        vector(p.game_cars[0].physics.location, (0,-1200,17))
        vector(p.game_cars[1].physics.location, (0,-950,17))
        for car in p.game_cars[:2]:
            vector(car.physics.velocity, (0,800,0))
        controls = SimpleControllerState(throttle=1, boost=True)
        self.assertFalse(TeamPlay(0, {'tendency': 'Defensive Anchor'}).apply(p, controls).boost)
        self.assertIs(TeamPlay(0, {'tendency': 'Aggressive First Man'}).apply(p, controls), controls)


if __name__ == '__main__':
    unittest.main()
