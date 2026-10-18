"""Resolve public images by stable tournament player/team IDs, with resumable caching.

Empty profiles stay empty; a matching nickname alone never supplies an identity.
The player's chosen profile image may be artwork rather than a headshot.
"""
import json, time, urllib.request, urllib.error, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from threading import Event,Lock
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'scratch/profile-image-sources'
CACHE.mkdir(exist_ok=True)
DEST=ROOT/'data/broadcast-profiles.json'
HEAD={'User-Agent':'RLManager/1.0 personal offline career public profile cache'}
registry=json.loads(DEST.read_text(encoding='utf-8'))
players=json.loads((ROOT/'data/players.json').read_text(encoding='utf-8'))
teams=json.loads((ROOT/'data/teams.json').read_text(encoding='utf-8'))
targets=[('players',p['id'],int(p['startGGId'])) for p in players if p.get('startGGId')]
targets += [('teams',t['id'],int(t['id'][8:])) for t in teams if t['id'].startswith('sg_team_')]

def save():
    # Other official sources can be filled while this long lookup is running.
    latest=json.loads(DEST.read_text(encoding='utf-8'))
    registry['community']=latest['community']
    for kind in ['players','teams']:
        for key,record in latest[kind].items():
            if key not in registry[kind] or record.get('avatarSource','').startswith('https://liquipedia.net/'):
                registry[kind][key]={**registry[kind].get(key,{}),**record}
    DEST.write_text(json.dumps(registry,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def request(q):
    req=urllib.request.Request('https://www.start.gg/api/-/gql',data=json.dumps({'query':q}).encode(),
        headers={**HEAD,'Content-Type':'application/json','Client-Version':'20'})
    with urllib.request.urlopen(req,timeout=40) as response:return json.load(response)

pending=[t for t in targets if not (CACHE/(t[0]+'-'+str(t[2])+'.json')).exists()]
print('Public profiles to resolve:',len(pending),flush=True)
for offset in range(0,len(pending),40):
    batch=pending[offset:offset+40]
    fields=[]
    for i,(kind,key,id) in enumerate(batch):
        field=f'player(id:{id}) {{ id gamerTag user {{ slug images {{ url type }} }} }}' if kind=='players' else f'team(id:{id}) {{ id name images {{ url type }} }}'
        fields.append(f'p{i}:{field}')
    try:
        result=request('query PublicProfileImages { '+' '.join(fields)+' }')
        if result.get('errors'):raise ValueError(str(result['errors'])[:250])
        for i,(kind,key,id) in enumerate(batch):
            (CACHE/(kind+'-'+str(id)+'.json')).write_text(json.dumps(result['data'].get('p'+str(i))),encoding='utf-8')
    except (urllib.error.HTTPError,urllib.error.URLError,ValueError) as error:
        print('Profile lookup paused:',error,flush=True)
        break
    if offset%400==0:print('Resolved:',min(offset+40,len(pending)),'/',len(pending),flush=True)
    time.sleep(2)

folder=ROOT/'public/profile-images'
registry=json.loads(DEST.read_text(encoding='utf-8'))
folder.mkdir(exist_ok=True)
limited=Event();rateLock=Lock();lastRequest=0.0
def download(target):
    global lastRequest
    kind,key,id=target
    cached=CACHE/(kind+'-'+str(id)+'.json')
    if not cached.exists():return kind,key,{},0
    data=json.loads(cached.read_text(encoding='utf-8'))
    record=dict(registry[kind].get(key,{}))
    identity=(data or {}).get('user') if kind=='players' else data
    slug=(identity or {}).get('slug')
    profile='https://www.start.gg/'+slug if slug else f'https://www.start.gg/{"player" if kind=="players" else "team"}/{id}'
    record.setdefault('profileUrl',profile)
    image=next((i for i in (identity or {}).get('images',[]) if i.get('type')=='profile' and i.get('url')),None)
    if record.get('avatarUrl'):return kind,key,record,0
    if not image:
        record.update(imageStatus='no_public_profile_image',imageCheckedAt='2026-10-11')
        return kind,key,record,0
    url=image['url']
    if urllib.parse.urlparse(url).hostname not in ['images.start.gg','images.smash.gg']:return kind,key,record,0
    # Keep the source's signed URL intact. Local cache prevents mid-game requests.
    suffix=Path(urllib.parse.urlparse(url).path).suffix.lower()
    if suffix not in ['.png','.jpg','.jpeg','.webp','.gif']:suffix='.jpg'
    file=folder/(key+suffix)
    try:
        if not file.exists():
            if limited.is_set():return kind,key,record,0
            # At most five CDN requests per second, across four bounded workers.
            with rateLock:
                time.sleep(max(0,.2-(time.monotonic()-lastRequest)))
                lastRequest=time.monotonic()
            with urllib.request.urlopen(urllib.request.Request(url,headers=HEAD),timeout=20) as response:
                if not response.headers.get('Content-Type','').startswith('image/'):raise ValueError('Not an image')
                body=response.read(8*1024*1024+1)
                if len(body)>8*1024*1024:raise ValueError('Image exceeds cache limit')
                file.write_bytes(body)
        record.update(avatarUrl='/profile-images/'+file.name,avatarSource=profile,imageOrigin='start.gg public profile',imageStatus='available')
        return kind,key,record,1
    except urllib.error.HTTPError as error:
        if error.code==429:limited.set();print('Image service rate limit; resume later.',flush=True)
        record['imageStatus']='source_unavailable'
    except (urllib.error.URLError,TimeoutError,ValueError):record['imageStatus']='source_unavailable'
    return kind,key,record,0
downloaded=missing=0
with ThreadPoolExecutor(max_workers=4) as pool:
    for kind,key,record,added in pool.map(download,targets):
        registry[kind][key]=record
        if record.get('imageStatus')=='no_public_profile_image':missing+=1
        downloaded+=added
        if added and downloaded%100==0:save();print('Additional images cached:',downloaded,flush=True)
save()
summary={kind:{'images':sum(bool(p.get('avatarUrl')) for p in registry[kind].values()),'profiles':len(registry[kind])} for kind in ['players','teams','community']}
(ROOT/'data/profile-image-coverage.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
print('Coverage:',json.dumps(summary),'empty official profiles:',missing,flush=True)
