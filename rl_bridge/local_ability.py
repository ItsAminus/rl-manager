"""Five independent local skill controllers, using ordinary RLBot inputs only.

These are geometry/feedback controllers, not trained neural weights. The native
policy still supplies mechanics, jumps and recoveries. No state-setting API is
used. Attribute precision varies continuously, including inside one bot tier.
"""
import hashlib
import math
from local_performance import copy_controls
from local_skill_progression import core_skills

def clamp(v,lo=-1.,hi=1.):return max(lo,min(hi,v))
def xyz(v):return tuple(float(getattr(v,k,0)) for k in ('x','y','z'))
def plus(a,b):return tuple(x+y for x,y in zip(a,b))
def minus(a,b):return tuple(x-y for x,y in zip(a,b))
def times(a,k):return tuple(x*k for x in a)
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def length(a):return math.sqrt(dot(a,a))
def unit(a):return times(a,1/max(1e-6,length(a)))
def flat(a):return a[:2]+(0.,)
def distance(a,b):return length(minus(a,b))
def angle(v):return (v+math.pi)%(2*math.pi)-math.pi
def segment_gap(p,a,b):
    ab=minus(b,a);t=clamp(dot(minus(p,a),ab)/max(1,dot(ab,ab)),0,1)
    return distance(p,plus(a,times(ab,t)))

class LocalAbility:
    def __init__(self,index,profile):
        self.index=index;self.profile=profile
        self.enabled=profile.get('difficulty') in ('Easy','Medium') and (profile.get('performance') or {}).get('skillControlVersion')==1
        self.skills=core_skills({'rating':profile.get('rating',50),'attributes':profile.get('attributes',{})})
        self.phase={k:int.from_bytes(hashlib.sha256(f"{profile.get('playerId',index)}:{k}".encode()).digest()[:4],'big')/2**32*2*math.pi for k in self.skills}
        self.last_plan=None;self.active_skill=None;self.engine=str(profile.get('engine','')).lower()
        self.tactic='balanced'
    def value(self,skill):
        p=self.profile.get('performance') or {}
        # Condition adjusts execution without replacing the permanent stat.
        adjustment=(float(p.get('form',50))-50)*.06+(float(p.get('confidence',50))-50)*.03-float(p.get('fatigue',0))*8
        return clamp((self.skills[skill]+adjustment)/100,0,1)
    def precision(self,skill):
        q=self.value(skill)
        return {'skill':self.skills[skill],'effective':q*100,
                'positionError':3+900*(1-q)**1.6,
                'reactionSeconds':.012+.16*(1-q)**1.3,
                'angularError':.002+.55*(1-q)**1.5}
    def error(self,skill,now):
        # Smooth, repeatable individual imprecision; no per-frame random jitter.
        phase=self.phase[skill]
        return math.sin(now*.65+phase),math.cos(now*.47+phase)
    def aim(self,skill,target,now):
        e=self.precision(skill)['positionError'];a,b=self.error(skill,now)
        return plus(target,(e*a,e*b,0.))
    def plan(self,packet,controls):
        self.last_plan=None;self.active_skill=None
        if not self.enabled or not hasattr(packet,'num_cars') or self.index>=packet.num_cars:return None
        c=packet.game_cars[self.index];info=packet.game_info
        if (not info.is_round_active or info.is_kickoff_pause or getattr(info,'is_match_ended',False)
            or not getattr(c,'is_bot',True) or c.is_demolished or controls.jump):return None
        p=xyz(c.physics.location);b=xyz(packet.game_ball.physics.location);bv=xyz(packet.game_ball.physics.velocity)
        cv=xyz(c.physics.velocity);now=float(info.seconds_elapsed);forward=1 if c.team==0 else -1;goal=(0.,forward*5120.,0.)
        if not all(math.isfinite(v) for v in p+b+bv+cv+(now,)):return None
        mates=[(i,m) for i,m in enumerate(packet.game_cars[:packet.num_cars]) if i!=self.index and m.team==c.team and not m.is_demolished]
        foes=[m for m in packet.game_cars[:packet.num_cars] if m.team!=c.team and not m.is_demolished]
        # Existing aerials only. No takeoff, flip or boost mechanics are added.
        if c.has_wheel_contact and p[2]>100:return None # wall driving stays native
        if not c.has_wheel_contact:
            if (self.engine not in ('necto','element','nexto','botimus prime') or p[2]<250 or b[2]<250
                or not (controls.boost or abs(controls.pitch)+abs(controls.yaw)>.1)):return None
            omega=xyz(getattr(c.physics,'angular_velocity',None))
            if length(omega)>=4.0 or distance(p,b)>3000:return None
            lead=clamp(distance(p,b)/max(800,length(cv)),.08,.65)
            ideal=plus(b,times(bv,lead));err=self.precision('aerial')['positionError'];a,d=self.error('aerial',now)
            target=plus(ideal,(err*a,err*d,err*.6*a))
            return self.remember('aerial',ideal,target,c,now,lead=lead)
        gap=distance(flat(p),flat(b));toward_goal=bv[1]*forward<-200
        if controls.throttle<0:return None # preserve native braking/reversing/yielding
        # Forecast a low ball crossing our goal mouth, before it becomes an
        # emergency. Native jump saves and high/bouncing shots stay native.
        if toward_goal and b[2]<220 and abs(bv[2])<250 and b[1]*forward<-500:
            t=(-forward*5000-b[1])/bv[1]
            impact=plus(b,times(bv,max(0,t)))
            if 0<t<2.4 and abs(impact[0])<1050:
                line=-forward*clamp(abs(p[1])+250,3650,4800)
                intercept=clamp((line-b[1])/bv[1],.05,t)
                ideal=(clamp(b[0]+bv[0]*intercept,-930,930),line,0.)
                if any(distance(flat(xyz(m.physics.location)),ideal)+300<distance(flat(p),ideal) for _,m in mates):return None
                return self.remember('saving',ideal,self.aim('saving',ideal,now),c,now)
        if b[2]>200:return None
        # Maintain a carried ball over the bonnet, rather than chase it flat.
        if 100<b[2]<200 and gap<230 and abs(cv[2])<100:
            ideal=plus(flat(b),times(unit(flat(cv)),-55))
            return self.remember('dribbling',ideal,self.aim('dribbling',ideal,now),c,now,ballVelocity=bv)
        if not 220<gap<1800 or b[1]*forward<-1800:return None
        if any(distance(flat(xyz(m.physics.location)),flat(b))<gap-200 for _,m in mates):return None
        # Do not turn a deliberate off-ball demo/retreat into another chase.
        yaw=float(c.physics.rotation.yaw);heading=angle(math.atan2(b[1]-p[1],b[0]-p[0])-yaw)
        if abs(heading)>1.05 or controls.throttle<.2 or self.tactic in ('defend','demo'):return None
        shot_blocked=any(segment_gap(flat(xyz(f.physics.location)),flat(b),goal)<450 for f in foes)
        outlets=[]
        for _,mate in mates:
            mp=flat(xyz(mate.physics.location));mv=flat(xyz(mate.physics.velocity))
            if not (500<distance(mp,flat(b))<3000 and (mp[1]-b[1])*forward>400 and abs(mp[0])<3200):continue
            clearance=min((segment_gap(flat(xyz(f.physics.location)),flat(b),mp) for f in foes),default=5000)
            if clearance>350:outlets.append((clearance,mp,mv))
        plan=self.profile.get('matchTactics') or {}
        wants_pass=self.tactic=='infield' or plan.get('passingStyle')=='Passing Focus'
        if outlets and (shot_blocked or wants_pass):
            _,receiver,rv=max(outlets,key=lambda o:o[0]);travel=clamp(distance(flat(b),receiver)/1800,.2,1.25)
            lead=plus(receiver,times(rv,travel));ideal=(clamp(lead[0],-3600,3600),clamp(lead[1],-4500,4500),0.)
            # Lead estimation and contact alignment each depend on passing.
            estimate=self.precision('passing')['reactionSeconds']
            target=self.aim('passing',plus(ideal,times(rv,estimate)),now)
            return self.contact('passing',b,ideal,target,c,now)
        if b[1]*forward>200 and abs(b[0])<3300:
            keepers=[flat(xyz(f.physics.location)) for f in foes if xyz(f.physics.location)[1]*forward>3500]
            options=[(-650.,goal[1],0.),(0.,goal[1],0.),(650.,goal[1],0.)]
            ideal=max(options,key=lambda q:min((distance(q,k) for k in keepers),default=0)) if keepers else goal
            return self.contact('shooting',b,ideal,self.aim('shooting',ideal,now),c,now)
        return None
    def remember(self,skill,ideal,target,car,now,**extra):
        self.active_skill=skill;self.last_plan={'skill':skill,'ideal':ideal,'target':target,**extra}
        return self.last_plan
    def contact(self,skill,ball,ideal,destination,car,now):
        # Approach the back of the ball on the line to the intended receiver or
        # goal opening. This changes the contact direction, not the ball itself.
        velocity=xyz(car.physics.velocity);lead=self.precision(skill)['reactionSeconds']
        contact=plus(flat(ball),times(flat(velocity),-lead*.15))
        approach=plus(contact,times(unit(minus(flat(destination),flat(ball))),-230))
        error=self.precision(skill)['positionError'];a,b=self.error(skill,now)
        approach=plus(approach,(error*a*.35,error*b*.35,0.))
        return self.remember(skill,ideal,destination,car,now,approach=approach)
    def apply(self,packet,controls,tactic='balanced'):
        self.tactic=tactic
        plan=self.plan(packet,controls)
        if not plan:return controls
        c=packet.game_cars[self.index];p=xyz(c.physics.location);now=float(packet.game_info.seconds_elapsed);skill=plan['skill'];q=self.value(skill)
        result=copy_controls(controls)
        if skill=='aerial':
            r=c.physics.rotation;pitch=float(getattr(r,'pitch',0));yaw=float(r.yaw);roll=float(getattr(r,'roll',0))
            cp,sp,cy,sy,cr,sr=math.cos(pitch),math.sin(pitch),math.cos(yaw),math.sin(yaw),math.cos(roll),math.sin(roll)
            f=(cp*cy,cp*sy,sp);right=(cy*sp*sr-sy*cr,sy*sp*sr+cy*cr,-cp*sr);up=(-cr*cy*sp-sr*sy,-cr*sy*sp+sr*cy,cp*cr)
            direction=unit(minus(plan['target'],p));front=dot(direction,f)
            # Only refine flights where the bot is already pointing at the ball;
            # leave inverted recovery/fast aerial mechanics to its own policy.
            if front<.5:return controls
            pitch_error=-math.atan2(dot(direction,up),front);yaw_error=math.atan2(dot(direction,right),front)
            omega=xyz(getattr(c.physics,'angular_velocity',None))
            desired_pitch=clamp(-pitch_error*3+dot(omega,right)*.3)
            desired_yaw=clamp(yaw_error*3-dot(omega,up)*.3)
            blend=.5
            result.pitch=clamp(controls.pitch+(desired_pitch-controls.pitch)*blend)
            result.yaw=clamp(controls.yaw+(desired_yaw-controls.yaw)*blend)
            # Boost permission stays with the native policy; tracking error
            # controls when an existing boost request is useful.
            result.boost=bool(controls.boost and front> .90+(1-q)*.08)
            return result
        target=plan.get('approach',plan['target']);delta=minus(target,p);heading=angle(math.atan2(delta[1],delta[0])-float(c.physics.rotation.yaw))
        gain=2.6;desired=clamp(heading*gain)
        blend=.7
        result.steer=clamp(controls.steer+(desired-controls.steer)*blend)
        if skill=='dribbling':
            cv=xyz(c.physics.velocity);bv=plan['ballVelocity'];forward=(math.cos(c.physics.rotation.yaw),math.sin(c.physics.rotation.yaw),0.)
            offset=dot(minus(plan['target'],p),forward)
            target_speed=dot(bv,forward)+clamp(offset*2.3,-450,450)
            speed=dot(cv,forward);requested=clamp((target_speed-speed)/450)
            result.throttle=controls.throttle+(requested-controls.throttle)*.7
            result.boost=False
        elif skill=='saving':
            speed=length(flat(xyz(c.physics.velocity)));gap=distance(flat(p),flat(target))
            requested=clamp((gap*2-speed)/500,-1,1)
            result.throttle=controls.throttle+(requested-controls.throttle)*.7
        # Preserve all native jumps, flips, handbrakes and boost authority for
        # shooting/passing/saves; the refinement changes steering/contact only.
        return result
