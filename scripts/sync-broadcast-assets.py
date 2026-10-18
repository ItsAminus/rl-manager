"""Cache documented profile portraits, social links and team crests for the local game.
Never assigns an established pro's photo to a qualifier merely sharing the same tag.
"""
import gzip,json,re,time,urllib.request,urllib.parse,urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'data/broadcast-profiles.json'
registry=json.loads(DEST.read_text(encoding='utf-8'))
HEAD={'User-Agent':'RLManager/1.0 (personal offline career game; attributed profile images)','Accept-Encoding':'gzip'}
def api(wiki,**args):
    time.sleep(2.1)
    url='https://liquipedia.net/'+wiki+'/api.php?'+urllib.parse.urlencode(dict(args,format='json'))
    with urllib.request.urlopen(urllib.request.Request(url,headers=HEAD),timeout=30) as response:
        body=response.read()
        return json.loads(gzip.decompress(body) if response.headers.get('Content-Encoding')=='gzip' else body)
players=json.loads((ROOT/'data/players.json').read_text(encoding='utf-8'))
teams=json.loads((ROOT/'data/real-rosters.json').read_text(encoding='utf-8'))['teams']
aliases={'TRK511':'Trk511','AppJack':'ApparentlyJack','Justin':'Jstn','Khalid':'OKhaliD','Kro':'Kronovi','ScrubKilla':'Scrub Killa','Greazy':'GReazymeister'}
targets=[('community',k,t) for k,t in [('gibbs','Gibbs'),('johnny','JohnnyBoi_i'),('sunless','SunlessKhan'),('rizzo','Rizzo')]]
targets += [('teams',t['id'],urllib.parse.unquote(t['source'].split('/rocketleague/')[-1]).replace('_',' ')) for t in teams if t.get('source','').startswith('https://liquipedia.net/rocketleague/') and t.get('status')=='active']
targets += [('players',p['id'],aliases.get(p['gamertag'],p['gamertag'])) for p in players if not p['id'].startswith('sg_player_')]
targets=[t for t in targets if t[1] not in registry[t[0]]]
images=[]
for offset in range(0,len(targets),40):
    batch=targets[offset:offset+40]
    try:
        data=api('rocketleague',action='query',titles='|'.join(t[2] for t in batch),redirects=1,prop='revisions',rvprop='content',rvslots='main')
        names={x['from'].casefold():x['to'] for field in ['normalized','redirects'] for x in data.get('query',{}).get(field,[])}
        pages=data.get('query',{}).get('pages',{}).values()
        for kind,key,title in batch:
            title=names.get(title.casefold(),title); title=names.get(title.casefold(),title)
            page=next((p for p in pages if p.get('title','').casefold()==title.casefold()),{})
            rev=page.get('revisions',[])
            wiki=rev[0].get('slots',{}).get('main',{}).get('*','') if rev else ''
            if not wiki:continue
            profile='https://liquipedia.net/rocketleague/'+urllib.parse.quote(page['title'].replace(' ','_'))
            record=registry[kind].setdefault(key,{'profileUrl':profile})
            handle=re.search(r'\|twitter\s*=\s*([^\n|]+)',wiki,re.I)
            if handle:
                value=handle[1].strip().split('/')[-1].lstrip('@')
                if re.fullmatch(r'[A-Za-z0-9_]{1,30}',value): record.update(handle=value,socialUrl='https://x.com/'+value)
            picture=re.search(r'\|(?:image|logo)\s*=\s*([^\n|]+)',wiki,re.I)
            if picture and '{{' not in picture[1]:images.append((kind,key,picture[1].strip()))
        print('Profiles resolved',min(offset+40,len(targets)),'/',len(targets),flush=True)
    except urllib.error.HTTPError as exc:
        if exc.code==429:
            print('Source rate limit reached. Stopping; cached assets stay available.',flush=True)
            break
        print('Profile batch unavailable',str(exc),flush=True)
    except Exception as exc: print('Profile batch unavailable',str(exc),flush=True)
    DEST.write_text(json.dumps(registry,ensure_ascii=False,indent=2),encoding='utf-8')
unique=list(dict.fromkeys(f for _,_,f in images));metadata={}
for offset in range(0,len(unique),40):
    try:
        data=api('commons',action='query',titles='|'.join('File:'+f for f in unique[offset:offset+40]),prop='imageinfo',iiprop='url',iiurlwidth=192)
        for page in data.get('query',{}).get('pages',{}).values():
            if page.get('imageinfo'):metadata[page['title'][5:].replace('_',' ').casefold()]=page['imageinfo'][0]
    except Exception as exc:print('Image metadata unavailable',str(exc),flush=True)
folder=ROOT/'public/broadcast-profiles';folder.mkdir(parents=True,exist_ok=True)
for kind,key,file in images:
    info=metadata.get(file.replace('_',' ').casefold())
    if not info:continue
    url=info.get('thumburl') or info['url'];url='https:'+url if url.startswith('//') else url
    suffix=Path(urllib.parse.urlparse(url).path).suffix or '.png'
    target=folder/(re.sub('[^a-zA-Z0-9_-]','_',key)+suffix)
    try:
        if not target.exists():
            time.sleep(2.1)
            with urllib.request.urlopen(urllib.request.Request(url,headers=HEAD),timeout=20) as response:
                if not response.headers.get('Content-Type','').startswith('image/'):raise ValueError('Not an image')
                target.write_bytes(response.read())
        registry[kind][key].update(avatarUrl='/broadcast-profiles/'+target.name,avatarSource=info.get('descriptionurl'),imageFile=file)
        DEST.write_text(json.dumps(registry,ensure_ascii=False,indent=2),encoding='utf-8')
        print('Image cached',kind,key,flush=True)
    except Exception as exc:print('Image unavailable',key,str(exc),flush=True)
