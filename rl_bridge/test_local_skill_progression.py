import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import rating_bots
from rating_bots import rating_plan
from local_skill_progression import core_skills
from test_bot_plan import roster

class Tests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=Path(__file__).parent/'commentary/cache')
        self.patch=patch.object(rating_bots,'SERIES_ROOT',Path(self.temp.name));self.patch.start()
    def tearDown(self):self.patch.stop();self.temp.cleanup()
    def context(self):
        c=roster();c.update(difficulty='Hard',gameMode='Path To Glory',pathHostedUnlocked=False,careerId='progression-test',fixtureId='series-one')
        for side in ('blueTeam','orangeTeam'):
            for p in c[side]['players']:p['rating']=99;p['attributes']={'passing':74,'groundControl':95,'aerial':95,'shooting':99,'shotAccuracy':99,'defense':95,'goalkeeping':95}
        return c
    def test_live_routing_is_gated_by_all_five_skills_and_hard_is_unchanged(self):
        c=self.context();a=rating_plan(c)['assignments'][1];self.assertEqual(a['engine'],'Botimus Prime')
        for p in c['blueTeam']['players']:p['attributes']['passing']=75
        self.assertIn(rating_plan(c)['assignments'][1]['engine'],('Necto','Element'))
        c['gameMode']='Manager Career';c['difficulty']='Easy';self.assertIn(rating_plan(c)['assignments'][1]['engine'],('Stick','Codename Cryo'))
        c['difficulty']='Hard';self.assertEqual(rating_plan(c)['route'],'Rocket Host');self.assertNotIn('development',rating_plan(c)['assignments'][1])
    def test_unlock_waits_for_the_next_series_and_does_not_change_the_human(self):
        c=self.context();old=rating_plan(c,lock_series=True)
        c['blueTeam']['players'][1]['attributes']['passing']=95;c['gameNumber']=2
        locked=rating_plan(c)['assignments'][1]
        self.assertEqual(locked['engine'],old['assignments'][1]['engine']);self.assertEqual(locked['target'],old['assignments'][1]['target'])
        c['fixtureId']='series-two';c['blueTeam']['players'][1]['pathTierCap']=79;new=rating_plan(c)
        self.assertIn(new['assignments'][1]['engine'],('Necto','Element'));self.assertIsNone(new['assignments'][0]['engine'])
        self.assertNotIn('development',new['assignments'][0])
    def test_old_missing_attributes_fall_back_to_career_rating_and_preserve_zero(self):
        self.assertEqual(core_skills({'rating':80,'attributes':{'passing':0,'aerial':None}})['passing'],0)
        self.assertEqual(core_skills({'rating':80})['shooting'],80)
    def test_earned_series_form_reward_uses_stronger_ai_without_permanent_changes(self):
        c=self.context();p=c['blueTeam']['players'][1];p.update(rating=54,pathTierCap=0,attributes={'passing':54,'groundControl':54,'aerial':54,'shooting':54,'shotAccuracy':54,'defense':54,'goalkeeping':54})
        self.assertEqual(rating_plan(c)['assignments'][1]['engine'],'Career Rookie')
        p['pathForm']={'rating':92,'fixtureId':c['fixtureId'],'rewardKey':'games_5'}
        plan=rating_plan(c);self.assertEqual(plan['route'],'Local');self.assertEqual(plan['assignments'][1]['engine'],'Nexto')
        self.assertTrue(plan['assignments'][1]['temporaryForm']);self.assertEqual(p['rating'],54);self.assertEqual(p['attributes']['passing'],54)
        c['fixtureId']='later-series';self.assertEqual(rating_plan(c)['assignments'][1]['engine'],'Career Rookie')
    def test_squad_trials_cap_the_local_policy_and_champ_unlocks_hosted_matches(self):
        c=self.context()
        for side in ('blueTeam','orangeTeam'):
            for p in c[side]['players']:p['attributes']={key:99 for key in ('passing','groundControl','aerial','shooting','shotAccuracy','defense','goalkeeping')}
        for p in c['blueTeam']['players']:p['pathTierCap']=0
        plan=rating_plan(c)
        self.assertEqual(plan['route'],'Local');self.assertEqual(plan['assignments'][1]['engine'],'Career Rookie')
        for p in c['blueTeam']['players']:p['pathTierCap']=79
        self.assertIn(rating_plan(c)['assignments'][1]['engine'],('Necto','Element'))
        for p in c['blueTeam']['players']:p['pathTierCap']=84
        c['pathHostedUnlocked']=True
        from test_rating_bots import CATALOG
        hosted=rating_plan(c,CATALOG)
        self.assertEqual(hosted['route'],'Rocket Host');self.assertIn(hosted['assignments'][1]['engine'],('AstraV5','Zeus'))
        self.assertIsNone(hosted['assignments'][0]['engine']);self.assertFalse(hosted['assignments'][1]['styleApplied'])
if __name__=='__main__':unittest.main()
