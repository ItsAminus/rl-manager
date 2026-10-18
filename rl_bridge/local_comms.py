"""Relay the local human's native quick chat to bots and collect real receipts."""
import json
import time
from pathlib import Path
from local_tactics import COMMANDS

def atomic_json(path,value):
    path=Path(path);temporary=path.with_suffix('.tmp');temporary.write_text(json.dumps(value),encoding='utf-8');temporary.replace(path)

class LocalCommsBridge:
    def __init__(self,source,folder,session,emit=lambda _:None):
        self.source=Path(source) if source else None;self.folder=Path(folder);self.session=session;self.emit=emit
        self.last_poll=-1.;self.sequence=0;self.pending=None;self.expected={};self.sent_at=0.;self.reported=False;self.view=None
    def update(self,packet,clock=None):
        wall=time.time() if clock is None else clock
        if not self.source or wall-self.last_poll<.08:return self.view
        self.last_poll=wall
        try:
            if self.source.stat().st_size>4096:return self.view
            command=json.loads(self.source.read_text(encoding='utf-8'))
            seq=command.get('sequence',0);sender=command.get('sender',-1);team=command.get('team',-1);chat=command.get('quickChat',-1)
            if (command.get('session')==self.session and isinstance(seq,int) and seq>self.sequence
                and isinstance(sender,int) and 0<=sender<packet.num_cars and chat in COMMANDS
                and 0<=wall-float(command.get('created',0))<2
                and not packet.game_cars[sender].is_bot and packet.game_cars[sender].team==team
                and packet.game_info.is_round_active and not packet.game_info.is_kickoff_pause and not packet.game_info.is_match_ended):
                self.sequence=seq;self.pending=command;self.sent_at=wall;self.reported=False
                self.expected={i:str(c.name) for i,c in enumerate(packet.game_cars[:packet.num_cars]) if c.is_bot and c.team==team}
                self.view={'sequence':seq,'label':COMMANDS[chat][2],'state':'sending','acceptedBy':[],'remaining':0}
                atomic_json(self.folder/'comms-command.json',{**command,'elapsed':float(packet.game_info.seconds_elapsed)})
        except (OSError,ValueError,TypeError):pass
        if self.pending:
            accepted=[];expires=[]
            for index,name in self.expected.items():
                try:
                    ack=json.loads((self.folder/f'comms-ack-{index}.json').read_text(encoding='utf-8'))
                    if ack.get('sequence')==self.sequence:accepted.append(name);expires.append(float(ack['expires']))
                except (OSError,ValueError,KeyError,TypeError):pass
            if accepted:
                remaining=max(0,max(expires)-float(packet.game_info.seconds_elapsed))
                self.view.update(state='accepted',acceptedBy=accepted,remaining=round(remaining,1))
                if not self.reported:self.emit('Team comms accepted: '+self.view['label']+' — '+', '.join(accepted));self.reported=True
                activity=[]
                for index,name in self.expected.items():
                    try:
                        status=json.loads((self.folder/f'tactics-status-{index}.json').read_text(encoding='utf-8'))
                        age=float(packet.game_info.seconds_elapsed)-float(status['elapsed'])
                        if status.get('sequence')!=self.sequence or not 0<=age<1 or status.get('command')!=COMMANDS[self.pending['quickChat']][0]:continue
                        activity.append({'player':name,**status})
                    except (OSError,ValueError,KeyError,TypeError):pass
                self.view['activity']=activity
                label=COMMANDS[self.pending['quickChat']][2]
                if activity:
                    actual=max(activity,key=lambda row:(bool(row.get('changedControls')),row.get('stage')=='Hunting'))
                    detail=actual['stage']+((' '+actual['target']) if actual.get('target') else '')
                    self.view['label']=label+' · '+detail
                if remaining==0 and wall-self.sent_at>2.5:self.view=None;self.pending=None
            elif wall-self.sent_at>2:self.view.update(state='unconfirmed',remaining=0)
            if self.pending and wall-self.sent_at>25:self.view=None;self.pending=None
        return self.view
