"""Merge verified sources and build lightweight local display thumbnails."""
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image,ImageOps
ROOT=Path(__file__).resolve().parents[1]
file=ROOT/'data/broadcast-profiles.json'
registry=json.loads(file.read_text(encoding='utf-8'))
sources=ROOT/'scratch/profile-image-sources'
for category,source in [('community','official-community.json'),('teams','official-club-icons.json'),('players','official-roster-images.json')]:
    p=sources/source
    if p.exists():
        for id,record in json.loads(p.read_text(encoding='utf-8')).items():registry[category].setdefault(id,{}).update(record)
# A team's website can rebrand; that does not change historical team identity.
bds=registry['teams'].get('team_3',{})
if 'shifters.gg' in bds.get('avatarSource',''):
    bds.pop('avatarUrl',None)
    bds['imageStatus']='historical_crest_unavailable'
    bds['profileUrl']='https://liquipedia.net/rocketleague/Team_BDS'
folder=ROOT/'public/profile-thumbnails';folder.mkdir(exist_ok=True)
converted=0
def thumbnail(item):
        kind,id,record=item
        url=record.get('avatarUrl','')
        if url.startswith(('https://','http://')):
            # External thumbnails must not add network waits during a match.
            # Keep their attribution so a later sync can resolve the source.
            record['imageStatus']='source_not_cached';record.pop('avatarUrl',None)
            return 0
        if not url.startswith('/') or url.startswith('/profile-thumbnails/'):return 0
        source=ROOT/'public'/url.lstrip('/')
        if not source.is_file() and url.startswith('/profile-images/'):
            source=ROOT/'scratch/profile-image-originals'/Path(url).name
        if not source.is_file() or source.suffix.lower()=='.svg':return 0
        try:
            with Image.open(source) as opened:
                image=ImageOps.exif_transpose(opened)
                image.thumbnail((384,384),Image.Resampling.LANCZOS)
                target=folder/(kind+'-'+id+'.webp')
                image.convert('RGBA').save(target,'WEBP',quality=85,method=4)
            record['avatarUrl']='/profile-thumbnails/'+target.name
            return 1
        except (OSError,ValueError,Image.DecompressionBombError):record['imageStatus']='source_image_unreadable';record.pop('avatarUrl',None)
        return 0
items=[(kind,id,record) for kind in ['players','teams','community'] for id,record in registry[kind].items()]
with ThreadPoolExecutor(max_workers=4) as pool:
    for added in pool.map(thumbnail,items):
        converted+=added
        if added and converted%500==0:print('Optimized images:',converted,flush=True)
file.write_text(json.dumps(registry,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
players=json.loads((ROOT/'data/players.json').read_text(encoding='utf-8'))
teams=json.loads((ROOT/'data/teams.json').read_text(encoding='utf-8'))
report={'checkedAt':'2026-10-11','players':{'total':len(players),'images':sum(bool(registry['players'].get(p['id'],{}).get('avatarUrl')) for p in players),
    'noPublicImage':sum(registry['players'].get(p['id'],{}).get('imageStatus')=='no_public_profile_image' for p in players),
    'noVerifiedProfile':sum(p['id'] not in registry['players'] for p in players)},
    'teams':{'total':len(teams),'images':sum(bool(registry['teams'].get(t['id'],{}).get('avatarUrl')) for t in teams)},
    'realCommunityAccounts':{'total':5,'images':sum(bool(registry['community'].get(id,{}).get('avatarUrl')) for id in ['esports','gibbs','johnny','sunless','rizzo'])},
    'note':'Missing images retain labelled initials. Public profile images may be artwork chosen by the account owner, not headshots.'}
(ROOT/'data/profile-image-coverage.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('Thumbnails built:',converted,'coverage:',json.dumps(report),flush=True)
