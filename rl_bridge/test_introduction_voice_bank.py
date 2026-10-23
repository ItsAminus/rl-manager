import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from introduction_voice_bank import build_manifest, expand_manifest, clip_fingerprint, generate, load_player_audio, speech_keys, assemble_player_audio, prepare_continuity


class VoiceBankTests(unittest.TestCase):
    def test_top_names_expansion_preserves_paid_recordings_and_stable_rating_order(self):
        players=[{'id':'a','gamertag':'Leader','overall':90},
                 {'id':'c','gamertag':'Tie later','overall':70},
                 {'id':'b','gamertag':'Tie first','overall':70}]
        bank=build_manifest(players,voice_id='TestVoice123')
        original=bank['clips']['name/a'];original['fingerprint']=clip_fingerprint(bank,original)
        expanded=expand_manifest(bank,players,2)
        self.assertIs(expanded['clips']['name/a'],original)
        self.assertIn('name/b',expanded['clips']);self.assertNotIn('name/c',expanded['clips'])
        self.assertEqual(sum(k.startswith(('intro/','outro/')) for k in expanded['clips']),30)
        changed=copy.deepcopy(players);changed[0]['gamertag']='Changed'
        with self.assertRaisesRegex(ValueError,'existing recording'):expand_manifest(bank,changed,2)

    def manifest(self):
        return build_manifest([{'id':'p1','gamertag':'RealTag','overall':80},
                               {'id':'p2','gamertag':'BelowCutoff','overall':79}],voice_id='TestVoice123')

    def test_cutoff_ages_and_placeholder_free_text(self):
        bank=self.manifest();clips=bank['clips']
        self.assertIn('name/p1',clips);self.assertNotIn('name/p2',clips)
        self.assertEqual(sum(k.startswith('age/') for k in clips),21)
        self.assertIn('age/15',clips);self.assertIn('age/35',clips)
        for clip in clips.values():
            self.assertNotIn('[NAME]',clip['text'])
            self.assertNotIn('[AGE]',clip['text'])
        self.assertIn('debut/2024-split-1-regional-1',clips)
        self.assertIn('worlds/7th-8th',clips)

    def test_completed_requests_resume_without_spending_again_and_voice_change_invalidates(self):
        bank=self.manifest();bank['clips']={'name/p1':bank['clips']['name/p1']}
        calls=[]
        def request(req,timeout):
            calls.append(req)
            self.assertIn('output_format=pcm_24000',req.full_url)
            self.assertEqual(json.loads(req.data)['text'],'RealTag.')
            return io.BytesIO(b'\0\0'*2400)
        with tempfile.TemporaryDirectory() as temp, patch('introduction_voice_bank.time.sleep'):
            generate(bank,temp,'test-key',emit=lambda _:None,request=request)
            generate(bank,temp,'test-key',emit=lambda _:None,request=request)
            self.assertEqual(len(calls),1)
            saved=json.loads((Path(temp)/'bank.json').read_text())
            self.assertEqual(saved['clips']['name/p1']['fingerprint'],clip_fingerprint(bank,bank['clips']['name/p1']))
            bank['voiceId']='OtherVoice123'
            generate(bank,temp,'test-key',emit=lambda _:None,request=request)
            self.assertEqual(len(calls),2)

    def test_loader_requires_same_voice_and_current_name_but_no_network(self):
        bank=self.manifest();player={'playerId':'p1','gamertag':'RealTag','age':18,
                                    'rlcsDebut':'2024 Split 1 Regional 1','bestWorldsResult':'7TH–8TH'}
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            for key in speech_keys(player,0):
                clip=bank['clips'][key];clip['fingerprint']=clip_fingerprint(bank,clip)
                (root/clip['file']).write_bytes(b'fake audio')
            (root/'bank.json').write_text(json.dumps(bank))
            loaded=load_player_audio(root,player,0,lambda path:path.name)
            self.assertEqual(len(loaded),6)
            # A true, newly researched placement outside the original vocabulary
            # must not silence the name/age/debut or replace the result with a lie.
            loaded=load_player_audio(root,{**player,'bestWorldsResult':'19TH-20TH'},0,lambda path:path.name)
            self.assertEqual(len(loaded),5)
            self.assertIsNone(load_player_audio(root,{**player,'gamertag':'Renamed'},0,lambda _:None))
            bank['voiceSettings']['stability']=.9
            (root/'bank.json').write_text(json.dumps(bank))
            self.assertIsNone(load_player_audio(root,player,0,lambda _:None))

    def test_path_escape_never_writes_outside_the_bank(self):
        bank=self.manifest();bank['clips']={'name/p1':{'text':'RealTag.','file':'../escape.wav'}}
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(ValueError,'inside the voice library'):
                generate(bank,temp,'test-key',emit=lambda _:None,request=lambda *a,**k:None)

    def test_context_changes_invalidate_clips_and_are_sent_as_conditioning(self):
        bank=self.manifest();clip=bank['clips']['name/p1'];clip.pop('generationContext');before=clip_fingerprint(bank,clip)
        prepare_continuity(bank)
        self.assertNotEqual(before,clip_fingerprint(bank,clip))
        self.assertIn('previous_text',clip['generationContext'])
        self.assertNotIn('[NAME]',clip['text'])

    def test_assembly_removes_excess_silence_matches_levels_and_keeps_quiet_ending(self):
        import numpy as np
        rate=24000
        tone=np.sin(2*np.pi*220*np.arange(rate//2)/rate).astype(np.float32)
        quiet=np.full(rate//50,.0015,dtype=np.float32)
        first=np.concatenate((np.zeros(rate//2),tone*.08,quiet,np.zeros(rate//2)))
        second=np.concatenate((np.zeros(rate//2),tone*.3,np.zeros(rate//2)))
        result=assemble_player_audio([first,second],rate)
        self.assertLess(len(result)/rate,1.5)
        self.assertLessEqual(float(np.max(np.abs(result))),.94001)
        self.assertTrue(np.all(np.isfinite(result)))
        with self.assertRaisesRegex(ValueError,'silent'):
            assemble_player_audio([np.zeros(1000)],rate)

    def test_local_save_failure_resumes_a_paid_clip_from_its_receipt(self):
        bank=self.manifest();bank['clips']={'name/p1':bank['clips']['name/p1']}
        request=unittest.mock.Mock(side_effect=lambda *a,**k:io.BytesIO(b'\0\0'*2400))
        with tempfile.TemporaryDirectory() as temp, patch('introduction_voice_bank.time.sleep'):
            with patch('introduction_voice_bank.save_manifest',side_effect=PermissionError('locked')):
                with self.assertRaises(PermissionError):generate(bank,temp,'test-key',emit=lambda _:None,request=request)
            fresh=copy.deepcopy(bank);fresh['clips']['name/p1'].pop('fingerprint')
            generate(fresh,temp,'test-key',emit=lambda _:None,request=request)
            self.assertEqual(request.call_count,1)
            self.assertIn('fingerprint',fresh['clips']['name/p1'])


if __name__=='__main__':unittest.main()
