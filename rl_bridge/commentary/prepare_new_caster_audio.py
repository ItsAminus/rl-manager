"""Stage new caster audio on CPU; never edits active training data.

Speaker labels are automatic candidates, not certified diarization. Speech
overlap is not unmixed; uncertain or inconsistent windows go to review.
"""
import hashlib
import json
import os
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(str(Path.home() / 'Downloads' / 'audio [vocals].mp3'))
OUT = ROOT/'commentary/prepared_audio/finals_vocals'
OUT.mkdir(parents=True, exist_ok=True)
sys.stdout.reconfigure(encoding='utf8', errors='replace')
os.environ['PATH'] = str(ROOT/'local_runtime/GPT-SoVITS/runtime')+os.pathsep+os.environ.get('PATH','')
import torch
import soundfile as sf
import librosa
import numpy as np
torch.set_num_threads(2)
torch.set_num_interop_threads(1)

def save(name, data):
    path=OUT/name
    temp=path.with_suffix(path.suffix+'.tmp')
    temp.write_text(json.dumps(data, indent=2), encoding='utf8')
    temp.replace(path)

def status(stage, **kwargs):
    save('status.json', {'stage':stage, 'time':time.strftime('%Y-%m-%d %H:%M:%S'),
                         'pid':os.getpid(), **kwargs})
    print(stage, kwargs, flush=True)

def main():
    fingerprint=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    prior=OUT/'source.json'
    if prior.exists() and json.loads(prior.read_text())['sha256']!=fingerprint:
        raise RuntimeError('Source changed; use a new staging directory')
    x,sr=sf.read(SOURCE,dtype='float32')
    if x.ndim>1: x=x.mean(axis=1)
    audio=librosa.resample(x,orig_sr=sr,target_sr=16000)
    save('source.json', {'path':str(SOURCE),'sha256':fingerprint,'duration_seconds':len(audio)/16000})
    transcript_path=OUT/'transcript.json'
    if not transcript_path.exists():
        status('transcribing', device='cpu', duration_seconds=len(audio)/16000)
        import whisper
        model=whisper.load_model('small.en',device='cpu',download_root=str(ROOT/'local_runtime/whisper'))
        transcript=model.transcribe(audio,language='en',word_timestamps=True,
                                   condition_on_previous_text=False,temperature=0,
                                   fp16=False,verbose=False)
        save('transcript.json',transcript)
        del model
    transcript=json.loads(transcript_path.read_text(encoding='utf8'))
    status('matching_speakers', device='cpu')
    from speechbrain.inference.speaker import EncoderClassifier
    encoder=EncoderClassifier.from_hparams(source=str(ROOT/'local_runtime/ecapa'),
        savedir=str(ROOT/'local_runtime/ecapa'),run_opts={'device':'cpu'})
    def embed(y):
        with torch.inference_mode():
            v=encoder.encode_batch(torch.from_numpy(y.copy()).unsqueeze(0)).flatten()
            return torch.nn.functional.normalize(v,dim=0)
    prototypes={}
    for speaker,path in {
        'alex':Path(str(Path.home() / 'Downloads' / 'Alex Knight sample.mp3')),
        'caster_one':Path(str(Path.home() / 'Downloads' / 'Caster One sample.mp3')),
    }.items():
        y,_=librosa.load(str(path),sr=16000)
        refs=[embed(y)]
        for start in range(0,len(y)-5*16000,6*16000):
            refs.append(embed(y[start:start+6*16000]))
        prototypes[speaker]=torch.nn.functional.normalize(torch.stack(refs).mean(dim=0),dim=0)
    groups=[]
    for seg in transcript['segments']:
        group=[]
        for word in seg.get('words',[]):
            if group and word['end']-group[0]['start']>8:
                groups.append((group,seg)); group=[]
            group.append(word)
        if group: groups.append((group,seg))
    rows=[]
    for index,(words,seg) in enumerate(groups):
        start=max(0,float(words[0]['start'])-.08)
        end=min(len(audio)/16000,float(words[-1]['end'])+.10)
        text=''.join(w['word'] for w in words).strip().replace('|',',')
        clip=audio[int(start*16000):int(end*16000)]
        reasons=[]
        row={'start':start,'end':end,'text':text,'duration_seconds':end-start,
             'label':'review','reasons':reasons}
        if len(clip)<2.5*16000 or len(text.split())<4: reasons.append('too_short')
        if seg.get('avg_logprob',-1)<-.7 or seg.get('no_speech_prob',0)>.5:
            reasons.append('uncertain_transcript')
        if len(clip)>=16000:
            windows=[clip]
            # Independent beginning/end checks catch some turn changes.
            if len(clip)>=4*16000:
                windows.extend([clip[:int(len(clip)*.6)],clip[int(len(clip)*.4):]])
            scores=[]
            for window in windows:
                vector=embed(window)
                scores.append({k:float(torch.dot(v,vector)) for k,v in prototypes.items()})
            best=max(scores[0],key=scores[0].get)
            other='caster_one' if best=='alex' else 'alex'
            row.update(speaker_candidate=best,scores=scores[0],window_scores=scores)
            if scores[0][best]<.45 or scores[0][best]-scores[0][other]<.12:
                reasons.append('weak_speaker_match')
            if any(s[best]-s[other]<.08 for s in scores[1:]):
                reasons.append('possible_turn_change_or_overlap')
            if not reasons: row['label']=best
        else: reasons.append('insufficient_voice_audio')
        folder=OUT/row['label']
        folder.mkdir(exist_ok=True)
        path=folder/f'clip_{index:04d}_{int(start*1000):09d}.wav'
        sf.write(path,clip,16000,subtype='PCM_16')
        row['path']=str(path)
        rows.append(row)
        if index%10==0:
            save('segments.json',rows)
            status('matching_speakers',completed=index+1,total=len(groups),
                   percent=round(100*(index+1)/len(groups),1))
    save('segments.json',rows)
    summary={label:{'clips':sum(r['label']==label for r in rows),
                    'minutes':round(sum(r['duration_seconds'] for r in rows if r['label']==label)/60,2)}
             for label in ('alex','caster_one','review')}
    summary.update(source_minutes=round(len(audio)/16000/60,2),
        note='Automatic speaker candidates; overlap is not separated. Transcripts and clean delivery require review before training.')
    save('summary.json',summary)
    for speaker in ('alex','caster_one'):
        (OUT/f'{speaker}-candidate.list').write_text('\n'.join(
            f"{r['path']}|{speaker}|EN|{r['text']}" for r in rows if r['label']==speaker)+'\n',encoding='utf8')
    status('prepared_for_review',summary=summary)

if __name__=='__main__':
    try: main()
    except Exception as exc:
        status('failed',error=str(exc))
        raise
