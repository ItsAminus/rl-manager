"""Build reproducible game seed data from the reviewed roster snapshot."""
import json, copy, re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
snapshot = json.loads((ROOT/'data/real-rosters.json').read_text(encoding='utf-8'))
players = json.loads((ROOT/'data/players.json').read_text(encoding='utf-8'))
teams = json.loads((ROOT/'data/teams.json').read_text(encoding='utf-8'))
by_tag = {p['gamertag'].casefold(): p for p in players}
for spec in snapshot['newPlayers']:
    if spec['gamertag'].casefold() in by_tag: continue
    p = copy.deepcopy(players[0])
    p.update(spec)
    p['id'] = 'real_' + re.sub('[^a-z0-9]+','_',spec['gamertag'].casefold()).strip('_')
    p.update(teamId=None, preferredTendency='BALANCED', form=60, morale=75, fatigue=0, consistency=75, chemistry=65, reputation=spec['overall']-5, careerEarnings=0, marketValue=round((spec['overall']/100)**5*650000), scoutKnowledge='FULL')
    p['attributes'] = {key: spec['overall'] for key in p['attributes']}
    p['traits'] = dict(aggression=60,riskTolerance=55,teamOrientation=70,adaptability=65,pressureResistance=70,developmentRate=65,professionalism=70,confidence=70,tiltTendency=35)
    players.append(p); by_tag[p['gamertag'].casefold()] = p
for p in players:
    p['teamId'] = None
    p['affiliationStatus'] = 'unverified'
    p['affiliationNote'] = 'Original database player; current affiliation has not been verified in this roster snapshot.'
by_team = {t['id']: t for t in teams}
for spec in snapshot['teams']:
    if spec['id'] not in by_team:
        t = copy.deepcopy(teams[0])
        t.update(id=spec['id'],reputation=93,budget=1250000,cashBalance=650000,fanbase=120000)
        teams.append(t); by_team[t['id']]=t
    t = by_team[spec['id']]
    t.update({key:spec[key] for key in ['name','shortName','region']})
    for role, tags in [('active',spec['starters']),('reserve',spec.get('reserves',[])),('inactive',spec.get('inactivePlayers',[]))]:
        for tag in tags:
            p=by_tag[tag.casefold()]
            p.update(teamId=spec['id'] if role!='inactive' else None,region=spec['region'],affiliationStatus=role,affiliationNote=spec.get('note',''))
for tag in snapshot['freeAgents']:
    by_tag[tag.casefold()].update(affiliationStatus='free_agent',affiliationNote='Confirmed departure; no subsequent signing verified.')
for filename, data in [('players.json',players),('teams.json',teams)]:
    (ROOT/'data'/filename).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Built {len(teams)} real organization records and {len(players)} real player records.')
