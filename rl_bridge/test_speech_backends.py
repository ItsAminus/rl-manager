import io
import json
from pathlib import Path
from types import SimpleNamespace
import sys
import tempfile
import threading
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0,str(Path(__file__).parent/'commentary'))
from speech_device import select_device, cpu_device
from chatterbox_worker import ChatterboxSpeech
from hybrid_broadcast import SpeechWorker


class DeviceSelectionTests(unittest.TestCase):
    def torch(self, available=True, hip=None, name='GPU'):
        return SimpleNamespace(version=SimpleNamespace(hip=hip), ones=MagicMock(),
                               cuda=SimpleNamespace(is_available=MagicMock(return_value=available),
                                                    get_device_name=MagicMock(return_value=name)))

    def test_nvidia_keeps_cuda(self):
        torch=self.torch(name='RTX 5060')
        result=select_device(torch)
        self.assertEqual((result.backend,result.device,result.label),('cuda','cuda','RTX 5060'))
        torch.ones.assert_called_once_with(1,device='cuda')

    def test_rocm_uses_the_shared_cuda_api_without_an_adapter_whitelist(self):
        result=select_device(self.torch(hip='7.2',name='AMD adapter'))
        self.assertEqual((result.backend,result.device),('rocm','cuda'))

    def test_any_adapter_can_use_cpu_without_rocm(self):
        torch=self.torch(available=False,name='RX 7700 XT')
        result=select_device(torch)
        self.assertEqual(result.backend,'cpu')
        torch.ones.assert_not_called()

    def test_driver_or_kernel_failure_falls_back_to_cpu(self):
        torch=self.torch()
        torch.ones.side_effect=RuntimeError('kernel unavailable')
        result=select_device(torch)
        self.assertEqual(result.device,'cpu')
        self.assertIn('kernel unavailable',result.reason)

    def test_forced_cpu_never_touches_gpu(self):
        torch=self.torch()
        self.assertEqual(select_device(torch,'cpu').backend,'cpu')
        torch.cuda.is_available.assert_not_called()
        torch.ones.assert_not_called()

    def test_cpu_load_keeps_both_caster_profiles_on_cpu(self):
        speech=ChatterboxSpeech.__new__(ChatterboxSpeech)
        speech.selection=cpu_device()
        speech.torch=MagicMock()
        speech.model_class=MagicMock()
        speech.conditionals_class=MagicMock()
        caster_one,caster_two=object(),object()
        speech.conditionals_class.load.side_effect=[caster_one,caster_two]
        with patch('chatterbox_worker.speech_model',return_value=Path('models')),patch('gpu_pacing.install_model_pacing',return_value=0):
            speech._load()
        self.assertEqual(speech.profiles,{'caster_one':caster_one,'caster_two':caster_two})
        self.assertTrue(all(call.args[1]=='cpu' for call in speech.conditionals_class.load.call_args_list))
        speech.model_class.from_local.assert_called_once_with(Path('models'),device='cpu')

    def test_gpu_failure_reloads_same_engine_on_cpu(self):
        speech=ChatterboxSpeech.__new__(ChatterboxSpeech)
        speech.torch=MagicMock()
        speech._load=MagicMock()
        speech._fallback_to_cpu(RuntimeError('out of GPU memory'))
        self.assertEqual(speech.selection.backend,'cpu')
        speech._load.assert_called_once()


class ProtocolTests(unittest.TestCase):
    class Process:
        def __init__(self,ready):
            self.stdout=io.StringIO(json.dumps(ready)+'\n')
            self.stdin=io.StringIO()
        def poll(self):return 0
        def wait(self,timeout=None):return 0

    def test_broken_optional_rocm_environment_retries_bundled_cpu(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            root=Path(folder);(root/'cache').mkdir()
            good=self.Process({'status':'ready','backend':'cpu','device':'CPU'})
            bad=self.Process({'error':'missing AMD dependency'})
            with patch('hybrid_broadcast.ROOT',root),patch('hybrid_broadcast.speech_pythons',return_value=[Path('optional.exe'),Path('bundled.exe')]),patch('hybrid_broadcast.subprocess.Popen',side_effect=[bad,good]) as start:
                worker=SpeechWorker(lambda line:None)
                try:
                    worker.wait_ready()
                    self.assertEqual(worker.backend,'cpu')
                    self.assertEqual(start.call_args.kwargs['env']['RLM_SPEECH_DEVICE'],'cpu')
                    self.assertEqual(start.call_args.args[0][0],'bundled.exe')
                finally:worker.close()

    def test_cancelled_speech_does_not_block_game_shutdown(self):
        worker=SpeechWorker.__new__(SpeechWorker)
        worker.stop_event=threading.Event();worker.stop_event.set()
        with self.assertRaisesRegex(RuntimeError,'cancelled'):worker._response(180)

    def test_timed_out_speech_process_is_closed(self):
        worker=SpeechWorker.__new__(SpeechWorker)
        worker.stop_event=threading.Event();worker._close_process=MagicMock()
        with self.assertRaises(TimeoutError):worker._response(0)
        worker._close_process.assert_called_once()

    def test_windows_shutdown_only_targets_the_owned_speech_tree(self):
        worker=SpeechWorker.__new__(SpeechWorker)
        worker.close_lock=threading.Lock()
        worker.process=MagicMock(pid=4567)
        worker.process.poll.side_effect=[None,0]
        with patch('hybrid_broadcast.os.name','nt'),patch('hybrid_broadcast.subprocess.run') as stop:
            worker._close_process()
        self.assertEqual(stop.call_args.args[0][1:],['/PID','4567','/T','/F'])


if __name__=='__main__':unittest.main()
