"""Local GPT-SoVITS V2 live commentary for RL Manager.

The voice models stay on the local GPU.  Commentary is generated in a worker
thread so RLBot packet handling remains real-time; a confirmed goal replaces
the current ambient line immediately.
"""
from collections import deque
from pathlib import Path
import os
import sys
import threading
import time
import tempfile
import winsound

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "local_runtime"
GSV_ROOT = RUNTIME / "GPT-SoVITS"
TRAINING = RUNTIME / "training_v2"

os.environ["PATH"] = str(GSV_ROOT / "runtime") + os.pathsep + os.environ.get("PATH", "")
os.environ["PYTHONPATH"] = str(GSV_ROOT) + os.pathsep + str(GSV_ROOT / "GPT_SoVITS")
os.environ["PYTHONIOENCODING"] = "utf-8"
os.environ["NLTK_DATA"] = str(GSV_ROOT / "runtime" / "nltk_data")
if str(GSV_ROOT) not in sys.path:
    sys.path.insert(0, str(GSV_ROOT))


def _latest(folder: Path, pattern: str) -> Path:
    files = sorted(folder.glob(pattern), key=lambda p: p.stat().st_mtime)
    if not files:
        raise FileNotFoundError(f"No trained checkpoint matching {pattern} in {folder}")
    return files[-1]


def _reference(speaker: str, emotion: str = "normal"):
    if speaker == "caster_two":
        references = Path(__file__).parent / "references"
        stem = "caster_two-hype" if emotion == "hype" else "caster_two-clear"
        return (references / f"{stem}.wav",
                (references / f"{stem}.txt").read_text(encoding="utf-8").strip())
    folder = TRAINING / speaker
    wav = sorted((folder / "5-wav32k").glob("*.wav"))[0]
    text = ""
    for line in (folder / "2-name2text.txt").read_text(encoding="utf-8").splitlines():
        fields = line.split("\t")
        if fields and fields[0] == wav.name and len(fields) >= 4:
            text = fields[3].strip()
            break
    return wav, text


class LocalSoVITSSpeech:
    def __init__(self):
        try:
            from .gpu_guard import ensure_inference_allowed
        except ImportError:
            from gpu_guard import ensure_inference_allowed
        ensure_inference_allowed()
        # Prevent inference_webui from loading its unrelated default model on
        # import.  Point it at our trained V2 pair before importing it.
        caster_one_dir = TRAINING / "caster_one" / "weights"
        os.environ["version"] = "v2"
        os.environ["is_half"] = "True"
        os.environ["gpt_path"] = str(_latest(caster_one_dir, "*-e*.ckpt"))
        os.environ["sovits_path"] = str(_latest(caster_one_dir, "*_e*.pth"))
        os.environ["bert_path"] = str(GSV_ROOT / "GPT_SoVITS" / "pretrained_models" / "chinese-roberta-wwm-ext-large")
        os.environ["cnhubert_base_path"] = str(GSV_ROOT / "GPT_SoVITS" / "pretrained_models" / "chinese-hubert-base")
        from GPT_SoVITS.TTS_infer_pack.TTS import TTS, TTS_Config
        self.models = {
            # The expanded GPT checkpoint produced extra nonsense syllables in
            # the audition. Keep Alex's learned voice, but use the base GPT for
            # articulation and the isolated solo recording for conditioning.
            "caster_two": (TRAINING / "caster_two" / "weights" / "caster_two_v2_e12_s3972.pth",
                       GSV_ROOT / "GPT_SoVITS" / "pretrained_models" /
                       "gsv-v2final-pretrained" /
                       "s1bert25hz-5kh-longer-epoch=12-step=369668.ckpt"),
            "caster_one": (_latest(TRAINING / "caster_one" / "weights", "*_e*.pth"),
                     _latest(TRAINING / "caster_one" / "weights", "*-e*.ckpt")),
        }
        self.refs = {name: _reference(name) for name in self.models}
        self.loaded = None
        self.lock = threading.Lock()
        self.pipeline = TTS(TTS_Config({"custom": {
            "device": "cuda", "is_half": True, "version": "v2",
            "t2s_weights_path": str(self.models["caster_one"][1]),
            "vits_weights_path": str(self.models["caster_one"][0]),
            "bert_base_path": os.environ["bert_path"],
            "cnhuhbert_base_path": os.environ["cnhubert_base_path"],
        }}))

    def synthesize(self, speaker: str, text: str, emotion: str = "normal"):
        with self.lock:
            if self.loaded != speaker:
                self.pipeline.init_t2s_weights(str(self.models[speaker][1]))
                self.pipeline.init_vits_weights(str(self.models[speaker][0]))
                self.loaded = speaker
            # The match-conditioned profile failed the listening check. Use
            # the clean reference until an expressive profile is validated.
            ref_wav, ref_text = self.refs[speaker]
            chunks = self.pipeline.run({
                "text": text, "text_lang": "en", "ref_audio_path": str(ref_wav),
                "aux_ref_audio_paths": [], "prompt_text": ref_text,
                "prompt_lang": "en", "top_k": 20, "top_p": 0.6,
                "temperature": 0.6,
                "text_split_method": "cut0" if speaker == "caster_two" else "cut4", "batch_size": 1,
                "speed_factor": 1.0, "split_bucket": False, "seed": 1234,
                "parallel_infer": False, "use_cuda_graph": False,
                "use_flash_attention": False, "repetition_penalty": 1.35,
                "return_fragment": False,
            })
            audio = list(chunks)
            if not audio:
                raise RuntimeError("GPT-SoVITS returned no audio")
            return audio[-1]


class LocalBroadcast:
    def __init__(self, team_names, log=lambda message: None, career_context=None):
        try:
            from .caster_engine import CasterEngine
        except ImportError:
            from caster_engine import CasterEngine
        self.teams = tuple(team_names)
        self.log = log
        self.caster = CasterEngine(home_team=self.teams[0], away_team=self.teams[1])
        # Loading the GPT-SoVITS base models can take a few minutes on first
        # launch.  Defer it to the worker so Rocket League starts immediately.
        self.speech = None
        self.lock = threading.RLock()
        self.stop_event = threading.Event()
        self.pending = deque(maxlen=2)
        self.snapshot = None
        self.previous_scores = [0, 0]
        self.last_touch = 0.0
        self.turn = 0
        self.busy = False
        self.worker = threading.Thread(target=self._loop, daemon=True)
        self.worker.start()

    def process_packet(self, packet):
        if packet.num_teams < 2 or packet.num_cars == 0:
            return
        info = packet.game_info
        scores = [int(packet.teams[0].score), int(packet.teams[1].score)]
        with self.lock:
            if scores[0] > self.previous_scores[0] or scores[1] > self.previous_scores[1]:
                idx = 0 if scores[0] > self.previous_scores[0] else 1
                team = self.teams[idx]
                ahead = scores[idx] > scores[1 - idx]
                decisive = ahead and (bool(info.is_overtime) or bool(getattr(info, "is_match_ended", False)))
                late = not info.is_overtime and 0 <= info.game_time_remaining <= 10
                if decisive:
                    text = f"It's in! {team} win it! That is the winning goal! What a finish!"
                elif late and ahead and self.previous_scores[0] == self.previous_scores[1]:
                    text = f"It's in! {team} take the lead right at the death! Can you believe it!"
                elif scores[0] == scores[1]:
                    text = f"It's in! {team} bring it level! We're tied at {scores[0]} each!"
                else:
                    text = f"It's in for {team}! The score is {scores[0]} to {scores[1]}!"
                self.pending.appendleft(("caster_two", text, "hype"))
            self.previous_scores = scores
            touch = getattr(packet.game_ball, "latest_touch", None)
            touch_name = getattr(touch, "player_name", "") if touch else ""
            self.snapshot = (scores, int(info.game_time_remaining), bool(info.is_overtime), touch_name)

    def _line(self):
        scores, remaining, overtime, touch = self.snapshot
        if self.pending:
            return self.pending.popleft()
        speaker = "caster_two" if self.turn % 2 == 0 else "caster_one"
        self.turn += 1
        self.caster.set_roster([], [])
        line = self.caster.generate_continuous_yap(scores[0], scores[1], remaining,
                                                    notable_player=touch)
        return speaker, line["text"], "normal"

    def _loop(self):
        while not self.stop_event.wait(0.05):
            with self.lock:
                if self.busy or self.snapshot is None:
                    continue
                speaker, text, emotion = self._line()
                self.busy = True
            try:
                if self.speech is None:
                    self.log("Loading local GPT-SoVITS voice engine...")
                    self.speech = LocalSoVITSSpeech()
                sr, audio = self.speech.synthesize(speaker, text, emotion)
                with tempfile.NamedTemporaryFile(prefix="rlcaster_", suffix=".wav", delete=False) as f:
                    path = f.name
                import soundfile as sf
                sf.write(path, audio, sr, subtype="PCM_16")
                winsound.PlaySound(path, winsound.SND_ASYNC | winsound.SND_FILENAME)
                self.log(f"Local {speaker.title()}: {text}")
                # Leave a short gap, then generate the next flowing turn.
                time.sleep(max(0.2, min(2.0, len(audio) / float(sr) * 0.12)))
                try:
                    os.unlink(path)
                except OSError:
                    pass
            except Exception as exc:
                self.log(f"Local commentary error: {exc}")
                time.sleep(1.0)
            finally:
                with self.lock:
                    self.busy = False

    def stop(self):
        self.stop_event.set()
        try:
            winsound.PlaySound(None, winsound.SND_PURGE)
        except Exception:
            pass
        self.worker.join(timeout=2)
