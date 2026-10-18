"""Verify real speech stages yield to gameplay; never launch a game or play audio."""
import contextlib
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'rl_bridge'))
sys.path.insert(0,str(ROOT/'rl_bridge/commentary'))

if __name__=='__main__':
    from bakkesmod_startup import process_ids
    if process_ids('RocketLeague.exe'):
        raise SystemExit('Speech benchmark skipped while Rocket League is open.')
    reports=ROOT/'rl_bridge/commentary/reports'
    reports.mkdir(parents=True,exist_ok=True)
    with (reports/'pacing-check.log').open('w',encoding='utf-8') as log, contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
        from chatterbox_worker import ChatterboxSpeech
        speech=ChatterboxSpeech()
        result=speech.synthesize('caster_one','What a finish!',reports/'paced-speech-check.wav',
                                 exaggeration=.78,cfg_weight=.35,gameplay_budget=True)
        assert speech.paced_modules>2,'Expected small model blocks, not only two whole decoders'
        assert result['gameplay_yield_seconds']>0,'Live GPU pacing must actually yield'
        import soundfile as sf
        import numpy as np
        pcm,rate=sf.read(result['file'])
        assert len(pcm)>0 and np.isfinite(pcm).all() and rate==24000
    print(json.dumps({'verified':True,'paced_modules':speech.paced_modules,**result}))
