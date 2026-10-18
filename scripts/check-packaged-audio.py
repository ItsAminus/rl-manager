"""Test shipped match audio under a relocated, isolated Python installation."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--resources', required=True, type=Path)
    parser.add_argument('--python', required=True, type=Path)
    args = parser.parse_args()
    resources, python = args.resources.resolve(), args.python.resolve()
    commentary = resources / 'rl_bridge/commentary'
    environment = {**os.environ, 'RLM_AUDIO_DEPS': str(resources / 'audio-deps'), 'PYTHONNOUSERSITE': '1', 'PYTHONDONTWRITEBYTECODE': '1'}
    environment.pop('PYTHONPATH', None)
    environment.pop('PYTHONHOME', None)
    results = []
    def check(name, env):
        run = subprocess.run([str(python), '-B', '-I', str(commentary / 'audio_check.py'), '--silent'],
                             env=env, capture_output=True, text=True, timeout=90)
        if run.returncode:
            raise RuntimeError(name + ': ' + run.stdout + run.stderr)
        result = json.loads(run.stdout)
        if not result['success'] or result['recordings'] != 407 or len(result['lanes']) != 3:
            raise RuntimeError(name + ': ' + str(result))
        results.append({'test': name, **result})
    check('default output', environment)
    check('Windows fallback', {**environment, 'RLM_AUDIO_BACKEND': 'windows'})
    with tempfile.TemporaryDirectory(prefix='rlm-audio-dependency-test-', dir=Path.cwd() / 'scratch') as folder:
        Path(folder, 'sounddevice.py').write_text("raise ImportError('simulated unavailable PortAudio')\n")
        check('missing PortAudio still plays every lane', {**environment, 'RLM_AUDIO_DEPS': folder, 'RLM_AUDIO_BACKEND': ''})
        if not all(any('using Windows default output' in message for message in lane['diagnostics']) for lane in results[-1]['lanes']):
            raise RuntimeError('Dependency-failure test did not actually use the fallback')
    # Exercise the real binary protocol and waveOut reset. Silence tests device
    # output without unexpectedly playing loud crowd recordings during a build.
    script = '''import io,sys,threading,time,wave
sys.path.insert(0,sys.argv[1])
from native_audio import NativeSink
out=io.BytesIO()
with wave.open(out,'wb') as wav:
 wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(48000);wav.writeframes(bytes(48000*2*4))
sink=NativeSink(continuous_output=True);started=threading.Event();cancel=threading.Event();result=[]
thread=threading.Thread(target=lambda:result.append(sink.play(out.getvalue(),started.set,True,cancel)))
thread.start()
assert started.wait(5),'No native START acknowledgement'
time.sleep(.1);at=time.monotonic();cancel.set();sink.interrupt();thread.join(3)
assert result==[False],result
assert time.monotonic()-at<1,'Countdown cancellation took too long'
sink.close();print('CANCELLATION_OK')
'''
    run = subprocess.run([str(python), '-B', '-I', '-c', script, str(commentary)], env={**environment, 'RLM_AUDIO_BACKEND': 'windows'},
                         capture_output=True, text=True, timeout=30)
    if run.returncode or 'CANCELLATION_OK' not in run.stdout:
        raise RuntimeError(run.stdout + run.stderr)
    print(json.dumps({'success': True, 'checks': results, 'countdownCancellation': True}, indent=2))


if __name__ == '__main__':
    main()
