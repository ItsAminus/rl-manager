"""Complete recordings; analysis and goal-cancelled countdown support a fade."""
import io
import os
from pathlib import Path
import struct
import sys
import threading
import wave
import winsound
from windows_audio import play_windows


def read_exact(stream, count):
    chunks = bytearray()
    while len(chunks) < count:
        part = stream.read(count - len(chunks))
        if not part:
            raise EOFError("Audio pipe closed")
        chunks.extend(part)
    return bytes(chunks)


def analysis_dependencies():
    sys.path.append(os.environ.get('RLM_AUDIO_DEPS', str(Path(os.environ.get('RLM_AI_RUNTIME',str(Path(__file__).resolve().parents[1] / 'local_runtime'))) / 'google_deps')))
    import numpy as np
    import sounddevice as sd
    return np, sd


def play_analysis(wav, cancelled):
    # Blocking native writes in this separate process, no audio callback sharing
    # the telemetry thread. Small blocks bound critical-event response latency.
    np, sd = analysis_dependencies()
    with wave.open(io.BytesIO(wav), 'rb') as source:
        rate = source.getframerate()
        pcm = np.frombuffer(source.readframes(source.getnframes()), dtype='<i2')
        pcm = pcm.reshape(-1, source.getnchannels()).mean(axis=1).astype('<i2')
    device = sd.query_devices(kind='output')
    # Use the default Windows WASAPI endpoint when available, avoiding the
    # legacy MME queue's much longer drain time.
    hosts = sd.query_hostapis()
    wasapi = next((h for h in hosts if h['name'] == 'Windows WASAPI'), None)
    device_id = wasapi['default_output_device'] if wasapi else None
    if device_id is not None and device_id >= 0:
        device = sd.query_devices(device_id)
    else:
        device_id = None
    channels = min(2, int(device['max_output_channels']))
    if channels < 1:
        raise RuntimeError('Windows has no active playback device')
    output_rate = int(device['default_samplerate'])
    if output_rate != rate:
        positions = np.arange(round(len(pcm) * output_rate / rate), dtype=np.float64) * rate / output_rate
        pcm = np.interp(positions, np.arange(len(pcm), dtype=np.float64), pcm).astype('<i2')
        rate = output_rate
    step = int(rate * .04)
    stream = sd.RawOutputStream(device=device_id, samplerate=rate, channels=channels,
                                dtype='int16', blocksize=step, latency=.03)
    stream.start()
    try:
        for offset in range(0, len(pcm), step):
            chunk = pcm[offset:offset+step]
            stop = cancelled.is_set()
            if stop:
                chunk = (chunk.astype(np.float32) * np.linspace(1, 0, len(chunk))).astype('<i2')
            stream.write(np.repeat(chunk[:, None], channels, axis=1).astype('<i2').tobytes())
            if stop:
                break
        stream.stop()  # drain the fade; only then may the reaction start
    finally:
        stream.close()
    return not cancelled.is_set()


class AudioOutput:
    def __init__(self):
        self.fallback = os.environ.get('RLM_AUDIO_BACKEND') == 'windows'
        if self.fallback:
            return
        try:
            analysis_dependencies()
        except Exception as exc:
            self.fallback = True
            print(f'PortAudio imports unavailable: {exc}; using Windows default output', file=sys.stderr, flush=True)

    def play(self, wav, cancel):
        if not self.fallback:
            try:
                return play_analysis(wav, cancel)
            except Exception as exc:
                print(f'PortAudio unavailable: {exc}; switching this lane to Windows default output', file=sys.stderr, flush=True)
                self.fallback = True
        return play_windows(wav, cancel)


def main():
    # A missing PortAudio wheel or incompatible headset must not disable all
    # commentary before the first recording is even submitted.
    active = None
    active_id = None
    cancelled = None
    errors = []
    output = AudioOutput()

    def play(wav, interruptible, cancel):
        print('START', flush=True)
        try:
            if interruptible or '--continuous-output' in sys.argv:
                # Independent output lets the countdown fade on a goal while
                # the reaction starts immediately on its own audio lane.
                complete = output.play(wav, cancel or threading.Event())
            else:
                # The established full-buffer backend is unchanged for clips.
                try:
                    winsound.PlaySound(wav, winsound.SND_MEMORY | winsound.SND_NODEFAULT)
                    complete = True
                except RuntimeError:
                    complete = play_windows(wav, cancel or threading.Event())
            print('DONE' if complete else 'INTERRUPTED', flush=True)
        except Exception as exc:
            errors.append(exc)
            print(f'ERROR: {exc}', flush=True)

    print("READY", flush=True)
    while True:
        header = sys.stdin.buffer.read(4)
        if not header:
            break
        command = struct.unpack("<I", header)[0]
        if not command:
            break
        job_id = struct.unpack('<I', read_exact(sys.stdin.buffer, 4))[0]
        if command == 0xffffffff:
            if job_id == active_id and cancelled is not None:
                cancelled.set()
            continue
        interruptible = bool(command & 0x80000000)
        length = command & 0x7fffffff
        if length > 32 * 1024 * 1024:
            raise ValueError("Audio packet exceeds limit")
        wav = read_exact(sys.stdin.buffer, length)
        if active is not None:
            active.join()
        if errors:
            raise errors[-1]
        active_id, cancelled = job_id, threading.Event() if interruptible else None
        active = threading.Thread(target=play, args=(wav, interruptible, cancelled))
        active.start()
    if active is not None:
        active.join()


if __name__ == "__main__":
    main()
