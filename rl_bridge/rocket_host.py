"""Official Rocket Host requests plus opt-in BakkesMod LAN match telemetry."""
import copy
import ipaddress
import json
import os
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request
import uuid
from rating_bots import rating_plan,flatten_catalog,canonical
from host_bot_health import StalledBotsError, quarantine, family_key

BOT_LIST='https://rockethost.jetfox.ovh/api/botList2.json'
SERVER_LIST='http://serverlist.jetfox.ovh/servers'
MAPS={'Mannfield_Dusk':'eurostadium_dusk_p','ForbiddenTemple':'CHN_Stadium_P',
    'UF_Night_P':'UF_Night_P','UtopiaColiseum_Dusk':'UtopiaStadium_Dusk_P',
    'SovereignHeights':'Street_P','NeoTokyo':'NeoTokyo_Standard_P','ChampionsField':'cs_p'}

def read_url(url,timeout=15):
    with urllib.request.urlopen(url,timeout=timeout) as response:
        return response.read(1024*1024).decode('utf-8')

def server_address(server):
    host=str(server['ip']);port=int(server['port'])
    if not ipaddress.ip_address(host).is_global or not 1<=port<=65535:raise ValueError('Invalid Rocket Host server address')
    return f'{host}:{port}'

def request_url(server,context,assignments):
    arena=context.get('arenaUpk') or MAPS.get(context.get('arena'),'eurostadium_dusk_p')
    if not re.fullmatch(r'[A-Za-z0-9_]+',arena):raise ValueError('Invalid Rocket Host map')
    bots=lambda side:','.join(a['engine'] for a in assignments if a['team']==side and a['type']!='Human')
    for a in assignments:
        if a['engine'] and not re.fullmatch(r'[A-Za-z0-9_.+-]+',a['engine']):raise ValueError('Invalid hosted bot identifier')
    query=urllib.parse.urlencode({'mapName':arena,'gameMode':'TAGame.GameInfo_Soccar_TA',
        'mutators':'BotsNone,PlayerCount8','networkOptions':'?NumPublicConnections=10?NumOpenPublicConnections=10?Lan?Listen',
        'rlbot':'yes','blueBots':bots(0),'orangeBots':bots(1)})
    return 'http://'+server_address(server)+'/?'+query

def validate_join_address(text):
    address=text.strip();match=re.fullmatch(r'(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})',address)
    if not match or not ipaddress.ip_address(match[1]).is_global or not 1<=int(match[2])<=65535:
        raise ValueError('Rocket Host did not return a valid game address: '+address[:180])
    return address

def engine_matches(name,engine):
    # The catalog uses NextoPlus; the server's PRI uses Nexto+. Keep
    # the plus distinct from Nexto, and accept numeric server version labels
    # such as Opti-V2.2 without matching different policies like OptiFR.
    raw=canonical(re.sub(r'^Bot[_ -]+','',name,flags=re.I).replace('+','Plus'))
    wanted=canonical(engine.replace('+','Plus'))
    # Observed Rocket Host PRI label for the advertised Kiyo3 policy.
    # Keep Kiyo (the separate older policy) distinct, including duplicates.
    if wanted=='kiyo3' and raw=='kiyo30':raw='kiyo3'
    # AstraV5 is the advertised request ID, but its live PRI is simply Astra.
    # Do not strip arbitrary versions: e.g. Nexto and Nexto+ are distinct.
    if wanted=='astrav5' and (raw=='astra' or re.fullmatch(r'astra\d+',raw)):
        raw='astrav5'+raw[len('astra'):]
    # Rocket Host's Byte catalog entry currently spawns a Kilobyte PRI.
    # Normalize only that exact policy alias, including duplicate suffixes.
    if wanted=='byte' and (raw=='kilobyte' or re.fullmatch(r'kilobyte\d+',raw)):
        raw='byte'+raw[len('kilobyte'):]
    if raw==wanted:return True
    # Kiyo and Kiyo3 are separate advertised policies, not duplicate car IDs.
    # Parenthesized duplicate labels were already removed by canonical().
    if wanted in ('kiyo','kiyo3'):return False
    suffix=raw[len(wanted):] if raw.startswith(wanted) else ''
    return bool(suffix and ((suffix.isdigit() and not wanted[-1:].isdigit()) or re.fullmatch(r'v\d+',suffix)))

class HostedPacketReader:
    def __init__(self,assignments):
        self.assignments=assignments;self.bindings={};self.native_names={};self.native_ids={};self.touches={};self.touch_owner=-1;self.touch_time=0
        self.first_stamp=None
        self.active_bots=set();self.activity={};self.activity_stamp=None
        self.staged_bindings={}

    def staging_players(self,raw):
        """Bind arriving bots before human team entry, retaining duplicate roles."""
        people=[p for p in raw.get('players',[]) if p.get('isBot')]
        used=set();result=[]
        for a in self.assignments:
            if a['type']=='Human':continue
            candidates=[p for p in people if p['nativeId'] not in used and p['team']==a['team'] and engine_matches(p['name'],a['engine'])]
            if not candidates:continue
            previous=self.staged_bindings.get(a['slot'])
            selected=next((p for p in candidates if p['nativeId']==previous),None) or min(candidates,key=lambda p:int(p['nativeId']))
            used.add(selected['nativeId']);self.staged_bindings[a['slot']]=selected['nativeId']
            result.append({**selected,'slot':a['slot'],'is_bot':True,'playerId':a['playerId'],'gamertag':a['name']})
        return result

    def bots_present(self,raw):
        people=[p for p in raw.get('players',[]) if p.get('isBot')]
        expected=[a for a in self.assignments if a['type']!='Human']
        if len(people)!=len(expected):return False
        used=set()
        for a in expected:
            candidates=[p for p in people if p['nativeId'] not in used and p['team']==a['team'] and engine_matches(p['name'],a['engine'])]
            if not candidates:return False
            used.add(min(candidates,key=lambda p:int(p['nativeId']))['nativeId'])
        return True

    def check_activity(self,raw,timeout=20):
        stamp=float(raw['updated'])
        # Count fresh live-play seconds, excluding replays, pauses and respawns.
        # A long telemetry gap must not look like twenty seconds of inactivity.
        dt=max(0,min(1,stamp-self.activity_stamp)) if self.activity_stamp is not None else 0
        self.activity_stamp=stamp
        live=bool(raw['active']) and not raw['ended']
        pending=[]
        people={p['nativeId']:p for p in raw['players']}
        for a in self.assignments:
            if a['type']=='Human':continue
            p=people.get(self.bindings.get(a['slot']))
            if p is None:
                if not raw['ended']:pending.append(a)
                continue
            physics=p.get('physics',{});position=physics.get('location',(0,0,0));velocity=physics.get('velocity',(0,0,0))
            state=self.activity.setdefault(p['nativeId'],{'position':position,'touches':p.get('touches',0),'idle':0,'live':False})
            displaced=sum((x-y)**2 for x,y in zip(position,state['position']))>35**2
            moved=displaced and sum(v*v for v in velocity)>80**2
            touched=p.get('touches',0)>state['touches']
            if live and not p.get('demolished') and state['live'] and (moved or touched):
                state['idle']=0
                self.active_bots.add(p['nativeId'])
            elif live and state['live'] and not p.get('demolished'):
                state['idle']+=dt
            if p.get('demolished'):state['idle']=0
            # Accumulate small movements too; slow rotation through pads is play.
            if moved or touched or not live or not state['live'] or p.get('demolished'):
                state['position']=position
            state.update(touches=p.get('touches',0),live=live and not p.get('demolished'))
            if live and state['idle']>=timeout:pending.append(a)
        if pending:
            if len(pending)==sum(a['type']!='Human' for a in self.assignments):
                # A frozen server is not proof that every bot policy is broken.
                raise RuntimeError('All hosted bots are inactive; the server may be stalled. No career result recorded and no bot families blacklisted. Retry this game.')
            raise StalledBotsError(pending)
    def bind(self,raw):
        people=raw.get('players',[])
        if len(people)!=len(self.assignments):return False
        used=set();bindings={};names={}
        for a in self.assignments:
            candidates=[p for p in people if p['nativeId'] not in used and p['team']==a['team'] and
                (not p['isBot'] and p.get('locallyControlled',False) if a['type']=='Human' else p['isBot'] and engine_matches(p['name'],a['engine']))]
            if not candidates:return False
            # Duplicate instances of one policy are equivalent; stable native
            # IDs distinguish their career roles for the entire game.
            previous=self.staged_bindings.get(a['slot'])
            selected=next((p for p in candidates if p['nativeId']==previous),None) or min(candidates,key=lambda p:int(p['nativeId']))
            bindings[a['slot']]=selected['nativeId'];names[a['playerId']]=selected['name'];used.add(selected['nativeId'])
        self.bindings,self.native_names=bindings,names
        self.native_ids={a['playerId']:bindings[a['slot']] for a in self.assignments}
        return True
    def packet(self,raw):
        from rlbot.utils.structures.game_data_struct import GameTickPacket
        packet=GameTickPacket();packet.num_teams=2;packet.num_cars=len(self.assignments)
        for i,score in enumerate(raw['scores']):packet.teams[i].score=int(score)
        # The hosted client does not replicate TotalGameTimePlayed (observed 0).
        # Use its capture clock for continuous touch/incident timestamps.
        stamp=float(raw.get('updated',raw['elapsed']))
        if self.first_stamp is None:self.first_stamp=stamp
        info=packet.game_info;info.seconds_elapsed=max(0,stamp-self.first_stamp);info.game_time_remaining=float(raw['remaining'])
        info.is_overtime=raw['overtime'];info.is_match_ended=raw['ended'];info.is_round_active=raw['active']
        ball=raw['ball'];position=ball.get('location',(0,0,0));velocity=ball.get('velocity',(0,0,0))
        info.is_kickoff_pause=(not raw['active'] and not raw['ended'] and abs(position[0])<10 and abs(position[1])<10 and sum(v*v for v in velocity)<900)
        people={p['nativeId']:p for p in raw['players']}
        new_touches=[]
        for a in self.assignments:
            p=people.get(self.bindings[a['slot']])
            if not p:raise ValueError('A Rocket Host participant left; career result cannot be safely recorded')
            car=packet.game_cars[a['slot']];car.name=a['name'];car.team=a['team'];car.is_bot=a['type']!='Human'
            car.boost=max(0,min(100,int(p.get('boost',0))));car.has_wheel_contact=p.get('grounded',False);car.is_demolished=p.get('demolished',False)
            self.physics(car.physics,p.get('physics',{}))
            for key in ('score','goals','assists','saves','shots','demolitions'):setattr(car.score_info,key,max(0,int(p.get(key,0))))
            count=p.get('touches',0)
            if a['slot'] in self.touches and count>self.touches[a['slot']]:new_touches.append(a['slot'])
            self.touches[a['slot']]=count
        self.physics(packet.game_ball.physics,raw['ball'])
        if len(new_touches)==1:
            self.touch_owner=new_touches[0];self.touch_time=float(info.seconds_elapsed)
        elif len(new_touches)>1:self.touch_owner=-1
        touch=packet.game_ball.latest_touch;touch.player_index=self.touch_owner;touch.time_seconds=self.touch_time
        if self.touch_owner>=0:touch.player_name=self.assignments[self.touch_owner]['name']
        return packet
    @staticmethod
    def physics(target,data):
        for field,key in [('location','location'),('velocity','velocity'),('angular_velocity','angularVelocity')]:
            for axis,value in zip(('x','y','z'),data.get(key,(0,0,0))):setattr(getattr(target,field),axis,float(value))
        for axis,value in zip(('pitch','yaw','roll'),data.get('rotation',(0,0,0))):setattr(target.rotation,axis,float(value))


class HostedEntryGate:
    """Release the spectator lock promptly, then confirm the human's car.

    Sending a command isn't proof of entry. Keep retrying it until fresh
    telemetry binds all six career roles, with a short bounded entry timeout.
    """
    def __init__(self,reader,send_ready,log,roster_timeout=120,entry_timeout=15):
        self.reader=reader;self.send_ready=send_ready;self.log=log
        self.roster_timeout=roster_timeout;self.entry_timeout=entry_timeout
        self.began=None;self.released=False;self.entry_deadline=None
        self.next_request=0;self.next_progress=0;self.last_error=''

    @staticmethod
    def validate_start(raw):
        if raw['ended'] or raw['scores']!=[0,0] or raw['remaining']<295:
            raise RuntimeError('Rocket Host started before your car joined. No career result recorded; retry this game.')

    def advance(self,raw,now):
        if self.began is None:self.began=now
        if not self.released:
            if not self.reader.bots_present(raw):
                if now>=self.next_progress:
                    matched=len(self.reader.staging_players(raw))
                    expected=sum(a['type']!='Human' for a in self.reader.assignments)
                    names=', '.join(p['name'] for p in raw.get('players',[]) if p.get('isBot'))
                    self.log(f'Waiting for assigned bot identities: {matched}/{expected} matched; host reports {names or "no bots yet"}')
                    self.next_progress=now+5
                if now-self.began>=self.roster_timeout:
                    raise RuntimeError('Rocket Host did not supply the complete assigned bot roster before team entry')
                return False
            self.validate_start(raw)
            self.released=True;self.entry_deadline=now+self.entry_timeout
            self.log('All five assigned bots confirmed; joining your selected team now')
        if self.reader.bind(raw):
            self.validate_start(raw)
            return True
        if now>=self.entry_deadline:
            detail=(' Control connection: '+self.last_error+'.') if self.last_error else ''
            raise RuntimeError('All five bots joined, but your locally controlled car did not enter the assigned team within 15 seconds.'+detail+' No career result recorded; retry this game.')
        if now>=self.next_request:
            self.next_request=now+1
            try:self.send_ready();self.last_error=''
            except Exception as exc:
                self.last_error=str(exc)
                self.log('Team-entry command needs retry; waiting for your car to spawn')
        return False

def launch(context,rl_path,result_path,enable_commentary=True):
    """Retry the same series game after excluding a failed policy, at most twice."""
    from launcher import log_event
    retry_context=copy.deepcopy(context)
    for attempt in range(3):
        try:
            return _launch_once(retry_context,rl_path,result_path,enable_commentary)
        except StalledBotsError as exc:
            blocked=set(retry_context.get('_excludedHostedBots',[]))
            blocked.update(family_key(a['engine']) for a in exc.assignments)
            retry_context['_excludedHostedBots']=sorted(blocked)
            try:quarantine(exc.assignments,context.get('rocketHostRegion','US-CENTRAL'))
            except OSError as error:
                log_event('STATUS',message=f'Bot health warning: exclusions remain active for this launch; could not save them ({error})')
            if attempt==2:
                raise RuntimeError(str(exc)+' Automatic recovery exhausted two retries. Previous completed series games remain saved; retry this game with healthy bots.') from exc
            names=', '.join(a['name']+' ('+a['engine']+')' for a in exc.assignments)
            log_event('BOT_RECOVERY',message=f'{names} stopped playing. Excluding the failed bots and restarting game {context.get("gameNumber",1)} with replacements from the same rating tier (retry {attempt+1}/2). Previous completed games remain saved.',gameNumber=context.get('gameNumber',1))


def _launch_once(context,rl_path,result_path,enable_commentary=True):
    from bakkesmod_startup import connect_with_hud,rcon_commands,folder,process_ids,allow_career_commands
    from launcher import log_event,create_commentary,finish_played_match
    from broadcast_telemetry import BroadcastTelemetry
    from match_incidents import IncidentTracker
    log=lambda text:log_event('STATUS',message=text)
    # Fetch the authoritative catalog before starting a game or reserving a server.
    catalog=flatten_catalog(json.loads(read_url(BOT_LIST)))
    selected=rating_plan(context,catalog,lock_series=True);assignments=selected['assignments']
    servers=json.loads(read_url(SERVER_LIST))
    if not servers:raise RuntimeError('Rocket Host has no available server regions')
    preferred=context.get('rocketHostRegion','US-CENTRAL')
    server=next((s for s in servers if s['location']==preferred),servers[0])
    for a in assignments:log_event('CONFIG_PLAYER',name=a['name'],team='Blue' if a['team']==0 else 'Orange',slot=a['slot'],type=a['type'],bot=a['engine'],profile=a)
    log(selected['notice'])
    allow_career_commands()
    from rlbot.setup_manager import SetupManager,RocketLeagueLauncherPreference,ROCKET_LEAGUE_PROCESS_INFO
    import logging
    logging.getLogger('rlbot').setLevel(logging.WARNING)
    ROCKET_LEAGUE_PROCESS_INFO.get_ideal_args=lambda port:['-rlbot',f'RLBot_ControllerURL=127.0.0.1:{port}','RLBot_PacketSendRate=120','-nomovie','-noeac']
    manager=SetupManager()
    dispatcher=None;hud=None;joined=False
    try:
        connect_with_hud(manager,RocketLeagueLauncherPreference(preferred_launcher='epic',use_login_tricks=True,rocket_league_exe_path=rl_path),log,required=True,
                         manual_confirmation=bool(context.get('bakkesmodConfirmation')))
        status=json.loads((folder()/'data/rl-manager/plugin-status.json').read_text())
        if not status.get('rocketHostTelemetry'):raise RuntimeError('Update RL Manager HUD to 1.4 before using Rocket Host')
        rcon_commands(['rcon_refresh_allowed'])
        dispatcher=create_commentary(enable_commentary,context=context)
        if dispatcher:dispatcher.prepare_intro()
        log('Requesting Rocket Host server in '+server['location']+' with all five assigned bots...')
        address=validate_join_address(read_url(request_url(server,context,assignments),timeout=90))
        session=uuid.uuid4().hex
        root=folder()/'data/rl-manager';root.mkdir(parents=True,exist_ok=True)
        (root/'host-session.json').write_text(json.dumps({'session':session,'pid':status['pid'],'expires':time.time()+1200,'address':address}))
        rcon_commands(['plugin load serverhost','rlm_host_arm',f'unreal_command "open {address}?Lan?Password="'])
        joined=True
        log('Joining Rocket Host as spectator; holding your team entry until all five assigned bots are present')
        reader=HostedPacketReader(assignments);started=False;started_at=None;deadline=time.monotonic()+120;last_tick=0;last_seen=time.monotonic();last_stamp=None
        entry=HostedEntryGate(reader,lambda:rcon_commands(['rlm_host_ready']),log)
        diagnostic=context.get('_diagnosticSeconds')
        if diagnostic is not None and (not isinstance(diagnostic,int) or not 20<=diagnostic<=300):
            raise ValueError('Invalid connection diagnostic duration')
        hud_context=copy.deepcopy(context.get('broadcast') or {})
        hud_context['route']='Rocket Host'
        hud=BroadcastTelemetry(log_event,hud_context)
        highlights=IncidentTracker()
        while True:
            try:raw=json.loads((root/'host-packet.json').read_text())
            except (OSError,ValueError):raw=None
            if raw and raw.get('session')==session and raw.get('pid')==status['pid'] and time.time()-raw.get('updated',0)<2 and raw['updated']!=last_stamp:
                last_stamp=raw['updated'];last_seen=time.monotonic()
                if not started:
                    hud.update_staging(raw,reader.staging_players(raw))
                    if entry.advance(raw,time.monotonic()):
                        started=True;started_at=time.monotonic();deadline=started_at+1800;hud.native_names=reader.native_names;hud.native_ids=reader.native_ids
                        from game_window import focus_rocket_league
                        focus_rocket_league()
                        log_event('MATCH_STARTED',message='Rocket Host 3v3 ready: human and all five assigned bots confirmed')
                if started:
                    reader.check_activity(raw)
                    packet=reader.packet(raw);hud.update(packet);highlights.update(packet)
                    if dispatcher:dispatcher.process_packet(packet)
                    if time.monotonic()-last_tick>10:
                        last_tick=time.monotonic();log_event('TICK',blue=raw['scores'][0],orange=raw['scores'][1],time_remaining=raw['remaining'],overtime=raw['overtime'],ended=raw['ended'])
                    if raw['ended']:
                        if raw['scores'][0]==raw['scores'][1]:raise RuntimeError('Hosted match ended without a winner; no career result recorded')
                        from game_window import minimize_rocket_league
                        minimize_rocket_league()
                        return finish_played_match(packet,result_path,dispatcher,highlights.events)
                    if diagnostic is not None and time.monotonic()-started_at>=diagnostic:
                        expected=sum(a['type']!='Human' for a in assignments)
                        if len(reader.active_bots)!=expected:raise RuntimeError('Diagnostic did not confirm activity from every hosted bot')
                        log_event('CONNECTION_TEST_COMPLETED',message=f'All {expected} assigned bots playing; career identities and live telemetry verified. No career result written.')
                        return None
            if time.monotonic()>deadline:raise RuntimeError('Rocket Host connection timed out; no played result recorded')
            if started and time.monotonic()-last_seen>12:raise RuntimeError('Rocket Host telemetry disconnected; no result guessed or simulated')
            time.sleep(.02)
    finally:
        if joined:
            try:rcon_commands(['rlm_host_stop','unreal_command "disconnect"'])
            except Exception:pass
        # A cleanup error must not mask the stalled-bot report or prevent retry.
        for cleanup in ([hud.close] if hud else [])+([dispatcher.stop] if dispatcher else [])+[manager.shut_down]:
            try:cleanup()
            except Exception as exc:log('Rocket Host cleanup warning: '+str(exc))
