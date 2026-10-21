import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from game_launcher import launcher_preference
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

    def test_steam_launch_uses_account_launcher_and_preserves_bridge_arguments(self):
        manager = SetupManager.__new__(SetupManager)
        manager.logger = Mock()
        arguments = ['-rlbot', 'RLBot_ControllerURL=127.0.0.1:23234', 'RLBot_PacketSendRate=120', '-nomovie', '-noeac']
        with patch('rlbot.setup_manager.try_get_steam_executable_path', return_value=Path('C:/Steam/steam.exe')), \
                patch('rlbot.setup_manager.ROCKET_LEAGUE_PROCESS_INFO.get_ideal_args', return_value=arguments), \
                patch('rlbot.setup_manager.subprocess.Popen') as spawn, \
                patch.object(SetupManager, 'launch_rocket_league_with_epic') as epic:
            manager.launch_rocket_league(23234, launcher_preference('C:/Steam/steamapps/common/rocketleague/Binaries/Win64/RocketLeague.exe'))
            self.assertEqual(spawn.call_args.args[0], [str(Path('C:/Steam/steam.exe')), '-applaunch', '252950'] + arguments)
            epic.assert_not_called()

    def test_epic_keeps_its_authentication_flow_and_logs_selection(self):
        logs = []
        preference = launcher_preference(r'C:\Program Files\Epic Games\rocketleague\Binaries\Win64\RocketLeague.exe', logs.append)
        self.assertEqual(preference.preferred_launcher, 'epic')
        self.assertTrue(preference.use_login_tricks)
        self.assertIn('launcher: epic', logs[0])


if __name__ == '__main__':
    unittest.main()
