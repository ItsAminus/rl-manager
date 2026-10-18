"""Offline validity check for paced live inference; does not play audio or launch a game."""
import json,random,sys,contextlib
from pathlib import Path
import time

root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'rl_bridge/commentary'))
from chatterbox_worker import ChatterboxSpeech,ROOT

with contextlib.redirect_stdout(sys.stderr):
    speech=ChatterboxSpeech()
assert speech.paced_modules==2, 'Installed model is missing a pacing boundary'
import numpy as np
import soundfile as sf
rows=[];waves=[]
for paced in (False,True):
    speech.torch.manual_seed(2468);random.seed(2468);np.random.seed(2468)
    output=ROOT/'reports'/('gameplay-paced-check.wav' if paced else 'gameplay-regular-check.wav')
    with contextlib.redirect_stdout(sys.stderr):
        result=speech.synthesize('caster_one','A brilliant finish!',output,gameplay_budget=paced)
    pcm,rate=sf.read(output)
    assert np.isfinite(pcm).all() and np.max(np.abs(pcm))>.01 and len(pcm)>rate*.5
    if paced:assert result['gameplay_yield_seconds']>0
    waves.append(pcm)
    rows.append({'paced':paced,**result})
summary={'checks':rows,'paced_modules':speech.paced_modules,
         'equal_length':len(waves[0])==len(waves[1]),
         'identical_seeded_pcm':bool(np.array_equal(waves[0],waves[1]))}
report=ROOT/'reports/gameplay-pacing-check.json'
report.write_text(json.dumps(summary,indent=2),encoding='utf8')
print(json.dumps(summary))
