"""Rank match references on CPU, without changing either training run."""
import json
from pathlib import Path
import numpy as np
import torch
import librosa
import soundfile as sf
from speechbrain.inference.speaker import EncoderClassifier

torch.set_num_threads(4)
ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT/'local_runtime/training_v2'
OUT = Path(__file__).parent/'reports/alex-hype'
OUT.mkdir(parents=True, exist_ok=True)
enc = EncoderClassifier.from_hparams(source=str(ROOT/'local_runtime/ecapa'),
                                     savedir=str(ROOT/'local_runtime/ecapa'),
                                     run_opts={'device':'cpu'})
def embedding(x):
    with torch.inference_mode():
        v = enc.encode_batch(torch.from_numpy(x.copy()).unsqueeze(0)).flatten()
        return torch.nn.functional.normalize(v, dim=0)
refs = {name: embedding(librosa.load(str(path),sr=16000)[0]) for name,path in {
    'caster_two': Path(str(Path.home() / 'Downloads' / 'Alex Knight sample.mp3')),
    'caster_one': Path(str(Path.home() / 'Downloads' / 'Caster One sample.mp3')),
}.items()}
rows = json.loads((DATA/'segments.json').read_text())
candidates = [dict(r) for r in rows if r['speaker']=='caster_two' and 3 <= r['end']-r['start']<=8]
# Include the climax, where emotional delivery may have reduced the old
# speaker-matching score. Recheck rather than assuming these are Alex.
transcript = json.loads((DATA/'transcript.json').read_text())
for seg in transcript['segments']:
    if 1660 < seg['start'] < 1756 and 3 <= seg['end']-seg['start'] <= 8:
        candidates.append({'start':seg['start'], 'end':seg['end'], 'text':seg['text'].strip()})
info = sf.info(DATA/'match_vocals.wav')
results = []
for i,row in enumerate(candidates):
    x,sr = sf.read(DATA/'match_vocals.wav', start=int(row['start']*info.samplerate),
                   stop=int(row['end']*info.samplerate), dtype='float32')
    if x.ndim>1: x=x.mean(axis=1)
    x=librosa.resample(x,orig_sr=sr,target_sr=16000)
    e=embedding(x)
    scores={k:float(torch.dot(v,e)) for k,v in refs.items()}
    # Fundamental-frequency estimates are only a ranking aid, not proof of
    # emotion or speaker identity.
    pitch=librosa.yin(x,fmin=70,fmax=400,sr=16000,frame_length=1024,hop_length=256)
    rms=librosa.feature.rms(y=x,frame_length=1024,hop_length=256)[0]
    pitch=pitch[rms>max(.01,float(np.quantile(rms,.35)))]
    if len(pitch)==0: continue
    row.update(scores=scores, margin=scores['caster_two']-scores['caster_one'],
               pitch_median=float(np.median(pitch)),pitch_p90=float(np.quantile(pitch,.9)))
    row['rank']=row['pitch_median']+.3*(row['pitch_p90']-row['pitch_median'])
    results.append(row)
results.sort(key=lambda r:r['rank'],reverse=True)
(OUT/'reference-ranking.json').write_text(json.dumps(results,indent=2),encoding='utf8')
chosen=[]
for row in results:
    if row['scores']['caster_two']<.36 or row['margin']<.08:
        continue
    if any(abs(row['start']-other['start'])<1 for other in chosen):
        continue
    chosen.append(row)
    if len(chosen)==2:
        break
for i,row in enumerate(chosen):
    x,sr=sf.read(DATA/'match_vocals.wav', start=int(row['start']*info.samplerate),
                  stop=int(row['end']*info.samplerate), dtype='float32')
    if x.ndim>1:x=x.mean(axis=1)
    sf.write(OUT/f'hype-reference-{i}.wav',x,sr,subtype='PCM_16')
    (OUT/f'hype-reference-{i}.txt').write_text(row['text'],encoding='utf8')
    print(json.dumps(row),flush=True)
if not chosen:
    raise RuntimeError('No sufficiently distinct Alex reference found')
