import json,tempfile,time,unittest
from pathlib import Path
from local_comms import LocalCommsBridge,atomic_json
from local_tactics import LocalTactics
from rlbot.agents.base_agent import SimpleControllerState
from rlbot.utils.structures.quick_chats import QuickChats as Q
from test_local_tactics import scenario

class Tests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=Path(__file__).parent/'commentary/cache');self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.source=self.root/'native-command.json';self.bots=self.root/'bots';self.bots.mkdir()
        self.packet=scenario();self.packet.game_info.is_match_ended=False
        for i,c in enumerate(self.packet.game_cars):c.name='Player '+str(i)
        self.log=[];self.bridge=LocalCommsBridge(self.source,self.bots,'this-match',self.log.append);self.wall=time.time()
    def publish(self,**patch):
        value={'session':'this-match','sequence':1,'sender':0,'team':0,'quickChat':Q.Information_TakeTheShot,'created':self.wall};value.update(patch);atomic_json(self.source,value)
    def test_native_human_command_reaches_both_teammates_and_only_then_confirms(self):
        self.publish();view=self.bridge.update(self.packet,self.wall);self.assertEqual(view['state'],'sending');self.assertFalse(self.log)
        for index in (1,2):
            bot=LocalTactics(index,{'difficulty':'Medium','performance':{'quality':.9}},command_folder=self.bots)
            bot.apply(self.packet,SimpleControllerState());self.assertEqual(bot.command,'press')
        view=self.bridge.update(self.packet,self.wall+.1);self.assertEqual(view['state'],'accepted');self.assertEqual(len(view['acceptedBy']),2);self.assertEqual(view['remaining'],18)
        self.assertIn('Press forward',self.log[0]);self.packet.game_info.seconds_elapsed+=19;self.assertIsNone(self.bridge.update(self.packet,self.wall+19))
    def test_no_receipt_never_claims_success(self):
        self.publish();self.bridge.update(self.packet,self.wall);view=self.bridge.update(self.packet,self.wall+2.1)
        self.assertEqual(view['state'],'unconfirmed');self.assertEqual(view['acceptedBy'],[])
    def test_receipt_displays_actual_demo_action_instead_of_just_acknowledgement(self):
        self.publish(quickChat=Q.Information_Incoming);self.bridge.update(self.packet,self.wall)
        bot=LocalTactics(1,{'difficulty':'Medium','performance':{'quality':.9}},command_folder=self.bots)
        bot.apply(self.packet,SimpleControllerState())
        view=self.bridge.update(self.packet,self.wall+.1)
        self.assertIn('Hunting Player 3',view['label']);self.assertTrue(view['activity'][0]['changedControls'])
        status=json.loads((self.bots/'tactics-status-1.json').read_text());self.assertEqual(status['stage'],'Hunting')
    def test_native_callback_and_file_relay_do_not_cancel_each_others_receipts(self):
        bot=LocalTactics(1,{'difficulty':'Medium','performance':{'quality':.9}},command_folder=self.bots)
        bot.prepare(self.packet);self.assertTrue(bot.receive(0,0,Q.Information_Incoming))
        self.publish(quickChat=Q.Information_Incoming);self.bridge.update(self.packet,self.wall)
        bot.next_poll=0;bot.apply(self.packet,SimpleControllerState())
        self.assertEqual(self.bridge.update(self.packet,self.wall+.1)['state'],'accepted')
    def test_enemy_bot_stale_other_match_and_kickoff_cannot_send_orders(self):
        for patch in ({'sender':3,'team':1},{'sender':2},{'session':'old-match'},{'created':self.wall-3},{'quickChat':999}):
            self.publish(**patch);self.assertIsNone(self.bridge.update(self.packet,self.wall));self.bridge.last_poll=-1
        self.packet.game_info.is_kickoff_pause=True;self.publish();self.assertIsNone(self.bridge.update(self.packet,self.wall))
        self.assertFalse((self.bots/'comms-command.json').exists())
    def test_hard_bots_ignore_relay_and_expired_packets_are_not_acknowledged(self):
        self.publish();self.bridge.update(self.packet,self.wall)
        hard=LocalTactics(1,{'difficulty':'Hard','performance':{'quality':.9}},command_folder=self.bots);hard.apply(self.packet,SimpleControllerState());self.assertFalse((self.bots/'comms-ack-1.json').exists())
        self.packet.game_info.seconds_elapsed+=3;bot=LocalTactics(1,{'difficulty':'Medium','performance':{'quality':.9}},command_folder=self.bots);bot.apply(self.packet,SimpleControllerState());self.assertEqual(bot.command,'balanced')
    def test_default_information_quick_chats_have_useful_tactics(self):
        for chat,expected in [(Q.Information_IGotIt,'infield'),(Q.Information_NeedBoost,'defend'),(Q.Information_Defending,'defend')]:
            self.publish(quickChat=chat);self.bridge.last_poll=-1;self.bridge.sequence=0;self.bridge.update(self.packet,self.wall)
            bot=LocalTactics(1,{'difficulty':'Medium','performance':{'quality':.9}},command_folder=self.bots);bot.apply(self.packet,SimpleControllerState());self.assertEqual(bot.command,expected)
if __name__=='__main__':unittest.main()
