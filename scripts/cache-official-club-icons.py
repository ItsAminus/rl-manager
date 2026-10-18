"""Cache the icon published by each confirmed organisation's own website."""
import json,re,time,urllib.request,urllib.parse,urllib.error
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
pages=json.loads((ROOT/'scratch/roster-sources/pages.json').read_text(encoding='utf-8'))['query']['pages']
teams=json.loads((ROOT/'data/real-rosters.json').read_text(encoding='utf-8'))['teams']
dest=ROOT/'public/club-icons';dest.mkdir(exist_ok=True)
registryFile=ROOT/'data/broadcast-profiles.json'
iconManifest=ROOT/'scratch/profile-image-sources/official-club-icons.json'
known=json.loads(iconManifest.read_text(encoding='utf-8')) if iconManifest.exists() else {}
class Icons(HTMLParser):
    def __init__(self):super().__init__();self.items=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs);rel=(a.get('rel') or '').lower()
        if tag=='link' and ('icon' in rel.split() or rel in ['apple-touch-icon','mask-icon']) and a.get('href'):
            score=(100 if '.svg' in a['href'].lower() else 60 if rel=='apple-touch-icon' else 10)
            self.items.append((score,a['href']))
for page in pages.values():
    source='https://liquipedia.net/rocketleague/'+urllib.parse.quote(page['title'].replace(' ','_'))
    team=next((t for t in teams if t.get('source')==source),None)
    if not team:continue
    text=page.get('revisions',[{}])[0].get('slots',{}).get('main',{}).get('*','')
    text=re.sub(r'<!--.*?-->','',text,flags=re.S)
    site=re.search(r'\|website\s*=\s*([^\s|\]}]+)',text)
    if not site:continue
    url=site[1]
    if '{{' in url or not '.' in url:continue
    if not url.startswith(('https://','http://')):url='https://'+url
    try:
        request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
        with urllib.request.urlopen(request,timeout=15) as response:
            base=response.url;html=response.read(2*1024*1024).decode('utf-8',errors='replace')
        if team['name']=='Team BDS' and 'shifters.gg' in base:
            print('Historical crest retained: Team BDS website has rebranded.',flush=True);continue
        parser=Icons();parser.feed(html)
        if not parser.items:continue
        image=urllib.parse.urljoin(base,max(parser.items,key=lambda i:i[0])[1])
        with urllib.request.urlopen(urllib.request.Request(image,headers={'User-Agent':'Mozilla/5.0'}),timeout=15) as response:
            content=response.headers.get('Content-Type','').split(';')[0]
            if not content.startswith('image/'):continue
            suffix={'image/svg+xml':'.svg','image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/x-icon':'.ico','image/vnd.microsoft.icon':'.ico'}.get(content,'.png')
            file=dest/(team['id']+suffix);file.write_bytes(response.read(2*1024*1024))
        registry=json.loads(registryFile.read_text(encoding='utf-8'))
        record=dict(avatarUrl='/club-icons/'+file.name,avatarSource=base,profileUrl=base,imageOrigin='Official organisation website icon')
        known[team['id']]=record
        iconManifest.write_text(json.dumps(known,indent=2)+'\n',encoding='utf-8')
        registry['teams'].setdefault(team['id'],{}).update(record)
        registryFile.write_text(json.dumps(registry,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print('Official club icon:',team['name'],base,flush=True)
    except (urllib.error.URLError,TimeoutError,ValueError) as error:print('Unavailable:',team['name'],str(error)[:90],flush=True)
    time.sleep(1)
