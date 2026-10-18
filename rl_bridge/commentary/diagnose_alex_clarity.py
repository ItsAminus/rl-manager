"""Audition Alex with clean reference audio; never alters training files."""
import os, sys, json, time
from pathlib import Path
from gpu_guard import ensure_inference_allowed
ensure_inference_allowed()
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT/'local_runtime/GPT-SoVITS'
DATA = ROOT/'local_runtime/training_v2/caster_two'
OUT = Path(__file__).parent/'reports/alex-clarity'
OUT.mkdir(parents=True, exist_ok=True)
os.environ['NLTK_DATA'] = str(SOURCE/'runtime/nltk_data')
os.environ['PATH'] = str(SOURCE/'runtime') + os.pathsep + os.environ.get('PATH','')
os.environ['version'] = 'v2'
sys.path[:0] = [str(SOURCE/'GPT_SoVITS'), str(SOURCE)]
sys.stdout.reconfigure(encoding='utf8', errors='replace')
import torch, soundfile as sf, librosa, numpy as np
torch.set_num_threads(4)
import whisper
sample = Path(str(Path.home() / 'Downloads' / 'Alex Knight sample.mp3'))
x, rate = sf.read(sample, dtype='float32')
if x.ndim > 1: x = x.mean(axis=1)
transcript = OUT/'reference-transcript.json'
if not transcript.exists():
    model = whisper.load_model('small.en', device='cpu', download_root=str(ROOT/'local_runtime/whisper'))
    result = model.transcribe(librosa.resample(x, orig_sr=rate, target_sr=16000), language='en',
                              word_timestamps=True, fp16=False, temperature=0)
    transcript.write_text(json.dumps(result), encoding='utf8')
    del model
result = json.loads(transcript.read_text(encoding='utf8'))
choices = []
for words in [[w for segment in result['segments'] for w in segment.get('words', [])]]:
    for offset in range(len(words)):
        group = []
        for word in words[offset:]:
            if word['end']-words[offset]['start'] > 8: break
            group.append(word)
        if len(group) >= 6 and 4 <= group[-1]['end']-group[0]['start'] <= 8:
            choices.append(group)
group = max(choices, key=len)
start = max(0, group[0]['start']-.08)
end = min(len(x)/rate, group[-1]['end']+.08)
ref = OUT/'clean-reference.wav'
sf.write(ref, x[int(start*rate):int(end*rate)], rate, subtype='PCM_16')
prompt = ''.join(w['word'] for w in group).strip()
print('CLEAN REFERENCE:', prompt, flush=True)
from TTS_infer_pack.TTS import TTS, TTS_Config
PRE = SOURCE/'GPT_SoVITS/pretrained_models'
pipeline = TTS(TTS_Config({'custom': {
    'device':'cuda', 'is_half':True, 'version':'v2',
    't2s_weights_path':str(DATA/'weights/caster_two_v2-e30.ckpt'),
    'vits_weights_path':str(DATA/'weights/caster_two_v2_e24_s7944.pth'),
    'bert_base_path':str(PRE/'chinese-roberta-wwm-ext-large'),
    'cnhuhbert_base_path':str(PRE/'chinese-hubert-base'),
}}))
settings = {'text':'What a goal! He beats the last defender and wins it in overtime. That is unbelievable!',
    'text_lang':'en', 'ref_audio_path':str(ref), 'prompt_text':prompt, 'prompt_lang':'en',
    'top_k':20, 'top_p':0.6, 'temperature':0.6, 'text_split_method':'cut0', 'batch_size':1,
    'speed_factor':1.0, 'split_bucket':False, 'seed':1234, 'parallel_infer':False,
    'use_cuda_graph':False, 'use_flash_attention':False, 'repetition_penalty':1.35}
metrics = {}
for mode in ['trained', 'base_gpt']:
    if mode == 'base_gpt':
        pipeline.init_t2s_weights(str(PRE/'gsv-v2final-pretrained/s1bert25hz-5kh-longer-epoch=12-step=369668.ckpt'))
    t = time.monotonic()
    sr, audio = list(pipeline.run(settings))[-1]
    sf.write(OUT/(mode+'.wav'), audio, sr, subtype='PCM_16')
    metrics[mode] = {'duration_s':len(audio)/sr, 'generation_s':time.monotonic()-t,
                     'dtype':str(audio.dtype), 'peak':float(np.abs(audio.astype(float)).max())}
    print('SAVED',mode,metrics[mode],flush=True)
(OUT/'metrics.json').write_text(json.dumps(metrics,indent=2),encoding='utf8')
