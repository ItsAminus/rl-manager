import copy
import math
import unittest
from types import SimpleNamespace as N
from local_ability import LocalAbility,distance
from local_performance import performance_profile
from rlbot.agents.base_agent import SimpleControllerState as Controls

FIELDS={'passing':['passing'],'dribbling':['groundControl'],'aerial':['aerial'],'shooting':['shooting','shotAccuracy'],'saving':['defense','goalkeeping']}
def profile(value=80,identity='same-pro',skill=None):
    attrs={k:80 for fields in FIELDS.values() for k in fields}
    for key in FIELDS.get(skill,attrs):attrs[key]=value
    p={'playerId':identity,'engine':'Necto','difficulty':'Medium','rating':80,'attributes':attrs,'condition':{'form':50,'morale':50,'fatigue':0},'traits':{'confidence':50}}
    p['performance']=performance_profile(p,'Medium',79,'Diamond')
    return p
def car(x,y,team=0,bot=True,z=17):
    v=lambda a,b,c:N(x=a,y=b,z=c)
    return N(team=team,is_bot=bot,is_demolished=False,has_wheel_contact=True,boost=70,
             physics=N(location=v(x,y,z),velocity=v(0,700,0),rotation=N(pitch=0,yaw=math.pi/2,roll=0),angular_velocity=v(0,0,0)),score_info=N(goals=0,saves=0,assists=0,score=0))
def scene(skill,t=10):
    cars=[car(-2500,-1000,bot=False),car(0,1400),car(2500,-2000),car(500,4700,team=1)]
    ball=N(location=N(x=0,y=2400,z=93),velocity=N(x=0,y=80,z=0))
    p=N(num_cars=4,game_cars=cars,game_info=N(is_round_active=True,is_kickoff_pause=False,is_match_ended=False,seconds_elapsed=t),game_ball=N(physics=ball))
    c=cars[1]
    if skill=='passing':
        cars[2]=car(800,3500);cars[2].physics.velocity.x=200
        cars[3]=car(0,4000,team=1)
    elif skill=='dribbling':
        c.physics.location.y=1800;c.physics.velocity.y=1000
        ball.location.y=1920;ball.location.z=145;ball.velocity.y=1000
    elif skill=='saving':
        c.physics.location.x=220;c.physics.location.y=-4200;c.physics.rotation.yaw=-math.pi/2
        ball.location.x=300;ball.location.y=-3000;ball.velocity.x=-40;ball.velocity.y=-1500
    elif skill=='aerial':
        c.has_wheel_contact=False;c.physics.location.z=600;c.physics.rotation.pitch=.25
        ball.location.y=2400;ball.location.z=1050;ball.velocity.x=100;ball.velocity.y=300
    return p
def original(skill):return Controls(throttle=1,steer=.05,pitch=.05 if skill=='aerial' else 0,yaw=-.1 if skill=='aerial' else 0,boost=skill=='aerial')
def output_distance(a,b):return sum((getattr(a,k)-getattr(b,k))**2 for k in ('steer','throttle','pitch','yaw'))

def paired_report(samples=300):
    result={}
    for skill in FIELDS:
        errors={80:[],83:[]};controls={80:[],83:[]}
        for seed in range(samples):
            p=scene(skill,seed*.17);base=original(skill)
            oracle=LocalAbility(1,profile(100,f'pro-{seed}'));ideal=oracle.apply(p,base)
            for value in errors:
                d=LocalAbility(1,profile(value,f'pro-{seed}'));out=d.apply(p,base)
                if d.active_skill!=skill:raise AssertionError(f'{skill} did not control this scenario: {d.active_skill}')
                errors[value].append(distance(d.last_plan['ideal'],d.last_plan['target']))
                controls[value].append(output_distance(out,ideal))
        result[skill]={str(v):{'targetRms':round(math.sqrt(sum(e*e for e in errors[v])/samples),5),'controlRms':round(math.sqrt(sum(controls[v])/samples),7)} for v in errors}
    return result

class Tests(unittest.TestCase):
    def test_all_five_upgrades_change_real_output_on_the_same_engine_without_ovr_or_tier_change(self):
        for skill in FIELDS:
            a=profile(80,skill=skill);b=profile(83,skill=skill);p=scene(skill)
            self.assertEqual(a['rating'],b['rating']);self.assertEqual(a['engine'],b['engine'])
            da,db=LocalAbility(1,a),LocalAbility(1,b);oa=da.apply(p,original(skill));ob=db.apply(p,original(skill))
            self.assertEqual(da.active_skill,skill);self.assertGreater(output_distance(oa,ob),1e-10,skill)
    def test_paired_80_vs_83_scenarios_improve_target_and_control_precision_for_every_skill(self):
        for skill,values in paired_report().items():
            self.assertLess(values['83']['targetRms'],values['80']['targetRms'],skill)
            self.assertLess(values['83']['controlRms'],values['80']['controlRms'],skill)
    def test_each_skill_is_independent_of_other_contexts(self):
        for upgraded in FIELDS:
            for context in FIELDS:
                if upgraded==context:continue
                p=scene(context);base=original(context)
                a=LocalAbility(1,profile(80)).apply(p,base);b=LocalAbility(1,profile(83,skill=upgraded)).apply(p,base)
                self.assertEqual(output_distance(a,b),0,(upgraded,context))
    def test_no_stat_quantisation_or_cap_at_80_and_condition_affects_execution(self):
        for skill in FIELDS:
            errors=[LocalAbility(1,profile(v)).precision(skill)['positionError'] for v in range(80,100)]
            self.assertTrue(all(b<a for a,b in zip(errors,errors[1:])))
        a=profile();b=copy.deepcopy(a);b['performance'].update(form=15,confidence=10,fatigue=.8)
        self.assertGreater(LocalAbility(1,b).precision('shooting')['positionError'],LocalAbility(1,a).precision('shooting')['positionError'])
    def test_human_hard_and_unarmed_profiles_are_not_changed(self):
        for mode in ('Hard',None):
            a=profile();a['difficulty']=mode;p=scene('shooting');c=original('shooting')
            self.assertIs(LocalAbility(1,a).apply(p,c),c)
        a=profile();a['performance'].pop('skillControlVersion');p=scene('shooting');c=original('shooting');self.assertIs(LocalAbility(1,a).apply(p,c),c)
        p.game_cars[1].is_bot=False;self.assertIs(LocalAbility(1,profile()).apply(p,c),c)
    def test_kickoffs_replays_dodges_and_unavailable_aerial_mechanics_are_preserved(self):
        for kind in ('kickoff','replay','jump','basic-air','spinning'):
            p=scene('aerial');c=original('aerial');a=profile()
            if kind=='kickoff':p.game_info.is_kickoff_pause=True
            elif kind=='replay':p.game_info.is_round_active=False
            elif kind=='jump':c.jump=True
            elif kind=='basic-air':a['engine']='Career Rookie'
            else:p.game_cars[1].physics.angular_velocity.x=5.4
            self.assertIs(LocalAbility(1,a).apply(p,c),c)
    def test_does_not_change_physics_inputs_or_mutate_the_original_controller(self):
        for skill in FIELDS:
            p=scene(skill);c=original(skill);before=repr(p);control=repr(vars(c));out=LocalAbility(1,profile()).apply(p,c)
            self.assertEqual(repr(p),before);self.assertEqual(repr(vars(c)),control)
            self.assertEqual(out.jump,c.jump);self.assertEqual(out.handbrake,c.handbrake);self.assertEqual(out.roll,c.roll)
    def test_aerial_pitch_and_yaw_steer_towards_the_ball_not_away(self):
        p=scene('aerial');p.game_cars[1].physics.rotation.pitch=0;p.game_ball.physics.location.x=-200
        out=LocalAbility(1,profile(99)).apply(p,Controls(boost=True))
        self.assertGreater(out.pitch,0);self.assertGreater(out.yaw,0)

if __name__=='__main__':unittest.main()
