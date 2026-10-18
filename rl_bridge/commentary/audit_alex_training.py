"""Prepare a stricter, isolated Alex corpus on CPU; preserve active training."""
import json
import os
import sys
from pathlib import Path
import time
import argparse
parser=argparse.ArgumentParser()
parser.add_argument('--device',choices=('cpu','cuda'),default='cpu')
args=parser.parse_args()
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'local_runtime/alex_clarity_v2'
OUT.mkdir(parents=True,exist_ok=True)
os.environ['PATH']=str(ROOT/'local_runtime/GPT-SoVITS/runtime')+os.pathsep+os.environ.get('PATH','')
sys.stdout.reconfigure(encoding='utf8',errors='replace')
import torch
import librosa
import numpy as np
import soundfile as sf
torch.set_num_threads(2)
from speechbrain.inference.speaker import EncoderClassifier

def save(name,data):
    path=OUT/name
    tmp=path.with_suffix(path.suffix+'.tmp')
    tmp.write_text(json.dumps(data,indent=2),encoding='utf8'); tmp.replace(path)
def status(stage,**details):
    save('audit-status.json',{'stage':stage,'time':time.strftime('%Y-%m-%d %H:%M:%S'),
                            'pid':os.getpid(),'device':args.device,**details})
    print(stage,details,flush=True)

def main():
    if args.device=='cuda':
        caster_one=json.loads((ROOT/'local_runtime/training_v2/status.json').read_text(encoding='utf8'))
        if caster_one['stage']!='expanded_training_complete':
            raise RuntimeError('GPU transcript checks must wait for Caster One to finish')
        if not torch.cuda.is_available():raise RuntimeError('CUDA is unavailable')
    status('loading_models')
    enc=EncoderClassifier.from_hparams(source=str(ROOT/'local_runtime/ecapa'),
         savedir=str(ROOT/'local_runtime/ecapa'),run_opts={'device':'cpu'})
    def embed(x):
        with torch.inference_mode():
            v=enc.encode_batch(torch.from_numpy(x.copy()).unsqueeze(0)).flatten()
            return torch.nn.functional.normalize(v,dim=0)
    prototypes={}
    for speaker,path in {'alex':str(Path.home() / 'Downloads' / 'Alex Knight sample.mp3'),
                         'caster_one':str(Path.home() / 'Downloads' / 'Caster One sample.mp3')}.items():
        x,_=librosa.load(path,sr=16000)
        vectors=[embed(x)]
        for begin in range(0,len(x)-6*16000,6*16000): vectors.append(embed(x[begin:begin+6*16000]))
        prototypes[speaker]=torch.nn.functional.normalize(torch.stack(vectors).mean(0),dim=0)
    lines=(ROOT/'local_runtime/training_v2/caster_two/train.list').read_text(encoding='utf8').splitlines()
    lines=[line for line in lines if 'interview_' in line]
    cache=OUT/'speaker-audit.json'
    records=json.loads(cache.read_text(encoding='utf8')) if cache.exists() else []
    done={r['path'] for r in records}
    status('checking_voice',total=len(lines),completed=len(records))
    for index,line in enumerate(lines):
        path,_,_,text=line.split('|',3)
        if path in done:continue
        x,_=librosa.load(path,sr=16000)
        windows=[x,x[:int(len(x)*.65)],x[int(len(x)*.35):]]
        scores=[]
        for window in windows:
            v=embed(window)
            scores.append({k:float(torch.dot(p,v)) for k,p in prototypes.items()})
        reasons=[]
        if min(s['alex'] for s in scores)<.52:reasons.append('weak_alex_match')
        if min(s['alex']-s['caster_one'] for s in scores)<.18:reasons.append('weak_voice_contrast')
        if len(x)/16000<3 or len(x)/16000>8.5:reasons.append('duration')
        if float(np.max(np.abs(x)))>=.995:reasons.append('clipping')
        records.append({'path':path,'original_text':text,'scores':scores,'reasons':reasons,
                        'duration_seconds':len(x)/16000})
        if index%20==0:
            save('speaker-audit.json',records)
            status('checking_voice',total=len(lines),completed=index+1,
                   candidates=sum(not r['reasons'] for r in records))
    save('speaker-audit.json',records)
    selected=[r for r in records if not r['reasons']]
    # Independent retranscription supplies confidence and highlights mismatch;
    # agreement is a filter, not a guarantee the transcript is correct.
    import whisper
    import difflib
    import re
    model=whisper.load_model('small.en',device=args.device,download_root=str(ROOT/'local_runtime/whisper'))
    checked_path=OUT/'transcript-audit.json'
    checked=json.loads(checked_path.read_text(encoding='utf8')) if checked_path.exists() else []
    done={r['path'] for r in checked}
    status('checking_transcripts',total=len(selected),completed=len(checked))
    for index,entry in enumerate(selected):
        if entry['path'] in done:continue
        x,_=librosa.load(entry['path'],sr=16000)
        result=model.transcribe(x,language='en',fp16=False,temperature=0,
                               condition_on_previous_text=False)
        new=result['text'].strip().replace('|',',')
        norm=lambda t:re.findall(r"[a-z']+",t.lower())
        agreement=difflib.SequenceMatcher(None,norm(entry['original_text']),norm(new),autojunk=False).ratio()
        segments=result['segments']
        confidence=min((s.get('avg_logprob',-10) for s in segments),default=-10)
        valid=agreement>=.88 and confidence>=-.45 and len(new.split())>=5
        checked.append({**entry,'text':new,'agreement':agreement,'confidence':confidence,
                        'passes_transcript_filter':valid})
        # Keep every completed transcript when changing devices or recovering.
        save('transcript-audit.json',checked)
        if index%10==0:
            status('checking_transcripts',total=len(selected),completed=index+1,
                   accepted=sum(r['passes_transcript_filter'] for r in checked))
    save('transcript-audit.json',checked)
    usable=[r for r in checked if r['passes_transcript_filter']]
    # Reserve source blocks for validation; nearby utterances stay together.
    training=[];holdout=[]
    for row in usable:
        start=int(Path(row['path']).stem.split('_')[-1])/1000
        (holdout if int(start//30)%10==0 else training).append(row)
    for name,rows in [('train',training),('holdout',holdout)]:
        (OUT/f'{name}.list').write_text('\n'.join(f"{r['path']}|caster_two|EN|{r['text']}" for r in rows)+'\n',encoding='utf8')
    summary={'original_interview_clips':len(lines),'voice_candidates':len(selected),
             'accepted_clips':len(usable),'training_clips':len(training),
             'training_minutes':round(sum(r['duration_seconds'] for r in training)/60,2),
             'holdout_clips':len(holdout),'automatic_checks_only':True,
             'active_training_modified':False}
    save('summary.json',summary)
    status('corpus_audited',summary=summary)

if __name__=='__main__':
    try:main()
    except Exception as exc:
        status('failed',error=str(exc));raise
