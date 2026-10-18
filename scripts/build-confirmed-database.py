"""Build a real-only 2026 pool from cached public registrations and LAN statistics.

No invented names, biographies or roster fillers. OVR is a game estimate, not an
official rating or a claimed human rank. Historical registrations carry dates.
"""
import collections, copy, datetime as dt, json, math, re, unicodedata
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'scratch/real-database-sources'
DATE='2026-10-11'
VERSION='2026-10-11-real-qualifiers-v2'
def read(file): return json.loads(file.read_text(encoding='utf-8'))
def write(file,obj): file.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
archive=SOURCE/'before-real-pool'
archive.mkdir(exist_ok=True)
for name in ['players.json','teams.json','real-rosters.json']:
    if not (archive/name).exists(): (archive/name).write_bytes((ROOT/'data'/name).read_bytes())
players=read(archive/'players.json')
teams=read(archive/'teams.json')
snapshot=read(archive/'real-rosters.json')
def key(s):
    s=''.join(c for c in unicodedata.normalize('NFKD',s).casefold() if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]','',s)
aliases={'apparentlyjack':'appjack','jstn':'justin','ggm1majicbear':'majicbear','sweatyclarence':'sweaty','fiberr':'fibrr','okhalid':'khalid','acronik':'acronik','fairypeak':'fairypeak','kuxir97':'kuxir97'}
def canonical(s): return aliases.get(key(s),key(s))
by_id={p['id']:p for p in players}
core={canonical(p['gamertag']):p for p in players}
ATTRS=list(players[0]['attributes'])
TRAITS=dict(aggression=50,riskTolerance=50,teamOrientation=65,adaptability=60,pressureResistance=60,developmentRate=60,professionalism=65,confidence=65,tiltTendency=40)
datasets=[('919d74f8fd0735c3',.50,'rlcs-world-championship-2026','2026-09-20'),
          ('50be6cd74bf54167',.25,'esports-world-cup-2026','2026-08-17'),
          ('75da45f252bbc0d7',.15,'rlcs-paris-major-2-2026','2026-05-24'),
          ('c7d309d8652fd85b',.10,'rlcs-major-1-2026','2026-02-22')]
bio={}
lan=collections.defaultdict(list)
worlds=[]
for file,weight,event,date in datasets:
    data=read(SOURCE/(file+'.body.decoded.json'))
    for row in data:
        if row.get('nickname') and row.get('role')=='player': bio[row['id']]=row
        if row.get('playerName') and 'rating' in row:
            lan[canonical(row['playerName'])].append(dict(row,event=event,date=date,weight=weight,source=f'https://blast.tv/rl/stats/players/rating?tournamentId={event}&order=desc'))
            if event=='rlcs-world-championship-2026': worlds.append(row)
bio_by_key={canonical(p['nickname']):p for p in bio.values()}
def new_player(id,tag,region):
    p=dict(id=id,gamertag=tag,realName=None,nationality=None,region=region,age=None,teamId=None,preferredTendency='BALANCED',overall=60,potential=64,form=60,morale=70,fatigue=0,consistency=65,chemistry=65,reputation=30,careerEarnings=0,marketValue=30000,scoutKnowledge='Unknown',attributes={k:60 for k in ATTRS},traits=copy.deepcopy(TRAITS))
    players.append(p); by_id[id]=p
    return p

# Link recognized pros to their existing career IDs. Ambiguous generic tags are
# kept separate using start.gg's stable player ID; only the strongest seeded
# registration for a recognized pro receives the canonical alias.
registrations=[]
region_by_slug={'europe':'Europe','north-america':'North America','mena':'MENA','south-america':'South America','oceania':'Oceania','apac':'Asia-Pacific','ssa':'Sub-Saharan Africa'}
events={}
for metadata in SOURCE.glob('tournament-*.json'):
    t=read(metadata)['data']['tournament']
    region=next(v for k,v in region_by_slug.items() if k in t['name'].casefold().replace(' ','-'))
    slug={'Europe':'europe-last-chance-qualifier','North America':'north-america-last-chance-qualifier','MENA':'mena-last-chance-qualifier','South America':'south-america-last-chance-qualifier','Oceania':'oceania-open-6','Asia-Pacific':'apac-open-6','Sub-Saharan Africa':'ssa-open-6'}[region]
    events[t['id']]=dict(region=region,date=dt.datetime.fromtimestamp(t['startAt'],dt.timezone.utc).date().isoformat(),name=t['name'],source=f'https://www.start.gg/tournament/rlcs-2026-{slug}/attendees/teams')
    pages=sorted(SOURCE.glob(f"entrants-{t['id']}-*.json"),key=lambda f:int(f.stem.rsplit('-',1)[1]))
    expected=read(pages[0])['data']['tournament']['teams']['pageInfo']['totalPages']
    assert len(pages)==expected, f'Incomplete download: {t["name"]}'
    for page in pages:
        for n in read(page)['data']['tournament']['teams']['nodes']:
            starters=[m for m in n['members'] if m['memberType']=='PLAYER' and not m['isCoach'] and not m['isAlternate'] and m['player']]
            if not n.get('entrant') or len(starters)!=3: continue
            registrations.append(dict(n,starters=starters,eventInfo=events[t['id']]))
best_alias={}
for n in sorted(registrations,key=lambda n:(n['entrant'].get('initialSeedNum') or 99999,-dt.date.fromisoformat(n['eventInfo']['date']).toordinal())):
    for m in n['members']:
        if not m['player']: continue
        tag=m['player']['gamerTag']; k=canonical(tag)
        if k in core or k in bio_by_key: best_alias.setdefault(k,m['player']['id'])
sg_to_id={}
def registered_player(m,region):
    sg=m['player']['id']; tag=m['player']['gamerTag']; k=canonical(tag)
    if sg in sg_to_id: return by_id[sg_to_id[sg]]
    if best_alias.get(k)==sg and (k in core or k in bio_by_key):
        if k in core: p=core[k]
        else:
            p=new_player('pro_'+bio_by_key[k]['id'],bio_by_key[k]['nickname'],region); core[k]=p
    else: p=new_player('sg_player_'+str(sg),tag,region)
    p['startGGId']=sg
    sg_to_id[sg]=p['id']
    return p

for p in players:
    p['previousOverall']=p['overall']
    p['previousAttributes']=copy.deepcopy(p['attributes'])
    p.update(teamId=None,affiliationStatus='unverified',affiliationNote='Current affiliation and availability unverified.')
team_by_id={t['id']:t for t in teams}
specs=copy.deepcopy(snapshot['teams'])
assigned=set()
def finish_spec(spec):
    spec['starterIds']=[core[canonical(t)]['id'] for t in spec['starters']]
    spec['reserveIds']=[core[canonical(t)]['id'] for t in spec.get('reserves',[])]
    spec['inactiveIds']=[core[canonical(t)]['id'] for t in spec.get('inactivePlayers',[])]
    for role, ids in [('active',spec['starterIds']),('reserve',spec['reserveIds'])]:
        for id in ids:
            assert id not in assigned
            assigned.add(id); by_id[id].update(teamId=spec['id'],region=spec['region'],affiliationStatus=role,affiliationNote=spec.get('note',''))
    for id in spec['inactiveIds']: assigned.add(id); by_id[id].update(affiliationStatus='inactive')
for spec in specs:
    spec['rosterDate']=snapshot['verifiedAt']; spec['rosterKind']='current_confirmed'
    finish_spec(spec)
claimed_names={key(t['name']) for t in specs}
claimed_names.update(['vitality','spacestation','furia','pioneers','gengmobil1racing','nrg'])
rejected=collections.Counter()

def add_team(spec,ids,reserves):
    if key(spec['name']) in claimed_names or any(id in assigned for id in ids):
        rejected['newer_roster_or_shared_player']+=1; return False
    if len(ids)!=3 or len(set(ids))!=3:
        rejected['invalid_starters']+=1; return False
    reserves=[id for id in reserves if id not in assigned and id not in ids]
    spec.update(starterIds=ids,reserveIds=reserves,starters=[by_id[id]['gamertag'] for id in ids],reserves=[by_id[id]['gamertag'] for id in reserves])
    specs.append(spec); claimed_names.add(key(spec['name']))
    for role, ps in [('active',ids),('reserve',reserves)]:
        for id in ps:
            assigned.add(id); by_id[id].update(teamId=spec['id'],region=spec['region'],affiliationStatus=role,affiliationNote=spec['note'])
    return True

# Worlds entrants are dated lineups; October-confirmed org changes above win.
world_teams=collections.defaultdict(list)
for s in worlds:
    k=canonical(s['playerName'])
    if k not in core:
        b=bio.get(s['playerId']); core[k]=new_player('pro_'+s['playerId'],b['nickname'] if b else s['playerName'],'Europe')
    world_teams[s['teamId']].append(core[k]['id'])
world_team_info={b['team']['id']:b['team'] for b in bio.values() if b.get('team')}
region_codes={'EU':'Europe','NA':'North America','SAM':'South America','MENA':'MENA','OCE':'Oceania','APAC':'Asia-Pacific','SSA':'Sub-Saharan Africa'}
world_metadata=read(SOURCE/'6377f154f99f4a6d.body.decoded.json')
for tid,ids in world_teams.items():
    info=world_team_info.get(tid)
    if not info: continue
    region=next((region_codes.get(t['region']) for t in world_metadata if t.get('id')==tid and t.get('region') in region_codes),None)
    if not region:
        nationality=info.get('nationality')
        region={'SA':'MENA','BR':'South America','AR':'South America','AU':'Oceania','ZA':'Sub-Saharan Africa','JP':'Asia-Pacific','DE':'Asia-Pacific','US':'North America','CA':'North America'}.get(nationality,'Europe')
    add_team(dict(id='real_team_'+tid,name=info['name'],shortName=info['shortName'],region=region,status='active',source='https://blast.tv/rl/stats/players/rating?tournamentId=rlcs-world-championship-2026&order=desc',rosterDate='2026-09-15',rosterKind='dated_tournament',note='Confirmed Worlds 2026 playing lineup, dated 15 September 2026; current offseason affiliation may differ.'),ids,[])

qualifier_results=collections.defaultdict(list)
for n in sorted(registrations,key=lambda n:(-dt.date.fromisoformat(n['eventInfo']['date']).toordinal(),n['entrant'].get('initialSeedNum') or 99999,n['id'])):
    e=n['eventInfo']; ids=[registered_player(m,e['region'])['id'] for m in n['starters']]
    reserves=[registered_player(m,e['region'])['id'] for m in n['members'] if m['player'] and m['isAlternate'] and not m['isCoach']]
    placement=(n['entrant'].get('standing') or {}).get('placement'); seed=n['entrant'].get('initialSeedNum')
    for id in ids: qualifier_results[id].append(dict(date=e['date'],event=e['name'],source=e['source'],placement=placement,seed=seed,region=e['region']))
    for id in reserves: qualifier_results[id].append(dict(date=e['date'],event=e['name'],source=e['source'],placement=None,seed=seed,region=e['region'],reserve=True))
    add_team(dict(id='sg_team_'+str(n['id']),name=n['name'],shortName=n['name'][:14],region=e['region'],status='active',source=e['source'],rosterDate=e['date'],rosterKind='dated_tournament',startGGTeamId=n['id'],entrantId=n['entrant']['id'],seed=seed,placement=placement,note=f"Confirmed registration for {e['name']}, dated {e['date']}. This is the last confirmed event lineup, not a claim of an active roster today."),ids,reserves)

# Public metadata fills only sourced biographies; unknown facts stay null.
for p in players:
    b=bio_by_key.get(canonical(p['gamertag'])) if not p['id'].startswith('sg_player_') else None
    if b:
        p['gamertag']=b['nickname']
        p['realName']=(' '.join((b.get('firstName') or '',b.get('lastName') or ''))).strip() or None
        p['nationality']=b.get('nationality')
        dob=b.get('dateOfBirth')
        if isinstance(dob,list) and dob[0]=='D':
            born=dt.datetime.fromtimestamp(dob[1]/1000,dt.timezone.utc).date(); today=dt.date.fromisoformat(DATE)
            p['age']=today.year-born.year-((today.month,today.day)<(born.month,born.day))
            p['birthDate']=born.isoformat()
        else: p['age']=None
    elif p['id'].startswith('sg_player_'): p['age']=None
    else:
        # The old seed's guessed ages/names do not constitute a source.
        p['age']=None
    evidence=lan.get(canonical(p['gamertag']),[]) if not p['id'].startswith('sg_player_') else []
    if evidence:
        weighted=sum(s['rating']*s['weight']*min(1,s['gamesPlayed']/15) for s in evidence)/sum(s['weight']*min(1,s['gamesPlayed']/15) for s in evidence)
        ovr=max(82,min(99,round(89+(weighted-6.5)*11)))
        confidence='medium'; method='Recent LAN performance: Worlds 50%, EWC 25%, Paris Major 15%, Boston Major 10%; available weights normalized; samples below 15 games downweighted.'
        sources=[dict(event=s['event'],date=s['date'],source=s['source'],games=s['gamesPlayed'],rating=round(s['rating'],4)) for s in evidence]
        combined={k:sum(s.get(k,0)*s['weight'] for s in evidence)/sum(s['weight'] for s in evidence) for k in ['goalsPerGame','assistsPerGame','savesPerGame','demosInflictedPerGame','shootingPercentage']}
    elif qualifier_results[p['id']]:
        latest=qualifier_results[p['id']][0]
        rank=latest.get('placement') or latest.get('seed') or 512
        ovr=round(max(48,min(90,92-4.8*math.log2(max(1,rank)))))
        confidence='low'; method='Provisional estimate from the latest confirmed regional qualifier placement, or seed when no placement exists. Team result does not measure individual skill.'
        if latest.get('reserve'): ovr=max(48,ovr-2); method+=' Registered reserve; no individual playing sample.'
        sources=qualifier_results[p['id']]; combined={}
    else:
        ovr=65; confidence='unknown'; method='No current competitive sample verified. Conservative provisional baseline, not an assessment of current form.'; sources=[]; combined={}
    honors=[]
    k=canonical(p['gamertag'])
    if k=='nass': ovr=98; honors=['2026 1v1 World Champion; 2026 Boston Major champion and top-rated Boston player']; confidence='high'
    if k=='zen': ovr=99; honors=['2026 2v2 World Champion; elite recent LAN form']; confidence='high'
    if k=='kiileerrz': ovr=99; honors=['2026 3v3 World Champion and tournament MVP']; confidence='high'
    if k=='rw9': ovr=max(98,ovr); honors=['2026 3v3 World Champion and Grand Finals MVP']; confidence='high'
    if k=='dralii': ovr=max(97,ovr); honors=['2026 3v3 World Champion']
    if k in ['vatira','atow','nwpo']: ovr=max(98,ovr)
    if honors: sources.append(dict(event='RLCS 2026 Worlds official awards',date='2026-09-20',source='https://www.rocketleague.com/competitive/rlcs-2026-world-championship',honors=honors)); method+=' Reviewed title/award calibration; 1v1 and 3v3 evidence are distinguished.'
    p.update(overall=ovr,potential=min(99,ovr+(4 if p.get('age') is not None and p['age']<=20 else 2)),reputation=max(20,ovr-5),marketValue=round((ovr/100)**6*650000),ratingConfidence=confidence,ratingMethod=method,ratingSources=sources)
    # Attribute differentiation uses observed LAN rates; other attributes stay
    # neutral estimates, with no invented playstyle or mental-health diagnosis.
    p['attributes']={a:ovr for a in ATTRS}
    if combined:
        p['attributes']['shooting']=max(55,min(99,round(ovr+(combined['goalsPerGame']-.65)*10)))
        p['attributes']['passing']=max(55,min(99,round(ovr+(combined['assistsPerGame']-.6)*10)))
        for a in ['defense','goalkeeping']: p['attributes'][a]=max(55,min(99,round(ovr+(combined['savesPerGame']-1.8)*6)))
        p['attributes']['demolitions']=max(55,min(99,round(ovr+(combined['demosInflictedPerGame']-1.2)*6)))
        p['attributes']['shotAccuracy']=max(55,min(99,round(ovr+(combined['shootingPercentage']-25)*.35)))
    if k=='nass': p['attributes']['mechanical']=99; p['attributes']['groundControl']=99
    p['traits']=copy.deepcopy(TRAITS)
    p['preferredTendency']='BALANCED'
    if combined:
        p['preferredTendency']=max({'STRIKER':p['attributes']['shooting'],'PLAYMAKER':p['attributes']['passing'],'DEFENSIVE_ANCHOR':p['attributes']['defense']},key=lambda t:{'STRIKER':p['attributes']['shooting'],'PLAYMAKER':p['attributes']['passing'],'DEFENSIVE_ANCHOR':p['attributes']['defense']}[t])
    p['scoutKnowledge']='FULL' if confidence in ['high','medium'] else 'Unknown'
for tag in snapshot['freeAgents']: core[canonical(tag)].update(affiliationStatus='free_agent',affiliationNote='Confirmed 2026 departure; subsequent affiliation unverified.')
for spec in specs:
    spec['starters']=[by_id[id]['gamertag'] for id in spec['starterIds']]
    spec['reserves']=[by_id[id]['gamertag'] for id in spec['reserveIds']]
    spec['inactivePlayers']=[by_id[id]['gamertag'] for id in spec.get('inactiveIds',[])]
    if spec['id'] not in team_by_id:
        r=round(sum(by_id[id]['overall'] for id in spec['starterIds'])/3)
        t=dict(id=spec['id'],name=spec['name'],shortName=spec['shortName'],region=spec['region'],reputation=max(15,r-5),budget=round(50000+r*r*50),cashBalance=round(50000+r*r*50),coachRating=r,facilityLevel=1,fanbase=max(100,(r-40)**2*10),sponsorIncome=round(r*150),teamChemistry=65,teamForm=60)
        teams.append(t); team_by_id[t['id']]=t
    else:
        t=team_by_id[spec['id']]; t['reputation']=max(15,round(sum(by_id[id]['overall'] for id in spec['starterIds'])/max(1,len(spec['starterIds'])))-3) if spec['starterIds'] else 40
snapshot.update(version=VERSION,verifiedAt=DATE,teams=specs,newPlayers=[],ratingVersion=VERSION,ratingNote='OVR and all gameplay attributes are estimates. Qualifier-only players have low-confidence team-result estimates, not invented individual statistics.')
snapshot['counts']=dict(teams=len(teams),players=len(players),playableTeams=sum(len(t['starterIds'])==3 and t['status']=='active' for t in specs),registeredTeamsReviewed=len(registrations),byRegion=dict(collections.Counter(t['region'] for t in specs if len(t['starterIds'])==3 and t['status']=='active')),ratingCoverage=dict(collections.Counter(p['ratingConfidence'] for p in players)),excluded=dict(rejected))
assert len(by_id)==len(players)
assert len({t['id'] for t in teams})==len(teams)
all_assigned=[id for t in specs for id in t['starterIds']+t['reserveIds']+t.get('inactiveIds',[])]
assert len(all_assigned)==len(set(all_assigned))
for name,obj in [('players.json',players),('teams.json',teams),('real-rosters.json',snapshot)]: write(ROOT/'data'/name,obj)
write(ROOT/'data'/'database-audit.json',dict(version=VERSION,verifiedAt=DATE,counts=snapshot['counts'],sources=list(events.values()),ratingNote=snapshot['ratingNote']))
print(json.dumps(snapshot['counts'],indent=2))
print('Top OVR:',[(p['gamertag'],p['overall']) for p in sorted(players,key=lambda p:-p['overall'])[:20]])
