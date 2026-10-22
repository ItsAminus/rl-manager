import unittest
from unittest.mock import patch,Mock
from contextlib import contextmanager
import json
import io
from tempfile import TemporaryDirectory
from pathlib import Path
from bakkesmod_startup import hud_is_loaded,allow_career_commands,MIN_HUD_VERSION,wait_for_hud,HUDStartupError,StartupForeground,connect_with_hud,rcon_commands,process_ids,ensure_bakkesmod,wait_for_game_ready,request_injector_confirmation,restart_injectors

class StartupClock:
    now=0
    def sleep(self,seconds):self.now+=seconds
    def monotonic(self):return self.now

class HUDStartupTests(unittest.TestCase):
    def test_manual_confirmation_only_accepts_this_launch_request(self):
        request='a'*32;events=[]
        lines=['not json',json.dumps({'event':'CONFIRM_BAKKESMOD','requestId':'stale'}),json.dumps({'event':'CONFIRM_BAKKESMOD','requestId':request})]
        with patch('bakkesmod_startup.uuid.uuid4',return_value=Mock(hex=request)):
            request_injector_confirmation(stream=io.StringIO('\n'.join(lines)),emit=lambda *a,**k:events.append((a,k)))
        self.assertEqual(events[0][0],('BAKKESMOD_CONFIRM_REQUIRED',))
        self.assertEqual(events[0][1]['requestId'],request)

    def test_closed_confirmation_pipe_never_launches(self):
        with self.assertRaisesRegex(HUDStartupError,'confirmation expired'):
            request_injector_confirmation(stream=io.StringIO(''),emit=lambda *a,**k:None)

    def test_menu_confirmation_precedes_injector_restart_and_handshake(self):
        events=[]
        with patch('bakkesmod_startup.startup_foreground'),patch('bakkesmod_startup.prepare_hud_assets'), \
             patch('bakkesmod_startup.wait_for_game_ready',return_value=True), \
             patch('bakkesmod_startup.current_hud_connected',return_value=False), \
             patch('game_window.focus_rocket_league',return_value=True), \
             patch('bakkesmod_startup.request_injector_confirmation',side_effect=lambda:events.append('button')), \
             patch('bakkesmod_startup.ensure_bakkesmod',side_effect=lambda *a,**k:events.append(('injector',k)) or True), \
             patch('bakkesmod_startup.wait_for_hud',side_effect=lambda *a,**k:events.append('hud') or True):
            self.assertTrue(connect_with_hud(Mock(),'epic',lambda _:None,required=True,manual_confirmation=True))
        self.assertEqual(events,['button',('injector',{'restart_existing':True}),'hud'])

    def test_verified_injected_game_does_not_ask_or_restart_between_games(self):
        with patch('bakkesmod_startup.startup_foreground'),patch('bakkesmod_startup.prepare_hud_assets'), \
             patch('bakkesmod_startup.wait_for_game_ready',return_value=True), \
             patch('bakkesmod_startup.current_hud_connected',return_value=True), \
             patch('bakkesmod_startup.request_injector_confirmation') as confirm, \
             patch('bakkesmod_startup.ensure_bakkesmod') as injector:
            self.assertTrue(connect_with_hud(Mock(),'epic',lambda _:None,required=True,manual_confirmation=True))
        confirm.assert_not_called();injector.assert_not_called()

    def test_button_restart_only_terminates_inspected_injector_pids(self):
        exe=Path('C:/BakkesMod/BakkesMod.exe')
        with patch('bakkesmod_startup.process_ids',side_effect=[{123},set()]), \
             patch('bakkesmod_startup.injector_executable',return_value=exe) as inspect, \
             patch('bakkesmod_startup.subprocess.run',return_value=Mock(returncode=0)) as stop:
            self.assertEqual(restart_injectors(lambda _:None),[exe])
        inspect.assert_called_once_with(123)
        self.assertEqual(stop.call_args.args[0],['taskkill','/PID','123','/F'])

    def test_existing_updated_injector_is_preserved(self):
        with patch('bakkesmod_startup.process_ids',return_value={100}), \
             patch('bakkesmod_startup.retire_outdated_injector',return_value=False), \
             patch('bakkesmod_startup.subprocess.Popen') as launch:
            self.assertTrue(ensure_bakkesmod(lambda _:None))
            launch.assert_not_called()

    def test_old_shortcut_injector_switches_to_managed_update(self):
        with patch('bakkesmod_startup.process_ids',side_effect=[{100},set(),{200}]), \
             patch('bakkesmod_startup.retire_outdated_injector',return_value=True) as retire, \
             patch('bakkesmod_startup.Path.is_file',return_value=True), \
             patch('bakkesmod_startup.subprocess.Popen') as launch:
            self.assertTrue(ensure_bakkesmod(lambda _:None))
            self.assertEqual(retire.call_args.args[0],100)
            self.assertIn('local_runtime',launch.call_args.args[0][0])

    def test_cold_start_prefers_managed_update(self):
        with patch('bakkesmod_startup.process_ids',side_effect=[set(),{200}]), \
             patch('bakkesmod_startup.Path.is_file',return_value=True), \
             patch('bakkesmod_startup.subprocess.Popen') as launch:
            self.assertTrue(ensure_bakkesmod(lambda _:None))
            self.assertIn('local_runtime',launch.call_args.args[0][0])

    def test_stale_plugin_status_cannot_confirm_current_game(self):
        self.assertFalse(hud_is_loaded({'loaded':True,'version':'1.2.0','pid':100},{200}))
        self.assertFalse(hud_is_loaded({'loaded':True,'version':'1.1.0'},{200}))
        self.assertFalse(hud_is_loaded({'loaded':False,'version':'1.2.0','pid':200},{200}))
        self.assertFalse(hud_is_loaded({'loaded':True,'version':'broken','pid':200},{200}))
        self.assertFalse(hud_is_loaded({'loaded':True,'version':'1.2.0','pid':200},{200}))
        self.assertFalse(hud_is_loaded({'loaded':True,'version':'1.3.0','pid':200},{200}))
        self.assertFalse(hud_is_loaded({'loaded':True,'version':'1.5.2','pid':200},{200}))
        self.assertFalse(hud_is_loaded({'loaded':True,'version':'1.6.2','pid':200},{200}))
        self.assertFalse(hud_is_loaded({'loaded':True,'version':'1.7.4','pid':200},{200}))
        self.assertFalse(hud_is_loaded({'loaded':True,'version':'1.7.7','pid':200},{200}))
        self.assertFalse(hud_is_loaded({'loaded':True,'version':'1.8.0','pid':200},{200}))
        self.assertFalse(hud_is_loaded({'loaded':True,'version':'1.8.1','pid':200},{200}))
        self.assertTrue(hud_is_loaded({'loaded':True,'version':MIN_HUD_VERSION,'pid':200},{200}))

    def test_command_list_preserves_existing_rules_and_is_idempotent(self):
        with TemporaryDirectory(dir=Path(__file__).parent) as root:
            path=Path(root)/'data/rcon_commands.cfg';path.parent.mkdir()
            path.write_text('existing_command\nrcon_refresh_allowed\n')
            self.assertTrue(allow_career_commands(root))
            text=path.read_text();self.assertIn('existing_command',text)
            self.assertIn('rlm_host_arm',text);self.assertNotIn('*',text)
            self.assertFalse(allow_career_commands(root))

    def check_startup(self, ready_at=None, replace_at=None, timeout=None):
        clock=StartupClock();messages=[];requests=[]
        with TemporaryDirectory(dir=Path(__file__).parent) as root:
            path=Path(root)/'data/rl-manager/plugin-status.json';path.parent.mkdir(parents=True)
            # A stale status must not shortcut a fresh launch.
            path.write_text(json.dumps({'loaded':True,'version':MIN_HUD_VERSION,'pid':99}))
            def processes(name):
                pid=200 if replace_at is not None and clock.now>=replace_at else 100
                if ready_at is not None and clock.now>=ready_at:
                    path.write_text(json.dumps({'loaded':True,'version':MIN_HUD_VERSION,'pid':pid}))
                return {pid}
            def rcon(commands):
                requests.append((clock.now,commands))
                if ready_at is None or clock.now<ready_at:raise ConnectionRefusedError()
            with patch('bakkesmod_startup.folder',return_value=Path(root)), \
                 patch('bakkesmod_startup.process_ids',side_effect=processes), \
                 patch('bakkesmod_startup.rcon_commands',side_effect=rcon), \
                 patch('bakkesmod_startup.time.monotonic',side_effect=clock.monotonic), \
                 patch('bakkesmod_startup.time.sleep',side_effect=clock.sleep):
                result=wait_for_hud(messages.append,**({'timeout':timeout} if timeout is not None else {}))
        return result,clock.now,messages,requests

    def test_cold_injection_taking_longer_than_15_seconds_can_join(self):
        result,elapsed,messages,_=self.check_startup(ready_at=32)
        self.assertTrue(result);self.assertGreaterEqual(elapsed,32)
        self.assertTrue(any('Waiting for BakkesMod injection' in m for m in messages))
        self.assertIn('current Rocket League process confirmed',messages[-1])

    def test_epic_replacement_process_can_load_during_wait(self):
        result,elapsed,_,_=self.check_startup(ready_at=20,replace_at=8)
        self.assertTrue(result);self.assertGreaterEqual(elapsed,20)

    def test_failed_injection_has_a_bounded_wait_and_actionable_message(self):
        result,elapsed,messages,requests=self.check_startup(timeout=25)
        self.assertFalse(result);self.assertEqual(elapsed,25)
        self.assertIn('foreground',messages[-1]);self.assertIn('No match was joined',messages[-1])
        # Retry a refused connection without hammering it every frame.
        self.assertLess(len(requests),10)

    def test_hud_load_is_retried_after_rcon_connects_before_plugin_is_ready(self):
        clock=StartupClock();requests=[]
        with TemporaryDirectory(dir=Path(__file__).parent) as root:
            status=Path(root)/'data/rl-manager/plugin-status.json';status.parent.mkdir(parents=True)
            def rcon(commands):
                requests.append(commands)
                # First request is accepted while the plugin manager is loading.
                # A later request actually makes our plugin load.
                if sum('plugin load RLManagerHUD' in c for c in requests)>=2:
                    status.write_text(json.dumps({'loaded':True,'version':MIN_HUD_VERSION,'pid':100}))
            with patch('bakkesmod_startup.folder',return_value=Path(root)), \
                 patch('bakkesmod_startup.process_ids',return_value={100}), \
                 patch('bakkesmod_startup.rcon_commands',side_effect=rcon), \
                 patch('bakkesmod_startup.time.monotonic',side_effect=clock.monotonic), \
                 patch('bakkesmod_startup.time.sleep',side_effect=clock.sleep):
                self.assertTrue(wait_for_hud(lambda _:None,timeout=10,required=True))
        self.assertGreaterEqual(clock.now,3)

    def test_loaded_status_without_authenticated_control_cannot_start_hosted_match(self):
        clock=StartupClock()
        with TemporaryDirectory(dir=Path(__file__).parent) as root:
            status=Path(root)/'data/rl-manager/plugin-status.json';status.parent.mkdir(parents=True)
            status.write_text(json.dumps({'loaded':True,'version':MIN_HUD_VERSION,'pid':100}))
            with patch('bakkesmod_startup.folder',return_value=Path(root)), \
                 patch('bakkesmod_startup.process_ids',return_value={100}), \
                 patch('bakkesmod_startup.rcon_commands',side_effect=HUDStartupError('authentication was rejected')) as request, \
                 patch('bakkesmod_startup.time.monotonic',side_effect=clock.monotonic), \
                 patch('bakkesmod_startup.time.sleep',side_effect=clock.sleep):
                with self.assertRaisesRegex(HUDStartupError,'authentication was rejected'):
                    wait_for_hud(lambda _:None,timeout=10,required=True)
                self.assertLessEqual(request.call_count,4)

    def test_rcon_rejected_login_never_sends_game_commands(self):
        with TemporaryDirectory(dir=Path(__file__).parent) as root:
            config=Path(root)/'cfg/config.cfg';config.parent.mkdir()
            config.write_text('rcon_password "test-password"\nrcon_port "9002"')
            socket=Mock();socket.recv.return_value='authno'
            with patch('websocket.create_connection',return_value=socket):
                with self.assertRaisesRegex(HUDStartupError,'authentication was rejected'):
                    rcon_commands(['rlm_host_ready'],root)
            self.assertEqual(socket.send.call_count,1)
            socket.close.assert_called_once()

    def test_rcon_authenticated_connection_sends_commands_and_closes(self):
        import websocket
        with TemporaryDirectory(dir=Path(__file__).parent) as root:
            config=Path(root)/'cfg/config.cfg';config.parent.mkdir()
            config.write_text('rcon_password "test-password"\nrcon_port "9002"')
            socket=Mock();socket.recv.side_effect=['authyes',websocket.WebSocketTimeoutException()]
            with patch('websocket.create_connection',return_value=socket):
                rcon_commands(['rlm_host_ready'],root)
            self.assertEqual(socket.send.call_args.args,('rlm_host_ready',))
            socket.close.assert_called_once()

    def test_game_restore_follows_epic_process_replacement_without_stealing_focus_repeatedly(self):
        foreground=StartupForeground(lambda _:None)
        with patch('game_window.focus_rocket_league',return_value=True) as focus:
            foreground.tick({100});foreground.tick({100});foreground.tick({200})
            self.assertEqual(focus.call_count,2)
            foreground.tick(set());foreground.tick({200})
            self.assertEqual(focus.call_count,3)

    def test_game_restore_retries_until_new_window_exists(self):
        foreground=StartupForeground(lambda _:None)
        with patch('game_window.focus_rocket_league',side_effect=[False,True]) as focus:
            foreground.tick({100});foreground.tick({100});foreground.tick({100})
            self.assertEqual(focus.call_count,2)

    def test_restore_monitor_covers_gateway_wait_and_hud_handshake(self):
        running=[]
        @contextmanager
        def monitor(log):
            running.append(True)
            try:yield
            finally:running.clear()
        manager=Mock()
        manager.connect_to_game.side_effect=lambda **kwargs:self.assertTrue(running)
        def wait(*args,**kwargs):self.assertTrue(running);return True
        with patch('bakkesmod_startup.startup_foreground',side_effect=monitor), \
             patch('bakkesmod_startup.prepare_hud_assets'), \
             patch('bakkesmod_startup.wait_for_game_ready',return_value=True), \
             patch('bakkesmod_startup.ensure_bakkesmod',return_value=True), \
             patch('bakkesmod_startup.wait_for_hud',side_effect=wait) as handshake:
            self.assertTrue(connect_with_hud(manager,'epic',lambda _:None,required=True))
            handshake.assert_called_once_with(unittest.mock.ANY,required=True)
        self.assertFalse(running)

    def test_injector_starts_only_after_gateway_and_ready_window_then_hud(self):
        events=[];manager=Mock()
        manager.connect_to_game.side_effect=lambda **_:events.append('gateway')
        with patch('bakkesmod_startup.startup_foreground'), \
             patch('bakkesmod_startup.prepare_hud_assets',side_effect=lambda:events.append('assets')), \
             patch('bakkesmod_startup.wait_for_game_ready',side_effect=lambda _:events.append('window') or True), \
             patch('bakkesmod_startup.ensure_bakkesmod',side_effect=lambda _:events.append('injector') or True), \
             patch('bakkesmod_startup.wait_for_hud',side_effect=lambda *a,**k:events.append('hud') or True):
            self.assertTrue(connect_with_hud(manager,'epic',lambda _:None,required=True))
        self.assertEqual(events,['assets','gateway','window','injector','hud'])

    def test_failed_game_launch_never_starts_injector(self):
        with patch('bakkesmod_startup.startup_foreground'), \
             patch('bakkesmod_startup.prepare_hud_assets'), \
             patch('bakkesmod_startup.wait_for_game_ready',return_value=False), \
             patch('bakkesmod_startup.ensure_bakkesmod') as injector:
            with self.assertRaises(HUDStartupError):connect_with_hud(Mock(),'epic',lambda _:None,required=True)
        injector.assert_not_called()

    def test_ready_window_must_be_stable_after_epic_replaces_the_game(self):
        clock=StartupClock()
        def pids(_):return {100 if clock.now<2 else 200}
        with patch('bakkesmod_startup.process_ids',side_effect=pids), \
             patch('game_window.rocket_league_window_ready',side_effect=lambda _:clock.now>=1), \
             patch('bakkesmod_startup.time.monotonic',side_effect=clock.monotonic), \
             patch('bakkesmod_startup.time.sleep',side_effect=clock.sleep):
            self.assertTrue(wait_for_game_ready(lambda _:None,timeout=10,stable_seconds=3))
        self.assertEqual(clock.now,5)

    def test_process_without_ready_viewport_does_not_trigger_injector(self):
        clock=StartupClock()
        with patch('bakkesmod_startup.process_ids',return_value={100}), \
             patch('game_window.rocket_league_window_ready',return_value=False), \
             patch('bakkesmod_startup.time.monotonic',side_effect=clock.monotonic), \
             patch('bakkesmod_startup.time.sleep',side_effect=clock.sleep):
            self.assertFalse(wait_for_game_ready(lambda _:None,timeout=4))
        self.assertEqual(clock.now,4)

    def test_windows_process_inspection_failure_is_not_treated_as_game_closed(self):
        with patch('bakkesmod_startup.subprocess.run',return_value=Mock(returncode=1)):
            with self.assertRaisesRegex(RuntimeError,'readiness is unknown'):process_ids('RocketLeague.exe')

if __name__=='__main__':unittest.main()
