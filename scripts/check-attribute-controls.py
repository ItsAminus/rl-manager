"""Offline paired control benchmark. Does not launch Rocket League or use a GPU.

Target/control errors are scenario measures, not match win rates or shooting
percentages. Optional RLUtilities checks a native airborne physics rollout.
"""
import json,sys,time,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'rl_bridge'))
from test_local_ability import paired_report,profile,scene,original
from local_ability import LocalAbility,xyz,distance,unit,minus,dot
from rlbot.agents.base_agent import SimpleControllerState
from types import SimpleNamespace as N

report={'scenarioPairsPerSkill':500,'sameEngine':'Necto','sameOVR':80,
        'method':'Identical game snapshots, native controller requests, identity, form, OVR and bot engine. Five attributes at 80 versus 83. Control RMS is measured against the same controller with 100 attributes, not human gameplay.',
        'skills':paired_report(500)}
cases=[(LocalAbility(1,profile()),scene(k),original(k)) for k in report['skills']]
start=time.perf_counter()
for i in range(20000):
    d,p,c=cases[i%len(cases)];p.game_info.seconds_elapsed=i/120;d.apply(p,c)
report['meanControllerMs']=(time.perf_counter()-start)*1000/20000

sdk=Path.home()/'AppData/Local/RLBotGUIX/RLBotPackDeletable/RLBotPack-master/RLBotPack/MirrorBot/src'
if sdk.is_dir():
    sys.path.insert(0,str(sdk))
    try:
        from rlutilities.simulation import Car,Input
        from rlutilities.linear_algebra import vec3,euler_to_rotation,rotation_to_euler
        values={80:[],83:[]}
        for seed in range(80):
            for skill in values:
                c=Car();c.position=vec3(0,1200,700);c.velocity=vec3(850,0,120);c.orientation=euler_to_rotation(vec3(.1,0,0));c.on_ground=False;c.jumped=True;c.double_jumped=True;c.jump_timer=-1;c.dodge_timer=-1;c.boost=100
                p=scene('aerial',seed*.17);me=p.game_cars[1];p.game_ball.physics.location=N(x=1500,y=1400,z=1150);p.game_ball.physics.velocity=N(x=0,y=0,z=0)
                d=LocalAbility(1,profile(skill,f'flight-{seed}'));error=0
                for tick in range(90):
                    r=rotation_to_euler(c.orientation);me.physics.location=N(x=c.position[0],y=c.position[1],z=c.position[2]);me.physics.velocity=N(x=c.velocity[0],y=c.velocity[1],z=c.velocity[2]);me.physics.angular_velocity=N(x=c.angular_velocity[0],y=c.angular_velocity[1],z=c.angular_velocity[2]);me.physics.rotation=N(pitch=r[0],yaw=r[1],roll=r[2]);p.game_info.seconds_elapsed=seed*.17+tick/120
                    out=d.apply(p,SimpleControllerState(boost=True));inp=Input()
                    for key in ('throttle','steer','pitch','yaw','roll','jump','boost','handbrake'):setattr(inp,key,getattr(out,key))
                    c.step(inp,1/120)
                    forward=tuple(c.forward()[i] for i in range(3));towards=unit(minus(xyz(p.game_ball.physics.location),tuple(c.position[i] for i in range(3))))
                    error+=math.acos(max(-1,min(1,dot(forward,towards))))**2
                values[skill].append(error/90)
        report['rlutilitiesAerial']={'description':'80 paired 0.75-second airborne target-tracking rollouts using bundled RLUtilities car physics; identical native boost request. Static tracking target, not a played match.',
                                    'rmsRadians':{str(k):math.sqrt(sum(v)/len(v)) for k,v in values.items()}}
    except ImportError as e:report['rlutilitiesAerial']={'unavailable':str(e)}
folder=ROOT/'scratch/attribute-controls';folder.mkdir(parents=True,exist_ok=True)
(folder/'paired-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
