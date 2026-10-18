"""Core-skill gates choose existing local policies, never alter game physics."""
import json
import math
from pathlib import Path

CONFIG=json.loads((Path(__file__).resolve().parent.parent/'data/local-skill-progression.json').read_text(encoding='utf-8'))

def core_skills(player):
    attrs=player.get('attributes') or {};fallback=float(player.get('rating',50));values={}
    for skill in CONFIG['skills']:
        scores=[]
        for key in skill['attributes']:
            try:
                value=float(attrs.get(key));scores.append(max(0,min(100,value)) if math.isfinite(value) else fallback)
            except (TypeError,ValueError):scores.append(fallback)
        values[skill['id']]=sum(scores)/len(scores)
    return values

def eligible_tier(player,mode,tiers):
    skills=core_skills(player);rating=float(player.get('rating',50))
    for rule in CONFIG['difficulties'][mode]:
        if rating>=rule['cutoff'] and min(skills.values())>=rule['minimumSkill']:
            tier=next(t for t in tiers if t[0]==rule['cutoff'])
            return tier,{'skills':skills,'minimumSkill':rule['minimumSkill'],'eligibleLevel':rule['level'],
                         'ceiling':CONFIG['difficulties'][mode][0]['level']}
    raise ValueError('No supported local skill tier')
