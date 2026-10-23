import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('fact_import', Path(__file__).with_name('import-introduction-facts.py'))
facts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(facts)


class ImportTests(unittest.TestCase):
    def row(self, event, path, tier='A-Tier'):
        return dict(event=event, path='/rocketleague/Rocket_League_Championship_Series/'+path, tier=tier)

    def test_rlrs_grid_qualifiers_and_other_formats_do_not_become_debuts(self):
        for row in [
            self.row('RLCS Season 7 - Europe: RLRS', 'Season_7/Europe/Rocket_League_Rival_Series'),
            self.row('RLCS X - The Grid', 'Season_X/Fall/Europe/The_Grid/1'),
            self.row('RLCS 2026: Europe 2v2 Open', '2026/2v2/Europe/Open'),
            self.row('RLCS 2026 Last Chance Qualifier', '2026/Last_Chance_Qualifier/Europe'),
            self.row('RLCS 2024 Closed Qualifier', '2024/Major_1/Europe/Open_Qualifier_1/Closed_Qualifier', 'Qualifier'),
        ]:
            self.assertFalse(facts.rlcs_main(row), row)

    def test_main_event_names_map_to_the_recorded_voice_vocabulary(self):
        row=self.row('RLCS 2022-23 - Spring: EU Regional 1 - Spring Open','2022-23/Spring/Europe/Open')
        self.assertTrue(facts.rlcs_main(row))
        self.assertEqual(facts.debut_label(row),'2022-23 Spring Regional 1')
        row=self.row('RLCS 2024 - Major 1: NA Open Qualifier 1','2024/Major_1/North_America/Open_Qualifier_1')
        self.assertTrue(facts.rlcs_main(row))
        self.assertEqual(facts.debut_label(row),'2024 Open 1')

    def test_person_sections_keep_results_separate_and_failed_render_is_empty(self):
        p=facts.ResultsParser()
        row='<tr><td>2024-02-09</td><td data-sort-value="3-4">3rd - 4th</td><td>A-Tier</td><td></td><td><a href="/rocketleague/event">Event</a></td><td data-sort-value="Club">C</td><td>Win</td></tr>'
        p.feed('<div id="rlm-bio-0"><div><table>'+row+'</table></div></div><div id="rlm-bio-1">#invoke:Lua</div><div id="rlm-bio-2"><table>'+row.replace('Event','Other')+'</table></div>')
        self.assertEqual(p.rows['rlm-bio-0'][0]['event'],'Event')
        self.assertEqual(p.rows['rlm-bio-1'],[])
        self.assertEqual(p.rows['rlm-bio-2'][0]['event'],'Other')

    def test_matching_qualifier_nickname_alone_is_not_identity_evidence(self):
        wiki='{{Infobox player\n|id=Common\n|name=Someone Else\n|birth_date=2001-01-01\n}}'
        self.assertIsNone(facts.research.identity({'id':'sg_player_123','gamertag':'Common'}, {'wiki':wiki}, {}))


if __name__ == '__main__':
    unittest.main()
