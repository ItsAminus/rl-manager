import importlib.util
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('steam_cache',Path(__file__).with_name('sync-scoreboard-steam-avatars.py'))
steam=importlib.util.module_from_spec(spec)
spec.loader.exec_module(steam)

class SteamAvatarIdentityTests(unittest.TestCase):
    def test_only_explicit_steam_links_from_player_infobox_are_accepted(self):
        self.assertEqual(steam.steam_profile('{{Infobox player\n|steam=profiles/76561199038935432\n}}'),
                         'https://steamcommunity.com/profiles/76561199038935432')
        self.assertIsNone(steam.steam_profile('{{Infobox player\n|steam=https://example.com/fake\n}}'))
        self.assertIsNone(steam.steam_profile('{{Infobox player\n|steam=\n|twitter=Mech\n}}'))

    def test_same_nickname_cannot_verify_an_unrelated_qualifier_account(self):
        player={'id':'sg_player_1','gamertag':'zen','realName':'Alexis Bernier'}
        wiki='{{Infobox player\n|id=zen\n|name=Alexis Bernier\n|startgg=someone_else\n}}'
        self.assertIsNone(steam.confirmed_identity(player,wiki,{'profileUrl':'https://www.start.gg/user/01234567'}))
        self.assertEqual(steam.confirmed_identity(player,wiki.replace('someone_else','01234567'),
                                                {'profileUrl':'https://www.start.gg/user/01234567'}),'Exact linked start.gg user')

    def test_xml_must_match_the_requested_steam_account(self):
        url='https://steamcommunity.com/profiles/76561199038935432'
        xml=b'<profile><steamID64>76561199038935432</steamID64><avatarFull>https://avatars.fastly.steamstatic.com/test_full.jpg</avatarFull></profile>'
        self.assertIn('steamstatic.com',steam.avatar_from_xml(xml,url))
        with self.assertRaises(ValueError): steam.avatar_from_xml(xml,url.replace('5432','9999'))
        with self.assertRaises(ValueError): steam.avatar_from_xml(xml.replace(b'avatars.fastly.steamstatic.com',b'example.com'),url)

if __name__=='__main__':unittest.main()
