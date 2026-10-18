import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from bot_assignment import player_assignment
from team_play import TeamPlay
from test_clip_broadcast import packet, vector
from rlbot.agents.base_agent import SimpleControllerState

class AssignmentTests(unittest.TestCase):
    def test_rating_selects_real_engines_and_native_strength(self):
        for rating, engine in ((69,'Psyonix'), (70,'Necto'), (80,'Necto'), (85,'Nexto'), (99,'Nexto')):
            self.assertEqual(player_assignment({'rating':rating}, 'fixture', lucky_chance=0)['engine'], engine)
        for rating in range(86, 101):
            profile = player_assignment({'rating':rating}, 'fixture')
            self.assertEqual(profile['engine'], 'Nexto')
            self.assertEqual(profile['beta'], 1)
        self.assertLess(player_assignment({'rating':85},'fixture')['beta'],1)

    def test_lucky_game_is_stable_and_does_not_change_saved_rating(self):
        p = {'playerId':'x','rating':75}
        a = player_assignment(p, 'fixture:1', lucky_chance=1)
        self.assertEqual(a, player_assignment(p, 'fixture:1', lucky_chance=1))
        self.assertEqual(a['engine'],'Nexto')
        self.assertEqual(p['rating'],75)

    def test_aerials_and_kickoff_are_never_replaced_by_spacing(self):
        p = packet()
        controls = SimpleControllerState(throttle=1, boost=True, jump=True)
        policy = TeamPlay(0,{})
        self.assertIs(policy.apply(p,controls),controls)
        controls.jump = False
        p.game_info.is_kickoff_pause = True
        self.assertIs(policy.apply(p,controls),controls)

    def test_bot_yields_to_an_imminent_human_collision(self):
        p = packet()
        p.game_cars[1].team = 0
        p.game_cars[1].is_bot = True
        vector(p.game_cars[0].physics.location,(0,0,17))
        vector(p.game_cars[1].physics.location,(400,0,17))
        vector(p.game_cars[1].physics.velocity,(-1600,0,0))
        c = SimpleControllerState(throttle=1,boost=True)
        result = TeamPlay(1,{}).apply(p,c)
        self.assertFalse(result.boost)
        self.assertLess(result.throttle,0)
        self.assertTrue(c.boost)

    def test_ground_double_commit_yields_to_a_closer_teammate(self):
        p = packet()
        p.game_cars[1].team = 0
        vector(p.game_cars[0].physics.location,(-1000,-1000,17))
        vector(p.game_cars[0].physics.velocity,(500,500,0))
        vector(p.game_cars[1].physics.location,(0,-500,17))
        vector(p.game_cars[1].physics.velocity,(0,800,0))
        c = SimpleControllerState(throttle=1,boost=True)
        result = TeamPlay(0,{}).apply(p,c)
        self.assertFalse(result.boost)
        self.assertEqual(result.throttle,.65)

if __name__ == '__main__': unittest.main()
