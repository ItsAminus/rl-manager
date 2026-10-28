import queue
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
from bot_startup import BotStartupError, start_with_bot_recovery
from launcher import select_bot_cfg


class BotRecoveryTests(unittest.TestCase):
    def fixture(self):
        players=[SimpleNamespace(config_path='shim-healthy.cfg',bot_skill=1,
                                  name='Healthy',manager_profile={'engine':'PenguinBot','rating':60}),
                 SimpleNamespace(config_path='shim-failed.cfg',bot_skill=1,
                                  name='Failed',manager_profile={'engine':'Bribblebot','rating':60})]
        config=SimpleNamespace(player_configs=players,manager_botpack_path='botpack')
        readiness=SimpleNamespace(original_configs={0:'healthy.cfg',1:'failed.cfg'})
        manager=Mock()
        manager.agent_metadata_queue=queue.Queue()
        manager.agent_metadata_queue.put('old worker metadata')
        return manager,config,readiness

    def test_failed_first_output_is_replaced_temporarily_and_all_bots_rechecked(self):
        manager,config,readiness=self.fixture()
        replacement_readiness=Mock()
        log=Mock()
        with patch('bot_startup.start_with_ready_bots',side_effect=[BotStartupError({1:'Failed'}),None]) as start, \
                patch('bot_startup.BotReadiness',return_value=replacement_readiness), \
                patch('launcher.engine_config',side_effect=lambda root,name:Path(name+'.cfg')), \
                patch('launcher.verify_bot_can_load',return_value=True),patch('launcher.log_event'):
            result=start_with_bot_recovery(manager,config,readiness,log)
        self.assertIs(result,replacement_readiness)
        self.assertEqual(start.call_count,2)
        self.assertTrue(all(call.kwargs['hold_on_failure'] for call in start.call_args_list))
        self.assertEqual(config.player_configs[0].manager_profile['engine'],'PenguinBot')
        self.assertEqual(config.player_configs[0].config_path,'healthy.cfg')
        self.assertNotEqual(config.player_configs[1].manager_profile['engine'],'Bribblebot')
        manager.kill_bot_processes.assert_called_once()
        manager.load_match_config.assert_called_once_with(config)
        self.assertTrue(manager.agent_metadata_queue.empty())
        self.assertIn('temporarily',log.call_args.args[0])

    def test_next_nearest_higher_bot_is_used_when_lower_and_same_level_fail(self):
        profile={'engine':'Bribblebot','rating':60}
        with patch('launcher.engine_config',side_effect=lambda root,name:Path(name+'.cfg')), \
                patch('launcher.verify_bot_can_load',side_effect=lambda cfg:cfg.stem=='Stick'), \
                patch('launcher.log_event'):
            cfg,skill=select_bot_cfg(Path('.'),60,1,profile=profile,excluded={'Bribblebot'})
        self.assertEqual(cfg,Path('Stick.cfg'))
        self.assertEqual(profile['engine'],'Stick')
        self.assertEqual(profile['rating'],60)

    def test_all_failed_candidates_stop_instead_of_retrying_forever(self):
        manager,config,readiness=self.fixture()
        with patch('bot_startup.start_with_ready_bots',side_effect=BotStartupError({1:'Failed'})), \
                patch('launcher.engine_config',return_value=None):
            with self.assertRaisesRegex(RuntimeError,'alternative local bots'):
                start_with_bot_recovery(manager,config,readiness,Mock())
        manager.load_match_config.assert_not_called()

    def test_non_bot_startup_failure_is_not_hidden_by_fallback(self):
        manager,config,readiness=self.fixture()
        with patch('bot_startup.start_with_ready_bots',side_effect=RuntimeError('game disconnected')):
            with self.assertRaisesRegex(RuntimeError,'game disconnected'):
                start_with_bot_recovery(manager,config,readiness,Mock())
        manager.kill_bot_processes.assert_not_called()


if __name__=='__main__':unittest.main()
