"""Merge user recordings without replacing existing audio or importing notebook secrets."""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'rl_bridge/commentary/voice_bank'
FFMPEG = ROOT / 'rl_bridge/local_runtime/tools/ffmpeg.exe'
ALIASES = {'lategoal': 'late_goal', 'overtimewin': 'winner'}


def merge(source, destination=DEST):
    destination.mkdir(parents=True, exist_ok=True)
    manifest_file = destination / 'manifest.json'
    manifest = json.loads(manifest_file.read_text(encoding='utf-8')) if manifest_file.exists() else {}
    archive = destination / 'archive/before-final-bank'
    if not archive.exists():
        archive.mkdir(parents=True)
        for file in destination.glob('*.wav'):
            shutil.copy2(file, archive / file.name)
        (archive / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    # Existing scream effects stay in the independent reaction lane. New spoken
    # goal calls share the commentary lane, so two spoken sentences never overlap.
    for clip_id, entry in manifest.items():
        if entry.get('source') in ('scream_1_basic.wav', 'scream_2.wav', 'scream_3.wav', 'scream_4.wav', 'last_sec_BANGER.mp3'):
            entry['audioRole'] = 'crowd'
            entry['category'] = 'crowd_late_goal' if clip_id.startswith('late_goal') else 'crowd_goal'
    source_manifest = json.loads((source / 'manifest.json').read_text(encoding='utf-8'))
    script = (source / 'commentary-script-bank.txt').read_text(encoding='utf-8')
    text = dict(re.findall(r'^([a-z_]+_\d+):\s*(.+)$', script, flags=re.MULTILINE))
    hashes = {hashlib.sha256(p.read_bytes()).hexdigest(): p.stem for p in destination.glob('*.wav')}
    indexed = {(m.get('sourceBank'), m.get('sourceId'), m.get('sourceSha256')): key for key, m in manifest.items()}
    imported, reused = [], []
    for file in sorted(source.glob('*.wav')):
        match = re.fullmatch(r'([a-z_]+)_(\d+)', file.stem)
        if not match:
            raise ValueError(f'Unrecognized recording name: {file.name}')
        digest = hashlib.sha256(file.read_bytes()).hexdigest()
        existing = indexed.get(('FINAL VOICE BANK', file.stem, digest)) or hashes.get(digest)
        if existing:
            reused.append({'source': file.name, 'clip': existing})
            continue
        category = ALIASES.get(match[1], match[1])
        clip_id = file.stem
        if (destination / (clip_id + '.wav')).exists():
            numbers = [int(p.stem.rsplit('_', 1)[1]) for p in destination.glob(match[1] + '_*.wav')]
            clip_id = f'{match[1]}_{max(numbers, default=0)+1:02d}'
        target = destination / (clip_id + '.wav')
        subprocess.run([str(FFMPEG), '-v', 'error', '-y', '-i', str(file), '-map', '0:a:0',
                        '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', str(target)], check=True)
        with wave.open(str(target), 'rb') as wav:
            seconds = wav.getnframes() / wav.getframerate()
        manifest[clip_id] = {**source_manifest.get(file.stem, {}), 'id': clip_id, 'category': category,
                            'text': source_manifest.get(file.stem, {}).get('text', text.get(file.stem, '')),
                            'file': target.name, 'seconds': round(seconds, 6), 'audioRole': 'commentary',
                            'preserveFullAudio': True, 'sourceBank': 'FINAL VOICE BANK', 'sourceId': file.stem,
                            'sourceSha256': digest}
        imported.append({'source': file.name, 'clip': clip_id, 'category': category, 'seconds': round(seconds, 3)})
    manifest_file.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    report = {'sourceFiles': len(imported)+len(reused), 'imported': len(imported), 'reused': len(reused),
              'totalPlayableFiles': len(list(destination.glob('*.wav'))), 'imports': imported, 'duplicates': reused}
    (destination / 'final-bank-import.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: value for key, value in report.items() if key not in ('imports', 'duplicates')}), flush=True)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', nargs='?', type=Path, default=Path.home() / 'Downloads/FINAL VOICE BANK/rl-manager-voice-bank')
    merge(parser.parse_args().source)
