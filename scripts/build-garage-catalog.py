"""Curate supported cosmetics from the installed, official RLBot item catalog."""
import csv,json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=Path(str(Path.home() / 'AppData' / 'Local' / 'RLBotGUIX' / 'Python311' / 'Lib' / 'site-packages' / 'rlbot' / 'csv' / 'items.csv'))
rows=list(csv.reader(source.open(encoding='utf-8-sig')))
desired={'bodies':('Body',['Octane','Fennec','Dominus','Breakout','Merc']),
 'wheels':('Wheels',['Cristiano','OEM','Dieci','Tunica','Vortex','Stern','Alchemist','Invader']),
 'boosts':('Boost',['Standard','Ion','Sparkles','(Alpha Reward) Gold Rush','Standard Blue','Standard Yellow','Flamethrower']),
 'finishes':('PaintFinish',['Glossy','Matte','Metallic','Pearlescent','Anodized','Anodized Pearl']),
 'trails':('SupersonicTrail',['Classic','Lightspeed','Laser Wave III','Hot Rocks','Friction']),
 'explosions':('GoalExplosion',['Classic','Standard','Electroshock','Hellfire','Sub-Zero','Party Time'])}
catalog={'source':'https://github.com/RLBot/RLBotGUI/blob/master/rlbot_gui/gui/csv/items.csv','groups':{}}
for key,(kind,names) in desired.items():
 items=[]
 for name in names:
  matches=[r for r in rows if len(r)>=4 and r[1]==kind and r[3]==name]
  if matches:items.append({'id':int(matches[0][0]),'name':name.replace('(Alpha Reward) ','')})
 catalog['groups'][key]=items
catalog['groups']['decals']=[{'id':0,'name':'Clean paint','bodyId':0}]
for body in catalog['groups']['bodies']:
 for suffix in ['Stripes','Wings','Flames','Lone Wolf','Ombre','Yorebands','RLCS']:
  matches=[r for r in rows if len(r)>=4 and r[1]=='Skin' and r[3]==body['name']+': '+suffix]
  if matches:catalog['groups']['decals'].append({'id':int(matches[0][0]),'name':suffix,'bodyId':body['id']})
(root/'data/garage-items.json').write_text(json.dumps(catalog,indent=2)+'\n',encoding='utf-8')
print({k:len(v) for k,v in catalog['groups'].items()})
