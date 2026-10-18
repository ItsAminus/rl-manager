import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'commentary'))
from gpu_pacing import InferencePacer,install_model_pacing
from types import SimpleNamespace
from unittest.mock import Mock


class PacingTests(unittest.TestCase):
    def test_inference_yields_after_completed_work_and_keeps_output(self):
        now=[0.0];events=[]
        def forward(value):now[0]+=.01;events.append('forward');return value
        def sync():events.append('sync')
        def sleep(duration):events.append(duration);now[0]+=duration
        p=InferencePacer(sync,lambda:now[0],sleep,duty=.7,burst=.016,max_pause=.012)
        step=p.wrap(forward);sentinel=object()
        p.begin(True)
        for _ in range(4):self.assertIs(step(sentinel),sentinel)
        pauses=[e for e in events if isinstance(e,float)]
        self.assertEqual(len(pauses),2)
        self.assertTrue(all(0<x<=.012 for x in pauses))
        for index,event in enumerate(events):
            if isinstance(event,float):self.assertEqual(events[index-1],'sync')
        self.assertAlmostEqual(p.yield_seconds,sum(pauses))

    def test_pregame_postgame_do_not_yield_and_reset_live_accounting(self):
        events=[];p=InferencePacer(lambda:events.append('sync'),sleep=lambda _:events.append('sleep'))
        p.begin(False);step=p.wrap(lambda x:x+1)
        self.assertEqual(step(3),4);self.assertEqual(events,[])
        p.work=4;p.yield_seconds=2;p.begin(True)
        self.assertEqual(p.work,0);self.assertEqual(p.yield_seconds,0)

    def test_gameplay_default_leaves_most_of_cycle_available_to_game(self):
        now=[0.];pauses=[]
        def forward(value):now[0]+=.006;return value
        def sleep(seconds):pauses.append(seconds);now[0]+=seconds
        p=InferencePacer(lambda:None,lambda:now[0],sleep);p.begin(True)
        step=p.wrap(forward)
        for _ in range(5):self.assertEqual(step('unchanged'),'unchanged')
        self.assertEqual(len(pauses),5)
        self.assertAlmostEqual(.03/(.03+sum(pauses)),.35)

    def test_long_stage_retains_unpaid_pause_instead_of_dropping_budget(self):
        now=[0.];pauses=[]
        def forward():now[0]+=.12
        p=InferencePacer(lambda:None,lambda:now[0],pauses.append);p.begin(True)
        p.wrap(forward)()
        self.assertEqual(pauses,[.05]);self.assertGreater(p.pause_debt,.17)
        p.wrap(lambda:None)()
        self.assertEqual(pauses,[.05,.05]);self.assertGreater(p.pause_debt,.12)
        p.begin(False);self.assertEqual(p.pause_debt,0)

    def test_wraps_small_model_blocks_without_double_counting_parents(self):
        def stage():return SimpleNamespace(forward=lambda value:value)
        layers=[stage(),stage()];acoustic=[stage() for _ in range(5)]
        transformer=SimpleNamespace(layers=layers,forward=lambda value:value)
        estimator=SimpleNamespace(down_blocks=[(acoustic[0],[acoustic[1]],acoustic[2])],
                                  mid_blocks=[],up_blocks=[],final_block=acoustic[3],final_proj=acoustic[4],forward=lambda value:value)
        model=SimpleNamespace(t3=SimpleNamespace(tfmr=transformer),
                              s3gen=SimpleNamespace(flow=SimpleNamespace(decoder=SimpleNamespace(estimator=estimator))))
        parent=transformer.forward;decoder=estimator.forward
        pacer=SimpleNamespace(wrap=Mock(side_effect=lambda forward:lambda value:forward(value)))
        self.assertEqual(install_model_pacing(model,pacer),7)
        self.assertEqual(pacer.wrap.call_count,7)
        self.assertIs(transformer.forward,parent);self.assertIs(estimator.forward,decoder)
        for block in layers+acoustic:self.assertEqual(block.forward('same output'),'same output')

if __name__=='__main__':unittest.main()
