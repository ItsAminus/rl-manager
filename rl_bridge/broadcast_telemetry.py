"""Small HUD updates; no injected game code or network matchmaking changes."""
import ctypes,sys,time,json,threading,copy
from pathlib import Path

class BroadcastTelemetry:
    def __init__(self,emit,context=None):
        self.emit=emit;self.last=0
        self.context=copy.deepcopy(context)
        if self.context:
            # Pin the HUD to one verified award per career identity. Cached
            # launch payloads and different hosted bot titles cannot rotate it.
            try:
                titles=json.loads((Path(__file__).resolve().parents[1]/'data/player-titles.json').read_text(encoding='utf-8'))
                for side in ('blue','orange'):
                    for player in self.context.get(side,{}).get('players',[]):
                        # The main process resolves an equipped, earned career
                        # award before constructing this payload. Preserve that
                        # selection; an IRL account snapshot must not replace it.
                        if player.get('title') and str(player.get('titleSource', '')).startswith('Career award · '):
                            continue
                        record=titles.get(player.get('playerId'),{})
                        title=record.get('title','')
                        player['title']=title if title in record.get('titles',[]) else ''
            except (OSError,ValueError):
                pass  # Retain the supplied context if the registry is unavailable.
        self.native_names={}
        self.comms=None
        self.presentation=None
        self.native_ids={}
        self.target=Path(context['nativeStatePath']) if context and context.get('nativeStatePath') else None
        self.session=str(time.time_ns())
        self.latest=None;self.wake=threading.Event();self.stopped=threading.Event()
        self.writer=None
        if self.target:
            self.writer=threading.Thread(target=self._write,name='fullscreen-hud-data',daemon=True)
            self.writer.start()
    def _write(self):
        while not self.stopped.is_set():
            self.wake.wait(.25);self.wake.clear()
            data=self.latest
            if not data:continue
            try:
                self.target.parent.mkdir(parents=True,exist_ok=True)
                temporary=self.target.with_suffix('.tmp')
                temporary.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
                temporary.replace(self.target)
            except OSError:pass  # display failure must never stall a live packet
    def close(self):
        self.stopped.set();self.wake.set()
        if self.writer:self.writer.join(timeout=1)
    def update_staging(self,raw,players):
        # Presentation only: these partial rosters never start a game, feed
        # commentary/statistics, or count as a played career result.
        if not self.target:return
        self.latest={'blue':int(raw['scores'][0]),'orange':int(raw['scores'][1]),
                     'remaining':float(raw['remaining']),'overtime':bool(raw['overtime']),
                     'ended':False,'staging':True,'players':players,'updated':time.time(),
                     'session':self.session,'context':self.context}
        self.wake.set()
    def window(self):
        if sys.platform!='win32':return {'foreground':False}
        from ctypes import wintypes
        user=ctypes.windll.user32
        user.GetForegroundWindow.restype=wintypes.HWND
        user.GetWindowTextW.argtypes=[wintypes.HWND,wintypes.LPWSTR,ctypes.c_int]
        user.GetClientRect.argtypes=[wintypes.HWND,ctypes.POINTER(wintypes.RECT)]
        user.ClientToScreen.argtypes=[wintypes.HWND,ctypes.POINTER(wintypes.POINT)]
        handle=user.GetForegroundWindow()
        text=ctypes.create_unicode_buffer(256);user.GetWindowTextW(handle,text,256)
        if 'rocket league' not in text.value.lower():return {'foreground':False}
        rect=wintypes.RECT();point=wintypes.POINT(0,0)
        if not user.GetClientRect(handle,ctypes.byref(rect)) or not user.ClientToScreen(handle,ctypes.byref(point)):return {'foreground':False}
        return {'foreground':True,'bounds':{'x':point.x,'y':point.y,'width':rect.right,'height':rect.bottom},
                'scoreboard':bool(user.GetAsyncKeyState(9)&0x8000)}
    def career_role(self,car):
        # RLBot can allocate the human car before configured bot slots. Resolve
        # the explicit human role or exact bot gamertag, never the bot engine or
        # a guessed array offset. Ambiguous/unmatched identities remain blank.
        if not self.context:return {}
        team=int(getattr(car,'team',-1))
        if team not in (0,1):return {}
        roster=self.context.get('orange' if team else 'blue',{}).get('players',[])
        bot=bool(getattr(car,'is_bot',False));name=str(getattr(car,'name',''))
        if bot:
            matches=[p for p in roster if not p.get('isHuman',False) and p.get('gamertag')==name]
        else:
            matches=[p for p in roster if p.get('isHuman',False)]
        if len(matches)!=1 or not matches[0].get('playerId'):return {}
        return {'playerId':matches[0]['playerId'],'gamertag':matches[0].get('gamertag','')}
    def update(self,packet):
        now=time.monotonic()
        if now-self.last<.1:return
        self.last=now
        if packet.num_teams<2 or packet.num_cars<1:return
        info=packet.game_info
        players=[{'slot':i,'name':str(getattr(c,'name','')),'team':int(getattr(c,'team',0)),
                  'is_bot':bool(getattr(c,'is_bot',False)),
                  'score':int(c.score_info.score),'goals':int(c.score_info.goals),
                  'assists':int(c.score_info.assists),'saves':int(c.score_info.saves),'shots':int(c.score_info.shots),
                  'boost':int(c.boost),**self.career_role(c)} for i,c in enumerate(packet.game_cars[:packet.num_cars])]
        for p in players:
            if p.get('playerId') in self.native_names:p['name']=self.native_names[p['playerId']]
            if p.get('playerId') in self.native_ids:p['nativeId']=self.native_ids[p['playerId']]
        data=dict(blue=int(packet.teams[0].score),orange=int(packet.teams[1].score),
                  remaining=float(info.game_time_remaining),overtime=bool(info.is_overtime),
                  kickoff=bool(info.is_kickoff_pause),ended=bool(info.is_match_ended),players=players,comms=self.comms,presentation=self.presentation)
        if self.target:
            self.latest={**data,'updated':time.time(),'session':self.session,'context':self.context}
            self.wake.set()
        else:self.emit('BROADCAST',**data,**self.window())
