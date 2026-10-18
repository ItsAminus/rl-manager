"""Verify native match options without connecting to Rocket League."""
import unittest
from pathlib import Path
from unittest.mock import patch
from launcher import build_match_config


class MatchSettingsTests(unittest.TestCase):
    def test_native_goal_replays_enabled_and_next_game_restarts(self):
        context = {
            'blueTeam': {'players': [{'gamertag': 'Human', 'rating': 40, 'isHuman': True},
                                     {'gamertag': 'Blue 2', 'rating': 40},
                                     {'gamertag': 'Blue 3', 'rating': 40}]},
            'orangeTeam': {'players': [{'gamertag': f'Orange {i}', 'rating': 40} for i in range(3)]}}
        with patch('launcher.log_event'):
            config = build_match_config(context, Path('unused-test-botpack'))
        self.assertFalse(config.skip_replays)
        self.assertFalse(config.create_match_settings().skip_replays)
        self.assertEqual(config.existing_match_behavior, 'Restart')
        self.assertEqual(config.num_players, 6)


if __name__ == '__main__':
    unittest.main()
