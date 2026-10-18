"""Device-format and Windows fallback regression tests, with no audible output."""
import io
import os
from pathlib import Path
import sys
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch, Mock
import wave

sys.path.insert(0, str(Path(__file__).parent / 'commentary'))
from clip_broadcast import audio_dependencies
import native_audio_worker as worker


def recording():
    data = io.BytesIO()
    with wave.open(data, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(48000)
        wav.writeframes(bytes(9600))
    return data.getvalue()


class NativeAudioTests(unittest.TestCase):
    def test_missing_portaudio_does_not_disable_recorded_audio(self):
        with patch.dict(os.environ, {'RLM_AUDIO_BACKEND': ''}), \
             patch.object(worker, 'analysis_dependencies', side_effect=ImportError('PortAudio unavailable')), \
             patch.object(worker, 'play_windows', return_value=True) as fallback:
            output = worker.AudioOutput()
            self.assertTrue(output.play(recording(), threading.Event()))
            self.assertEqual(fallback.call_count, 1)

    def test_failed_device_switches_lane_to_windows_and_retains_cancellation(self):
        cancelled = threading.Event()
        with patch.dict(os.environ, {'RLM_AUDIO_BACKEND': ''}), \
             patch.object(worker, 'analysis_dependencies'), \
             patch.object(worker, 'play_analysis', side_effect=RuntimeError('Invalid sample rate')) as portaudio, \
             patch.object(worker, 'play_windows', return_value=False) as fallback:
            output = worker.AudioOutput()
            self.assertFalse(output.play(recording(), cancelled))
            self.assertFalse(output.play(recording(), cancelled))
            self.assertEqual(portaudio.call_count, 1)
            self.assertEqual(fallback.call_count, 2)
            self.assertIs(fallback.call_args.args[1], cancelled)

    def test_headset_receives_its_native_44100_rate_instead_of_forced_48000(self):
        np, _ = audio_dependencies()
        stream = Mock()
        sd = SimpleNamespace(query_devices=lambda *args, **kwargs: {'max_output_channels': 2, 'default_samplerate': 44100},
                             query_hostapis=lambda: [], RawOutputStream=Mock(return_value=stream))
        with patch.object(worker, 'analysis_dependencies', return_value=(np, sd)):
            self.assertTrue(worker.play_analysis(recording(), threading.Event()))
        self.assertEqual(sd.RawOutputStream.call_args.kwargs['samplerate'], 44100)
        self.assertEqual(sum(len(call.args[0]) for call in stream.write.call_args_list), 4410 * 2 * 2)
        stream.stop.assert_called_once()
        stream.close.assert_called_once()


if __name__ == '__main__':
    unittest.main()
