import configparser
import json
import queue
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from bot_startup import BotReadiness, mark_ready, receive_metadata, start_with_ready_bots
from rlbot.utils.class_importer import import_agent


class StartupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT/'commentary/cache', prefix='startup-test-')
        self.root = Path(self.temp.name)
        self.original = self.root/'original.cfg'
        self.original.write_text('[Locations]\npython_file = original_test_bot.py\n'
                                 'looks_config = looks.cfg\nloadout_generator = loadout_generator.py\n[Bot Parameters]\nexample = preserved\n')
        (self.root/'original_test_bot.py').write_text(
            'from rlbot.agents.base_agent import BaseAgent, SimpleControllerState\n'
            'class TestBot(BaseAgent):\n'
            '    def initialize_agent(self):\n'
            '        self.initialized = True\n'
            '    def get_output(self, packet):\n'
            '        if not self.initialized: raise RuntimeError("not initialized")\n'
            '        if packet == "fail": raise RuntimeError("inference failed")\n'
            '        return SimpleControllerState(throttle=1)\n')
        self.players = [SimpleNamespace(bot=False, rlbot_controlled=False, name='Human'),
                        SimpleNamespace(bot=True, rlbot_controlled=True, name='Bot', config_path=str(self.original))]
        self.config = SimpleNamespace(player_configs=self.players)
        self.barrier = BotReadiness(self.config, root=self.root/'runtime')

    def tearDown(self):
        # RLBot caches imported module objects; close our isolated test files.
        for name in list(sys.modules):
            if name == 'original_test_bot' or name.startswith('ready_1_'):
                sys.modules.pop(name)
        self.assertTrue(self.root.resolve().is_relative_to((ROOT/'commentary/cache').resolve()))
        self.temp.cleanup()

    def manager(self):
        return SimpleNamespace(start_match=Mock(), launch_bot_processes=Mock(),
                               game_interface=SimpleNamespace(set_game_state=Mock()))

    def test_wrapper_preserves_original_config_and_waits_for_successful_output(self):
        original_text = self.original.read_text()
        cfg = configparser.ConfigParser()
        cfg.read(self.players[1].config_path)
        self.assertEqual(cfg.get('Bot Parameters', 'example'), 'preserved')
        self.assertEqual(Path(cfg.get('Locations', 'looks_config')), self.root/'looks.cfg')
        self.assertEqual(Path(cfg.get('Locations', 'loadout_generator')), self.root/'loadout_generator.py')
        wrapped = import_agent(cfg.get('Locations', 'python_file')).get_loaded_class()
        agent = wrapped('Bot', 0, 1)
        self.assertEqual(self.barrier.ready(), set())
        agent.initialize_agent()
        self.assertEqual(self.barrier.ready(), set())
        with self.assertRaisesRegex(RuntimeError, 'inference failed'):
            agent.get_output('fail')
        self.assertEqual(self.barrier.ready(), set())
        self.assertEqual(agent.get_output('okay').throttle, 1)
        self.assertEqual(self.barrier.ready(), {1})
        self.assertEqual(self.original.read_text(), original_text)

    def test_kickoff_stays_paused_until_readiness_finishes(self):
        manager = self.manager()
        calls = []
        manager.start_match.side_effect = lambda: calls.append('load')
        manager.game_interface.set_game_state.side_effect = lambda state: calls.append(state.game_info.paused)
        manager.launch_bot_processes.side_effect = lambda: calls.append('bots')
        self.barrier.wait = lambda *_: calls.append('all-ready')
        start_with_ready_bots(manager, self.barrier, lambda _: None)
        self.assertEqual(calls, ['load', True, 'bots', 'all-ready', False])

    def test_runtime_shim_actually_applies_the_local_condition_profile(self):
        from test_local_performance import packet,player
        from local_performance import performance_profile
        self.players[1].config_path=str(self.original)
        self.players[1].manager_profile={'performance':performance_profile(player(False),'Medium',94,'Diamond')}
        barrier=BotReadiness(self.config,root=self.root/'condition')
        cfg=configparser.ConfigParser();cfg.read(self.players[1].config_path)
        cls=import_agent(cfg.get('Locations','python_file')).get_loaded_class()
        agent=cls('Bot',0,1);agent.initialize_agent();agent.beta=1
        p=packet();p.game_cars.append(p.game_cars[0]);p.num_cars=2
        agent.get_output(p)
        self.assertEqual(agent.beta,1);self.assertTrue(agent._manager_performance.enabled)
        self.assertEqual(barrier.ready(),{1})

    def test_timeout_releases_pause_and_never_claims_match_started(self):
        manager = self.manager()
        self.barrier.wait = Mock(side_effect=RuntimeError('bot failed'))
        with self.assertRaisesRegex(RuntimeError, 'bot failed'):
            start_with_ready_bots(manager, self.barrier, lambda _: None)
        states = [call.args[0].game_info.paused for call in manager.game_interface.set_game_state.call_args_list]
        self.assertEqual(states, [True, False])

    def test_native_quick_chat_reaches_the_tactical_layer_through_the_real_agent_shim(self):
        from test_local_tactics import scenario
        from rlbot.utils.structures.quick_chats import QuickChats
        self.players[1].config_path=str(self.original)
        self.players[1].manager_profile={'difficulty':'Medium','performance':{'version':1,'quality':.9,'reactionSeconds':.05,'cohesion':.65,'role':'BALANCED'}}
        barrier=BotReadiness(self.config,root=self.root/'comms');cfg=configparser.ConfigParser();cfg.read(self.players[1].config_path)
        cls=import_agent(cfg.get('Locations','python_file')).get_loaded_class();agent=cls('Bot',0,1);agent.initialize_agent();p=scenario();agent.get_output(p)
        agent.handle_quick_chat(0,0,QuickChats.Information_Defending)
        self.assertEqual(agent._manager_tactics.command,'defend');agent.get_output(p);self.assertEqual(barrier.ready(),{1})

    def test_all_five_attributes_change_actual_shim_output_without_replacing_the_native_agent(self):
        from test_local_ability import profile,scene,original,output_distance,FIELDS
        native=self.root/'original_test_bot.py'
        native.write_text(native.read_text().replace('return SimpleControllerState(throttle=1)','return getattr(packet, "base_controls", SimpleControllerState(throttle=1))'))
        outputs={}
        for value in (80,83):
            self.players[1].config_path=str(self.original);self.players[1].manager_profile=profile(value)
            barrier=BotReadiness(self.config,root=self.root/f'five-skills-{value}');cfg=configparser.ConfigParser();cfg.read(self.players[1].config_path)
            cls=import_agent(cfg.get('Locations','python_file')).get_loaded_class();agent=cls('Bot',0,1);agent.initialize_agent()
            outputs[value]={}
            for i,skill in enumerate(FIELDS):
                p=scene(skill,10+i);p.base_controls=original(skill)
                outputs[value][skill]=agent.get_output(p)
                self.assertEqual(agent._manager_ability.active_skill,skill)
        for skill in FIELDS:self.assertGreater(output_distance(outputs[80][skill],outputs[83][skill]),1e-10,skill)
    def test_saved_demo_order_controls_the_final_agent_output_after_the_skill_layer(self):
        from test_local_tactics import scenario
        from test_local_ability import profile
        from rlbot.agents.base_agent import SimpleControllerState
        p=scenario();data=profile(80);data['matchTactics']={'ordersByPlayer':{'same-pro':'demo'}}
        self.players[1].config_path=str(self.original);self.players[1].manager_profile=data
        BotReadiness(self.config,root=self.root/'demo-priority');cfg=configparser.ConfigParser();cfg.read(self.players[1].config_path)
        cls=import_agent(cfg.get('Locations','python_file')).get_loaded_class();agent=cls('Bot',0,1);agent.initialize_agent()
        # A skill correction must not undo a selected off-ball demo run.
        with patch('local_ability.LocalAbility.apply',return_value=SimpleControllerState(steer=-.99)):
            out=agent.get_output(p)
        self.assertEqual(agent._manager_tactics.stage,'Hunting');self.assertNotEqual(out.steer,-.99)

    def test_stale_or_wrong_index_marker_does_not_release_kickoff(self):
        (self.barrier.folder/'1.json').write_text(json.dumps({'index': 2}))
        self.assertEqual(self.barrier.ready(), set())
        mark_ready(self.barrier.folder, 1, 'Bot')
        self.assertEqual(self.barrier.ready(), {1})
        newer = BotReadiness(SimpleNamespace(player_configs=[SimpleNamespace(
            bot=True, rlbot_controlled=True, name='Bot', config_path=str(self.original))]), root=self.root/'runtime')
        self.assertNotEqual(newer.folder, self.barrier.folder)
        self.assertEqual(newer.ready(), set())

    def test_reordered_live_slots_report_the_configured_bot_identity(self):
        # Human selected in lineup slot 2, but spawned as car 0. Bots are
        # shifted to cars 1 and 2, while the other team keeps cars 3..5.
        players=[SimpleNamespace(bot=i!=2,rlbot_controlled=i!=2,name=f'Pro {i}',
                                 config_path=str(self.original)) for i in range(6)]
        barrier=BotReadiness(SimpleNamespace(player_configs=players),root=self.root/'reordered')
        self.assertEqual(set(barrier.expected),{0,1,3,4,5})
        for configured,live in ((0,1),(1,2),(3,3),(4,4),(5,5)):
            cfg=configparser.ConfigParser();cfg.read(players[configured].config_path)
            cls=import_agent(cfg.get('Locations','python_file')).get_loaded_class()
            agent=cls(players[configured].name,0 if configured<3 else 1,live)
            agent.initialize_agent()
            with self.assertRaisesRegex(RuntimeError,'inference failed'):
                agent.get_output('fail')
            self.assertNotIn(configured,barrier.ready())
            agent.get_output('okay')
            marker=json.loads((barrier.folder/f'{configured}.json').read_text())
            self.assertEqual(marker['runtimeIndex'],live)
            self.assertEqual(marker['name'],players[configured].name)
        self.assertEqual(barrier.ready(),set(barrier.expected))
        self.assertFalse((barrier.folder/'2.json').exists()) # never wait for human
        with patch('bot_startup.receive_metadata'):
            barrier.wait(self.manager(),lambda _:None)

    def test_metadata_drain_never_waits_on_empty_queue(self):
        manager = SimpleNamespace(agent_metadata_queue=Mock(), agent_metadata_map={},
                                  num_metadata_received=0, logger=Mock(), helper_process_manager=Mock())
        metadata = SimpleNamespace(index=1)
        manager.agent_metadata_queue.get_nowait.side_effect = [metadata, queue.Empty]
        with patch('rlbot.utils.process_configuration.append_child_pids', return_value=False), \
             patch('rlbot.utils.process_configuration.configure_processes') as configure:
            self.assertEqual(receive_metadata(manager), 1)
        manager.agent_metadata_queue.get.assert_not_called()
        self.assertIs(manager.agent_metadata_map[1], metadata)
        manager.helper_process_manager.start_or_update_helper_process.assert_called_once_with(metadata)
        configure.assert_called_once()

    def test_missing_bot_times_out_instead_of_allowing_a_head_start(self):
        clock = Mock(side_effect=[0, 0, 91])
        manager = Mock()
        with patch('bot_startup.receive_metadata'), self.assertRaisesRegex(RuntimeError, 'Bot'):
            self.barrier.wait(manager, lambda _: None, clock=clock, sleep=lambda _: None)


if __name__ == '__main__':
    unittest.main()
