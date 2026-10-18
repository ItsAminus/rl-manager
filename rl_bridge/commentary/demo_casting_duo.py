"""Generate a fictional two-caster sequence with a brief simultaneous reaction."""
import json
import os
import sys
from pathlib import Path
from gpu_guard import ensure_inference_allowed
ensure_inference_allowed()
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'local_runtime/GPT-SoVITS'
OUT=Path(__file__).parent/'reports/duo-demo'
OUT.mkdir(parents=True,exist_ok=True)
os.environ['NLTK_DATA']=str(SOURCE/'runtime/nltk_data')
os.environ['PATH']=str(SOURCE/'runtime')+os.pathsep+os.environ.get('PATH','')
os.environ['version']='v2'
sys.path[:0]=[str(SOURCE/'GPT_SoVITS'),str(SOURCE)]
sys.stdout.reconfigure(encoding='utf8',errors='replace')
import torch
import numpy as np
import soundfile as sf
torch.set_num_threads(4)
from TTS_infer_pack.TTS import TTS,TTS_Config
pre=SOURCE/'GPT_SoVITS/pretrained_models'
models={
    'alex':(ROOT/'local_runtime/alex_recovery_v2/caster_two/weights/alex_recovery_v2_e8_s1256.pth',
            pre/'gsv-v2final-pretrained/s1bert25hz-5kh-longer-epoch=12-step=369668.ckpt'),
    'caster_one':(ROOT/'local_runtime/training_v2/caster_one/weights/caster_one_v2_e24_s6336.pth',
            ROOT/'local_runtime/training_v2/caster_one/weights/caster_one_v2-e30.ckpt'),
}
alex_ref=Path(__file__).parent/'references/caster_two-clear.wav'
caster_one_ref=json.loads((Path(__file__).parent/'reports/caster_one-completed/sample.json').read_text(encoding='utf8'))
references={'alex':(alex_ref,alex_ref.with_suffix('.txt').read_text(encoding='utf8')),
            'caster_one':(Path(caster_one_ref['reference']),caster_one_ref['prompt'])}
turns=[
    {'speaker':'alex','text':'Ten seconds left. Falcons and Spacestation are tied. This is the final chance!'},
    {'speaker':'caster_one','text':"Off the wall! He's beaten one! The pass is there! It's in! Spacestation have done it!"},
    {'speaker':'alex','text':'No way! With one second left! That is outrageous!'},
    {'speaker':'caster_one','text':'From the brink of defeat to the winning goal. What a finish to this grand final!'},
]
pipeline=TTS(TTS_Config({'custom':{
    'device':'cuda','is_half':True,'version':'v2',
    't2s_weights_path':str(models['alex'][1]),'vits_weights_path':str(models['alex'][0]),
    'bert_base_path':str(pre/'chinese-roberta-wwm-ext-large'),
    'cnhuhbert_base_path':str(pre/'chinese-hubert-base'),
}}))
clips={}
for speaker in ('alex','caster_one'):
    if speaker=='caster_one':
        pipeline.init_t2s_weights(str(models[speaker][1]))
        pipeline.init_vits_weights(str(models[speaker][0]))
    ref,prompt=references[speaker]
    for index,turn in enumerate(turns):
        if turn['speaker']!=speaker:continue
        sr,audio=list(pipeline.run({
            'text':turn['text'],'text_lang':'en','ref_audio_path':str(ref),'prompt_text':prompt,
            'prompt_lang':'en','top_k':20,'top_p':.6,'temperature':.6,'text_split_method':'cut0',
            'batch_size':1,'speed_factor':1.0,'split_bucket':False,'seed':1234,
            'parallel_infer':False,'use_cuda_graph':False,'use_flash_attention':False,'repetition_penalty':1.35,
        }))[-1]
        sf.write(OUT/f'{index+1}-{speaker}.wav',audio,sr,subtype='PCM_16')
        x=audio.astype('float32')/32768
        active=np.flatnonzero(np.abs(x)>max(.001,float(np.max(np.abs(x)))*.005))
        if len(active):x=x[max(0,active[0]-int(.03*sr)):min(len(x),active[-1]+int(.06*sr))]
        clips[index]=x
        print('Generated',speaker,index+1,len(x)/sr,flush=True)
# Keep each speaker's relative dynamics and reserve room for their overlap.
gains={}
for speaker in ('alex','caster_one'):
    x=np.concatenate([clips[i] for i,t in enumerate(turns) if t['speaker']==speaker])
    gains[speaker]=min(2.0,.11/max(float(np.sqrt(np.mean(x*x))),.001))
starts=[0]
starts.append(len(clips[0])+int(.10*sr))
overlap=min(int(1.15*sr),len(clips[1])//3,len(clips[2])//2)
starts.append(starts[1]+len(clips[1])-overlap)
starts.append(max(starts[1]+len(clips[1]),starts[2]+len(clips[2]))+int(.10*sr))
mix=np.zeros((max(starts[i]+len(clips[i]) for i in range(4))+int(.25*sr),2),dtype='float32')
for i,turn in enumerate(turns):
    x=clips[i]*gains[turn['speaker']]
    # Slight separation makes the simultaneous reaction easier to follow.
    pan=-.18 if turn['speaker']=='alex' else .18
    stereo=x[:,None]*np.array([np.sqrt((1-pan)/2),np.sqrt((1+pan)/2)],dtype='float32')
    mix[starts[i]:starts[i]+len(x)]+=stereo
    turn.update(start_seconds=starts[i]/sr,duration_seconds=len(x)/sr)
peak=float(np.max(np.abs(mix)))
if peak>.95:mix*=.95/peak
sf.write(OUT/'alex-and-caster_one-last-second-win.wav',mix,sr,subtype='PCM_16')
(OUT/'timeline.json').write_text(json.dumps({'fictional_demo':True,'turns':turns,
    'overlap_seconds':overlap/sr,'duration_seconds':len(mix)/sr},indent=2),encoding='utf8')
print('SAVED DUO',len(mix)/sr,'seconds; overlap',overlap/sr,flush=True)
