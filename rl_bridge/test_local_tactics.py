import copy
import math
import unittest
from types import SimpleNamespace as N
from local_tactics import LocalTactics
from team_play import TeamPlay
from test_local_performance import packet
from rlbot.agents.base_agent import SimpleControllerState
from rlbot.utils.structures.quick_chats import QuickChats as Q

def scenario():
    p=packet(10);original=p.game_cars[0];p.game_cars=[copy.deepcopy(original) for _ in range(5)];p.num_cars=5
    for i,c in enumerate(p.game_cars):
        c.is_bot=i!=0;c.team=0 if i<3 else 1;c.boost=60
        c.physics.location.x,c.physics.location.y=[(0,1450),(1200,-2000),(-500,-3500),(1800,2500),(-1800,2400)][i]
        c.physics.rotation.yaw=math.pi/2;c.score_info.goals=5 if i==3 else 0
    p.game_ball.physics.location.x=0;p.game_ball.physics.location.y=1500
    return p

class Tests(unittest.TestCase):
    def director(self,mode='Medium'):
        profile={'difficulty':mode,'performance':{'cohesion':.65,'role':'BALANCED'}};play=TeamPlay(1,profile)
        return LocalTactics(1,profile,play)
    def issue(self,d,p,q):
        d.apply(p,SimpleControllerState());self.assertTrue(d.receive(0,0,q))
    def test_only_allied_human_can_issue_orders_and_hard_is_untouched(self):
        p=scenario();d=self.director();d.apply(p,SimpleControllerState())
        self.assertFalse(d.receive(3,1,Q.Information_GoForIt));self.assertFalse(d.receive(2,0,Q.Information_GoForIt))
        self.assertFalse(d.receive(0,1,Q.Information_GoForIt));self.assertTrue(d.receive(0,0,Q.Information_GoForIt));self.assertFalse(d.receive(0,0,Q.Information_Defending))
        h=self.director('Hard');c=SimpleControllerState();self.assertIs(h.apply(p,c),c);self.assertFalse(h.receive(0,0,Q.Information_GoForIt))
    def test_orders_expire_and_restore_support_style(self):
        p=scenario();d=self.director();base=dict(d.team_play.style);self.issue(d,p,Q.Information_GoForIt)
        d.apply(p,SimpleControllerState());self.assertLess(d.team_play.style['supportDistance'],base['supportDistance'])
        p.game_info.seconds_elapsed=29;d.apply(p,SimpleControllerState());self.assertEqual(d.command,'balanced');self.assertEqual(d.team_play.style,base)
        self.assertEqual(d.take_ack(),('',0))
    def test_defending_and_infield_orders_change_ground_positions(self):
        for command in [Q.Information_Defending,Q.Information_Centering]:
            p=scenario();d=self.director();self.issue(d,p,command);c=SimpleControllerState(steer=-.123,boost=True)
            result=d.apply(p,c);self.assertNotEqual(result.steer,c.steer);self.assertFalse(result.boost)
    def test_pass_attempt_aims_ground_contact_towards_ahead_infield_teammate(self):
        p=scenario();p.game_cars[1].physics.location.x=0;p.game_cars[1].physics.location.y=1100
        p.game_cars[0].physics.location.x=1000;p.game_cars[0].physics.location.y=2400
        p.game_cars[3].physics.location.x=4000;p.game_cars[4].physics.location.x=-4000
        d=self.director();self.issue(d,p,Q.Information_Centering);c=SimpleControllerState(steer=.7)
        self.assertGreater(d.apply(p,c).steer,0) # approach on the opposite side of the ball from the outlet
    def test_demo_uses_one_off_ball_hunter_and_requires_defensive_cover(self):
        p=scenario();p.game_cars[1].physics.location.x=1000;p.game_cars[1].physics.location.y=2300;p.game_cars[1].physics.rotation.yaw=0
        d=self.director();self.issue(d,p,Q.Information_Incoming);c=SimpleControllerState(steer=-.8)
        self.assertGreater(d.apply(p,c).steer,0) # higher-scoring enemy at positive x/y
        p.game_cars[0].physics.location.y=1600;p.game_cars[2].physics.location.y=1800
        self.assertIs(d.apply(p,c),c)
    def test_kickoffs_aerials_flips_replays_and_goal_line_defence_keep_original_policy(self):
        for case in ['kickoff','aerial','flip','replay','goal-line']:
            p=scenario();d=self.director();self.issue(d,p,Q.Information_Defending);c=SimpleControllerState(steer=.4)
            if case=='kickoff':p.game_info.is_kickoff_pause=True
            elif case=='aerial':p.game_cars[1].has_wheel_contact=False
            elif case=='flip':c.jump=True;p.game_cars[1].physics.location.x=0;p.game_cars[1].physics.location.y=1000
            elif case=='replay':p.game_info.is_round_active=False
            elif case=='goal-line':p.game_ball.physics.location.y=-4800
            self.assertIs(d.apply(p,c),c)
    def test_ground_support_continues_while_the_ball_is_high(self):
        p=scenario();p.game_ball.physics.location.z=650;d=self.director();self.issue(d,p,Q.Information_Defending)
        c=SimpleControllerState(steer=.4);self.assertIsNot(d.apply(p,c),c);self.assertEqual(d.stage,'Covering our half')
    def test_only_bots_given_a_demo_order_can_be_the_saved_plan_hunter(self):
        p=scenario();p.game_cars[1].physics.location.x=1000;p.game_cars[1].physics.location.y=2300
        # The other AI is closer to the target, but has a defending order.
        p.game_cars[2].physics.location.x=1800;p.game_cars[2].physics.location.y=2450
        p.game_cars[0].physics.location.y=-500
        profile={'playerId':'p1','difficulty':'Medium','performance':{'quality':.9},'matchTactics':{'ordersByPlayer':{'p1':'demo'}},'tacticOrdersBySlot':{1:'demo',2:'defend'}}
        d=LocalTactics(1,profile);c=SimpleControllerState(jump=True)
        result=d.apply(p,c);self.assertEqual(d.stage,'Hunting');self.assertTrue(d.changed_controls);self.assertFalse(result.jump)
    def test_demo_can_hunt_in_our_half_with_a_high_ball_when_someone_covers(self):
        p=scenario();p.game_ball.physics.location.y=-400;p.game_ball.physics.location.z=600
        p.game_cars[1].physics.location.y=300;p.game_cars[2].physics.location.y=-3000
        d=self.director();self.issue(d,p,Q.Information_Incoming);d.apply(p,SimpleControllerState())
        self.assertEqual(d.stage,'Hunting');self.assertTrue(d.changed_controls)
    def test_orange_team_defends_its_own_end(self):
        p=scenario()
        for c in p.game_cars:c.team=1-c.team;c.physics.location.y*=-1;c.physics.location.x*=-1;c.physics.rotation.yaw=-math.pi/2
        p.game_ball.physics.location.y*=-1;d=self.director();d.apply(p,SimpleControllerState());self.assertTrue(d.receive(0,1,Q.Information_Defending))
        result=d.apply(p,SimpleControllerState());self.assertTrue(math.isfinite(result.steer));self.assertFalse(result.boost)
    def test_saved_timeout_order_is_active_without_chat_and_returns_after_live_order(self):
        p=scenario();profile={'playerId':'teammate','difficulty':'Medium','performance':{'cohesion':.65,'role':'BALANCED'},'matchTactics':{'ordersByPlayer':{'teammate':'defend'}}}
        d=LocalTactics(1,profile,TeamPlay(1,profile));c=SimpleControllerState(steer=-.123,boost=True)
        self.assertNotEqual(d.apply(p,c).steer,c.steer)
        self.assertTrue(d.receive(0,0,Q.Information_GoForIt));self.assertEqual(d.command,'press')
        p.game_info.seconds_elapsed+=19;d.apply(p,c)
        self.assertEqual(d.command,'balanced');self.assertEqual(d.base_command,'defend')
        self.assertNotEqual(d.apply(p,c).steer,c.steer)
if __name__=='__main__':unittest.main()
