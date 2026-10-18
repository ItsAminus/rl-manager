"""Use previously confirmed source pages without making fresh API requests."""
import json,re,html,urllib.parse,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
file=ROOT/'data/broadcast-profiles.json'
registry=json.loads(file.read_text(encoding='utf-8'))
players=json.loads((ROOT/'data/players.json').read_text(encoding='utf-8'))
portraits=json.loads((ROOT/'data/player-portraits.json').read_text(encoding='utf-8'))
aliases={'jstn':'justin','apparentlyjack':'appjack'}
for p in players:
    if p['id'].startswith('sg_player_'):continue
    tag=p['gamertag'].lower().rstrip('.');photo=portraits.get(aliases.get(tag,tag),{})
    if photo.get('path'):
        registry['players'].setdefault(p['id'],{}).update(avatarUrl=photo['path'],avatarSource=photo.get('source'),profileUrl='https://liquipedia.net/rocketleague/'+urllib.parse.quote(p['gamertag']))
registry['community']['rizzo']=dict(avatarUrl=portraits['rizzo']['path'],avatarSource=portraits['rizzo']['source'],profileUrl='https://liquipedia.net/rocketleague/Rizzo')
teams=json.loads((ROOT/'data/real-rosters.json').read_text(encoding='utf-8'))['teams']
pages=json.loads((ROOT/'scratch/roster-sources/pages.json').read_text(encoding='utf-8'))['query']['pages']
for page in pages.values():
    wiki=page.get('revisions',[{}])[0].get('slots',{}).get('main',{}).get('*','')
    wiki=re.sub(r'<!--.*?-->','',wiki,flags=re.S)
    title=page['title'];source='https://liquipedia.net/rocketleague/'+urllib.parse.quote(title.replace(' ','_'))
    match=next((t for t in teams if t.get('source')==source),None)
    if not match:continue
    record=registry['teams'].setdefault(match['id'],{'profileUrl':source})
    twitter=re.search(r'\|twitter\s*=\s*([^\n|]+)',wiki,re.I)
    if twitter and re.fullmatch(r'[A-Za-z0-9_]{1,30}',twitter[1].strip()):record['handle']=twitter[1].strip()
    image=re.search(r'\|(?:image|logo)\s*=\s*([^\n|]+)',wiki,re.I)
    if image and '{{' not in image[1]:
        name=image[1].strip().replace(' ','_');digest=hashlib.md5(name.encode()).hexdigest()
        record.update(avatarUrl='https://liquipedia.net/commons/images/'+digest[0]+'/'+digest[:2]+'/'+urllib.parse.quote(name),avatarSource='https://liquipedia.net/commons/File:'+urllib.parse.quote(name))
    # A later image in rendered infobox HTML can be a nationality flag.
    # Only the explicitly declared logo identifies the team's crest.
file.write_text(json.dumps(registry,ensure_ascii=False,indent=2),encoding='utf-8')
print('Confirmed portraits:',len(registry['players']),'team crests:',len(registry['teams']))
