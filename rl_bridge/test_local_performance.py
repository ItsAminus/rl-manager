import unittest
from types import SimpleNamespace as N
from rlbot.agents.base_agent import SimpleControllerState
from local_performance import LocalPerformance,performance_profile
from team_play import TeamPlay

def player(good=True):
    v=95 if good else 10
    return {'rating':96,'condition':{'form':v,'morale':v,'fatigue':0 if good else 90,'trust':v,'chemistry':v,'teamChemistry':v},'traits':{'confidence':v,'teamOrientation':65},'matchRole':'First Man (Primary Striker / Disruptor)'}
def packet(t=0):
    car=N(team=0,is_bot=True,is_demolished=False,has_wheel_contact=True,physics=N(location=N(x=0,y=0,z=17),velocity=N(x=0,y=0,z=0),rotation=N(yaw=0)),score_info=N(goals=0,saves=0,assists=0))
    return N(num_cars=1,game_cars=[car],game_info=N(is_round_active=True,is_kickoff_pause=False,seconds_elapsed=t),game_ball=N(physics=N(location=N(x=500,y=0,z=93))))
class Tests(unittest.TestCase):
    def profile(self,p):return {'performance':performance_profile(p,'Medium',94,'Diamond')}
    def test_good_form_removes_execution_limits_and_bad_condition_adds_them(self):
        good=self.profile(player())['performance'];poor=self.profile(player(False))['performance']
        self.assertGreater(good['quality'],poor['quality']);self.assertLess(good['reactionSeconds'],poor['reactionSeconds']);self.assertGreater(good['cohesion'],poor['cohesion'])
        a=LocalPerformance(0,self.profile(player()));b=LocalPerformance(0,self.profile(player(False)))
        a.apply(packet(),SimpleControllerState(steer=1));b.apply(packet(),SimpleControllerState(steer=1))
        self.assertLess(a.apply(packet(.06),SimpleControllerState(steer=-1)).steer,0)
        self.assertEqual(b.apply(packet(.06),SimpleControllerState(steer=-1)).steer,1)
    def test_protects_kickoffs_aerials_flips_goal_line_and_replays(self):
        for case in ('kickoff','aerial','flip','defence','replay'):
            p=packet();controls=SimpleControllerState(steer=1);director=LocalPerformance(0,self.profile(player(False)))
            director.apply(p,controls);p.game_info.seconds_elapsed=.01;fresh=SimpleControllerState(steer=-1)
            if case=='kickoff':p.game_info.is_kickoff_pause=True
            elif case=='aerial':p.game_cars[0].has_wheel_contact=False
            elif case=='flip':fresh.jump=True
            elif case=='defence':p.game_ball.physics.location.y=-5000
            else:p.game_info.is_round_active=False
            self.assertIs(director.apply(p,fresh),fresh)
    def test_hard_is_unmodified_and_condition_does_not_change_ratings_or_physics(self):
        self.assertIsNone(performance_profile(player(),'Hard',94,'Elite'))
        c=SimpleControllerState(steer=1);self.assertIs(LocalPerformance(0,{}).apply(packet(),c),c)
        source=player(False);before=repr(source);self.profile(source);self.assertEqual(repr(source),before)
    def test_training_and_ovr_improve_within_a_tier_and_zero_confidence_is_not_defaulted(self):
        p=player();p['condition']={};p['traits']={'confidence':0};first=self.profile(p)['performance']
        p['traits']['confidence']=50;second=self.profile(p)['performance'];self.assertGreater(second['quality'],first['quality'])
        p['rating']=97;p['attributes']={'shooting':99,'shotAccuracy':99,'groundControl':99};self.assertGreater(self.profile(p)['performance']['quality'],second['quality'])
    def test_chemistry_changes_support_and_roles_follow_players(self):
        a=player();b=player(False);pa={**a,**self.profile(a)};pb={**b,**self.profile(b)}
        self.assertLess(TeamPlay(0,pa).style['yieldMargin'],TeamPlay(0,pb).style['yieldMargin'])
        a['matchRole']='Third Man / Anchor (Last Man Back / Goal Defense)'
        self.assertGreater(TeamPlay(0,{**a,**self.profile(a)}).style['supportDistance'],TeamPlay(0,pa).style['supportDistance'])
    def test_goal_contributions_add_bounded_in_match_momentum(self):
        d=LocalPerformance(0,self.profile(player(False)));p=packet();q=d.quality(p)
        p.game_cars[0].score_info.goals=3;self.assertGreater(d.quality(p),q);self.assertLessEqual(d.quality(p)-q,.035001)
    def test_only_confirmed_misses_apply_live_pressure_and_resilience_limits_it(self):
        import tempfile
        from pathlib import Path
        from local_performance import publish_incidents
        root=Path(__file__).parent/'commentary/cache'
        with tempfile.TemporaryDirectory(dir=root) as folder:
            a=player();b=player();a['traits']['pressureResistance']=0;b['traits']['pressureResistance']=100
            da=LocalPerformance(0,self.profile(a),folder);db=LocalPerformance(0,self.profile(b),folder)
            qa=da.quality(packet());qb=db.quality(packet())
            publish_incidents(folder,[{'type':'open_net_miss','slot':0,'critical':True}]*4+[{'type':'shot','slot':0}]*20)
            da.next_incident_check=0;db.next_incident_check=0
            self.assertGreater(qa-da.quality(packet()),qb-db.quality(packet()))
            self.assertLessEqual(qa-da.quality(packet()),.080001)
    def test_non_pickleable_policy_controls_are_supported(self):
        class NativeInput:
            throttle=.7;steer=.4;boost=True;jump=False;pitch=.2;yaw=.3;roll=.5;handbrake=False
            def __reduce_ex__(self,_):raise TypeError('cannot pickle native Input')
        d=LocalPerformance(0,self.profile(player()));out=d.apply(packet(),NativeInput())
        self.assertIsInstance(out,SimpleControllerState);self.assertEqual(out.throttle,.7);self.assertEqual(out.roll,.5);self.assertTrue(out.boost)
if __name__=='__main__':unittest.main()
