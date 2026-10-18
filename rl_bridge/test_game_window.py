import unittest
from types import SimpleNamespace
from unittest.mock import Mock,patch
import game_window


class WindowHandoffTests(unittest.TestCase):
    def test_finished_game_minimizes_and_ready_game_restores_without_changing_display_mode(self):
        calls=[]
        user=SimpleNamespace(IsIconic=Mock(return_value=True),
                             ShowWindow=lambda window,mode:calls.append((window,mode)),
                             SetForegroundWindow=lambda window:True)
        with patch.object(game_window.sys,'platform','win32'),patch.object(game_window,'_rocket_window',return_value=(user,123)):
            self.assertTrue(game_window.minimize_rocket_league())
            self.assertTrue(game_window.focus_rocket_league())
        self.assertEqual(calls,[(123,6),(123,9)])

    def test_missing_or_inaccessible_window_never_blocks_result_saving(self):
        with patch.object(game_window.sys,'platform','win32'):
            with patch.object(game_window,'_rocket_window',return_value=(None,None)):
                self.assertFalse(game_window.minimize_rocket_league())
                self.assertFalse(game_window.focus_rocket_league())
            with patch.object(game_window,'_rocket_window',side_effect=OSError('window disappeared')):
                self.assertFalse(game_window.minimize_rocket_league())
                self.assertFalse(game_window.focus_rocket_league())

if __name__=='__main__':unittest.main()
