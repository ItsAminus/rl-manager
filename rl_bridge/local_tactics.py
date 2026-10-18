"""Short-lived ground tactics for local career bots, via native quick chat.

The original policy keeps kickoffs, aerials, flips and urgent goal defence.
Commands change priorities; a completed pass or demolition is never promised.
"""
import math
import json,time
from pathlib import Path
from local_performance import copy_controls
from rlbot.utils.structures.quick_chats import QuickChats

COMMANDS={QuickChats.Information_GoForIt:('press',18,'Press forward'),
          QuickChats.Information_Defending:('defend',20,'Protect the lead'),
          QuickChats.Information_Centering:('infield',18,'Look for infield passes'),
          QuickChats.Information_Incoming:('demo',12,'Demo pressure'),
          QuickChats.Information_InPosition:('balanced',0,'Resume normal tactics')}
COMMANDS.update({QuickChats.Information_TakeTheShot:COMMANDS[QuickChats.Information_GoForIt],QuickChats.Information_IGotIt:COMMANDS[QuickChats.Information_Centering],QuickChats.Information_NeedBoost:COMMANDS[QuickChats.Information_Defending],QuickChats.Information_AllYours:COMMANDS[QuickChats.Information_GoForIt]})
def point(car):return (car.physics.location.x,car.physics.location.y)
def distance(a,b):return math.hypot(a[0]-b[0],a[1]-b[1])
def saved_order(profile):
    plan=profile.get('matchTactics') or {};chosen=(plan.get('ordersByPlayer') or {}).get(profile.get('playerId'))
    return chosen if chosen in ('balanced','press','defend','infield','demo') else ('defend' if plan.get('overallStyle')=='Defensive' else 'infield' if plan.get('passingStyle')=='Passing Focus' else 'demo' if plan.get('demoFreq')=='High' else 'press' if plan.get('overallStyle')=='Aggressive' else 'balanced')

class LocalTactics:
    def __init__(self,index,profile,team_play=None,command_folder=None):
        self.index=index;self.enabled=profile.get('difficulty') in ('Easy','Medium') and bool(profile.get('performance'))
        self.team_play=team_play;self.base_style=dict(team_play.style) if team_play else None
        self.packet=None;self.command='balanced';self.expires=0.;self.last_command=-100.;self.last_sender=None;self.ack=None
        self.base_command=saved_order(profile);self.orders_by_slot=profile.get('tacticOrdersBySlot') or {}
        self.command_folder=Path(command_folder) if command_folder else None;self.command_sequence=0;self.next_poll=0.
        self.active_command=self.base_command;self.stage='Normal role';self.target_name='';self.changed_controls=False;self.next_status=0.
    def poll_command(self):
        if not self.enabled or not self.command_folder or time.monotonic()<self.next_poll:return
        self.next_poll=time.monotonic()+.08
        try:
            data=json.loads((self.command_folder/'comms-command.json').read_text(encoding='utf-8'))
            seq=data.get('sequence',0)
            if not isinstance(seq,int) or seq<=self.command_sequence:return
            self.command_sequence=seq
            if abs(float(self.packet.game_info.seconds_elapsed)-float(data.get('elapsed',-999)))>2:return
            if self.receive(data['sender'],data['team'],data['quickChat']):
                target=self.command_folder/f'comms-ack-{self.index}.json';temporary=target.with_suffix('.tmp')
                temporary.write_text(json.dumps({'sequence':seq,'expires':self.expires}),encoding='utf-8');temporary.replace(target)
        except (OSError,ValueError,KeyError,TypeError):pass
    def receive(self,index,team,quick_chat):
        p=self.packet
        if not self.enabled or p is None or quick_chat not in COMMANDS or index<0 or index>=p.num_cars:return False
        sender=p.game_cars[index];car=p.game_cars[self.index];info=p.game_info
        if sender.is_bot or sender.team!=car.team or team!=car.team or not info.is_round_active or info.is_kickoff_pause:return False
        now=float(info.seconds_elapsed)
        if now<self.last_command:self.last_command=-100.
        if now-self.last_command<1.5:return self.last_sender==index and self.command==COMMANDS[quick_chat][0] and now<self.expires
        self.command,duration,label=COMMANDS[quick_chat];self.expires=now+duration;self.last_command=now;self.last_sender=index;self.ack=(label,duration)
        return True
    def take_ack(self):result=self.ack;self.ack=None;return result
    def drive(self,car,controls,target,boost=False):
        result=copy_controls(controls);pos=point(car);angle=math.atan2(target[1]-pos[1],target[0]-pos[0])-car.physics.rotation.yaw
        angle=(angle+math.pi)%(2*math.pi)-math.pi
        result.steer=max(-1,min(1,angle*2.4));result.throttle=1 if distance(pos,target)>250 else .1
        result.boost=bool(boost and abs(angle)<.25 and distance(pos,target)>600 and car.boost>5)
        result.jump=False;result.pitch=0;result.yaw=0;result.roll=0
        result.handbrake=abs(angle)>2.4;return result
    def prepare(self,packet):
        if not self.enabled or not hasattr(packet,'num_cars') or self.index>=packet.num_cars:return
        self.packet=packet;now=float(packet.game_info.seconds_elapsed)
        self.poll_command()
        if (now>=self.expires or now<self.last_command) and self.command!='balanced':self.command='balanced';self.ack=('',0)
        active=self.command if now<self.expires else self.base_command
        self.active_command=active
        if self.team_play and self.base_style:
            self.team_play.style=dict(self.base_style)
            if active=='press':self.team_play.style['supportDistance']*=.8
            elif active=='defend':self.team_play.style['supportDistance']*=1.3
            elif active=='infield':self.team_play.style['supportWidth']=.28
    def status(self,stage,target='',changed=False):
        self.stage=stage;self.target_name=target;self.changed_controls=changed
    def publish_status(self):
        if not self.command_folder or time.monotonic()<self.next_status:return
        self.next_status=time.monotonic()+.25
        try:
            target_file=self.command_folder/f'tactics-status-{self.index}.json';temporary=target_file.with_suffix('.tmp')
            temporary.write_text(json.dumps({'command':self.active_command,'stage':self.stage,'target':self.target_name,'changedControls':self.changed_controls,'elapsed':float(self.packet.game_info.seconds_elapsed),'sequence':self.command_sequence}),encoding='utf-8');temporary.replace(target_file)
        except OSError:pass
    def apply(self,packet,controls):
        if not self.enabled or not hasattr(packet,'num_cars') or self.index>=packet.num_cars:return controls
        try:return self.apply_order(packet,controls)
        finally:self.publish_status()
    def apply_order(self,packet,controls):
        self.prepare(packet);car=packet.game_cars[self.index];info=packet.game_info;now=float(info.seconds_elapsed);active=self.active_command
        self.status('Normal role' if active=='balanced' else 'Looking for an opening')
        if active=='balanced':return controls
        ball=(packet.game_ball.physics.location.x,packet.game_ball.physics.location.y);own_y=-5120 if car.team==0 else 5120;forward=1 if car.team==0 else -1
        if not info.is_round_active or info.is_kickoff_pause or getattr(info,'is_match_ended',False):self.status('Waiting for live play');return controls
        if car.is_demolished or not car.has_wheel_contact or car.physics.location.z>80:self.status('Recovering / airborne');return controls
        if distance(ball,(0,own_y))<1500:self.status('Protecting our goal');return controls
        mates=[(i,c) for i,c in enumerate(packet.game_cars[:packet.num_cars]) if i!=self.index and c.team==car.team and not c.is_demolished]
        enemies=[(i,c) for i,c in enumerate(packet.game_cars[:packet.num_cars]) if c.team!=car.team and not c.is_demolished]
        gap=distance(point(car),ball)
        # An airborne ball is not a reason for every off-ball teammate to ignore
        # their order. Preserve imminent native ball touches and existing flips.
        if controls.jump and gap<900:self.status('Playing the ball');return controls
        for i,mate in mates:
            a=(car.physics.location.x+car.physics.velocity.x*.25,car.physics.location.y+car.physics.velocity.y*.25)
            b=(mate.physics.location.x+mate.physics.velocity.x*.25,mate.physics.location.y+mate.physics.velocity.y*.25)
            if distance(a,b)<155 and distance(point(car),point(mate))<650 and (not mate.is_bot or i<self.index):self.status('Avoiding a teammate');return controls
        if active=='press':
            if gap>900 and not any(distance(point(c),ball)<gap-350 for _,c in mates):
                self.status('Pressing the ball',changed=True)
                return self.drive(car,controls,ball,boost=True)
            if gap>1200:
                self.status('Supporting the press',changed=True)
                return self.drive(car,controls,(max(-2700,min(2700,ball[0]*.65+(-650 if self.index%2 else 650))),max(-3800,min(3800,ball[1]-forward*700))))
        elif active=='defend':
            if gap>1200 and any(distance(point(c),ball)<gap for _,c in mates):
                target=(max(-1800,min(1800,ball[0]*.4+(-550 if self.index%2 else 550))),forward*max(-3900,min(0,ball[1]*forward-1800)))
                self.status('Covering our half',changed=True)
                return self.drive(car,controls,target)
        elif active=='infield':
            if gap>900 and any(distance(point(c),ball)<650 for _,c in mates):
                target=(max(-1500,min(1500,ball[0]*.25+(-500 if self.index%2 else 500))),max(-3800,min(3800,ball[1]-forward*850)))
                self.status('Offering an infield outlet',changed=True)
                return self.drive(car,controls,target)
            outlets=[c for _,c in mates if abs(point(c)[0])<2000 and 350<(point(c)[1]-ball[1])*forward<2200 and 650<distance(point(c),ball)<2600]
            if gap<850 and packet.game_ball.physics.location.z<220 and outlets and all(distance(point(c),ball)>700 for _,c in enemies):
                receiver=min(outlets,key=lambda c:distance(point(c),ball));to=point(receiver);length=distance(to,ball)
                approach=(ball[0]-(to[0]-ball[0])*180/length,ball[1]-(to[1]-ball[1])*180/length)
                self.status('Looking for the pass',changed=True);return self.drive(car,controls,to if gap<230 else approach)
        elif active=='demo' and enemies and gap>650:
            target_index,target=max(enemies,key=lambda item:(getattr(item[1].score_info,'goals',0)*4+getattr(item[1].score_info,'assists',0)*2+getattr(item[1].score_info,'score',0)/1000,-item[0]))
            # One hunter only; a teammate must remain behind the ball as cover.
            if not any((point(c)[1]-ball[1])*forward<-300 for _,c in mates):self.status('Waiting for defensive cover');return controls
            live_demo=self.command=='demo' and now<self.expires
            hunters=[(self.index,car)]+[(i,c) for i,c in mates if c.is_bot and c.has_wheel_contact and c.physics.location.z<80 and distance(point(c),ball)>650 and (live_demo or self.orders_by_slot.get(i,self.orders_by_slot.get(str(i)))=='demo')]
            hunters=[(i,c) for i,c in hunters if any(j!=i and not cover.is_demolished and cover.team==car.team and (point(cover)[1]-ball[1])*forward<-300 for j,cover in enumerate(packet.game_cars[:packet.num_cars]))]
            hunter=min(hunters,key=lambda item:(distance(point(item[1]),point(target)),item[0]))[0]
            if hunter==self.index:
                lead=max(.12,min(.65,distance(point(car),point(target))/3500))
                aim=(max(-3900,min(3900,target.physics.location.x+target.physics.velocity.x*lead)),max(-4900,min(4900,target.physics.location.y+target.physics.velocity.y*lead)))
                self.status('Hunting',str(getattr(target,'name',f'Opponent {target_index}')),True)
                return self.drive(car,controls,aim,boost=True)
            self.status('Covering the demo run')
        return controls
