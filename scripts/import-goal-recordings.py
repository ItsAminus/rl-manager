"""Import the supplied match reactions as complete, predecoded PCM recordings."""
import hashlib
import json
from pathlib import Path
import subprocess
import wave

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path.home() / 'Downloads'
DESTINATION = ROOT / 'rl_bridge/commentary/voice_bank'
FFMPEG = ROOT / 'rl_bridge/local_runtime/tools/ffmpeg.exe'
FILES = {
    'goal_01': 'scream_1_basic.wav',
    'goal_02': 'scream_2.wav',
    'goal_03': 'scream_3.wav',
    'goal_04': 'scream_4.wav',
    'late_goal_01': 'last_sec_BANGER.mp3',
    'countdown_01': '10_sec_countdown.wav',
}


def main():
    manifest_path = DESTINATION / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    for clip_id, name in FILES.items():
        source = SOURCE / name
        target = DESTINATION / f'{clip_id}.wav'
        # Decode once, outside gameplay. This also rewrites the countdown's
        # invalid RIFF size without trimming its opening, speech or ending.
        subprocess.run([str(FFMPEG), '-v', 'error', '-y', '-i', str(source),
                        '-map', '0:a:0', '-ar', '48000', '-ac', '1',
                        '-c:a', 'pcm_s16le', str(target)], check=True)
        with wave.open(str(target), 'rb') as audio:
            seconds = audio.getnframes() / audio.getframerate()
        manifest[clip_id] = {
            'id': clip_id, 'category': clip_id.rsplit('_', 1)[0],
            'file': target.name, 'seconds': round(seconds, 6),
            'source': name, 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'preserveFullAudio': True,
            'use': ('Regulation countdown, once at ten seconds; finish uninterrupted.'
                    if clip_id.startswith('countdown') else
                    'Final-second equalizer or go-ahead goal only.'
                    if clip_id.startswith('late_goal') else 'Confirmed goal reaction.'),
        }
        print(f'{target.name}: {seconds:.3f}s')
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
