"""Extract only the authorized caster voice from interview recordings."""
import json, sys
from pathlib import Path
import librosa, soundfile as sf, torch, whisper
from speechbrain.inference.speaker import EncoderClassifier

ROOT = Path(__file__).resolve().parents[1]
RUN = ROOT / "local_runtime" / "training_v2"
RUNTIME = ROOT / "local_runtime"
INTERVIEWS = {
    "caster_one": Path(str(Path.home() / 'Downloads' / 'Caster One Caster One - Casting story telling reading and creative process.mp3')),
    "caster_two": Path(str(Path.home() / 'Downloads' / 'Alex Caster Two Knight - Therapy mental health and content production.mp3')),
}
REFS = {
    "caster_one": Path(str(Path.home() / 'Downloads' / 'Caster One sample.mp3')),
    "caster_two": Path(str(Path.home() / 'Downloads' / 'Alex Knight sample.mp3')),
}

def main():
    enc = EncoderClassifier.from_hparams(source=str(RUNTIME / "ecapa"), savedir=str(RUNTIME / "ecapa"), run_opts={"device": "cuda"})
    def embed(x):
        with torch.inference_mode():
            v = enc.encode_batch(torch.from_numpy(x.copy()).unsqueeze(0).to("cuda")).flatten()
            return torch.nn.functional.normalize(v, dim=0)
    prototypes = {}
    for speaker, ref in REFS.items():
        x, _ = librosa.load(str(ref), sr=16000, mono=True)
        prototypes[speaker] = embed(x)
    for speaker, path in INTERVIEWS.items():
        print(f"Transcribing {speaker}: {path}", flush=True)
        audio, _ = librosa.load(str(path), sr=16000, mono=True)
        model = whisper.load_model("small.en", device="cuda", download_root=str(RUNTIME / "whisper"))
        result = model.transcribe(audio, language="en", word_timestamps=True, verbose=False,
                                  condition_on_previous_text=False, temperature=0)
        del model; torch.cuda.empty_cache()
        accepted = []
        for seg in result.get("segments", []):
            words = seg.get("words", [])
            if not words: continue
            start = max(0.0, float(words[0]["start"]) - .06)
            end = min(len(audio) / 16000, float(words[-1]["end"]) + .08)
            if not 2.5 <= end-start <= 10 or len(words) < 4: continue
            clip = audio[int(start*16000):int(end*16000)]
            score = float(torch.dot(prototypes[speaker], embed(clip)).cpu())
            if score < .36: continue
            text = "".join(w["word"] for w in words).strip().replace("|", ",")
            out = RUN / speaker / "wavs" / f"{speaker}_interview_{int(start*1000):09d}.wav"
            sf.write(out, clip, 16000, subtype="PCM_16")
            accepted.append((out, text, score))
        train = RUN / speaker / "train.list"
        existing = train.read_text(encoding="utf8").splitlines()
        existing_paths = {line.split("|", 1)[0] for line in existing if line}
        for out, text, score in accepted:
            if str(out) not in existing_paths:
                existing.append(f"{out}|{speaker}|EN|{text}")
        train.write_text("\n".join(existing) + "\n", encoding="utf8")
        print(f"{speaker}: accepted {len(accepted)} interview clips; added {sum((out.stat().st_size for out,_,_ in accepted), 0)} bytes", flush=True)

if __name__ == "__main__": main()
