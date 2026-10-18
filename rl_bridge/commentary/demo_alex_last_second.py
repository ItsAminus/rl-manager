"""Audition dynamic last-second commentary with Alex's earlier voice model."""
import json
import os
import sys
from pathlib import Path
from gpu_guard import ensure_inference_allowed
ensure_inference_allowed()
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT/'local_runtime/GPT-SoVITS'
OUT = Path(__file__).parent/'reports/alex-hype'
os.environ['NLTK_DATA'] = str(SOURCE/'runtime/nltk_data')
os.environ['PATH'] = str(SOURCE/'runtime') + os.pathsep + os.environ.get('PATH','')
os.environ['version'] = 'v2'
sys.path[:0] = [str(SOURCE/'GPT_SoVITS'),str(SOURCE)]
sys.stdout.reconfigure(encoding='utf8',errors='replace')
import torch
import soundfile as sf
import librosa
import numpy as np
torch.set_num_threads(4)
from TTS_infer_pack.TTS import TTS,TTS_Config
pre=SOURCE/'GPT_SoVITS/pretrained_models'
baseline = '--base-voice' in sys.argv
pipeline=TTS(TTS_Config({'custom':{
    'device':'cuda','is_half':True,'version':'v2',
    't2s_weights_path':str(pre/'gsv-v2final-pretrained/s1bert25hz-5kh-longer-epoch=12-step=369668.ckpt'),
    'vits_weights_path':str(pre/'gsv-v2final-pretrained/s2G2333k.pth' if baseline else
                           ROOT/'local_runtime/training_v2/caster_two/weights/caster_two_v2_e12_s3972.pth'),
    'bert_base_path':str(pre/'chinese-roberta-wwm-ext-large'),
    'cnhuhbert_base_path':str(pre/'chinese-hubert-base'),
}}))
text="He's got one chance! It's in! With one second left! They have stolen it at the death! I cannot believe what we've just seen!"
metrics={}
for name,ref in [('control',Path(__file__).parent/'references/caster_two-clear.wav'),
                 ('hype-0',OUT/'hype-reference-0.wav'),
                 ('hype-1',OUT/'hype-reference-1.wav')]:
    if not ref.exists():continue
    rate,audio=list(pipeline.run({
        'text':text,'text_lang':'en','ref_audio_path':str(ref),
        'prompt_text':ref.with_suffix('.txt').read_text(encoding='utf8'),'prompt_lang':'en',
        'top_k':20,'top_p':.6,'temperature':.6,'text_split_method':'cut0',
        'batch_size':1,'speed_factor':1.0,'split_bucket':False,'seed':1234,
        'parallel_infer':False,'use_cuda_graph':False,'use_flash_attention':False,
        'repetition_penalty':1.35,
    }))[-1]
    sf.write(OUT/(('base-' if baseline else '')+name+'.wav'),audio,rate,subtype='PCM_16')
    x=audio.astype('float32')/32768
    pitch=librosa.yin(x,sr=rate,fmin=70,fmax=450)
    rms=librosa.feature.rms(y=x)[0]
    pitch=pitch[rms>max(.01,float(np.quantile(rms,.35)))]
    metrics[name]={'duration':len(audio)/rate,'pitch_median':float(np.median(pitch)),
                   'pitch_p90':float(np.quantile(pitch,.9)),
                   'peak':float(np.max(np.abs(x)))}
    print(name,metrics[name],flush=True)
(OUT/('base-audition-metrics.json' if baseline else 'audition-metrics.json')).write_text(json.dumps(metrics,indent=2),encoding='utf8')
