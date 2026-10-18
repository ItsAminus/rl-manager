"""Cache public, identity-linked channel banners and official RLCS editorial photos."""
import json
from pathlib import Path
import re
import urllib.request
from urllib.parse import urlparse

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/chirp-media'
OUT.mkdir(parents=True,exist_ok=True)
registry=json.loads((ROOT/'data/broadcast-profiles.json').read_text(encoding='utf-8'))
result={'community':{},'photos':[]}
def fetch(url):
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Accept-Language':'en-US,en;q=0.9'})
    with urllib.request.urlopen(req,timeout=20) as r:return r.read(8_000_000),r.headers.get('Content-Type','')
def save(url,name):
    if urlparse(url).hostname not in ('yt3.googleusercontent.com','yt3.ggpht.com','cms-assets.unrealengine.com'):raise ValueError('Unexpected image host')
    data,kind=fetch(url)
    if not kind.startswith('image/'):raise ValueError('Image response expected')
    suffix='.webp' if 'webp' in kind else '.png' if 'png' in kind else '.jpg'
    target=OUT/(name+suffix);target.write_bytes(data)
    return '/chirp-media/'+target.name
def urls(value):
    if isinstance(value,dict):
        if isinstance(value.get('url'),str):yield value['url']
        for child in value.values():yield from urls(child)
    elif isinstance(value,list):
        for child in value:yield from urls(child)
def banners(value):
    if isinstance(value,dict):
        for key,child in value.items():
            if 'banner' in key.lower():yield from urls(child)
            else:yield from banners(child)
    elif isinstance(value,list):
        for child in value:yield from banners(child)
for account,record in registry['community'].items():
    source=record.get('profileUrl','')
    if not source.startswith('https://www.youtube.com/@'):continue
    try:
        html=fetch(source)[0].decode('utf-8','replace')
        match=re.search(r'(?:var\s+)?ytInitialData\s*=\s*',html)
        if not match:raise ValueError('Channel metadata missing')
        data=json.JSONDecoder().raw_decode(html[match.end():])[0]
        choices=[url for url in banners(data) if urlparse(url).hostname in ('yt3.googleusercontent.com','yt3.ggpht.com')]
        if not choices:raise ValueError('No public channel banner found')
        result['community'][account]={'url':save(choices[-1],'banner-'+account),'source':source}
        print(account,'official banner cached',flush=True)
    except Exception as exc:print(account,'banner unavailable:',type(exc).__name__,flush=True)
source='https://www.rocketleague.com/competitive/rlcs-2026-world-championship'
try:
    html=fetch(source)[0].decode('utf-8','replace')
    urls_found=list(dict.fromkeys(re.findall(r'https://cms-assets\.unrealengine\.com/[^\s"<>\\]+',html)))
    for i,url in enumerate(urls_found[:6]):
        try:
            result['photos'].append({'url':save(url,'rlcs-editorial-'+str(i)),'source':source,'caption':'Official RLCS editorial image · archive'})
        except Exception:pass
except Exception as exc:print('RLCS photos unavailable:',type(exc).__name__,flush=True)
if not result['photos']:
    # Public images linked by the official championship page. These are archive
    # images, never represented as photographs of the user's simulated match.
    for i,asset in enumerate(('cmq4f077r1zlj08ocpzmh06ad','cmuflz69o027s07ok41olnr5j','cmufmpxk10aft07okq5tjek55')):
        try:
            url='https://cms-assets.unrealengine.com/cmkr1i7c9047e07n0es5291ez/'+asset
            result['photos'].append({'url':save(url,'rlcs-editorial-'+str(i)),'source':source,'caption':'Official RLCS editorial image · archive'})
        except Exception as exc:print('Archive image unavailable:',type(exc).__name__,flush=True)
(ROOT/'data/chirp-media.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Cached',len(result['community']),'official banners and',len(result['photos']),'editorial images',flush=True)
