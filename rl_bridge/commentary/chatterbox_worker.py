"""Resident Caster One/Caster Two speech on CUDA, ROCm or CPU. JSON in, WAV files out."""
import argparse
import contextlib
import gc
import json
import os
from pathlib import Path
import sys
import tempfile
import time
from runtime_paths import speech_model
from speech_device import select_device, cpu_device

ROOT = Path(__file__).resolve().parent
RUNTIME = Path(os.environ.get('RLM_AI_RUNTIME', str(ROOT.parent / 'local_runtime')))


def emit(value):
    print(json.dumps(value), flush=True)


class ChatterboxSpeech:
    def __init__(self, preference='auto'):
        temporary = ROOT / "cache" / "chatterbox_tmp"
        temporary.mkdir(parents=True, exist_ok=True)
        tempfile.tempdir = str(temporary)
        os.environ["TMP"] = os.environ["TEMP"] = str(temporary)
        os.environ["NUMBA_CACHE_DIR"] = str(temporary / "numba")
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TOKENIZERS_PARALLELISM"] = "false"
        os.environ["OMP_NUM_THREADS"] = "2"
        os.environ["MKL_NUM_THREADS"] = "2"
        os.environ["OPENBLAS_NUM_THREADS"] = "2"
        import torch
        from chatterbox.tts import ChatterboxTTS, Conditionals
        self.torch = torch
        self.model_class, self.conditionals_class = ChatterboxTTS, Conditionals
        self.selection = select_device(torch, preference)
        torch.set_num_interop_threads(1)
        try:
            self._load()
        except RuntimeError as error:
            if self.selection.device == 'cpu':
                raise
            self._fallback_to_cpu(error)

    def _load(self):
        self.cpu_threads = max(1, min(4, (os.cpu_count() or 4) // 2))
        self.torch.set_num_threads(self.cpu_threads if self.selection.device == 'cpu' else 2)
        # Same weights and voice conditionals on every backend. Never replace
        # the casters with system voices, or try to load CUDA tensors on a CPU.
        self.model = self.model_class.from_local(speech_model(RUNTIME), device=self.selection.device)
        self.profiles = {speaker: self.conditionals_class.load(
            ROOT / 'cache' / f'{speaker}_conds.pt', self.selection.device)
            for speaker in ('caster_one', 'caster_two')}
        from gpu_pacing import InferencePacer, install_model_pacing
        synchronize = ((lambda: self.torch.cuda.current_stream().synchronize())
                       if self.selection.device == 'cuda' else (lambda: None))
        self.pacer = InferencePacer(synchronize, duty=.75 if self.selection.device == 'cpu' else .35)
        # These are the repeated token and acoustic decoder steps. Wrap the
        # bound forward methods because Chatterbox also calls forward directly.
        self.paced_modules = install_model_pacing(self.model, self.pacer)

    def _fallback_to_cpu(self, error):
        reason = str(error)
        # Failed forwards can retain CUDA tensors in their traceback frames.
        # Release those references before loading the CPU model.
        error.__traceback__ = None
        self.model = None
        self.profiles = {}
        gc.collect()
        try:
            self.torch.cuda.empty_cache()
        except Exception:
            pass
        self.selection = cpu_device(f'GPU inference failed; keeping Caster One/Caster Two on CPU: {reason}')
        print(self.selection.reason, file=sys.stderr, flush=True)
        self._load()

    def synthesize(self, speaker, text, output, exaggeration=0.65, cfg_weight=0.5, temperature=0.8,
                   gameplay_budget=False):
        import soundfile as sf
        output = Path(output).resolve()
        if not output.is_relative_to(ROOT.resolve()):
            raise ValueError("Speech output must stay inside the commentary directory")
        if speaker not in ('caster_one', 'caster_two'):
            raise ValueError('Unknown commentary speaker')
        started = time.monotonic()
        try:
            wav = self._render(speaker, text, exaggeration, cfg_weight, temperature, gameplay_budget)
        except RuntimeError as error:
            if self.selection.device == 'cpu':
                raise
            self._fallback_to_cpu(error)
            wav = self._render(speaker, text, exaggeration, cfg_weight, temperature, gameplay_budget)
        pcm = wav.detach().cpu().numpy().reshape(-1)
        output.parent.mkdir(parents=True, exist_ok=True)
        temporary = output.with_suffix(".tmp.wav")
        sf.write(temporary, pcm, self.model.sr, subtype="PCM_16")
        temporary.replace(output)
        return {"file": str(output), "seconds": len(pcm) / self.model.sr,
                "generation_seconds": time.monotonic() - started, "sample_rate": self.model.sr,
                "backend": self.selection.backend, "gameplay_yield_seconds": self.pacer.yield_seconds}

    def _render(self, speaker, text, exaggeration, cfg_weight, temperature, gameplay_budget):
        self.model.conds = self.profiles[speaker]
        self.pacer.begin(gameplay_budget)
        try:
            with self.torch.inference_mode():
                return self.model.generate(text, exaggeration=exaggeration,
                                          cfg_weight=cfg_weight, temperature=temperature)
        finally:
            self.pacer.active = False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", action="store_true")
    parser.add_argument('--probe', action='store_true')
    parser.add_argument('--device', choices=('auto','cpu'), default=os.environ.get('RLM_SPEECH_DEVICE','auto'))
    args = parser.parse_args()
    if args.probe:
        import torch
        choice = select_device(torch, args.device)
        emit({'backend':choice.backend,'device':choice.label,'reason':choice.reason})
        return 0
    if args.test:
        import faulthandler
        faulthandler.dump_traceback_later(180)
    # Model libraries print progress. Keep it off the JSON protocol stream.
    try:
        with contextlib.redirect_stdout(sys.stderr):
            speech = ChatterboxSpeech(args.device)
        emit({"status": "ready", "device": speech.selection.label,
              'backend':speech.selection.backend,'fallback':speech.selection.reason,
              'cpu_threads':speech.cpu_threads,
              "paced_modules": speech.paced_modules})
        if args.test:
            faulthandler.cancel_dump_traceback_later()
    except Exception as exc:
        emit({"error": str(exc)})
        return 1
    if args.test:
        for speaker, text in (("caster_one", "What a finish!"), ("caster_two", "That is a great recovery.")):
            with contextlib.redirect_stdout(sys.stderr):
                result = speech.synthesize(speaker, text, ROOT / "reports" / f"chatterbox_{speech.selection.backend}_{speaker}_check.wav")
            emit({"speaker": speaker, "text": text, **result})
        return 0
    for line in sys.stdin:
        request = json.loads(line)
        try:
            with contextlib.redirect_stdout(sys.stderr):
                result = speech.synthesize(request["speaker"], request["text"], request["output"],
                                           request.get("exaggeration", 0.65),
                                           request.get('cfg_weight', 0.5), request.get('temperature', 0.8),
                                           request.get('gameplay_budget', False))
            emit({"id": request["id"], **result})
        except Exception as exc:
            emit({"id": request["id"], "error": str(exc)})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
