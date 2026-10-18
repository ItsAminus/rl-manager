"""Generate an audition using only Alex's completed expanded V2 models."""
import os
import sys
import time
from pathlib import Path
from gpu_guard import ensure_inference_allowed
ensure_inference_allowed()

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'local_runtime/GPT-SoVITS'
DATA = ROOT / 'local_runtime/training_v2/caster_two'
os.environ['NLTK_DATA'] = str(SOURCE/'runtime/nltk_data')
os.environ['PATH'] = str(SOURCE/'runtime') + os.pathsep + os.environ.get('PATH', '')
os.environ['version'] = 'v2'
sys.path[:0] = [str(SOURCE/'GPT_SoVITS'), str(SOURCE)]
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import torch
import numpy as np
import soundfile as sf
from TTS_infer_pack.TTS import TTS, TTS_Config

torch.set_num_threads(4)
# Pick a short match excerpt, rather than a calm interview prompt.
rows = [line.split('\t') for line in (DATA/'2-name2text.txt').read_text(encoding='utf8').splitlines()]
candidates = []
for row in rows:
    if 'interview' in row[0] or len(row) < 4:
        continue
    path = DATA/'5-wav32k'/row[0]
    audio, rate = sf.read(path)
    if 3 <= len(audio)/rate <= 8:
        candidates.append((float(np.sqrt(np.mean(audio**2))), path, row[3]))
_, reference, prompt = max(candidates, key=lambda item: item[0])
print('REFERENCE:', reference.name, prompt, flush=True)
pipeline = TTS(TTS_Config({'custom': {
    'device': 'cuda', 'is_half': True, 'version': 'v2',
    't2s_weights_path': str(DATA/'weights/caster_two_v2-e30.ckpt'),
    'vits_weights_path': str(DATA/'weights/caster_two_v2_e24_s7944.pth'),
    'bert_base_path': str(SOURCE/'GPT_SoVITS/pretrained_models/chinese-roberta-wwm-ext-large'),
    'cnhuhbert_base_path': str(SOURCE/'GPT_SoVITS/pretrained_models/chinese-hubert-base'),
}}))
text = 'Oh, what a goal! He takes it off the ceiling, beats the last defender, and wins it in overtime! That is unbelievable!'
started = time.monotonic()
result = list(pipeline.run({
    'text': text, 'text_lang': 'en', 'ref_audio_path': str(reference),
    'prompt_text': prompt, 'prompt_lang': 'en', 'top_k': 20,
    'top_p': 0.6, 'temperature': 0.6, 'text_split_method': 'cut0',
    'batch_size': 1, 'speed_factor': 1.0, 'split_bucket': False,
    'seed': 1234, 'parallel_infer': False, 'use_cuda_graph': False,
    'use_flash_attention': False, 'repetition_penalty': 1.35,
}))
rate, audio = result[-1]
output = Path(__file__).parent/'reports/alex-expanded-hype.wav'
output.parent.mkdir(exist_ok=True)
sf.write(output, audio, rate, subtype='PCM_16')
print('SAVED:', output, 'duration:', len(audio)/rate, 'generation_s:', time.monotonic()-started, flush=True)
