import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent/'commentary'))
from series_story import SeriesStory

def series(best, blue, orange, history=()):
    return SeriesStory({'series': {'bestOf': best, 'blueWins': blue, 'orangeWins': orange,
                                   'gameNumber': blue+orange+1, 'history': history}}, ('NIP','PWR'))

class SeriesTests(unittest.TestCase):
    def test_two_game_group_match_always_plays_both_and_can_draw(self):
        first = series(2,0,0)
        self.assertIn('two-game group matchup', first.stakes())
        self.assertIn('second game still has to be played', first.postgame((4,0)))
        second = series(2,1,0)
        self.assertNotIn('series point', second.stakes())
        self.assertIn('Each nation earns one group point', second.postgame((0,2)))
        self.assertIn('all three group points', second.postgame((2,0)))
        with self.assertRaises(ValueError): series(2,1,1)

    def test_match_point_and_decider_follow_best_of(self):
        self.assertIn('PWR have to win', series(3,1,0).stakes())
        self.assertIn('deciding', series(5,2,2).stakes())
        self.assertIn('series point', series(7,3,0).stakes())
        with self.assertRaises(ValueError): series(3,2,0)

    def test_postgame_survival_and_deciding_game(self):
        text = series(3,1,0).postgame((1,2))
        self.assertIn('survive series point', text)
        self.assertIn('level at 1', text)
        self.assertIn('deciding game', text)

    def test_reverse_sweep_requires_confirmed_earlier_game_losses(self):
        history = [{'winner': i} for i in (0,0,1,1)]
        text = series(5,2,2,history).postgame((0,1))
        self.assertIn('reverse sweep is complete', text)
        self.assertIn('PWR win the series 3 to 2', text)
        self.assertNotIn('reverse sweep', series(5,2,2,[{'winner':i} for i in (0,1,0,1)]).postgame((0,1)))

    def test_goals_are_not_added_to_series_score(self):
        text = series(5,1,0).postgame((7,1))
        self.assertIn('lead the series 2 to 0', text)
        self.assertNotIn('series 8', text)
        self.assertEqual(series(5,0,0).postgame((2,2)), '')
        self.assertNotIn('reverse sweep', series(1,0,0).postgame((1,0)))

    def test_comeback_requires_confirmed_deficit(self):
        self.assertIn('two-goal deficit', series(5,0,0).postgame((2,3), [{'type':'goal','score':(2,0)}]))
        self.assertNotIn('two-goal deficit', series(5,0,0).postgame((2,3)))

if __name__ == '__main__': unittest.main()
