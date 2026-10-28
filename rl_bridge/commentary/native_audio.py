"""Sentence playback isolated from RLBot telemetry and speech generation."""
import io
import os
import math
from collections import deque
import queue
import struct
import subprocess
import sys
import threading
import time
import wave
from pathlib import Path

def commentary_volume():
    try:
        value=float(os.environ.get('RLM_COMMENTARY_VOLUME','1'))
        return max(0,min(1,value)) if math.isfinite(value) else 1
    except (TypeError,ValueError):return 1


class NativeSink:
    def __init__(self, continuous_output=False):
        self.writer_lock = threading.Lock()
        self.job_id = 0
        self.active_job = None
        self.process = subprocess.Popen(
            [sys.executable, "-u", str(Path(__file__).with_name("native_audio_worker.py"))]
            + (["--continuous-output"] if continuous_output else []),
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        self.responses = queue.Queue()
        self.diagnostics = deque(maxlen=20)
        def read_output():
            try:
                for line in self.process.stdout:
                    self.responses.put(line.strip())
            finally:
                self.responses.put(None)
        def read_errors():
            for line in self.process.stderr:
                message = line.decode(errors='replace').strip()
                self.diagnostics.append(message)
                print(f'[Match audio] {message}', file=sys.stderr, flush=True)
        threading.Thread(target=read_output, name='audio-responses', daemon=True).start()
        threading.Thread(target=read_errors, name='audio-diagnostics', daemon=True).start()
        if self._response(30) != b"READY":
            error = '; '.join(self.diagnostics)
            self.close()
            raise RuntimeError(f"Native audio startup failed: {error}")

    def _response(self, timeout):
        try:
            return self.responses.get(timeout=timeout)
        except queue.Empty:
            self.close()
            raise TimeoutError('Windows audio did not respond; check the active playback device')

    def play(self, wav, started, interruptible=False, cancelled=None):
        with self.writer_lock:
            self.job_id += 1
            self.active_job = self.job_id if interruptible else None
            length = len(wav) | (0x80000000 if interruptible else 0)
            self.process.stdin.write(struct.pack("<II", length, self.job_id))
            self.process.stdin.write(wav)
            if interruptible and cancelled is not None and cancelled.is_set():
                self.process.stdin.write(struct.pack('<II', 0xffffffff, self.job_id))
            self.process.stdin.flush()
        if self._response(30) != b"START":
            raise RuntimeError("Native audio process did not accept the sentence")
        started()
        with wave.open(io.BytesIO(wav), 'rb') as recording:
            duration = recording.getnframes() / recording.getframerate()
        response = self._response(duration + 20)
        with self.writer_lock:
            self.active_job = None
        if response not in (b"DONE", b"INTERRUPTED"):
            detail = response.decode(errors='replace') if response else '; '.join(self.diagnostics)
            raise RuntimeError(f"Native audio could not complete the recording: {detail}")
        return response == b'DONE'

    def interrupt(self):
        with self.writer_lock:
            if self.active_job is not None:
                self.process.stdin.write(struct.pack('<II', 0xffffffff, self.active_job))
                self.process.stdin.flush()

    def close(self):
        if self.process.poll() is None:
            try:
                with self.writer_lock:
                    self.process.stdin.write(struct.pack("<I", 0))
                    self.process.stdin.flush()
                self.process.wait(timeout=3)
            except (BrokenPipeError, OSError, subprocess.TimeoutExpired):
                self.process.terminate()
                self.process.wait(timeout=3)
        for stream in (self.process.stdin, self.process.stdout, self.process.stderr):
            if not stream.closed:
                stream.close()


class ClipPlayer:
    """One sentence on air; busy ends only after native playback acknowledges it."""
    sample_rate = 48000
    stream = None
    underruns = 0

    def __init__(self, sink=None, continuous_output=False, volume=1.0):
        self.volume=max(0,min(1,float(volume)))
        self.sink = sink or NativeSink(continuous_output=continuous_output)
        self.lock = threading.Lock()
        self.wake = threading.Event()
        self.finished = threading.Event()
        self.finished.set()
        self.current = None
        self.closed = False
        self.error = None
        self.completed_clips = 0
        self.interrupted_clips = 0
        self.interruptible = False
        self.cancelled = threading.Event()
        self.first_audio_latency_ms = None
        self.thread = threading.Thread(target=self._run, name="commentary-audio", daemon=True)
        self.thread.start()

    @property
    def busy(self):
        with self.lock:
            return self.current is not None

    def check_health(self):
        if self.error:
            raise RuntimeError(f"Native audio playback failed: {self.error}")

    def play(self, pcm, interruptible=False):
        self.check_health()
        with self.lock:
            if self.closed or self.current is not None:
                return False
            # Encoding and pipe writes happen on the worker thread, never on a
            # live packet. Retain an owned buffer until the native DONE signal.
            self.current = pcm
            self.interruptible = interruptible
            self.cancelled.clear()
            self.requested_at = time.monotonic()
            self.finished.clear()
            self.wake.set()
            return True

    def interrupt(self):
        with self.lock:
            if self.current is None or not self.interruptible or self.cancelled.is_set():
                return False
            self.cancelled.set()
            self.sink.interrupt()
            return True

    def _encode(self, pcm):
        # numpy is already loaded by ClipBank; no voice models in this process.
        import numpy as np
        output = io.BytesIO()
        with wave.open(output, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(self.sample_rate)
            wav.writeframes((np.clip(pcm*self.volume, -1, 1) * 32767).astype("<i2").tobytes())
        return output.getvalue()

    def _started(self):
        self.first_audio_latency_ms = (time.monotonic() - self.requested_at) * 1000

    def _run(self):
        while True:
            self.wake.wait()
            self.wake.clear()
            with self.lock:
                pcm = self.current
                if pcm is None and self.closed:
                    return
            if pcm is None:
                continue
            try:
                if self.interruptible:
                    complete = self.sink.play(self._encode(pcm), self._started,
                                              interruptible=True, cancelled=self.cancelled)
                else:
                    complete = self.sink.play(self._encode(pcm), self._started)
                if complete is False:
                    self.interrupted_clips += 1
                else:
                    self.completed_clips += 1
            except Exception as exc:
                self.error = exc
            finally:
                with self.lock:
                    self.current = None
                    self.interruptible = False
                    self.finished.set()
            if self.error:
                return

    def close(self):
        with self.lock:
            if self.closed:
                return
            self.closed = True
        # Do not stop playback at the final whistle, a score change, or a normal
        # shutdown. Wait for the full sentence, then terminate the idle helper.
        if not self.finished.wait(timeout=45):
            self.sink.close()
        self.wake.set()
        self.thread.join(timeout=3)
        self.sink.close()
