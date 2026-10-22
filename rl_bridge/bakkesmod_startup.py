"""Launch the supported injector after the game is ready, then verify its HUD."""
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import time
import threading
import shutil
import sys
import queue
import uuid
from contextlib import contextmanager

MIN_HUD_VERSION = '1.8.4'
HUD_STARTUP_TIMEOUT = 90


class HUDStartupError(RuntimeError):
    pass


class StartupForeground:
    """Restore each new game process once, including Epic's replacement process."""
    def __init__(self, log):
        self.log=log
        self.restored=frozenset()

    def tick(self, pids):
        current=frozenset(pids)
        if current!=self.restored and current:
            from game_window import focus_rocket_league
            if focus_rocket_league():
                self.restored=current
                self.log('Restored Rocket League for BakkesMod startup')
        elif not current:
            self.restored=frozenset()


@contextmanager
def startup_foreground(log):
    # SetupManager can wait inside its gateway connection for two minutes.
    # Restore the newly created window during that wait, not only afterwards.
    stopped=threading.Event();foreground=StartupForeground(log)
    def monitor():
        while not stopped.is_set():
            try:foreground.tick(process_ids('RocketLeague.exe'))
            except Exception:pass
            stopped.wait(2)
    thread=threading.Thread(target=monitor,name='rocket-startup-window',daemon=True)
    if os.name=='nt':thread.start()
    try:yield
    finally:
        stopped.set()
        if thread.ident is not None:thread.join(timeout=6)


def connect_with_hud(manager, launcher_preference, log, enable_hud=True, required=False,manual_confirmation=False):
    with startup_foreground(log):
        if enable_hud:prepare_hud_assets()
        manager.connect_to_game(launcher_preference=launcher_preference)
        if enable_hud:
            if not wait_for_game_ready(log):
                message='Rocket League or BakkesMod did not become ready. No match was joined or result recorded.'
                if required:raise HUDStartupError(message)
                log(message);return False
            if manual_confirmation:
                if current_hud_connected():
                    log('Custom HUD connected: current Rocket League process confirmed')
                    return True
                request_injector_confirmation()
                from game_window import focus_rocket_league
                focus_rocket_league()
            started=ensure_bakkesmod(log,restart_existing=True) if manual_confirmation else ensure_bakkesmod(log)
            if not started:
                message='BakkesMod could not start. No match was joined or result recorded.'
                if required:raise HUDStartupError(message)
                log(message);return False
            return wait_for_hud(log,required=required)
    return False


def current_hud_connected():
    try:
        status=json.loads((folder()/'data'/'rl-manager'/'plugin-status.json').read_text(encoding='utf-8'))
        if not hud_is_loaded(status,process_ids('RocketLeague.exe')):return False
        rcon_commands(['rcon_refresh_allowed','rlm_hud_enabled 1','rlm_scoreboard_enabled 1'])
        return True
    except Exception:return False


def request_injector_confirmation(timeout=600,stream=None,emit=None):
    """A launch-scoped UI acknowledgement; never interpret arbitrary commands."""
    if emit is None:
        from launcher import log_event
        emit=log_event
    request=uuid.uuid4().hex;messages=queue.Queue();source=stream or sys.stdin
    def reader():
        try:
            for line in source:
                try:value=json.loads(line)
                except (ValueError,TypeError):continue
                if isinstance(value,dict) and value.get('event')=='CONFIRM_BAKKESMOD' and value.get('requestId')==request:
                    messages.put(True);return
        finally:messages.put(False)
    threading.Thread(target=reader,name='injector-confirmation',daemon=True).start()
    emit('BAKKESMOD_CONFIRM_REQUIRED',requestId=request,
         message="At Rocket League's main menu? Return to RLM and click Start / restart BakkesMod.")
    try:confirmed=messages.get(timeout=timeout)
    except queue.Empty:confirmed=False
    if not confirmed:raise HUDStartupError('BakkesMod confirmation expired or the launcher closed. Retry the match; no result recorded.')


def wait_for_game_ready(log,timeout=60,stable_seconds=3):
    """Gateway connection plus a stable responsive viewport, not just an EXE."""
    from game_window import rocket_league_window_ready
    log('Waiting for Rocket League to finish launching before starting BakkesMod...')
    deadline=time.monotonic()+timeout;stable_at=None;previous=frozenset()
    while time.monotonic()<deadline:
        pids=frozenset(process_ids('RocketLeague.exe'))
        ready=bool(pids) and rocket_league_window_ready(pids)
        if not ready or pids!=previous:stable_at=None
        previous=pids
        if ready:
            if stable_at is None:stable_at=time.monotonic()
            if time.monotonic()-stable_at>=stable_seconds:
                log('Rocket League gateway and game window are ready; starting BakkesMod now')
                return True
        time.sleep(.5)
    log('Rocket League did not finish opening a responsive game window; BakkesMod was not started')
    return False

def process_ids(name):
    result = subprocess.run(['tasklist','/fi',f'IMAGENAME eq {name}','/fo','csv','/nh'],
        capture_output=True,text=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0),timeout=5)
    if result.returncode:
        raise RuntimeError('Windows could not inspect '+name+'; process readiness is unknown')
    return {int(row[1]) for row in csv.reader(io.StringIO(result.stdout))
            if len(row)>1 and row[0].lower()==name.lower() and row[1].isdigit()}

def folder():
    return Path(os.environ.get('APPDATA',''))/'bakkesmod'/'bakkesmod'

def retire_outdated_injector(pid, managed):
    """Replace only the exact old binary backed up during the official update."""
    backup=managed.with_name('BakkesMod.before-update.exe')
    if not managed.is_file() or not backup.is_file():return False
    import ctypes
    from ctypes import wintypes
    kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    kernel.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD]
    kernel.OpenProcess.restype=wintypes.HANDLE
    kernel.QueryFullProcessImageNameW.argtypes=[wintypes.HANDLE,wintypes.DWORD,wintypes.LPWSTR,ctypes.POINTER(wintypes.DWORD)]
    kernel.TerminateProcess.argtypes=[wintypes.HANDLE,wintypes.UINT]
    kernel.WaitForSingleObject.argtypes=[wintypes.HANDLE,wintypes.DWORD]
    kernel.CloseHandle.argtypes=[wintypes.HANDLE]
    handle=kernel.OpenProcess(0x1000|0x0001|0x00100000,False,pid)
    if not handle:return False
    try:
        size=wintypes.DWORD(32768);filename=ctypes.create_unicode_buffer(32768)
        if not kernel.QueryFullProcessImageNameW(handle,0,filename,ctypes.byref(size)):return False
        running=Path(filename.value)
        if running.name.lower()!='bakkesmod.exe' or running.resolve()==managed.resolve():return False
        def digest(path):
            with path.open('rb') as source:return hashlib.file_digest(source,'sha256').digest()
        # Never terminate an unknown or newer injector, or the current managed one.
        if running.stat().st_size!=backup.stat().st_size or digest(running)!=digest(backup):return False
        if not kernel.TerminateProcess(handle,0):
            raise HUDStartupError('The outdated BakkesMod injector could not be closed; close it and retry with RL Manager')
        if kernel.WaitForSingleObject(handle,5000)!=0:
            raise HUDStartupError('The outdated BakkesMod injector is still closing; retry in a moment')
        return True
    finally:kernel.CloseHandle(handle)

def prepare_hud_assets():
    """Install updates before opening the game, without launching the injector."""
    if os.name!='nt':return
    source=os.environ.get('RLM_HUD_SOURCE')
    if source and (Path(source)/'RLManagerHUD.dll').is_file():
        target=folder()/'plugins'/'RLManagerHUD.dll'
        target.parent.mkdir(parents=True,exist_ok=True)
        try:
            if not target.is_file() or hashlib.sha256(target.read_bytes()).digest()!=hashlib.sha256((Path(source)/'RLManagerHUD.dll').read_bytes()).digest():
                shutil.copy2(Path(source)/'RLManagerHUD.dll',target)
            shutil.copytree(Path(source)/'fonts',folder()/'data'/'rl-manager'/'fonts',dirs_exist_ok=True)
        except PermissionError as exc:
            raise HUDStartupError('Close Rocket League once so RLM can install its updated career HUD, then retry.') from exc


def injector_executable(pid):
    """Resolve the executable behind a verified injector PID before restarting."""
    import ctypes
    from ctypes import wintypes
    kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    kernel.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD]
    kernel.OpenProcess.restype=wintypes.HANDLE
    kernel.QueryFullProcessImageNameW.argtypes=[wintypes.HANDLE,wintypes.DWORD,wintypes.LPWSTR,ctypes.POINTER(wintypes.DWORD)]
    kernel.CloseHandle.argtypes=[wintypes.HANDLE]
    handle=kernel.OpenProcess(0x1000,False,pid)
    if not handle:raise HUDStartupError('Cannot inspect BakkesMod; close its injector and click the button again.')
    try:
        size=wintypes.DWORD(32768);filename=ctypes.create_unicode_buffer(32768)
        if not kernel.QueryFullProcessImageNameW(handle,0,filename,ctypes.byref(size)):
            raise HUDStartupError('Cannot locate the running BakkesMod injector; close it and retry.')
        exe=Path(filename.value)
        if exe.name.lower()!='bakkesmod.exe':raise HUDStartupError('The injector process changed; retry the match.')
        return exe
    finally:kernel.CloseHandle(handle)


def restart_injectors(log):
    paths=[]
    for pid in sorted(process_ids('BakkesMod.exe')):
        paths.append(injector_executable(pid))
        result=subprocess.run(['taskkill','/PID',str(pid),'/F'],capture_output=True,text=True,
                              creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0),timeout=10)
        if result.returncode and pid in process_ids('BakkesMod.exe'):
            raise HUDStartupError('BakkesMod could not be restarted. Close its injector, then retry the match.')
    deadline=time.monotonic()+5
    while process_ids('BakkesMod.exe'):
        if time.monotonic()>=deadline:raise HUDStartupError('BakkesMod is still closing; retry in a moment.')
        time.sleep(.2)
    if paths:log('Restarted the non-injected BakkesMod app after your menu confirmation')
    return paths


def ensure_bakkesmod(log,restart_existing=False):
    if os.name!='nt':return False
    managed=Path(os.environ.get('RLM_AI_RUNTIME',str(Path(__file__).resolve().parent/'local_runtime')))/'bakkesmod'/'BakkesMod.exe'
    existing=restart_injectors(log) if restart_existing else []
    running=process_ids('BakkesMod.exe')
    for pid in sorted(running):
        if retire_outdated_injector(pid,managed):
            log('Closed the outdated BakkesMod injector; switching to the verified updated copy')
    if running and process_ids('BakkesMod.exe'):
        log('BakkesMod injector is already running; checking injection in the ready game')
        return True
    candidates=[managed,*existing,
                Path(os.environ.get('ProgramFiles',r'C:\Program Files'))/'BakkesMod'/'BakkesMod.exe',
                Path(os.environ.get('ProgramFiles(x86)',r'C:\Program Files (x86)'))/'BakkesMod'/'BakkesMod.exe']
    exe=next((p for p in candidates if p.is_file()),None)
    if not exe:
        log('Custom HUD unavailable: BakkesMod injector is not installed')
        return False
    startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
    process=subprocess.Popen([str(exe)],startupinfo=startup,creationflags=subprocess.CREATE_NO_WINDOW)
    deadline=time.monotonic()+5
    while time.monotonic()<deadline:
        if process_ids('BakkesMod.exe'):
            log('Started BakkesMod injector after Rocket League finished launching')
            return True
        if process.poll() is not None:break
        time.sleep(.2)
    log('BakkesMod startup was not confirmed; custom HUD may be unavailable')
    return False

def allow_career_commands(root=None):
    """Add only this integration's commands; retain password and all other rules."""
    root=Path(root) if root else folder()
    path=root/'data'/'rcon_commands.cfg'
    text=path.read_text(encoding='utf-8') if path.exists() else ''
    names=('rlm_host_arm','rlm_host_stop','rlm_host_ready','rlm_hud_enabled','rlm_scoreboard_enabled')
    missing=[n for n in names if n not in text.splitlines()]
    if missing:
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(text.rstrip()+'\n'+'\n'.join(missing)+'\n',encoding='utf-8')
    return bool(missing)

def rcon_commands(commands, root=None):
    import websocket
    root=Path(root) if root else folder()
    config=(root/'cfg'/'config.cfg').read_text(encoding='utf-8',errors='ignore')
    password=re.search(r'rcon_password\s+"([^"]+)"',config)
    port=re.search(r'rcon_port\s+"(\d+)"',config)
    ws=websocket.create_connection(f"ws://127.0.0.1:{int(port.group(1)) if port else 9002}",timeout=1)
    try:
        if not password or not password.group(1):
            raise HUDStartupError('BakkesMod RCON password is missing from config.cfg; save the BakkesMod configuration and retry')
        ws.send('rcon_password '+(password.group(1) if password else ''))
        # The server explicitly sends authyes/authno. Never count a socket
        # connection or a failed login as successful command delivery.
        if ws.recv()!='authyes':
            raise HUDStartupError('BakkesMod RCON authentication was rejected; its saved configuration does not match the running plugin')
        for command in commands:
            ws.send(command)
            ws.settimeout(.1)
            try:
                reply=ws.recv()
                if 'ERR:illegal_command' in reply:raise HUDStartupError('BakkesMod rejected a required RL Manager command: '+command.split()[0])
            except websocket.WebSocketTimeoutException:pass
    finally:ws.close()

def hud_is_loaded(status, pids):
    # A leftover status from yesterday or a different Rocket League process
    # must never be presented as a successful native HUD connection.
    try:
        return (status.get('loaded') is True and int(status.get('pid',0)) in pids
                and tuple(map(int,status.get('version','0').split('.'))) >= tuple(map(int,MIN_HUD_VERSION.split('.'))))
    except (TypeError,ValueError):return False

def wait_for_hud(log, timeout=HUD_STARTUP_TIMEOUT, required=False):
    if os.name!='nt':return False
    status_file=folder()/'data'/'rl-manager'/'plugin-status.json'
    # The gateway can connect while the injector is still initializing. Cold
    # starts (and Epic's replacement process) need more than the old 15 seconds.
    # Always check the current process, never yesterday's status or an earlier
    # process captured at the beginning of this wait.
    started=time.monotonic();deadline=started+timeout
    next_request=0;next_progress=started+10
    last_pids=frozenset();status={};rcon_ready=False;last_error=''
    log('Waiting for BakkesMod and the career HUD to finish loading before joining the match...')
    while time.monotonic()<deadline:
        pids=process_ids('RocketLeague.exe')
        if frozenset(pids)!=last_pids:
            last_pids=frozenset(pids);next_request=0;rcon_ready=False;last_error=''
        try:
            status=json.loads(status_file.read_text(encoding='utf-8'))
            if hud_is_loaded(status,pids):
                # Enabling our display is part of the user's requested setup.
                if required and time.monotonic()<next_request:
                    time.sleep(.5);continue
                try:
                    rcon_commands(['rcon_refresh_allowed','rlm_hud_enabled 1','rlm_scoreboard_enabled 1'])
                except Exception as exc:
                    last_error=str(exc) if isinstance(exc,HUDStartupError) else type(exc).__name__
                    if required:
                        next_request=time.monotonic()+3
                        if time.monotonic()>=next_progress:
                            log('Career HUD loaded, but its control connection is not ready: '+last_error)
                            next_progress=time.monotonic()+10
                        time.sleep(.5);continue
                    log('Custom HUD control warning: '+last_error)
                log('Custom HUD connected: current Rocket League process confirmed')
                return True
        except (OSError,ValueError):pass
        if pids and time.monotonic()>=next_request:
            next_request=time.monotonic()+3
            try:
                rcon_commands(['rcon_refresh_allowed','plugin load RLManagerHUD','rlm_hud_enabled 1','rlm_scoreboard_enabled 1'])
                rcon_ready=True;last_error=''
            except Exception as exc:
                last_error=str(exc) if isinstance(exc,HUDStartupError) else type(exc).__name__
        if time.monotonic()>=next_progress:
            elapsed=int(time.monotonic()-started)
            stage='career HUD' if rcon_ready else 'BakkesMod injection'
            log(f'Waiting for {stage} ({elapsed}s). Keep Rocket League open while startup completes.')
            next_progress=time.monotonic()+10
        time.sleep(.5)
    if hud_is_loaded(status,last_pids):
        reason='Career HUD loaded, but BakkesMod control connection failed: '+(last_error or 'no authenticated response')+'.'
    elif status.get('pid') in last_pids and status.get('loaded') is True:
        reason=f'Career HUD version {status.get("version","unknown")} is running; {MIN_HUD_VERSION} is required. Restart Rocket League to load the installed update.'
    elif rcon_ready:
        reason='BakkesMod connected, but RLManagerHUD did not load after repeated requests. Check that plugins/RLManagerHUD.dll is installed.'
    else:
        reason='BakkesMod control connection never became ready ('+(last_error or 'no running Rocket League process')+'). The injector app being open does not confirm injection. Keep Rocket League in the foreground and check BakkesMod injection status.'
    message=reason+' No match was joined or result recorded.'
    log(message)
    if required:raise HUDStartupError(message)
    return False
