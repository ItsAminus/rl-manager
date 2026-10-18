"""Apply saved player cosmetics through RLBot's local match configuration.
Hosted bots and the human's inventory stay under their existing controllers.
"""
import json,re
from pathlib import Path

def apply_garage_loadout(pc,player):
    data=player.get('garageLoadout')
    if not data or not pc.bot:return False
    from rlbot.matchconfig.loadout_config import LoadoutConfig,Color
    catalog=json.loads((Path(__file__).resolve().parents[1]/'data'/'garage-items.json').read_text(encoding='utf-8'))['groups']
    fields={'car_id':'bodies','wheels_id':'wheels','boost_id':'boosts','paint_finish_id':'finishes','custom_finish_id':'finishes','decal_id':'decals','trails_id':'trails','goal_explosion_id':'explosions'}
    loadout=LoadoutConfig()
    for field,group in fields.items():
        value=data.get(field)
        if type(value)!=int or value not in [i['id'] for i in catalog[group]]:raise ValueError('Unsupported garage item')
        setattr(loadout,field,value)
    decal=next(i for i in catalog['decals'] if i['id']==data['decal_id'])
    if decal.get('bodyId') and decal['bodyId']!=data['car_id']:raise ValueError('Decal does not match body')
    paint=data.get('car_paint_id',0)
    if type(paint)!=int or paint not in range(14):raise ValueError('Unsupported painted body')
    loadout.paint_config.car_paint_id=paint
    def rgb(value):
        if not isinstance(value,str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',value):raise ValueError('Invalid garage colour')
        return Color(*[int(value[i:i+2],16) for i in [1,3,5]],255)
    loadout.primary_color_lookup=rgb(data.get('primary'))
    loadout.secondary_color_lookup=rgb(data.get('secondary'))
    pc.loadout_config=loadout
    return True
