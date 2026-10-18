"""Caster One audition on CPU while Alex training retains exclusive GPU use."""
import json
import os
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'local_runtime/GPT-SoVITS'
OUT=Path(__file__).parent/'reports/caster_one-completed'
OUT.mkdir(parents=True,exist_ok=True)
os.environ['NLTK_DATA']=str(SOURCE/'runtime/nltk_data')
os.environ['PATH']=str(SOURCE/'runtime')+os.pathsep+os.environ.get('PATH','')
os.environ['version']='v2'
sys.path[:0]=[str(SOURCE/'GPT_SoVITS'),str(SOURCE)]
sys.stdout.reconfigure(encoding='utf8',errors='replace')
import torch
import soundfile as sf
import librosa
import numpy as np
torch.set_num_threads(2)
from TTS_infer_pack.TTS import TTS,TTS_Config

rows=json.loads((Path(__file__).parent/'prepared_audio/finals_vocals/review-metadata.json').read_text(encoding='utf8'))
candidates=[]
for row in rows:
    # Keep the references with the stricter speaker/transcript pass. Pitch is
    # only a ranking aid; it does not certify excitement or speaker identity.
    if row['label']!='caster_one' or not 3<=row['duration_seconds']<=8:continue
    audio,sr=librosa.load(row['path'],sr=16000)
    pitch=librosa.yin(audio,sr=sr,fmin=70,fmax=400)
    candidates.append((float(np.median(pitch)),row))
_,row=max(candidates,key=lambda r:r[0])
ref=Path(row['path'])
prompt=row['text']
print('Reference:',prompt,flush=True)
pre=SOURCE/'GPT_SoVITS/pretrained_models'
weights=ROOT/'local_runtime/training_v2/caster_one/weights'
pipeline=TTS(TTS_Config({'custom':{
    'device':'cpu','is_half':False,'version':'v2',
    't2s_weights_path':str(weights/'caster_one_v2-e30.ckpt'),
    'vits_weights_path':str(weights/'caster_one_v2_e24_s6336.pth'),
    'bert_base_path':str(pre/'chinese-roberta-wwm-ext-large'),
    'cnhuhbert_base_path':str(pre/'chinese-hubert-base'),
}}))
text="It's in! At the death! Falcons have stolen the win! That is unbelievable!"
rate,audio=list(pipeline.run({
    'text':text,'text_lang':'en','ref_audio_path':str(ref),'prompt_text':prompt,'prompt_lang':'en',
    'top_k':20,'top_p':.6,'temperature':.6,'text_split_method':'cut0','batch_size':1,
    'speed_factor':1.0,'split_bucket':False,'seed':1234,'parallel_infer':False,
    'use_cuda_graph':False,'use_flash_attention':False,'repetition_penalty':1.35,
}))[-1]
path=OUT/'caster_one-last-second-win.wav'
sf.write(path,audio,rate,subtype='PCM_16')
(OUT/'sample.json').write_text(json.dumps({'text':text,'reference':str(ref),
    'prompt':prompt,'device':'cpu','duration_seconds':len(audio)/rate},indent=2),encoding='utf8')
print('SAVED',path,'duration',len(audio)/rate,flush=True)
