"""Small Alex-only audition; does not touch training state or checkpoints."""
import os
import sys
import json
from pathlib import Path
from gpu_guard import ensure_inference_allowed
ensure_inference_allowed()

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'local_runtime/GPT-SoVITS'
OUT = Path(__file__).parent / 'reports/alex-articulation'
OUT.mkdir(parents=True, exist_ok=True)
os.environ['NLTK_DATA'] = str(SOURCE / 'runtime/nltk_data')
os.environ['PATH'] = str(SOURCE / 'runtime') + os.pathsep + os.environ.get('PATH', '')
os.environ['version'] = 'v2'
sys.path[:0] = [str(SOURCE / 'GPT_SoVITS'), str(SOURCE)]
sys.stdout.reconfigure(encoding='utf8', errors='replace')
import torch
import soundfile as sf
torch.set_num_threads(4)
from TTS_infer_pack.TTS import TTS, TTS_Config

# A complete sentence, with margins around the words, rather than a dense
# window that starts/ends halfway through a thought.
x, sr = sf.read(str(Path.home() / 'Downloads' / 'Alex Knight sample.mp3'), dtype='float32')
if x.ndim > 1:
    x = x.mean(axis=1)
ref = OUT / 'sentence-reference.wav'
sf.write(ref, x[int(9.56 * sr):int(15.70 * sr)], sr, subtype='PCM_16')
prompt = "It's the story behind Gen G and the journey that all of those players have taken to winning the major."
(OUT / 'sentence-reference.txt').write_text(prompt, encoding='utf8')
pre = SOURCE / 'GPT_SoVITS/pretrained_models'
pipeline = TTS(TTS_Config({'custom': {
    'device': 'cuda', 'is_half': True, 'version': 'v2',
    't2s_weights_path': str(pre / 'gsv-v2final-pretrained/s1bert25hz-5kh-longer-epoch=12-step=369668.ckpt'),
    'vits_weights_path': str(ROOT / 'local_runtime/training_v2/caster_two/weights/caster_two_v2_e24_s7944.pth'),
    'bert_base_path': str(pre / 'chinese-roberta-wwm-ext-large'),
    'cnhuhbert_base_path': str(pre / 'chinese-hubert-base'),
}}))
settings = {
    'text': 'What a goal! He beats the last defender and wins it in overtime. That is unbelievable!',
    'text_lang': 'en', 'ref_audio_path': str(ref), 'prompt_text': prompt, 'prompt_lang': 'en',
    'top_k': 20, 'top_p': 0.6, 'temperature': 0.6, 'text_split_method': 'cut0',
    'batch_size': 1, 'speed_factor': 1.0, 'split_bucket': False, 'seed': 1234,
    'parallel_infer': False, 'use_cuda_graph': False, 'use_flash_attention': False,
    'repetition_penalty': 1.35,
}
variants = {
    'sentence': {},
    'sampling': {'top_k': 15, 'top_p': 1.0, 'temperature': 1.0},
    'repetition': {'top_k': 15, 'top_p': 1.0, 'temperature': 0.85, 'repetition_penalty': 1.5},
}
if '--voice-checkpoints' in sys.argv:
    ref = Path(__file__).parent / 'references/caster_two-clear.wav'
    prompt = ref.with_suffix('.txt').read_text(encoding='utf8')
    settings.update(ref_audio_path=str(ref), prompt_text=prompt)
    variants = {'voice_e6': {}, 'voice_e12': {}}
for name, overrides in variants.items():
    if name.startswith('voice_e'):
        epoch = int(name.split('e')[-1])
        weights = ROOT / 'local_runtime/training_v2/caster_two/weights'
        pipeline.init_vits_weights(str(next(weights.glob(f'*_e{epoch}_*.pth'))))
    rate, audio = list(pipeline.run({**settings, **overrides}))[-1]
    sf.write(OUT / (name + '.wav'), audio, rate, subtype='PCM_16')
    print('SAVED', name, len(audio) / rate, flush=True)
(OUT / 'variants.json').write_text(json.dumps(variants, indent=2), encoding='utf8')
