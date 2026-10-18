"""Small local LLM selects verified facts; it cannot invent the spoken wording."""
import json
import os
from pathlib import Path
import socket
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parent
RUNTIME = Path(os.environ.get('RLM_AI_RUNTIME', str(ROOT.parent / 'local_runtime')))


class LocalFactSelector:
    def __init__(self, stop_event=None):
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        self.url = f"http://127.0.0.1:{port}"
        self.log = (ROOT / "cache" / "hybrid_llm.log").open("a", encoding="utf-8")
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "BELOW_NORMAL_PRIORITY_CLASS", 0)
        self.process = subprocess.Popen([str(RUNTIME / "llama" / "llama-server.exe"),
                "-m", str(RUNTIME / "text_model" / "qwen2.5-1.5b-instruct-q4_k_m.gguf"),
                "--host", "127.0.0.1", "--port", str(port), "-c", "2048", "-np", "1",
                "-ngl", "0", "-t", "2", "-tb", "2", "--poll", "0", "--log-disable"],
                stdout=self.log, stderr=self.log, creationflags=flags)
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if stop_event is not None and stop_event.is_set():
                self.close()
                raise RuntimeError("Local text model startup cancelled")
            if self.process.poll() is not None:
                self.close()
                raise RuntimeError("Local text model stopped during startup")
            try:
                with self.opener.open(self.url + "/health", timeout=0.5) as response:
                    if response.status == 200:
                        return
            except Exception:
                time.sleep(0.15)
        self.close()
        raise TimeoutError("Local text model startup timed out")

    def choose(self, facts, recent_indices=()):
        prompt = ("<|im_start|>system\nYou direct Rocket League commentary. Choose the single best "
                  "discussion paragraph ID from the supplied list. Prefer relevant player performance and "
                  "tactical explanations over general advice or repeating score and time. "
                  "Return only a JSON object with ids, an array of integer IDs.\n<|im_end|>\n"
                  "<|im_start|>user\n" + json.dumps({"facts": dict(enumerate(facts)),
                  "avoid": list(recent_indices)}) + "\n<|im_end|>\n<|im_start|>assistant\n")
        data = json.dumps({"prompt": prompt, "n_predict": 40, "temperature": 0.4,
                           "grammar": 'root ::= "{\\\"ids\\\":" ws "[" number "]" ws "}"\n'
                                      'number ::= [0-9]+\nws ::= [ \\t\\n]*'}).encode()
        request = urllib.request.Request(self.url + "/completion", data=data,
                                         headers={"Content-Type": "application/json"})
        with self.opener.open(request, timeout=12) as response:
            generated = json.load(response)["content"]
        ids = json.loads(generated).get("ids", [])
        # All spoken facts come from the supplied verified list, even if the
        # model responds with an invalid/out-of-range selection.
        return list(dict.fromkeys(i for i in ids if type(i) is int and 0 <= i < len(facts)))[:2]

    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=3)
        self.log.close()
