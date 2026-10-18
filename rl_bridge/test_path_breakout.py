import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import rating_bots
from rating_bots import rating_plan, path_breakout_slot, series_file
from test_bot_plan import roster


class Tests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=Path(__file__).parent/'commentary/cache')
        self.root=patch.object(rating_bots,'SERIES_ROOT',Path(self.temp.name))
        self.root.start()
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(self.root.stop)

    def context(self):
        c=roster()
        c.update(careerId='breakout-test',fixtureId='series',gameMode='Path To Glory',gameNumber=1)
        for side in ('blueTeam','orangeTeam'):
            for p in c[side]['players']:
                p.update(rating=54,pathTierCap=0)
        return c

    def winning_context(self):
        c=self.context()
        for n in range(1000):
            c['fixtureId']=f'series-{n}'
            if any(a['luckyGame'] for a in rating_plan(c)['assignments']):
                following={**c,'gameNumber':2}
                if not any(a['luckyGame'] for a in rating_plan(following)['assignments']):return c
        self.fail('No deterministic hit followed by a miss')

    def test_one_own_ai_gets_actual_nexto_and_career_data_is_unchanged(self):
        c=self.winning_context();original=copy.deepcopy(c)
        plan=rating_plan(c)
        lucky=[a for a in plan['assignments'] if a['luckyGame']]
        self.assertEqual(len(lucky),1)
        a=lucky[0]
        self.assertEqual((a['team'],a['type'],a['engine'],a['botSkill']),(0,'Local','Nexto',1))
        self.assertEqual(a['rating'],54)
        self.assertEqual(a['performance']['skills']['shooting'],54)
        self.assertEqual(plan['assignments'][0]['type'],'Human')
        self.assertIsNone(plan['assignments'][0]['engine'])
        self.assertTrue(all(a['engine']=='Career Rookie' for a in plan['assignments'][3:]))
        self.assertEqual(c,original)
        # The launcher's engine resolver points to Nexto's real policy config.
        from bot_assignment import engine_config
        from launcher import DEFAULT_BOTPACK
        cfg=engine_config(Path(DEFAULT_BOTPACK),lucky[0]['engine'])
        self.assertIsNotNone(cfg)
        self.assertEqual(cfg.parent.name,'Nexto')

    def test_preview_launch_retries_and_selection_revision_do_not_reroll(self):
        c=self.winning_context()
        first=rating_plan(c)['assignments']
        self.assertEqual(first,rating_plan(c,lock_series=True)['assignments'])
        self.assertEqual(first,rating_plan(c,lock_series=True)['assignments'])
        c['botSelectionRevision']=91
        self.assertEqual(first,rating_plan(c)['assignments'])
        saved=json.loads(series_file(c).read_text())['assignments']
        self.assertFalse(any(a['luckyGame'] for a in saved))
        self.assertTrue(all(a['engine']=='Career Rookie' for a in saved if a['type']=='Local'))
        c['gameNumber']=2
        after=rating_plan(c,lock_series=True)['assignments']
        self.assertFalse(any(a['luckyGame'] for a in after))
        self.assertTrue(all(a['engine']=='Career Rookie' for a in after if a['type']=='Local'))

    def test_only_local_path_games_and_no_downgrade_for_existing_nexto(self):
        c=self.winning_context();base=rating_plan(c)['assignments']
        for a in base:
            if a['type']=='Local' and a['team']==0:a['engine']='Nexto'
        self.assertIsNone(path_breakout_slot(c,base))
        c['gameMode']='Manager Career'
        self.assertFalse(any(a['luckyGame'] for a in rating_plan(c)['assignments']))
        c['gameMode']='Path To Glory';c['pathHostedUnlocked']=True
        # No prior local series lock exists in this test.
        self.assertEqual(rating_plan(c)['route'],'Rocket Host')
        self.assertFalse(any(a['luckyGame'] for a in rating_plan(c)['assignments']))

    def test_total_game_probability_is_five_percent_not_per_teammate(self):
        c=self.context();base=rating_plan(c)['assignments']
        hits={1:0,2:0}
        for game in range(1,20001):
            c['gameNumber']=game
            slot=path_breakout_slot(c,base)
            if slot is not None:hits[slot]+=1
        self.assertTrue(900<=sum(hits.values())<=1100,hits)
        self.assertTrue(all(400<=count<=600 for count in hits.values()),hits)


if __name__=='__main__':unittest.main()
