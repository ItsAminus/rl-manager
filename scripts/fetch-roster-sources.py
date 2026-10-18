"""Cache public roster wikitext with source URLs for manual verification."""
import gzip, json, time, urllib.parse, urllib.request, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.stdout.reconfigure(encoding='utf-8')
titles = ['Team Vitality', 'Karmine Corp', 'Team BDS', 'Gentle Mates', 'Oxygen Esports', 'Moist Esports', 'G2 Esports', 'Gen.G Mobil1 Racing', 'Spacestation Gaming', 'Luminosity Gaming', 'M80', 'Shopify Rebellion', 'Team Falcons', 'Rule One', 'Twisted Minds', 'FURIA Esports', 'Complexity Gaming', 'Ninjas in Pyjamas', 'PWR', 'Chiefs Esports Club', 'Pioneers', 'Elevate', 'Gaimin Gladiators', 'Limitless']
params = dict(action='query', titles='|'.join(titles), redirects=1, prop='revisions', rvprop='content', rvslots='main', format='json')
url = 'https://liquipedia.net/rocketleague/api.php?' + urllib.parse.urlencode(params)
request = urllib.request.Request(url, headers={'User-Agent': 'RLManager/1.0 (personal local career game; roster verification)', 'Accept-Encoding': 'gzip'})
folder = ROOT / 'scratch/roster-sources'
folder.mkdir(parents=True, exist_ok=True)
if (folder / 'pages.json').exists():
    data = json.loads((folder / 'pages.json').read_text(encoding='utf-8'))
else:
    with urllib.request.urlopen(request, timeout=45) as response:
        body = response.read()
        data = json.loads(gzip.decompress(body) if response.headers.get('Content-Encoding') == 'gzip' else body)
    (folder / 'pages.json').write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
for page in data.get('query', {}).get('pages', {}).values():
    content = page.get('revisions', [{}])[0].get('slots', {}).get('main', {}).get('*', '')
    filename = page['title'].replace('/', '_') + '.txt'
    (folder / filename).write_text(content, encoding='utf-8')
    start = content.find('==Player Roster==')
    if start < 0: start = content.find('== Player Roster ==')
    if start < 0: start = content.find('{{Squad')
    target = folder / (page['title'].replace('/', '_') + '.html')
    if target.exists(): continue
    if not any(t in content for t in ['{{ActiveSquadAuto}}', '{{Squad|status=active']): continue
    time.sleep(31)
    parse_url = 'https://liquipedia.net/rocketleague/api.php?' + urllib.parse.urlencode(dict(action='parse', page=page['title'], prop='text', format='json'))
    try:
        with urllib.request.urlopen(urllib.request.Request(parse_url, headers={'User-Agent': 'RLManager/1.0 (personal local career game; roster verification)', 'Accept-Encoding': 'gzip'}), timeout=40) as r:
            raw = r.read()
            rendered = json.loads(gzip.decompress(raw) if r.headers.get('Content-Encoding') == 'gzip' else raw)
        (folder / (page['title'].replace('/', '_') + '.html')).write_text(rendered.get('parse', {}).get('text', {}).get('*', ''), encoding='utf-8')
        print('Cached roster:', page['title'], flush=True)
    except Exception as e:
        print('Failed:', page['title'], str(e), flush=True)
        if '429' in str(e): break
