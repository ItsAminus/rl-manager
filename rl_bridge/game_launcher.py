"""Choose the account launcher from the selected Rocket League installation."""
from pathlib import Path, PureWindowsPath
import os
import subprocess
import sys


def launcher_preference(executable, log=lambda _: None):
    from rlbot.setup_manager import RocketLeagueLauncherPreference

    executable = Path(executable)
    # Match a Steam library directory, including custom library drive locations.
    parts = [part.lower() for part in PureWindowsPath(str(executable)).parts]
    steam = any(parts[i:i + 2] == ['steamapps', 'common'] for i in range(len(parts) - 1))
    if not steam:
        # A manifest also identifies a library whose directory names differ.
        steam = any((parent / 'appmanifest_252950.acf').is_file()
                    for parent in executable.parents)
    platform = 'steam' if steam else 'epic'
    log(f'Rocket League launcher: {platform}; selected installation: {executable}')
    return RocketLeagueLauncherPreference(
        preferred_launcher=platform,
        # Epic's authentication workaround must never run on a Steam binary.
        use_login_tricks=not steam,
        rocket_league_exe_path=executable if executable.exists() else None,
    )


def configure_launcher(manager, executable, log=lambda _: None):
    """Keep Steam authentication while selecting the executable for local mods.

    RLBot 1.x uses Steam's -applaunch route, which can choose the EAC launch
    configuration even when -noeac is passed. Follow RLBot/core PR #172:
    launch RocketLeague.exe directly with Steam's app identity in its environment.
    Override this manager only; leave the installed RLBot package untouched.
    """
    preference = launcher_preference(executable, log)
    if preference.preferred_launcher != 'steam' or sys.platform != 'win32':
        return preference

    executable = Path(executable)

    def launch_steam(port):
        from bakkesmod_startup import process_ids
        from rlbot.setup_manager import ROCKET_LEAGUE_PROCESS_INFO

        if not executable.is_file() or executable.name.lower() != 'rocketleague.exe':
            raise RuntimeError('Select the Steam Binaries/Win64/RocketLeague.exe in connection settings before starting a match.')
        if not process_ids('steam.exe'):
            raise RuntimeError('Open Steam and sign in before starting a Rocket League match through RLM.')

        environment = os.environ.copy()
        environment.update(SteamAppId='252950', SteamGameId='252950')
        arguments = list(ROCKET_LEAGUE_PROCESS_INFO.get_ideal_args(port))
        if '-noeac' not in arguments:
            arguments.append('-noeac')
        log(f'Steam mod launch: {executable}; direct executable; SteamAppId=252950; arguments: {arguments}')
        subprocess.Popen([str(executable), *arguments], cwd=str(executable.parent), env=environment)
        return True

    manager.launch_rocket_league_with_steam = launch_steam
    return preference
