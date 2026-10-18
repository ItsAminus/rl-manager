"""Verify the native HUD in the main menu without creating a match/result."""
from pathlib import Path
import sys
import logging

# Epic's launch helper logs its temporary login arguments at INFO level.
logging.getLogger('rlbot').setLevel(logging.WARNING)

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'rl_bridge'))
from bakkesmod_startup import ensure_bakkesmod,connect_with_hud
from rlbot.setup_manager import SetupManager,RocketLeagueLauncherPreference,ROCKET_LEAGUE_PROCESS_INFO

def log(message):print(message,flush=True)

if not ensure_bakkesmod(log):raise RuntimeError('BakkesMod was not started')
ROCKET_LEAGUE_PROCESS_INFO.get_ideal_args=lambda port:[
    '-rlbot',f'RLBot_ControllerURL=127.0.0.1:{port}','RLBot_PacketSendRate=120','-nomovie','-noeac']
manager=SetupManager()
try:
    log('Opening Rocket League for startup verification; no match will be joined.')
    preference=RocketLeagueLauncherPreference(preferred_launcher='epic',use_login_tricks=True,
        rocket_league_exe_path=r'C:\Program Files\Epic Games\rocketleague\Binaries\Win64\RocketLeague.exe')
    connect_with_hud(manager,preference,log,required=True)
    log('HUD_STARTUP_VERIFIED: current game plugin and authenticated control connection ready.')
finally:
    manager.shut_down()
