"""Choose the account launcher from the selected Rocket League installation."""
from pathlib import Path, PureWindowsPath


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
