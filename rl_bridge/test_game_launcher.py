import tempfile
import unittest
import os
from pathlib import Path
from unittest.mock import Mock, patch

from game_launcher import configure_launcher, launcher_preference
from rlbot.setup_manager import SetupManager


class LauncherTests(unittest.TestCase):
    def test_steam_libraries_bypass_epic_authentication(self):
        for path in (r'C:\Program Files (x86)\Steam\steamapps\common\rocketleague\Binaries\Win64\RocketLeague.exe',
                     r'F:\Games\STEAMAPPS\Common\rocketleague\Binaries\Win64\RocketLeague.exe'):
            preference = launcher_preference(path)
            self.assertEqual(preference.preferred_launcher, 'steam')
            self.assertFalse(preference.use_login_tricks)
            with patch.object(SetupManager, 'launch_rocket_league_with_steam', return_value=True) as steam, \
                    patch.object(SetupManager, 'launch_rocket_league_with_epic') as epic:
                manager = SetupManager.__new__(SetupManager)
                self.assertTrue(manager.launch_rocket_league(23234, preference))
                steam.assert_called_once_with(23234)
                epic.assert_not_called()

    def test_library_manifest_and_existing_executable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'appmanifest_252950.acf').touch()
            executable = root / 'custom' / 'Binaries' / 'Win64' / 'RocketLeague.exe'
            executable.parent.mkdir(parents=True)
            executable.touch()
            preference = launcher_preference(executable)
            self.assertEqual(preference.preferred_launcher, 'steam')
            self.assertEqual(preference.rocket_league_exe_path, executable)

    def test_steam_launch_selects_mod_executable_and_preserves_bridge_arguments(self):
        manager = SetupManager.__new__(SetupManager)
        manager.logger = Mock()
        arguments = ['-rlbot', 'RLBot_ControllerURL=127.0.0.1:23234', 'RLBot_PacketSendRate=120', '-nomovie', '-noeac']
        with tempfile.TemporaryDirectory() as directory, \
                patch('game_launcher.sys.platform', 'win32'), \
                patch('bakkesmod_startup.process_ids', return_value={1234}), \
                patch.dict(os.environ, {'SteamAppId': 'other-game', 'SteamGameId': 'other-game'}), \
                patch('rlbot.setup_manager.ROCKET_LEAGUE_PROCESS_INFO.get_ideal_args', return_value=arguments), \
                patch('game_launcher.subprocess.Popen') as spawn, \
                patch.object(SetupManager, 'launch_rocket_league_with_epic') as epic:
            executable = Path(directory) / 'steamapps' / 'common' / 'rocketleague' / 'Binaries' / 'Win64' / 'RocketLeague.exe'
            executable.parent.mkdir(parents=True)
            executable.touch()
            logs = []
            preference = configure_launcher(manager, executable, logs.append)
            self.assertTrue(manager.launch_rocket_league(23234, preference))
            spawn.assert_called_once()
            self.assertEqual(spawn.call_args.args[0], [str(executable)] + arguments)
            self.assertEqual(spawn.call_args.kwargs['cwd'], str(executable.parent))
            self.assertEqual(spawn.call_args.kwargs['env']['SteamAppId'], '252950')
            self.assertEqual(spawn.call_args.kwargs['env']['SteamGameId'], '252950')
            self.assertEqual(os.environ['SteamAppId'], 'other-game')
            self.assertIn('direct executable', logs[-1])
            epic.assert_not_called()

    def test_steam_requires_selected_executable_and_running_client(self):
        with tempfile.TemporaryDirectory() as directory, \
                patch('game_launcher.sys.platform', 'win32'), \
                patch('bakkesmod_startup.process_ids', return_value=set()), \
                patch('game_launcher.subprocess.Popen') as spawn:
            executable = Path(directory) / 'steamapps' / 'common' / 'RocketLeague.exe'
            manager = SetupManager.__new__(SetupManager)
            preference = configure_launcher(manager, executable)
            with self.assertRaisesRegex(RuntimeError, 'Select the Steam'):
                manager.launch_rocket_league(23234, preference)
            executable.parent.mkdir(parents=True)
            executable.touch()
            with self.assertRaisesRegex(RuntimeError, 'Open Steam and sign in'):
                manager.launch_rocket_league(23234, preference)
            spawn.assert_not_called()

    def test_epic_configuration_leaves_steam_launcher_unchanged(self):
        manager = SetupManager.__new__(SetupManager)
        original = manager.launch_rocket_league_with_steam
        preference = configure_launcher(manager, r'C:\Program Files\Epic Games\rocketleague\Binaries\Win64\RocketLeague.exe')
        self.assertEqual(manager.launch_rocket_league_with_steam, original)
        self.assertEqual(preference.preferred_launcher, 'epic')

    def test_epic_keeps_its_authentication_flow_and_logs_selection(self):
        logs = []
        preference = launcher_preference(r'C:\Program Files\Epic Games\rocketleague\Binaries\Win64\RocketLeague.exe', logs.append)
        self.assertEqual(preference.preferred_launcher, 'epic')
        self.assertTrue(preference.use_login_tricks)
        self.assertIn('launcher: epic', logs[0])


if __name__ == '__main__':
    unittest.main()
