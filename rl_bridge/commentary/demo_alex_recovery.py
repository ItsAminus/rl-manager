"""Audition the completed corrective model; no automatic live activation."""
import os
import sys
import json
from pathlib import Path
from gpu_guard import ensure_inference_allowed
ensure_inference_allowed()
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'local_runtime/GPT-SoVITS'
OUT=Path(__file__).parent/'reports/alex-recovery'
OUT.mkdir(parents=True,exist_ok=True)
os.environ['NLTK_DATA']=str(SOURCE/'runtime/nltk_data')
os.environ['PATH']=str(SOURCE/'runtime')+os.pathsep+os.environ.get('PATH','')
os.environ['version']='v2'
sys.path[:0]=[str(SOURCE/'GPT_SoVITS'),str(SOURCE)]
sys.stdout.reconfigure(encoding='utf8',errors='replace')
import torch
import soundfile as sf
torch.set_num_threads(4)
from TTS_infer_pack.TTS import TTS,TTS_Config
pre=SOURCE/'GPT_SoVITS/pretrained_models'
checkpoint=ROOT/'local_runtime/alex_recovery_v2/caster_two/weights/alex_recovery_v2_e8_s1256.pth'
pipeline=TTS(TTS_Config({'custom':{
    'device':'cuda','is_half':True,'version':'v2',
    't2s_weights_path':str(pre/'gsv-v2final-pretrained/s1bert25hz-5kh-longer-epoch=12-step=369668.ckpt'),
    'vits_weights_path':str(checkpoint),
    'bert_base_path':str(pre/'chinese-roberta-wwm-ext-large'),
    'cnhuhbert_base_path':str(pre/'chinese-hubert-base'),
}}))
ref=Path(__file__).parent/'references/caster_two-clear.wav'
text='What a goal! He beats the last defender and wins it in overtime. That is unbelievable!'
rate,audio=list(pipeline.run({
    'text':text,'text_lang':'en','ref_audio_path':str(ref),
    'prompt_text':ref.with_suffix('.txt').read_text(encoding='utf8'),'prompt_lang':'en',
    'top_k':20,'top_p':.6,'temperature':.6,'text_split_method':'cut0','batch_size':1,
    'speed_factor':1.0,'split_bucket':False,'seed':1234,'parallel_infer':False,
    'use_cuda_graph':False,'use_flash_attention':False,'repetition_penalty':1.35,
}))[-1]
path=OUT/'alex-e8-clarity.wav'
sf.write(path,audio,rate,subtype='PCM_16')
(OUT/'sample.json').write_text(json.dumps({'checkpoint':str(checkpoint),
    'text':text,'reference':str(ref),'duration_seconds':len(audio)/rate},indent=2),encoding='utf8')
print('SAVED',path,len(audio)/rate,flush=True)
