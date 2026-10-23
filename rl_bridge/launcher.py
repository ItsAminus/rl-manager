#!/usr/bin/env python3
"""
RL Manager - Offline 3v3 Rocket League Match Launcher via RLBot
Controls 1 Human player + 2 Bot teammates vs 3 Bot opponents.
Direct integration using verified bots and Psyonix fail-safe.
"""

import sys
import os
import json
import time
import argparse
import subprocess
from functools import lru_cache
from pathlib import Path
from bot_assignment import player_assignment, engine_config

# Default paths on Windows
DEFAULT_RL_EXE = r"C:\Program Files\Epic Games\rocketleague\Binaries\Win64\RocketLeague.exe"
DEFAULT_BOTPACK = str(Path.home() / 'AppData' / 'Local' / 'RLBotGUIX' / 'RLBotPackDeletable' / 'RLBotPack-master' / 'RLBotPack')

def log_event(event_type, **kwargs):
    payload = {"event": event_type, "timestamp": time.time(), **kwargs}
    print(json.dumps(payload), flush=True)


def create_commentary(enabled=True, context=None):
    """One local hybrid director; legacy Google/SoVITS providers stay retired."""
    if not enabled:
        return None
    try:
        comm_dir = Path(__file__).parent / "commentary"
        if str(comm_dir) not in sys.path:
            sys.path.insert(0, str(comm_dir))
        from hybrid_broadcast import HybridBroadcast
        return HybridBroadcast(context=context, log=lambda message: log_event("STATUS", message=message))
    except Exception as exc:
        log_event("STATUS", message=f"Clip commentary unavailable: {exc}")
        return None

def find_bot_cfg(botpack_path: Path, name: str) -> Path | None:
    if not botpack_path.exists():
        return None
    name_l = name.lower()
    for cfg in botpack_path.rglob("*.cfg"):
        if "appearance" in cfg.name.lower() or "port" in cfg.name.lower():
            continue
        if cfg.stem.lower() == name_l or cfg.parent.name.lower() == name_l:
            return cfg
    return None

@lru_cache(maxsize=32)
def verify_bot_can_load(cfg_path: Path) -> bool:
    try:
        # Nexto and Necto both import modules called agent/bot. Validate in
        # separate processes so cached imports can't mix their model weights.
        check = ('import sys; from rlbot.parsing.bot_config_bundle import get_bot_config_bundle; '
                 'from rlbot.utils.class_importer import import_agent; '
                 'b=get_bot_config_bundle(sys.argv[1]); '
                 'import_agent(b.python_file).get_loaded_class()("test",0,0)')
        result = subprocess.run([sys.executable, '-c', check, str(cfg_path)], timeout=30,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        return result.returncode == 0
    except Exception:
        return False

def select_bot_cfg(botpack_path: Path, rating: int, index: int, tendency: str = "", profile=None) -> tuple:
    """Returns (bot_cfg_path_or_None, psyonix_skill_float)"""
    chosen = profile or player_assignment({'rating': rating, 'gamertag': str(index), 'tendency': tendency}, 'exhibition', lucky_chance=0)
    cfg = engine_config(botpack_path, chosen['engine'])
    if cfg and verify_bot_can_load(cfg):
        return cfg, 1.0
    if chosen['engine'] != 'Psyonix':
        raise RuntimeError(f"Required {chosen['engine']} bot is missing or cannot load; refusing to silently replace the player's skill tier")
    return None, chosen.get('botSkill', min(1., max(.1, rating/70)))

def build_match_config(config_data: dict, botpack_path: Path, arena_name: str = None):
    import rlbot.matchconfig.match_config as mc

    match_cfg = mc.MatchConfig()
    match_cfg.game_mode = "Soccer"
    match_cfg.game_map = arena_name or config_data.get('arena', 'Mannfield_Dusk')
    # Use Rocket League's native goal replay; bots resume on the next kickoff.
    match_cfg.skip_replays = False
    match_cfg.instant_start = False
    match_cfg.enable_state_setting = True
    match_cfg.existing_match_behavior = "Restart"

    player_configs = []
    match_key = f"{config_data.get('fixtureId', 'exhibition')}:{config_data.get('gameNumber', 1)}"
    ratings = {}
    if config_data.get('botRouting') == 'ratings-v2':
        from rating_bots import rating_plan
        ratings = {a['slot']: a for a in rating_plan(config_data,lock_series=True)['assignments']}
    def profile(player, slot):
        legacy = player_assignment(player, match_key)
        return {**legacy, **ratings[slot]} if slot in ratings else legacy

    blue_players = config_data.get("blueTeam", {}).get("players", []) or [
        {"gamertag": "Manager", "rating": 88, "isHuman": True},
        {"gamertag": "Teammate 1", "rating": 85, "isHuman": False},
        {"gamertag": "Teammate 2", "rating": 82, "isHuman": False},
    ]

    for i, p in enumerate(blue_players[:3]):
        pc = mc.PlayerConfig()
        pc.team = 0
        pc.name = p.get("gamertag", f"Blue_{i}")

        if p.get("isHuman", False):
            pc.bot = False
            pc.rlbot_controlled = False
            pc.bot_skill = 1.0
            pc.human_index = 0
            log_event("CONFIG_PLAYER", name=pc.name, team="Blue", type="Human", slot=i)
        else:
            pc.manager_profile = profile(p, i)
            bot_cfg, p_skill = select_bot_cfg(botpack_path, p.get("rating", 85), i, p.get("tendency", ""), pc.manager_profile)
            if bot_cfg:
                pc.bot = True
                pc.rlbot_controlled = True
                pc.bot_skill = p_skill
                pc.config_path = str(bot_cfg)
                log_event("CONFIG_PLAYER", name=pc.name, team="Blue", type="RLBot", bot=pc.manager_profile['engine'], profile=pc.manager_profile, slot=i)
            else:
                pc.bot = True
                pc.rlbot_controlled = False
                pc.bot_skill = p_skill
                log_event("CONFIG_PLAYER", name=pc.name, team="Blue", type="Psyonix", skill=p_skill, slot=i)

        from garage_loadout import apply_garage_loadout
        if apply_garage_loadout(pc,p):log_event('STATUS',message=f'Applied saved garage preset for {pc.name}')
        player_configs.append(pc)

    orange_players = config_data.get("orangeTeam", {}).get("players", []) or [
        {"gamertag": "Opponent 1", "rating": 87, "isHuman": False},
        {"gamertag": "Opponent 2", "rating": 84, "isHuman": False},
        {"gamertag": "Opponent 3", "rating": 81, "isHuman": False},
    ]

    for i, p in enumerate(orange_players[:3]):
        pc = mc.PlayerConfig()
        pc.team = 1
        pc.name = p.get("gamertag", f"Orange_{i}")
        pc.manager_profile = profile(p, i + 3)
        bot_cfg, p_skill = select_bot_cfg(botpack_path, p.get("rating", 85), i + 3, p.get("tendency", ""), pc.manager_profile)

        if bot_cfg:
            pc.bot = True
            pc.rlbot_controlled = True
            pc.bot_skill = p_skill
            pc.config_path = str(bot_cfg)
            log_event("CONFIG_PLAYER", name=pc.name, team="Orange", type="RLBot", bot=pc.manager_profile['engine'], profile=pc.manager_profile, slot=i+3)
        else:
            pc.bot = True
            pc.rlbot_controlled = False
            pc.bot_skill = p_skill
            log_event("CONFIG_PLAYER", name=pc.name, team="Orange", type="Psyonix", skill=p_skill, slot=i+3)

        if apply_garage_loadout(pc,p):log_event('STATUS',message=f'Applied saved garage preset for {pc.name}')
        player_configs.append(pc)

    match_cfg.player_configs = player_configs
    log_event("STATUS", message=f"Configured match with {len(player_configs)} active participants")
    return match_cfg

def return_to_lobby():
    """Disconnects from current match and brings Rocket League back to the main menu/lobby."""
    log_event("STATUS", message="Returning Rocket League to main lobby...")
    disconnected = False

    # 1. Primary method: BakkesMod RCON disconnect via WebSocket (port 9002)
    try:
        import websocket
        import re
        cfg_path = Path(os.environ.get("APPDATA", "")) / "bakkesmod" / "bakkesmod" / "cfg" / "config.cfg"
        pwd = ""
        port = 9002
        if cfg_path.exists():
            text = cfg_path.read_text(encoding="utf-8", errors="ignore")
            m_pwd = re.search(r'rcon_password\s+"([^"]+)"', text)
            if m_pwd:
                pwd = m_pwd.group(1)
            m_port = re.search(r'rcon_port\s+"(\d+)"', text)
            if m_port:
                port = int(m_port.group(1))

        ws = websocket.create_connection(f"ws://127.0.0.1:{port}", timeout=2.0)
        ws.send(f"rcon_password {pwd}")
        time.sleep(0.1)
        ws.send("rcon_refresh_allowed")
        time.sleep(0.1)
        ws.send("disconnect")
        time.sleep(0.2)
        ws.close()
        log_event("STATUS", message="Disconnected to main lobby via BakkesMod RCON.")
        disconnected = True
    except Exception as e:
        log_event("STATUS", message=f"BakkesMod RCON notice: {e}")

    # 2. Secondary method: PowerShell Win32 SendKeys to Rocket League window to trigger Leave Match
    if not disconnected:
        try:
            import subprocess
            ps_cmd = (
                "$wshell = New-Object -ComObject WScript.Shell; "
                "if ($wshell.AppActivate('Rocket League')) { "
                "  Start-Sleep -Milliseconds 200; "
                "  $wshell.SendKeys('{ESC}'); "
                "  Start-Sleep -Milliseconds 300; "
                "  $wshell.SendKeys('{UP}'); "
                "  Start-Sleep -Milliseconds 100; "
                "  $wshell.SendKeys('{ENTER}'); "
                "  Start-Sleep -Milliseconds 200; "
                "  $wshell.SendKeys('{ENTER}'); "
                "}"
            )
            subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], timeout=3, capture_output=True)
            log_event("STATUS", message="Sent leave match signal to Rocket League.")
        except Exception:
            pass

    return True

def finish_played_match(packet, result_file, dispatcher, incidents=None):
    """Snapshot and publish the played score before optional speech or cleanup."""
    blue = packet.teams[0].score
    orange = packet.teams[1].score
    stats = []
    for i in range(packet.num_cars):
        car = packet.game_cars[i]
        si = car.score_info
        stats.append({"name": car.name, "team": car.team, "is_bot": bool(car.is_bot),
                      "slot": i, "score": si.score, "goals": si.goals,
                      "assists": si.assists, "saves": si.saves,
                      "shots": si.shots, "demolitions": si.demolitions})
    result = {"completed": True, "blueScore": blue, "orangeScore": orange,
              "winner": "blue" if blue > orange else "orange", "playerStats": stats}
    if incidents is not None:
        result['incidents'] = incidents
    if result_file:
        try:
            target = Path(result_file)
            temporary = target.with_suffix(target.suffix + '.tmp')
            temporary.write_text(json.dumps(result, indent=2), encoding='utf-8')
            temporary.replace(target)
        except OSError as exc:
            log_event("STATUS", message=f"Result file unavailable; sending played result directly: {exc}")
    log_event("MATCH_COMPLETED", result=result)
    log_event("STATUS", message="Postgame desk: reviewing this game before the next launch")
    try:
        if dispatcher:
            dispatcher.finish_match()
    except Exception as exc:
        log_event("STATUS", message=f"Hybrid commentary warning: postgame failed: {exc}")
    finally:
        try:
            if dispatcher:
                dispatcher.stop()
        finally:
            log_event("COMMENTARY_COMPLETED")
    return result


def launch_match(match_cfg, rl_exe: Path, monitor: bool = True, result_file: Path | None = None, enable_commentary: bool = True, commentary=None, broadcast_context=None,manual_bakkesmod_confirmation=False,presentation_context=None):
    from rlbot.setup_manager import SetupManager, ROCKET_LEAGUE_PROCESS_INFO
    from game_launcher import launcher_preference

    # Align Rocket League packet rate to 120Hz for optimal Nexto neural network physics
    ROCKET_LEAGUE_PROCESS_INFO.get_ideal_args = lambda port: [
        '-rlbot',
        f'RLBot_ControllerURL=127.0.0.1:{port}',
        'RLBot_PacketSendRate=120',
        '-nomovie',
        '-noeac',  # Rocket League's supported offline launch mode for mods.
    ]

    log_event("STATUS", message="Initializing RLBot SetupManager...")
    import logging
    logging.getLogger('rlbot').setLevel(logging.WARNING)
    manager = SetupManager()
    manager.early_start_seconds = 5

    launcher_pref = launcher_preference(rl_exe, lambda message: log_event('STATUS', message=message))

    log_event("STATUS", message="Connecting to Rocket League gateway...")
    from bakkesmod_startup import connect_with_hud
    connect_with_hud(manager,launcher_pref,lambda message:log_event('STATUS',message=message),
                     enable_hud=bool(broadcast_context and broadcast_context.get('nativeStatePath')),
                     manual_confirmation=manual_bakkesmod_confirmation,required=manual_bakkesmod_confirmation)

    log_event("STATUS", message="Loading 3v3 match configuration...")
    from bot_startup import BotReadiness, receive_metadata, start_with_ready_bots
    readiness = BotReadiness(match_cfg)

    # Preload recordings and open the audio device before kickoff.
    dispatcher = commentary or create_commentary(enable_commentary and monitor)
    from player_introductions import run_showcase
    if monitor:
        run_showcase(manager, presentation_context or {}, dispatcher,
                     lambda message: log_event('STATUS', message=message))
    manager.load_match_config(match_cfg)
    if dispatcher and hasattr(dispatcher, "prepare_intro"):
        dispatcher.prepare_intro()
    from rlbot.utils.structures.game_data_struct import GameTickPacket
    packet = GameTickPacket()
    commentary_error_reported = False

    def update_commentary():
        nonlocal dispatcher, commentary_error_reported
        if dispatcher:
            try:
                dispatcher.process_packet(packet)
            except Exception as exc:
                if not commentary_error_reported:
                    log_event("STATUS", message=f"Clip commentary unavailable: {exc}")
                    commentary_error_reported = True
                dispatcher.stop()
                dispatcher = None

    log_event("STATUS", message="Loading bots before releasing kickoff...")
    try:
        start_with_ready_bots(manager, readiness,
                              lambda message: log_event("STATUS", message=message))
    except BaseException:
        if dispatcher:
            dispatcher.stop()
        manager.shut_down()
        raise

    from game_window import focus_rocket_league
    focus_rocket_league()
    log_event("MATCH_STARTED", message="3v3 offline match successfully started in Rocket League!")
    # Let the app retire its loading window before restoring exclusive-fullscreen
    # focus. A focus request made while that window owns the desktop can fail.
    time.sleep(.15)
    focus_rocket_league()

    if not monitor:
        log_event("STATUS", message="Match running in background.")
        return {"status": "started"}

    log_event("STATUS", message="Monitoring active match and servicing bot processes...")
    last_reported = -1
    last_metadata_time = 0.0
    from match_incidents import IncidentTracker
    from broadcast_telemetry import BroadcastTelemetry
    highlights = IncidentTracker()
    conditioned=any(getattr(p,'manager_profile',{}).get('performance') for p in match_cfg.player_configs if getattr(p,'rlbot_controlled',False))
    if broadcast_context:broadcast_context={**broadcast_context,'localComms':conditioned}
    broadcast = BroadcastTelemetry(log_event,broadcast_context)
    from local_comms import LocalCommsBridge
    comms=LocalCommsBridge(broadcast.target.parent/'comms-command.json' if conditioned and broadcast.target else None,readiness.folder,broadcast.session,lambda msg:log_event('STATUS',message=msg))
    last_incident_count=0

    try:
        while True:
            # Poll at 50Hz; total voice latency is measured separately.
            time.sleep(0.02)
            now = time.time()

            # Service agent metadata and child processes periodically
            if now - last_metadata_time >= 0.5:
                last_metadata_time = now
                try:
                    receive_metadata(manager)
                except Exception:
                    pass

            try:
                manager.game_interface.update_live_data_packet(packet)
            except Exception:
                continue

            # Classify the current packet and start preloaded audio immediately.
            highlights.update(packet)
            if conditioned and len(highlights.events)!=last_incident_count:
                from local_performance import publish_incidents
                try:publish_incidents(readiness.folder,highlights.events)
                except OSError:pass
                last_incident_count=len(highlights.events)
            broadcast.comms=comms.update(packet)
            broadcast.update(packet)
            update_commentary()

            game_info = packet.game_info
            blue_score = packet.teams[0].score if packet.num_teams > 0 else 0
            orange_score = packet.teams[1].score if packet.num_teams > 1 else 0
            secs = int(game_info.game_time_remaining)

            if abs(secs - last_reported) >= 10 or game_info.is_match_ended:
                last_reported = secs
                log_event("TICK", blue=blue_score, orange=orange_score,
                          time_remaining=secs, overtime=game_info.is_overtime,
                          ended=game_info.is_match_ended)

            if game_info.is_match_ended:
                from game_window import minimize_rocket_league
                minimize_rocket_league()
                result = finish_played_match(packet, result_file, dispatcher, highlights.events)

                # Wait for post-match scoreboard then return to main lobby
                time.sleep(2.5)
                return_to_lobby()
                return result

    except KeyboardInterrupt:
        log_event("STATUS", message="Interrupted by user.")
    except Exception as e:
        log_event("ERROR", message=str(e))
        raise
    finally:
        broadcast.close()
        if dispatcher:
            dispatcher.stop()
        manager.shut_down()

def main():
    parser = argparse.ArgumentParser(description="RL Manager 3v3 Match Launcher")
    parser.add_argument("--mode", choices=["test", "match"], default="test")
    parser.add_argument("--config", type=str, default=None)
    parser.add_argument("--rl-path", type=str, default=DEFAULT_RL_EXE)
    parser.add_argument("--botpack-path", type=str, default=DEFAULT_BOTPACK)
    parser.add_argument("--result-file", type=str, default="match_result.json")
    parser.add_argument("--map", type=str, default=None)
    parser.add_argument("--no-monitor", action="store_true")
    parser.add_argument("--no-commentary", action="store_true")

    args = parser.parse_args()

    rl_path = Path(args.rl_path)
    botpack_path = Path(args.botpack_path)
    result_path = Path(args.result_file)

    if not rl_path.exists():
        log_event("ERROR", message=f"RocketLeague.exe not found at: {rl_path}")
        sys.exit(1)

    log_event("STARTUP", rl_path=str(rl_path), botpack_path=str(botpack_path), mode=args.mode)

    config_data = {}
    if args.config:
        if os.path.exists(args.config):
            with open(args.config, "r", encoding="utf-8") as f:
                config_data = json.load(f)
        else:
            try:
                config_data = json.loads(args.config)
            except Exception:
                config_data = {}

    if config_data.get('botRouting')=='ratings-v2':
        from rating_bots import rating_plan
        routing=rating_plan(config_data)
        if routing['route']=='Rocket Host':
            from rocket_host import launch
            launch(config_data,str(rl_path),result_path,enable_commentary=not args.no_commentary)
            return
    match_cfg = build_match_config(config_data, botpack_path, arena_name=args.map)
    # Start speech preparation while Rocket League is connecting/loading.
    context = dict(config_data)
    for team, side in enumerate(("blueTeam", "orangeTeam")):
        context[side] = dict(context.get(side, {}))
        context[side].setdefault("name", "Blue" if team == 0 else "Orange")
        selected = {p.get("gamertag"): p for p in context[side].get("players", [])}
        context[side]["players"] = [{**selected.get(player.name, {}), "gamertag": player.name}
                                     for player in match_cfg.player_configs if player.team == team]
    commentary = create_commentary(not args.no_commentary and not args.no_monitor, context=context)
    try:
        launch_match(
            match_cfg,
            rl_path,
            monitor=not args.no_monitor,
            result_file=result_path,
            enable_commentary=not args.no_commentary,
            commentary=commentary,
            broadcast_context=config_data.get('broadcast'),
            manual_bakkesmod_confirmation=bool(config_data.get('bakkesmodConfirmation')),
            presentation_context=context,
        )
    finally:
        if commentary:
            commentary.stop()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        log_event('ERROR', message=str(exc))
        sys.exit(1)

