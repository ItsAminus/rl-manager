"""Keep kickoff paused until every external bot has produced its first output."""
import configparser
import json
import queue
import time
import uuid
from pathlib import Path


class BotStartupError(RuntimeError):
    def __init__(self, missing):
        self.missing = dict(missing)
        super().__init__('Bots failed to initialize before kickoff: '+', '.join(self.missing.values()))


def receive_metadata(manager):
    """RLBot's default drain waits 100 ms even when its queue is empty."""
    from rlbot.utils import process_configuration
    received = 0
    while True:
        try:
            metadata = manager.agent_metadata_queue.get_nowait()
        except queue.Empty:
            break
        manager.helper_process_manager.start_or_update_helper_process(metadata)
        manager.agent_metadata_map[metadata.index] = metadata
        received += 1
    manager.num_metadata_received += received
    children_changed = process_configuration.append_child_pids(manager.agent_metadata_map)
    if received or children_changed:
        process_configuration.configure_processes(manager.agent_metadata_map, manager.logger)
    return received


def mark_ready(folder, index, name, runtime_index=None):
    # Called only after initialize_agent AND a successful get_output. Metadata
    # alone arrives earlier and does not prove that the neural network is ready.
    path = Path(folder) / f"{index}.json"
    temporary = path.with_suffix(".tmp")
    # index is the configured slot. Rocket League may assign a different live
    # car index when spawning the human; readiness must not depend on that order.
    temporary.write_text(json.dumps({"index": index, "name": name,
                                     "runtimeIndex": index if runtime_index is None else runtime_index}), encoding="utf-8")
    temporary.replace(path)


def mark_failed(folder,index,error):
    path=Path(folder)/f'{index}.error.json'
    temporary=path.with_suffix('.tmp')
    temporary.write_text(json.dumps({'index':index,'error':str(error)[-1000:]}),encoding='utf-8')
    temporary.replace(path)


class BotReadiness:
    def __init__(self, match_config, root=None):
        from local_tactics import saved_order
        self.expected = {}
        self.original_configs = {}
        cache = root or Path(__file__).parent / "commentary/cache/bot_startup"
        self.folder = Path(cache).resolve() / uuid.uuid4().hex
        for index, player in enumerate(match_config.player_configs):
            if not player.bot or not player.rlbot_controlled:
                continue
            original_cfg = Path(player.config_path).resolve()
            self.original_configs[index] = str(original_cfg)
            config = configparser.ConfigParser(interpolation=None)
            config.read(original_cfg, encoding="utf-8-sig")
            original_agent = (original_cfg.parent / config.get("Locations", "python_file")).resolve()
            if not original_agent.is_file():
                raise FileNotFoundError(f"Bot script missing: {original_agent}")
            self.folder.mkdir(parents=True, exist_ok=True)
            for key in ("looks_config", "requirements_file", "logo_file", "loadout_generator"):
                value = config.get("Locations", key, fallback="")
                if value:
                    config.set("Locations", key, str((original_cfg.parent / value).resolve()))
            # Unique module names avoid RLBot's import cache across bot slots.
            shim = self.folder / f"ready_{index}_{self.folder.name}.py"
            profile=dict(getattr(player,'manager_profile',{}))
            profile['tacticOrdersBySlot']={i:saved_order(getattr(p,'manager_profile',{})) for i,p in enumerate(match_config.player_configs) if getattr(p,'team',None)==getattr(player,'team',None) and getattr(p,'bot',False)}
            shim.write_text(
                "import sys\n"
                f"sys.path.insert(0, {str(Path(__file__).resolve().parent)!r})\n"
                "from bot_startup import mark_ready, mark_failed\n"
                "from team_play import TeamPlay\n"
                "from local_performance import LocalPerformance\n"
                "from local_tactics import LocalTactics\n"
                "from local_ability import LocalAbility\n"
                "from rlbot.utils.class_importer import import_agent\n\n"
                "def original_class():\n"
                "    try:\n"
                f"        return import_agent({str(original_agent)!r}).get_loaded_class()\n"
                "    except Exception as exc:\n"
                f"        mark_failed({str(self.folder)!r}, {index}, exc)\n"
                "        raise\n\n"
                "class ReadyAgent(original_class()):\n"
                "    def initialize_agent(self):\n"
                "        try:\n"
                "            return super().initialize_agent()\n"
                "        except Exception as exc:\n"
                f"            mark_failed({str(self.folder)!r}, {index}, exc)\n"
                "            raise\n"
                "    def get_output(self, packet):\n"
                "        if not hasattr(self, '_manager_team_play'):\n"
                f"            profile = {profile!r}\n"
                "            self._manager_team_play = TeamPlay(self.index, profile)\n"
                f"            self._manager_tactics = LocalTactics(self.index, profile, self._manager_team_play, {str(self.folder)!r})\n"
                f"            self._manager_performance = LocalPerformance(self.index, profile, {str(self.folder)!r})\n"
                "            self._manager_ability = LocalAbility(self.index, profile)\n"
                "            if hasattr(self, 'beta'): self.beta = profile.get('beta', self.beta)\n"
                "        try:\n"
                "            controls = super().get_output(packet)\n"
                "        except Exception as exc:\n"
                "            if not getattr(self, '_manager_ready', False):\n"
                f"                mark_failed({str(self.folder)!r}, {index}, exc)\n"
                "            raise\n"
                "        controls = self._manager_performance.apply(packet, controls)\n"
                "        self._manager_tactics.prepare(packet)\n"
                "        controls = self._manager_team_play.apply(packet, controls)\n"
                "        tactic = self._manager_tactics.active_command\n"
                "        controls = self._manager_ability.apply(packet, controls, tactic)\n"
                "        controls = self._manager_tactics.apply(packet, controls)\n"
                "        self._manager_tactics.take_ack()\n"
                "        if not getattr(self, '_manager_ready', False):\n"
                f"            mark_ready({str(self.folder)!r}, {index}, self.name, runtime_index=self.index)\n"
                "            self._manager_ready = True\n"
                "        return controls\n"
                "    def handle_quick_chat(self, index, team, quick_chat):\n"
                "        if hasattr(self, '_manager_tactics'):\n"
                "            self._manager_tactics.receive(index, team, quick_chat)\n"
                "        return super().handle_quick_chat(index, team, quick_chat)\n", encoding="utf-8")
            config.set("Locations", "python_file", str(shim))
            # Startup deliberately waits inside the loaded, paused stadium.
            config.set("Locations", "supports_early_start", "False")
            runtime_cfg = self.folder / f"slot_{index}.cfg"
            with runtime_cfg.open("w", encoding="utf-8") as output:
                config.write(output)
            player.config_path = str(runtime_cfg)
            self.expected[index] = player.name

    def ready(self):
        result = set()
        for index in self.expected:
            try:
                data = json.loads((self.folder / f"{index}.json").read_text(encoding="utf-8"))
                if data["index"] == index:
                    result.add(index)
            except (OSError, ValueError, KeyError):
                pass
        return result

    def wait(self, manager, log, timeout=90, clock=time.monotonic, sleep=time.sleep):
        started = clock()
        previous = -1
        while True:
            receive_metadata(manager)
            ready = self.ready()
            if len(ready) != previous:
                previous = len(ready)
                log(f"Preparing bots: {len(ready)}/{len(self.expected)} ready; kickoff held")
            if ready == set(self.expected):
                log(f"All bots ready in {clock() - started:.1f}s; releasing kickoff")
                return
            failures={}
            for index,name in self.expected.items():
                if index in ready:continue
                try:
                    failure=json.loads((self.folder/f'{index}.error.json').read_text(encoding='utf-8'))
                    if failure.get('index')==index:
                        failures[index]=name
                        log(f'{name} startup failed: {failure.get("error","unknown error")}')
                except (OSError,ValueError):pass
            if failures:raise BotStartupError(failures)
            if clock() - started > timeout:
                raise BotStartupError({i:name for i,name in self.expected.items() if i not in ready})
            sleep(0.05)


def start_with_ready_bots(manager, readiness, log, hold_on_failure=False):
    from rlbot.utils.game_state_util import GameState, GameInfoState
    manager.start_match()
    if not readiness.expected:
        manager.launch_bot_processes()
        return
    # A normal countdown gives the interface time to apply the pause before
    # anyone can drive. The clock and every player's physics pause together.
    manager.game_interface.set_game_state(GameState(game_info=GameInfoState(paused=True)))
    ready=False
    try:
        manager.launch_bot_processes()
        readiness.wait(manager, log)
        ready=True
    finally:
        if ready or not hold_on_failure:
            manager.game_interface.set_game_state(GameState(game_info=GameInfoState(paused=False)))


def start_with_bot_recovery(manager, match_config, readiness, log):
    """Recover unplayed local startup failures without changing saved assignments.

    Import/constructor validation cannot prove that initialize_agent/get_output
    will succeed. Rebuild only failed policies, restart the unplayed stadium,
    and require fresh first-output markers from every bot before kickoff.
    """
    from launcher import select_bot_cfg
    failed=set()
    while True:
        try:
            start_with_ready_bots(manager,readiness,log,hold_on_failure=True)
            return readiness
        except BotStartupError as exc:
            # Each retry excludes at least one new policy. The finite candidate
            # ladder bounds retries; select_bot_cfg fails when it is exhausted.
            for index in exc.missing:
                profile=getattr(match_config.player_configs[index],'manager_profile',{})
                engine=profile.get('engine')
                if not engine:raise
                failed.add(engine)
            manager.kill_bot_processes()
            for index,original in readiness.original_configs.items():
                match_config.player_configs[index].config_path=original
            for index in exc.missing:
                player=match_config.player_configs[index]
                profile=player.manager_profile
                previous=profile['engine']
                cfg,skill=select_bot_cfg(Path(match_config.manager_botpack_path),
                                        profile.get('rating',0),index,profile=profile,excluded=failed)
                player.config_path=str(cfg);player.bot_skill=skill
                log(f'{player.name}: {previous} did not become ready; temporarily using {profile["engine"]} for this match. Saved bot choices are unchanged.')
            # Old process metadata must not be attached to the new workers.
            manager.agent_metadata_map.clear()
            while True:
                try:manager.agent_metadata_queue.get_nowait()
                except queue.Empty:break
            readiness=BotReadiness(match_config)
            manager.load_match_config(match_config)
