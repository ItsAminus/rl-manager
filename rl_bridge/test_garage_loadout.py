import unittest
from pathlib import Path
from unittest.mock import patch
from rlbot.matchconfig.match_config import PlayerConfig
from garage_loadout import apply_garage_loadout
from launcher import build_match_config

LOADOUT={'car_id':4284,'wheels_id':386,'boost_id':63,'paint_finish_id':270,'custom_finish_id':270,'decal_id':0,'trails_id':1948,'goal_explosion_id':1903,'car_paint_id':12,'primary':'#1244AA','secondary':'#FFEEDD'}
class GarageLoadoutTests(unittest.TestCase):
    def test_applies_saved_body_items_paint_and_rgb_to_actual_rlbot_config(self):
        p=PlayerConfig();p.bot=True
        self.assertTrue(apply_garage_loadout(p,{'garageLoadout':LOADOUT}))
        self.assertEqual(p.loadout_config.car_id,4284)
        self.assertEqual(p.loadout_config.paint_config.car_paint_id,12)
        self.assertEqual(p.loadout_config.primary_color_lookup.red,18)
        self.assertEqual(p.loadout_config.secondary_color_lookup.blue,221)
    def test_unsaved_appearance_and_human_car_are_preserved(self):
        p=PlayerConfig();p.bot=True;self.assertFalse(apply_garage_loadout(p,{}));self.assertIsNone(p.loadout_config)
        p.bot=False;self.assertFalse(apply_garage_loadout(p,{'garageLoadout':LOADOUT}));self.assertIsNone(p.loadout_config)
    def test_per_player_presets_reach_match_spawn_and_human_stays_separate(self):
        blue=[{'gamertag':'Human','rating':40,'isHuman':True,'garageLoadout':LOADOUT},{'gamertag':'zen','rating':40,'garageLoadout':LOADOUT},{'gamertag':'nass','rating':40,'garageLoadout':{**LOADOUT,'car_id':23}}]
        with patch('launcher.log_event'),patch('launcher.select_bot_cfg',return_value=(None,.5)):m=build_match_config({'blueTeam':{'players':blue},'orangeTeam':{'players':[{'gamertag':'Opponent','rating':40}]}},Path('unused-test-botpack'))
        self.assertIsNone(m.player_configs[0].loadout_config)
        self.assertEqual(m.player_configs[1].loadout_config.car_id,4284)
        self.assertEqual(m.player_configs[2].loadout_config.car_id,23)
        packet=m.create_match_settings()
        self.assertEqual(packet.player_configuration[1].car_id,4284)
    def test_rejects_unsupported_item_and_colour(self):
        p=PlayerConfig();p.bot=True
        for change in [{'car_id':999999},{'primary':'not a colour'},{'car_paint_id':-1}]:
            with self.assertRaises(ValueError):apply_garage_loadout(p,{'garageLoadout':{**LOADOUT,**change}})
if __name__=='__main__':unittest.main()
