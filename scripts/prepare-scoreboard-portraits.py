"""Frame cached player photos for the native scoreboard, preserving originals."""
import json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]

def prepare():
    read = lambda name: json.loads((ROOT / 'data' / name).read_text(encoding='utf-8'))
    headshots, steam, registry = read('player-headshots.json'), read('player-steam-avatars.json'), read('broadcast-profiles.json')['players']
    folder = ROOT / 'public/scoreboard-portraits'
    folder.mkdir(parents=True, exist_ok=True)
    previous = read('scoreboard-portraits.json')
    manifest, missing = {}, 0
    for player in read('players.json'):
        pid = player['id']
        if pid in headshots:
            record, kind = headshots[pid], 'headshot'
            original, source = record.get('path'), record.get('source')
        elif pid in steam:
            record, kind = steam[pid], 'steam-avatar'
            original, source = record.get('path'), record.get('source')
        else:
            record, kind = registry.get(pid, {}), 'account-avatar'
            original, source = record.get('avatarUrl'), record.get('avatarSource')
        if not original or not original.startswith('/') or '..' in original or not source:
            missing += 1
            continue
        path = ROOT / 'public' / original.lstrip('/')
        target = folder / (pid + '.png')
        try:
            if previous.get(pid, {}).get('original') != original or not target.exists() or target.stat().st_mtime < path.stat().st_mtime:
                with Image.open(path) as opened:
                    image = ImageOps.exif_transpose(opened).convert('RGBA')
                    # Upper framing keeps faces prominent in full torso headshots.
                    image = ImageOps.fit(image, (256, 256), Image.Resampling.LANCZOS,
                                         centering=(.5, .22 if kind == 'headshot' else .5))
                    image.save(target, 'PNG')
            manifest[pid] = {'path': '/scoreboard-portraits/' + target.name, 'original': original,
                             'source': source, 'kind': kind}
        except (OSError, ValueError):
            missing += 1
    (ROOT / 'data/scoreboard-portraits.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    counts = {kind: sum(p['kind'] == kind for p in manifest.values()) for kind in ('headshot', 'steam-avatar', 'account-avatar')}
    print(f'Scoreboard photos: {len(manifest)} prepared; {counts}; {missing} without a usable cached image')

if __name__ == '__main__':
    prepare()
