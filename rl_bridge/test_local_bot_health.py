import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from local_bot_health import check_bot, candidates, audit
from launcher import select_bot_cfg, verify_bot_can_load


class LocalBotHealthTests(unittest.TestCase):
    def tearDown(self):
        verify_bot_can_load.cache_clear()

    def test_import_check_uses_bot_directory_and_keeps_diagnostics(self):
        with tempfile.TemporaryDirectory() as folder:
            cfg=Path(folder)/'bot.cfg';cfg.touch()
            failed=subprocess.CompletedProcess([],1,'','ModuleNotFoundError: missing_dependency')
            with patch('local_bot_health.subprocess.run',return_value=failed) as run:
                healthy,error=check_bot(cfg)
                self.assertFalse(healthy)
                self.assertIn('missing_dependency',error)
                self.assertEqual(run.call_args.kwargs['cwd'],str(cfg.parent))
                self.assertTrue(run.call_args.kwargs['capture_output'])
                self.assertEqual(run.call_args.kwargs['timeout'],60)

    def test_missing_and_timeout_are_reported(self):
        self.assertFalse(check_bot(None)[0])
        with tempfile.TemporaryDirectory() as folder:
            cfg=Path(folder)/'bot.cfg';cfg.touch()
            with patch('local_bot_health.subprocess.run',side_effect=subprocess.TimeoutExpired([],60)):
                self.assertIn('60 seconds',check_bot(cfg)[1])

    def test_audit_checks_every_assignable_policy(self):
        with patch('local_bot_health.engine_config',return_value=Path('bot.cfg')), \
                patch('local_bot_health.check_bot',return_value=(True,'')) as check:
            result=audit(Path('.'))
        self.assertEqual(len(result),16)
        self.assertEqual(check.call_count,16)
        self.assertIn('Bribblebot',result)
        self.assertIn('Career Rookie',result)

    def test_candidate_order_does_not_upgrade_a_failed_bot(self):
        self.assertEqual(candidates('Nexto')[:3],['Nexto','Necto','Element'])
        self.assertNotIn('Nexto',candidates('Bribblebot'))
        self.assertEqual(candidates('Bribblebot')[-1],'Career Rookie')

    def test_local_failure_falls_back_and_updates_actual_profile(self):
        profile={'engine':'Bribblebot','rating':60,'playerId':'test'}
        with patch('launcher.engine_config',side_effect=lambda root,name:Path(name+'.cfg')), \
                patch('launcher.verify_bot_can_load',side_effect=lambda cfg:cfg.stem=='VirxEB'), \
                patch('launcher.log_event') as log:
            cfg,skill=select_bot_cfg(Path('.'),60,0,profile=profile)
        self.assertEqual(cfg.stem,'VirxEB')
        self.assertEqual(profile['engine'],'VirxEB')
        self.assertEqual(profile['fallbackFrom'],'Bribblebot')
        log.assert_called_once()

    def test_no_available_bot_reports_runtime_repair(self):
        with patch('launcher.engine_config',return_value=None):
            with self.assertRaisesRegex(RuntimeError,'complete setup'):
                select_bot_cfg(Path('.'),60,0,profile={'engine':'Bribblebot'})

    def test_rookie_fallback_uses_rookie_skill(self):
        profile={'engine':'Bribblebot'}
        with patch('launcher.engine_config',side_effect=lambda root,name:Path(name+'.cfg')), \
                patch('launcher.verify_bot_can_load',side_effect=lambda cfg:cfg.stem=='Career Rookie'), \
                patch('launcher.log_event'):
            _,skill=select_bot_cfg(Path('.'),60,0,profile=profile)
        self.assertEqual(skill,0.0)


if __name__=='__main__':unittest.main()
