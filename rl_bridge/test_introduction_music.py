import tempfile
import unittest
from array import array
from pathlib import Path
from introduction_music import IntroductionMusic,gain_block

class IntroductionMusicTests(unittest.TestCase):
 def test_missing_recording_does_not_start_a_lane(self):
  music=IntroductionMusic(source='missing_music_for_test.wav',sink=lambda *_:self.fail('No audio expected'))
  self.assertFalse(music.start());music.stop()
 def test_owned_lane_stops_and_ducking_controls_the_music_gain_only(self):
  with tempfile.TemporaryDirectory() as folder:
   source=Path(folder)/'music.wav';source.write_bytes(b'fixture');targets=[];closed=[]
   def sink(source,stopped,target,on_started,fade):
    on_started();stopped.wait(1);targets.append(target());closed.append(True)
   music=IntroductionMusic(source=source,sink=sink,log=lambda _:None,fade=.05)
   self.assertTrue(music.start());self.assertTrue(music.ready.wait(1));self.assertFalse(music.start())
   music.set_ducked(True);music.stop();self.assertFalse(music.thread.is_alive());self.assertEqual(targets,[.18]);self.assertEqual(closed,[True])
 def test_software_gain_and_fade_preserve_pcm_length(self):
  data=array('h',[10000,10000,10000,10000]).tobytes()
  result=array('h');result.frombytes(gain_block(data,.4,0))
  self.assertEqual(len(result),4);self.assertEqual(result[0],4000);self.assertEqual(result[-1],0)
if __name__=='__main__':unittest.main()
