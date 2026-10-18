"""Completed scores survive slow or failed speech; never launch a game."""
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import Mock, patch
from launcher import finish_played_match


class MatchResultTests(unittest.TestCase):
    def packet(self):
        score = NS(score=500, goals=3, assists=1, saves=2, shots=5, demolitions=0)
        return NS(teams=[NS(score=3), NS(score=1)], num_cars=1,
                  game_cars=[NS(name='Human account', team=0, is_bot=False, score_info=score)])

    def test_publishes_snapshot_before_postgame_and_keeps_atomic_file(self):
        workspace = Path(__file__).resolve().parent
        with tempfile.TemporaryDirectory(dir=workspace) as folder, patch('launcher.log_event') as log:
            self.assertTrue(Path(folder).resolve().is_relative_to(workspace))
            target = Path(folder) / 'result.json'
            packet = self.packet()
            desk = Mock()
            def postgame():
                self.assertEqual(log.call_args_list[0].args[0], 'MATCH_COMPLETED')
                self.assertEqual(json.loads(target.read_text())['blueScore'], 3)
                packet.teams[0].score = 0
                packet.game_cars[0].score_info.goals = 0
            desk.finish_match.side_effect = postgame
            result = finish_played_match(packet, target, desk)
            self.assertEqual(result['blueScore'], 3)
            self.assertEqual(result['playerStats'][0]['goals'], 3)
            self.assertEqual(log.call_args.args[0], 'COMMENTARY_COMPLETED')
            self.assertFalse(target.with_suffix('.json.tmp').exists())

    def test_failed_commentary_still_returns_real_result_and_sends_cleanup_marker(self):
        with patch('launcher.log_event') as log:
            desk = Mock()
            desk.finish_match.side_effect = RuntimeError('speech stopped')
            result = finish_played_match(self.packet(), None, desk)
            self.assertEqual(result['orangeScore'], 1)
            desk.stop.assert_called_once()
            self.assertEqual(log.call_args.args[0], 'COMMENTARY_COMPLETED')

    def test_file_error_still_sends_the_result_over_stdout(self):
        with patch('launcher.log_event') as log, patch.object(Path, 'write_text', side_effect=OSError('disk error')):
            result = finish_played_match(self.packet(), Path('unused.json'), None)
            calls = [c for c in log.call_args_list if c.args[0] == 'MATCH_COMPLETED']
            self.assertEqual(calls[0].kwargs['result'], result)


if __name__ == '__main__':
    unittest.main()
