"""Offline PNG preparation for the native Rocket League image decoder."""
import hashlib,json,re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image,ImageOps
ROOT=Path(__file__).resolve().parents[1]
public=ROOT/'public'
output=public/'broadcast-png';output.mkdir(exist_ok=True)
registry=json.loads((ROOT/'data/broadcast-profiles.json').read_text(encoding='utf-8'))
portraits=json.loads((ROOT/'data/player-portraits.json').read_text(encoding='utf-8'))
headshots=json.loads((ROOT/'data/player-headshots.json').read_text(encoding='utf-8'))
scoreboard=json.loads((ROOT/'data/scoreboard-portraits.json').read_text(encoding='utf-8'))
urls={r['avatarUrl'] for group in registry.values() for r in group.values() if r.get('avatarUrl','').startswith('/')}
urls.update(r['broadcastLogoUrl'] for group in registry.values() for r in group.values() if r.get('broadcastLogoUrl','').startswith('/'))
urls.update(r['path'] for r in portraits.values() if r.get('path'))
urls.update(r['path'] for r in headshots.values() if r.get('path'))
urls.update(r['path'] for r in scoreboard.values() if r.get('path'))
team_logos=ROOT/'data/team-broadcast-logos.json'
if team_logos.exists():urls.update(r['logo'] for r in json.loads(team_logos.read_text(encoding='utf-8')).values())
def convert(url):
    source=public/url.lstrip('/')
    name=hashlib.sha256(url.encode()).hexdigest()[:12]+'-'+re.sub('[^a-zA-Z0-9_.-]','_',Path(url).name)+'.png'
    target=output/name
    if target.exists() and target.stat().st_mtime>=source.stat().st_mtime:return 0
    try:
        with Image.open(source) as opened:
            photo=ImageOps.contain(ImageOps.exif_transpose(opened).convert('RGBA'),(128,128),Image.Resampling.LANCZOS)
            image=Image.new('RGBA',(128,128),(0,0,0,0))
            image.paste(photo,((128-photo.width)//2,(128-photo.height)//2));image.save(target,'PNG')
        return 1
    except (OSError,ValueError):return -1
with ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(convert,sorted(urls)))
print(f'Native PNGs: {len(urls)} checked, {sum(r==1 for r in results)} prepared, {sum(r<0 for r in results)} unsupported')
