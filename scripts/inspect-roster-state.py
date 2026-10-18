import json, re, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
folder = Path(__file__).resolve().parents[1] / 'scratch/real-database-sources'
data = json.loads((folder/'b7229b53efd0c451.body.json').read_text(encoding='utf-8'))
print('Page props:',list(data['props']['pageProps']))
state = data['props']['pageProps']['__APOLLO_STATE__']
for key, value in state.items():
    if key == 'ROOT_QUERY':
        print('ROOT_QUERY',json.dumps(value,ensure_ascii=False)[:4500])
    elif any(token in key.lower() for token in ['tournament','team','entrant','participant','player','event']):
        print(key,json.dumps(value,ensure_ascii=False)[:500])
print('Runtime config keys', list(data.get('runtimeConfig',{})))
html=(folder/'48b121bc967b80e4.body').read_text(encoding='utf-8')
print('Unravel tables',len(re.findall('<table',html)))
for word in ['nass','Nassim','playerRatings','player','120.5','"data"','series','</table>']:
    m=re.search(re.escape(word),html)
    if m: print('Unravel',word,html[max(0,m.start()-130):m.start()+420])
print('Unravel scripts',re.findall(r'<script[^>]+src="([^"]+)',html)[:10])
