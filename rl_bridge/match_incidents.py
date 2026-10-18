"""Conservative, auditable match highlights independent of commentary playback.
An unconverted shot is never assumed to be an open-net miss.
"""
import math

def distance(a,b):return math.sqrt(sum((x-y)**2 for x,y in zip(a,b)))
def vec(p):return (float(p.x),float(p.y),float(p.z))

class IncidentTracker:
    def __init__(self):
        self.events=[];self.previous=None;self.candidate=None
    def add(self,kind,slot,packet,evidence):
        if len(self.events)>=256:return
        info=packet.game_info;car=packet.game_cars[slot]
        score=[int(packet.teams[t].score) for t in range(2)]
        self.events.append({'type':kind,'slot':slot,'team':int(car.team),
            'remaining':float(info.game_time_remaining),'overtime':bool(info.is_overtime),
            'critical':bool(info.is_overtime or (info.game_time_remaining<=60 and abs(score[0]-score[1])<=1)),
            'evidence':evidence})
    def update(self,packet):
        if packet.num_teams<2 or packet.num_cars<1:return
        info=packet.game_info;ball=packet.game_ball
        now=float(info.seconds_elapsed);pos=vec(ball.physics.location);vel=vec(ball.physics.velocity)
        score=tuple(int(packet.teams[t].score) for t in range(2))
        touch=ball.latest_touch;touch_key=(int(touch.player_index),float(touch.time_seconds))
        cars=[{'goals':int(c.score_info.goals),'shots':int(c.score_info.shots),'saves':int(c.score_info.saves),
               'demos':int(c.score_info.demolitions),'demolished':bool(c.is_demolished),'position':vec(c.physics.location)} for c in packet.game_cars[:packet.num_cars]]
        old=self.previous
        if old and (now<old['now']-.5 or any(a<b for a,b in zip(score,old['score']))):
            self.events.clear();self.candidate=None;old=None
        active=info.is_round_active and not info.is_kickoff_pause and not info.is_match_ended
        if old:
            for slot,car in enumerate(cars):
                if slot>=len(old['cars']):continue
                prev=old['cars'][slot]
                if car['goals']>prev['goals']:
                    self.add('goal',slot,packet,{'score':score,'counter':'goals'})
                if car['saves']>prev['saves']:
                    self.add('save',slot,packet,{'counter':'saves','count':car['saves']-prev['saves']})
                # Demo credit comes from the attacking player's demo counter.
                if car['demos']>prev['demos'] and active:
                    team=packet.game_cars[slot].team;net=(0,5120 if team==0 else -5120,0)
                    victims=[i for i,p in enumerate(cars) if packet.game_cars[i].team!=team and p['demolished'] and not old['cars'][i]['demolished']]
                    if len(victims)==1:
                        victim=victims[0];others=[p for i,p in enumerate(cars) if packet.game_cars[i].team!=team and i!=victim and not p['demolished']]
                        towards=vel[1]*(1 if team==0 else -1)>500 and abs(pos[0])<1800 and abs(pos[1])>3000
                        if towards and distance(old['cars'][victim]['position'],net)<1800 and all(distance(p['position'],net)>2300 for p in others):
                            self.add('critical_demo',slot,packet,{'victimSlot':victim,'lastDefender':True})
                if active and car['shots']>prev['shots'] and touch_key[0]==slot and now-touch_key[1]<=.6:
                    team=int(packet.game_cars[slot].team);sign=1 if team==0 else -1;net=(0,sign*5120,0)
                    defenders=[p for i,p in enumerate(cars) if packet.game_cars[i].team!=team and not p['demolished']]
                    if pos[1]*sign>3100 and vel[1]*sign>500 and all(distance(p['position'],net)>2300 for p in defenders):
                        self.candidate={'slot':slot,'touch':touch_key,'score':score,'sign':sign,'at':now}
        pending=self.candidate
        if pending:
            if not active or score!=pending['score'] or touch_key!=pending['touch'] or now-pending['at']>3:
                self.candidate=None
            elif pos[1]*pending['sign']>4950 and (abs(pos[0])>1000 or pos[2]>800):
                self.add('open_net_miss',pending['slot'],packet,{'registeredShot':True,'noGoalDefender':True,'noInterveningTouch':True,'missPosition':pos})
                self.candidate=None
        self.previous={'now':now,'score':score,'cars':cars}
