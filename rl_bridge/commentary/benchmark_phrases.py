import time
import torch
from chatterbox.tts import ChatterboxTTS, Conditionals

device = 'cuda' if torch.cuda.is_available() else 'cpu'
print(f"Loading Chatterbox on {device}...")
model = ChatterboxTTS.from_pretrained(device=device)
conds = Conditionals.load('rl_bridge/commentary/cache/caster_one_conds.pt', map_location=device)
model.conds = conds

phrases = [
    'Goal by Gimmick!',
    'Huge save by Metsanauris!',
    'RelatingWave clears it out!'
]

for text in phrases:
    t0 = time.time()
    with torch.inference_mode():
        wav = model.generate(text, exaggeration=0.95)
    gen_time = time.time() - t0
    dur = (len(wav.squeeze()) / model.sr) if hasattr(wav, 'squeeze') else 2.0
    print(f"\"{text}\" -> generated in {gen_time:.2f}s (audio: {dur:.2f}s)")
