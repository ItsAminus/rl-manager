import json, collections, sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'scratch/real-database-sources'
sys.stdout.reconfigure(encoding='utf-8')
data=json.loads((root/'919d74f8fd0735c3.body.decoded.json').read_text(encoding='utf-8'))
players=[p for p in data if p.get('nickname') and p.get('role')=='player']
stats=[p for p in data if p.get('playerName') and 'rating' in p]
print('Players',len(players),'Worlds stats',len(stats))
print('Worlds',[(p['playerName'],round(p['rating'],2)) for p in stats[:15]])
print('Tournaments',[(p['id'],p['name']) for p in data if isinstance(p.get('id'),str) and '2026' in p.get('id','') and 'numberOfTeams' in p])
for file in root.glob('tournament-*.json'):
    t=json.loads(file.read_text(encoding='utf-8'))['data']['tournament']
    nodes=[n for f in root.glob(f"entrants-{t['id']}-*.json") for n in json.loads(f.read_text(encoding='utf-8'))['data']['tournament']['teams']['nodes']]
    valid=[n for n in nodes if n.get('entrant') and len([m for m in n['members'] if not m['isCoach'] and not m['isAlternate'] and m['player']])==3]
    print(t['name'],len(nodes),'complete entered',len(valid),'dated',t['startAt'])
    print('top',[(n['name'],n['entrant']['standing'],[m['player']['gamerTag'] for m in n['members'] if not m['isAlternate']]) for n in sorted(valid,key=lambda n:n['entrant'].get('initialSeedNum') or 99999)[:4]])
