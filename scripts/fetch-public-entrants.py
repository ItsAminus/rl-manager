"""Read public tournament registrations; cache responses, never use credentials."""
import argparse, json, time, urllib.request, urllib.error
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--tournament', type=int, default=915357)
p.add_argument('--page', type=int, default=1)
p.add_argument('--query-file')
p.add_argument('--slug')
p.add_argument('--all', action='store_true')
a = p.parse_args()
query = '''query PublicRosterResearch($id: ID!, $page: Int!) {
  tournament(id: $id) { id name startAt endAt teams(query: {page: $page, perPage: 50}) {
    pageInfo { total totalPages }
    nodes { id name members(status: [ACCEPTED]) { isCoach isAlternate isStandIn memberType player { id gamerTag } participant { gamerTag } }
      ... on EventTeam { event { id } entrant { id initialSeedNum isDisqualified standing { placement } } }
    }
  } }
}'''
if a.query_file:
    query = Path(a.query_file).read_text(encoding='utf-8')
def request(q, variables):
    req = urllib.request.Request('https://www.start.gg/api/-/gql',
        data=json.dumps({'query': q, 'variables': variables}).encode(),
        headers={'Content-Type': 'application/json', 'Client-Version': '20', 'User-Agent': 'RLManager personal public roster research'})
    try:
        with urllib.request.urlopen(req, timeout=40) as r: result = json.load(r)
    except urllib.error.HTTPError as e:
        print('HTTP',e.code,flush=True)
        if e.code == 400: print(e.read().decode('utf-8', errors='replace')[:2000],flush=True)
        raise SystemExit(1)
    if result.get('errors'):
        print(json.dumps(result, ensure_ascii=True)[:2000],flush=True)
        raise SystemExit(1)
    return result

folder=Path(__file__).resolve().parents[1] / 'scratch/real-database-sources'
if a.slug:
    info=request('query PublicRosterResearch($slug:String!){tournament(slug:$slug){id name startAt endAt events { id name }}}', {'slug':a.slug})
    if not info['data']['tournament']:
        print('Tournament not found:',a.slug)
        raise SystemExit(1)
    a.tournament=info['data']['tournament']['id']
    (folder/f'tournament-{a.tournament}.json').write_text(json.dumps(info,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Tournament',a.slug,a.tournament,flush=True)
    time.sleep(2)
page=a.page
while True:
    out=folder/f'entrants-{a.tournament}-{page}.json'
    result=None
    if a.all and out.exists():
        cached=json.loads(out.read_text(encoding='utf-8'))
        t=cached.get('data',{}).get('tournament')
        if t and 'endAt' in t: result=cached
    if result is None:
        result=request(query, {'id':a.tournament, 'page':page})
        out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    t=result.get('data',{}).get('tournament',{})
    print(t.get('name'),page,t.get('teams',{}).get('pageInfo'),flush=True)
    if not a.all or page>=t['teams']['pageInfo']['totalPages']: break
    page+=1
    time.sleep(2)
