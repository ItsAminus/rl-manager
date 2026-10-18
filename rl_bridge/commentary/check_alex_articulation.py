"""CPU transcription diagnostics; timings do not measure perceptual quality."""
import json
import sys
from pathlib import Path
import torch
import whisper
import librosa
torch.set_num_threads(4)
root = Path(__file__).resolve().parents[1]
model = whisper.load_model('small.en', device='cpu', download_root=str(root/'local_runtime/whisper'))
folder = Path(__file__).parent / 'reports/alex-articulation'
if '--hype' in sys.argv:
    folder = Path(__file__).parent / 'reports/alex-hype'
out = {}
for path in sorted(folder.glob('*.wav')):
    if 'reference' in path.name:
        continue
    if '--hype' in sys.argv and path.stem != 'hype-0':
        continue
    if '--voices-only' in sys.argv and not path.stem.startswith('voice_'):
        continue
    result = model.transcribe(librosa.load(str(path), sr=16000)[0], fp16=False,
                              language='en', temperature=0, word_timestamps=True)
    out[path.stem] = result
    words = [w for s in result['segments'] for w in s['words']]
    print(path.stem, result['text'], [(w['word'], round(w['end']-w['start'], 2)) for w in words], flush=True)
(folder/'word-timings.json').write_text(json.dumps(out), encoding='utf8')
