"""Bounded player condition around local policies; never changes car physics.

Healthy form removes execution limits; poor condition adds modest ground
decision latency. Native bot ability remains the upper limit, not new skills.
"""
import copy
import math
import json
import time
from local_skill_progression import core_skills
from pathlib import Path
from rlbot.agents.base_agent import SimpleControllerState

def copy_controls(controls):
    if isinstance(controls,SimpleControllerState):return copy.copy(controls)
    # RLUtilities policies return pybind Input objects which cannot be copied
    # with Python's pickle-based copy.copy. Preserve every controller field.
    return SimpleControllerState(**{key:getattr(controls,key,False if key in ('jump','boost','handbrake','use_item') else 0.)
        for key in ('throttle','steer','pitch','yaw','roll','jump','boost','handbrake','use_item')})

def publish_incidents(folder,events):
    counts={}
    for event in events:
        if event.get('type')=='open_net_miss':
            slot=str(event['slot']);counts[slot]=counts.get(slot,0)+(1.5 if event.get('critical') else 1)
    target=Path(folder)/'performance-events.json';target.parent.mkdir(parents=True,exist_ok=True)
    temp=target.with_suffix('.tmp');temp.write_text(json.dumps(counts),encoding='utf-8');temp.replace(target)

def clamp(n,low=0.,high=1.):return max(low,min(high,n))
def number(data,key,default):
    try:
        n=float(data.get(key,default));return n if math.isfinite(n) else default
    except (TypeError,ValueError):return default

def performance_profile(player,mode,cutoff,level):
    if mode not in ('Easy','Medium'):return None
    c=player.get('condition') or {};traits=player.get('traits') or {};attrs=player.get('attributes') or {}
    rating=number(player,'rating',cutoff)
    form=(clamp(number(c,'form',50),0,100)-50)/50
    confidence=(clamp(number(traits,'confidence',50),0,100)-50)/50
    morale=(clamp(number(c,'morale',50),0,100)-50)/50
    fatigue=clamp(number(c,'fatigue',0),0,100)/100
    trust=clamp(number(c,'trust',50),0,100)/100
    chemistry=(clamp(number(c,'chemistry',50),0,100)+clamp(number(c,'teamChemistry',50),0,100))/200
    role=str(player.get('matchRole') or player.get('tendency','BALANCED'))
    fields=('shooting','shotAccuracy','groundControl') if 'First Man' in role or role in ('STRIKER','MECHANICAL_CARRY') else ('defense','goalkeeping','positioning') if 'Third Man' in role or role=='DEFENSIVE_ANCHOR' else ('passing','rotations','gameSense')
    width=({'Easy':{94:6,84:9,69:14,0:68},'Medium':{94:6,89:4,84:4,74:9,64:9,0:63}}[mode]).get(cutoff,10)
    training=sum(number(attrs,k,rating)-(cutoff+width*.5) for k in fields)/len(fields)
    # A continuous within-tier ability adjustment prevents OVR 89 and 93 from
    # becoming identical merely because they share an engine family.
    ability=clamp(((rating-cutoff)/width-.5)*.05,-.025,.035)+clamp(training*.006,-.035,.035)
    quality=clamp(.88+ability+form*.075+confidence*.045+morale*.03-fatigue*.13+(trust-.5)*.025,.57,1)
    cohesion=clamp(chemistry*.65+number(traits,'teamOrientation',65)/100*.25+trust*.1,.15,1)
    reaction=clamp(.02+(1-quality)*.25+fatigue*.025,.02,.15)
    return {'version':1,'skillControlVersion':1,'skills':core_skills(player),'baseCutoff':cutoff,'quality':round(quality,4),'reactionSeconds':round(reaction,4),
            'fatigue':fatigue,'cohesion':round(cohesion,4),'role':role,
            'resilience':clamp(number(traits,'pressureResistance',50)/100),
            'form':number(c,'form',50),'confidence':number(traits,'confidence',50),
            'morale':number(c,'morale',50),'trust':trust*100,'chemistry':chemistry*100,
            'state':'In form' if quality>=.95 else 'Struggling' if quality<.79 else 'Settled'}

class LocalPerformance:
    def __init__(self,index,profile,incident_folder=None):
        self.index=index;self.performance=profile.get('performance');self.last=None;self.decision_at=None;self.momentum=0.
        self.incident_file=Path(incident_folder)/'performance-events.json' if incident_folder else None
        self.next_incident_check=0.;self.miss_pressure=0.
    @property
    def enabled(self):return isinstance(self.performance,dict) and self.performance.get('version')==1
    def quality(self,packet):
        if not self.enabled:return 1.
        clock=time.monotonic()
        if self.incident_file and clock>=self.next_incident_check:
            self.next_incident_check=clock+1
            try:
                count=float(json.loads(self.incident_file.read_text(encoding='utf-8')).get(str(self.index),0))
                self.miss_pressure=min(.08,count*.018*(1-self.performance.get('resilience',.5)*.6))
            except (OSError,ValueError,TypeError):pass
        if hasattr(packet,'num_cars') and self.index<packet.num_cars:
            stats=getattr(packet.game_cars[self.index],'score_info',None)
            if stats:
                # Only confirmed positive contributions; a shot is not proof of
                # an open-net miss. Losses/misses enter the next game's snapshot.
                impact=getattr(stats,'goals',0)*.012+getattr(stats,'assists',0)*.008+getattr(stats,'saves',0)*.003
                self.momentum=min(.035,impact)
        return clamp(self.performance['quality']+self.momentum-self.miss_pressure,.57,1.)
    def apply(self,packet,controls):
        if not self.enabled or not hasattr(packet,'num_cars') or self.index>=packet.num_cars:return controls
        car=packet.game_cars[self.index];info=packet.game_info
        own_goal_y=-5120 if car.team==0 else 5120
        ball=packet.game_ball.physics.location
        danger=math.hypot(ball.x,ball.y-own_goal_y)<1800
        if (not info.is_round_active or info.is_kickoff_pause or car.is_demolished or not car.has_wheel_contact
            or car.physics.location.z>80 or controls.jump or danger or ball.z>400):
            self.last=None;self.decision_at=None;return controls
        now=float(info.seconds_elapsed)
        if self.decision_at is not None and (now<self.decision_at or now-self.decision_at>1):self.last=None;self.decision_at=None
        quality=self.quality(packet)
        reaction=clamp(self.performance['reactionSeconds']-self.momentum*.15+self.miss_pressure*.25,.02,.15)
        if self.last is not None and now-self.decision_at<reaction:return copy_controls(self.last)
        result=copy_controls(controls)
        if self.last is not None:
            response=clamp(.7+quality*.3,.85,1.)
            result.steer=self.last.steer+(controls.steer-self.last.steer)*response
        self.last=copy_controls(result);self.decision_at=now
        return result
