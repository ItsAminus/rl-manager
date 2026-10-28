"""Career rating tiers, with stable identities and explicit hosted limitations."""
import hashlib
import re
import random
import json
import os
import tempfile
from pathlib import Path
from host_bot_health import excluded_engines, family_key
from local_performance import performance_profile
from local_skill_progression import eligible_tier

TIERS=[(99,('Kiyo3',),'Elite'),
       (98,('Chronos',),'Elite'),
       (97,('BonkDaddy',),'Elite'),
       (96,('Byte',),'Elite'),
       (93,('OptiGP','Opti','RippleV1','London'),'High GC'),
       (90,('NextoPlus','Ducky'),'GC / SSL'),
       (89,('AstraV5','Daizen','Zeus','OptiFR'),'Champ'),
       (86,('AstraV5','Daizen','Zeus'),'Champ'),
       (79,('Necto',),'Diamond'),
       # Use the locally installed policies that pass import/readiness checks.
       (74,('ReliefBot','Botimus Prime','Bumblebee','RedBot'),'Platinum'),
       (69,('Wildfire','Codename Cryo'),'Gold'),
       (0,('Lanfear','PenguinBot','Beast from the East','VirxEB','Bribblebot'),'Silver / developing')]
MEDIUM_TIERS=[(94,('Necto','Element'),'Diamond'),
              (89,('Botimus Prime',),'Platinum'),
              (84,('Botimus Prime',),'Platinum'),
              (74,('Stick','Codename Cryo'),'Gold'),
              (64,('PenguinBot','VirxEB'),'Silver'),(0,('Career Rookie',),'Bronze / Rookie')]
EASY_TIERS=[(94,('Stick','Codename Cryo'),'Gold'),
            (84,('PenguinBot','VirxEB'),'Silver'),
            (69,('Bribblebot','PenguinBot'),'Silver / developing'),
            (0,('Career Rookie',),'Bronze / Rookie')]
PATH_LOCAL_TIERS=[(94,('Nexto',),'Elite'),(89,('Nexto',),'GC / SSL'),(84,('Nexto',),'Champ'),(79,('Necto','Element'),'Diamond'),(74,('Botimus Prime',),'Platinum'),(69,('Stick','Codename Cryo'),'Gold'),(59,('PenguinBot','VirxEB'),'Silver'),(0,('Career Rookie',),'Bronze / Rookie')]
# Path To Glory has separate earned promotion gates; a Hard hierarchy change
# must not alter its trial cutoffs or unlocked policy pools.
PATH_HOST_TIERS=[(94,('BonkDaddy','Ripple','Ordis','London','Byte','Opti'),'Elite'),
                 (89,('Nexto','NextoPlus','Daizen','Fury'),'GC / SSL'),
                 (84,('Astra','Zeus'),'Champ'),(79,('Necto','Element'),'Diamond'),
                 (74,('Botimus Prime',),'Platinum'),(69,('Stick',),'Gold'),
                 (59,('PenguinBot',),'Silver'),(0,('Career Rookie',),'Bronze / Rookie')]
LOCAL_CONDITION_ALIASES={'Wildfire':'Codename Cryo','Psyonix':'Career Rookie','Bumblebee':'Botimus Prime','ReliefBot':'Botimus Prime','Lanfear':'PenguinBot'}

def difficulty(context):
    value=str(context.get('difficulty','Hard')).lower()
    return 'Easy' if value=='easy' else 'Medium' if value=='medium' else 'Hard'

def canonical(name):return re.sub(r'[^a-z0-9]','',name.lower().split('(')[0])

def flatten_catalog(data):
    return [name.split('(')[0].strip() for item in data
            for name in (item.get('versions',[]) if isinstance(item,dict) else [item])]

def resolve_hosted(family,catalog):
    # Use only real advertised identifiers, never invented version suffixes.
    candidates=[n for n in catalog if canonical(n)==canonical(family) or
                (family in ('Ripple','Astra','BonkDaddy') and canonical(n).startswith(canonical(family)))]
    preferences={'Ripple':['RippleV1.1','RippleV1'],'Astra':['AstraV5'],
                 'BonkDaddy':['BonkDaddy','BonkDaddyV4']}
    for preferred in preferences.get(family,[family]):
        if preferred in candidates:return preferred
    return sorted(candidates)[-1] if candidates else None

SERIES_ROOT=Path(__file__).resolve().parent/'runtime'/'series-bots'

def series_file(context):
    if not context.get('careerId') or not context.get('fixtureId'):return None
    suffix='' if difficulty(context)=='Hard' else ':'+difficulty(context)
    key=hashlib.sha256(f"{context['careerId']}:{context['fixtureId']}{suffix}".encode()).hexdigest()
    return SERIES_ROOT/f'{key}.json'

def path_breakout_slot(context, assignments):
    """One 5% draw per local career game, stable across preview/retry calls."""
    if context.get('gameMode')!='Path To Glory' or not context.get('careerId') or not context.get('fixtureId'):
        return None
    # Blue is the manager's squad in the bridge. A remote lobby cannot mix in
    # a local Nexto. Players already using Nexto have nothing to upgrade here.
    if any(a['type']=='Rocket Host' for a in assignments):return None
    candidates=[a for a in assignments if a['team']==0 and a['type']=='Local' and a['engine']!='Nexto']
    if not candidates:return None
    key=f"path-breakout-v1:{context['careerId']}:{context['fixtureId']}:{int(context.get('gameNumber',1))}"
    digest=hashlib.sha256(key.encode()).digest()
    if int.from_bytes(digest[:8],'big') % 20 != 0:return None
    candidates=sorted(candidates,key=lambda a:a['playerId'])
    return candidates[int.from_bytes(digest[8:16],'big') % len(candidates)]['slot']

def rating_plan(context,catalog=None,lock_series=False,allow_partial=False):
    mode=difficulty(context)
    path_mode=context.get('gameMode')=='Path To Glory'
    path_hosted=path_mode and bool(context.get('pathHostedUnlocked'))
    tiers=EASY_TIERS if mode=='Easy' else MEDIUM_TIERS if mode=='Medium' else TIERS
    if path_mode:tiers=PATH_HOST_TIERS if path_hosted else PATH_LOCAL_TIERS
    file=series_file(context);locked={}
    if file:
        try:
            candidate=json.loads(file.read_text(encoding='utf-8'))
            if isinstance(candidate,dict) and candidate.get('route') in ('Rocket Host','Local') and isinstance(candidate.get('assignments'),list) and all(isinstance(a,dict) and isinstance(a.get('playerId'),str) for a in candidate['assignments']):locked=candidate
        except (OSError,ValueError):pass
    previous={a['playerId']:a for a in locked.get('assignments',[])}
    players=[(team,p) for team,side in enumerate(('blueTeam','orangeTeam'))
             for p in context[side]['players'][:3]]
    remote=(bool(locked.get('route')=='Rocket Host') if locked else path_hosted) if path_mode else mode=='Hard' and (locked.get('route')=='Rocket Host' if locked else any(p.get('rating',85)>=84 for _,p in players))
    blocked=excluded_engines(context) if remote else set()
    if remote and catalog is not None:
        catalog=[engine for engine in catalog if family_key(engine) not in blocked]
    # Fixture seed: random across series, identical across games of one series.
    game_key=f"{context.get('careerId','')}:{context.get('fixtureId','exhibition')}:{context.get('botSelectionRevision',0)}:{mode}"
    assignments=[];bags={};draws={};errors=[]
    def draw_engine(cutoff,pool):
        # Shuffle within a tier before reusing any policy. Five elite bots
        # can therefore draw five distinct families rather than all BonkDaddy.
        engines=list(dict.fromkeys(resolve_hosted(f,catalog) if remote and catalog is not None else
                                    'Necto' if remote and f=='Element' else f for f in pool))
        engines=[engine for engine in engines if engine and family_key(engine) not in blocked]
        if not engines:return None
        if not bags.get(cutoff):
            cycle=draws.get(cutoff,0);draws[cutoff]=cycle+1
            seed=int.from_bytes(hashlib.sha256(f'{game_key}:tier:{cutoff}:{cycle}'.encode()).digest()[:8],'big')
            bags[cutoff]=list(engines);random.Random(seed).shuffle(bags[cutoff])
        return bags[cutoff].pop()
    for slot,(team,p) in enumerate(players):
        form=p.get('pathForm') if path_mode else None
        if form and form.get('fixtureId')==context.get('fixtureId'):
            # This saved, earned reward changes only this series' AI snapshot.
            # Permanent database skills, XP and promotion gates are untouched.
            p={**p,'rating':max(p.get('rating',0),92),'pathTierCap':max(p.get('pathTierCap',0),89),
               'attributes':{**p.get('attributes',{}),**{k:max(v,92) for k,v in p.get('attributes',{}).items() if isinstance(v,(int,float))}},
               'condition':{**p.get('condition',{}),'form':95,'morale':90,'fatigue':0}}
        rating=max(0,min(100,int(p.get('rating',85))))
        cutoff,pool,level=next(t for t in tiers if rating>=t[0])
        development=None
        if path_mode:
            (cutoff,pool,level),development=eligible_tier(p,'Path To Glory',tiers)
            cap=p.get('pathTierCap')
            if cap is not None and cutoff>cap:cutoff,pool,level=next(t for t in tiers if t[0]<=cap)
        identity=str(p.get('playerId') or p['gamertag'])
        minimum=False
        old=previous.get(identity);saved=old and old.get('engine')
        fallback={}
        actual_cutoff=cutoff
        if remote and old and old.get('engine'):
            # Recover from the failed policy's strength, not a new form rating.
            actual_cutoff=old.get('actualTierCutoff',old.get('tierCutoff',cutoff))
            cutoff,pool,level=next((t for t in tiers if t[0]==old.get('tierCutoff')), (cutoff,pool,level))
        if mode in ('Easy','Medium'):saved=LOCAL_CONDITION_ALIASES.get(saved,saved)
        if saved and family_key(saved) not in blocked and remote and catalog is not None and saved not in catalog:
            family=next((f for _,pool,_ in TIERS for f in pool if family_key(f)==family_key(saved)),saved)
            saved=resolve_hosted(family,catalog)
        if saved and family_key(saved) in blocked:saved=None
        if saved and (mode in ('Easy','Medium') or path_mode and not remote):
            anchor=old.get('tierCutoff',(old.get('performance') or {}).get('baseCutoff'))
            cutoff,pool,level=next(t for t in tiers if t[0]==anchor) if anchor is not None else next(t for t in tiers if old.get('rating',rating)>=t[0])
        if p.get('isHuman'):engine=None
        elif saved:
            engine=saved;minimum=old.get('hostedMinimum',False)
            fallback={key:old[key] for key in ('fallbackFrom','fallbackReason','actualTierCutoff','actualLevel') if key in old}
        elif remote and rating<79:
            engine=resolve_hosted('Necto',catalog) if catalog is not None else 'Necto';minimum=True
            if family_key(engine) in blocked:engine=None
        else:
            requested=next((t for t in tiers if t[0]==actual_cutoff),(cutoff,pool,level))
            engine=draw_engine(requested[0],requested[1])
        if remote and not p.get('isHuman') and not saved:
            requested=next((t for t in tiers if t[0]==actual_cutoff),(cutoff,pool,level))
            actual_level=requested[2]
            if engine is None and not minimum:
                # Nearest weaker healthy tier first. Hosted matches cannot mix
                # local policies in, and Necto is the hosted minimum.
                for lower_cutoff,lower_pool,lower_level in tiers:
                    if lower_cutoff>=actual_cutoff or lower_cutoff<79:continue
                    engine=draw_engine(lower_cutoff,lower_pool)
                    if engine:
                        actual_cutoff=lower_cutoff;actual_level=lower_level;break
            if engine and (actual_cutoff!=cutoff or old and old.get('engine') and old['engine']!=engine):
                unavailable=old.get('engine') if old and old.get('engine') else ', '.join(pool)
                fallback={'fallbackFrom':unavailable,'actualTierCutoff':actual_cutoff,'actualLevel':actual_level,
                          'fallbackReason':f'{unavailable} unavailable; using {engine} ({actual_level}, {actual_cutoff}+ tier).'}
            elif engine:
                fallback={'actualTierCutoff':actual_cutoff,'actualLevel':actual_level}
        assignment_error=None
        if not p.get('isHuman') and engine is None:
            assignment_error=f'{p["gamertag"]}: no healthy hosted bot in the requested {level} tier or any weaker supported tier.'
            if not remote:assignment_error=f'{p["gamertag"]}: no available local bot in the requested {level} tier.'
            if not allow_partial:raise ValueError(assignment_error)
            errors.append(assignment_error)
        effective=rating if remote or mode=='Hard' and not path_mode else {'Elite':85,'GC / SSL':85,'Champ':85,'Diamond':82,'Platinum':76,'Gold':70,'Silver':60,'Silver / developing':55,'Bronze / Rookie':35}[level]
        performance=performance_profile(p,'Medium' if path_mode and not remote else mode,cutoff,level)
        assignments.append({'playerId':identity,'name':p['gamertag'],'team':team,'slot':slot,
            'rating':rating,'effectiveRating':effective,'tierCutoff':cutoff,'difficulty':'Medium' if path_mode and not remote else mode,'botSkill':0.0 if level=='Bronze / Rookie' else 1.0,'luckyGame':False,'beta':1,
            'engine':None if p.get('isHuman') else engine,
            'type':'Human' if p.get('isHuman') else 'Rocket Host' if remote else 'Local',
            'target':level,'availableLevel':'Rocket Host Necto (Champ; hosted minimum)' if minimum else 'Rocket Host Necto (Champ; local Diamond version unavailable here)' if remote and not path_mode and engine=='Necto' else 'Local Nexto (approximately GC)' if path_mode and not remote and engine=='Nexto' else fallback.get('actualLevel',level),
            'hostedMinimum':minimum,'styleApplied':not remote and not p.get('isHuman'), 'tendency':p.get('tendency','BALANCED'),
            **fallback,
            **({'assignmentError':assignment_error} if assignment_error else {}),
            **({'development':development} if development and not p.get('isHuman') else {}),
            **({'performance':performance,'attributes':p.get('attributes',{}),'traits':p.get('traits',{}),'condition':p.get('condition',{}),'matchRole':p.get('matchRole'),'matchTactics':p.get('matchTactics',{})} if performance else {}),
            **({'temporaryForm':True} if form and form.get('fixtureId')==context.get('fixtureId') else {})})
    retained=set()
    for a in assignments:
        old=previous.get(a['playerId']);engine=old and old.get('engine')
        if mode in ('Easy','Medium'):engine=LOCAL_CONDITION_ALIASES.get(engine,engine)
        if a['type']=='Human' or not engine or family_key(engine) in blocked:continue
        if remote and catalog is not None and engine not in catalog:
            family=next((f for _,pool,_ in TIERS for f in pool if family_key(f)==family_key(engine)),engine)
            engine=resolve_hosted(family,catalog)
        if engine:
            a['engine']=engine;retained.add(a['playerId'])
    # Only replace a failed/unavailable policy. Never redraw healthy teammates.
    used={a['engine'] for a in assignments if a['playerId'] in retained}
    for a in assignments:
        if a['type']=='Human' or a['playerId'] in retained:continue
        old=previous.get(a['playerId'])
        if old and old.get('engine'):
            cutoff,pool,_=next(t for t in tiers if t[0]==a.get('actualTierCutoff',a['tierCutoff']))
            alternatives=[resolve_hosted(f,catalog) if remote and catalog is not None else f for f in pool]
            alternatives=[e for e in alternatives if e and family_key(e) not in blocked and e not in used]
            if alternatives:
                a['engine']=random.Random(game_key+a['playerId']).choice(alternatives)
                if a.get('fallbackReason'):
                    a['fallbackReason']=f'{a["fallbackFrom"]} unavailable; using {a["engine"]} ({a.get("actualLevel",a["target"])}, {cutoff}+ tier).'
        used.add(a['engine'])
    if lock_series and file and not errors:
        # Launch commits actual catalog identifiers; preview never commits guesses.
        SERIES_ROOT.mkdir(parents=True,exist_ok=True)
        with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=SERIES_ROOT,delete=False) as temp:
            saved=[previous.get(a['playerId'],a) if a['type']=='Human' else a for a in assignments]
            json.dump({'route':'Rocket Host' if remote else 'Local','assignments':saved},temp)
        os.replace(temp.name,file)
    # Apply AFTER saving the ordinary series assignment. This game's windfall
    # must never become the player's locked bot for the rest of the series.
    breakout=path_breakout_slot(context,assignments)
    if breakout is not None:
        assignments=[{**a,'engine':'Nexto','luckyGame':True,'botSkill':1.0,
                      'effectiveRating':85,'target':'GC / SSL',
                      'availableLevel':'Local Nexto (one-game breakout)'} if a['slot']==breakout else a
                     for a in assignments]
    return {'success':not errors,**({'error':' '.join(errors)} if errors else {}),
        'route':'Rocket Host' if remote else 'Local','difficulty':'Path To Glory' if path_mode else mode,'assignments':assignments,'seriesLocked':bool(locked) or bool(lock_series and file and not errors),
        'notice':('Hosted bot choices follow your rating tiers. Private bot policies cannot be modified locally.'+
                  ' Bot families are shuffled per series and locked to player identities for every game. Only failed or unavailable policies are replaced.'+
                  (' Unavailable bots were replaced by the next strongest healthy choices; replacements are shown per player.' if any(a.get('fallbackReason') for a in assignments) else '')+
                  (' Failed hosted policies excluded: '+', '.join(sorted(blocked))+'.' if blocked else '')+
                  (' Rocket Host advertises Necto as Champ; its local Diamond version cannot be mixed into a hosted match.' if not path_mode and any(a['engine']=='Necto' and a['type']!='Human' for a in assignments) else '')+
                  (' Rocket Host only offers Necto or stronger; lower-rated players in this mixed match use Necto.' if any(a['hostedMinimum'] and a['type']!='Human' for a in assignments) else '')) if remote
                 else ('Path To Glory: local bot tiers follow skills and completed promotion trials. The Champ trial unlocks Rocket Host for the squad. Normal bot choices stay fixed for this series; each local game has a 5% chance of one AI teammate using Nexto for that game only.' if path_mode else f'{mode}: local RLBot matches with career HUD, portraits, titles and pro names. Bot choices stay fixed per series and difficulty. Changing difficulty applies next game.')}
