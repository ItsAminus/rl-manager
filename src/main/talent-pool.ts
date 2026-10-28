import type {AppDatabase} from './database';
import {v4 as uuid} from 'uuid';
export const SCOUT_SKILLS=['shooting','passing','aerial','groundControl','goalkeeping','positioning','boostManagement'] as const;
export type ScoutBrief={minAge:number;maxAge:number;skills:Partial<Record<typeof SCOUT_SKILLS[number],number>>};
export function scoutBrief(value:any={}):ScoutBrief{
 const minAge=value.minAge??15,maxAge=value.maxAge??45,skills=value.skills??{};
 if(!Number.isInteger(minAge)||!Number.isInteger(maxAge)||minAge<15||maxAge>45||minAge>maxAge)throw Error('Choose an age range between 15 and 45.');
 if(!skills||Array.isArray(skills)||typeof skills!=='object'||Object.entries(skills).some(([key,n])=>!SCOUT_SKILLS.includes(key as any)||!Number.isInteger(n)||Number(n)<1||Number(n)>99))throw Error('Choose valid skill thresholds between 1 and 99.');
 return {minAge,maxAge,skills};
}
const fields=['mechanical','aerial','groundControl','shooting','shotPower','shotAccuracy','passing','defense','goalkeeping','positioning','rotations','boostManagement','speed','recovery','fiftyFifty','demolitions','gameSense','consistency','clutch'];
const clamp=(n:number)=>Math.max(15,Math.min(98,Math.round(n)));
/** Persistent fictional grassroots intake; never overwrites a real player's identity. */
export function ensureTalentPool(db:AppDatabase,c:any){
 if(c.mode==='Path To Glory')return;
 // Only flat, low-rated estimated profiles receive a one-time shape. Ratings and
 // already differentiated/trained profiles remain untouched.
 const flat=db.prepare(`SELECT p.id,p.overall,a.* FROM players p JOIN player_attributes a ON a.playerId=p.id
   LEFT JOIN player_rating_sources r ON r.playerId=p.id WHERE p.overall<=80 AND NOT EXISTS(SELECT 1 FROM attribute_variation v WHERE v.playerId=p.id)`).all();
 for(const p of flat){
  db.prepare('INSERT OR IGNORE INTO attribute_variation VALUES(?)').run(p.id);
  if(fields.some(f=>!Number.isFinite(p[f]))||new Set(fields.map(f=>p[f])).size!==1)continue;
  const seed=[...p.id].reduce((n,ch)=>(Math.imul(n,31)+ch.charCodeAt(0))>>>0,17),focus=seed%4;
  const profiles=[['shooting','shotAccuracy','shotPower'],['passing','positioning','gameSense'],['defense','goalkeeping','rotations'],['aerial','mechanical','groundControl']];
  const values=fields.map((f,i)=>clamp(p[f]+(profiles[focus].includes(f)?7:-2)+((seed>>>(i%16))%7)-3));
  db.prepare(`UPDATE player_attributes SET ${fields.map(f=>f+'=?').join(',')} WHERE playerId=?`).run(...values,p.id);
 }
 const season=c.currentDate.slice(0,4);
 if(db.prepare('SELECT 1 FROM talent_seasons WHERE careerId=? AND season=?').get(c.id,season))return;
 db.prepare('INSERT INTO talent_seasons VALUES(?,?)').run(c.id,season);
 const regions=db.prepare("SELECT DISTINCT region FROM teams WHERE region IS NOT NULL AND region<>''").all();
 const prefixes=['Aero','Flux','Nova','Echo','Vex','Orbit','Pulse','Rift','Kestrel','Drift','Prism','Frost','Lumen','Blitz','Ash','Crux'];
 for(const {region} of regions){
  // Several ordinary trialists for every exceptional ceiling. No guarantee that
  // any region or yearly intake contains an elite prospect.
  for(let i=0;i<5;i++){
   const id=uuid(),roll=Math.random(),exceptional=roll<.025,age=exceptional?15+Math.floor(Math.random()*2):15+Math.floor(Math.random()*6);
   const overall=45+Math.floor(Math.random()*23),potential=exceptional?91+Math.floor(Math.random()*8):Math.min(89,overall+5+Math.floor(Math.random()*23));
   const tag=prefixes[Math.floor(Math.random()*prefixes.length)]+id.replace(/-/g,'').slice(0,5);
   db.prepare(`INSERT INTO players(id,gamertag,region,age,overall,potential,preferredTendency,form,morale,fatigue,consistency,chemistry,reputation,marketValue,scoutKnowledge) VALUES(?,?,?,?,?,?,'BALANCED',50,60,0,50,50,5,1000,'Unknown')`).run(id,tag,region,age,overall,potential);
   const focus=Math.floor(Math.random()*4),clusters=[['shooting','shotAccuracy','shotPower'],['passing','positioning','gameSense'],['defense','goalkeeping','rotations'],['aerial','mechanical','groundControl']];
   db.prepare(`INSERT INTO player_attributes(playerId,${fields.join(',')}) VALUES(${Array(fields.length+1).fill('?').join(',')})`).run(id,...fields.map(f=>clamp(overall+(clusters[focus].includes(f)?9:-3)+Math.floor(Math.random()*13)-6)));
   // A big ceiling does not guarantee a professional attitude or fast growth.
   db.prepare('INSERT INTO player_traits VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,...Array.from({length:9},()=>25+Math.floor(Math.random()*65)));
   db.prepare('INSERT INTO hidden_prospects VALUES(?,?,?)').run(id,c.id,season);
   db.prepare("INSERT INTO player_affiliations(playerId,status,verifiedAt,source,note) VALUES(?,'career',?,'','Fictional grassroots player generated for this career; not a real esports identity.')").run(id,c.currentDate);
  }
 }
}
export function potentialAssessment(careerId:string,p:any,depth:number,regionReports=0){
 if(!depth)return 'Unknown';
 const seed=[...careerId+p.id].reduce((n,ch)=>(Math.imul(n,31)+ch.charCodeAt(0))>>>0,7);
 const youthful=p.age!=null&&p.age<=17;
 const uncertainty=depth===1?18:depth===2?12:youthful?9:6;
 const judgementError=(seed%21-10)*(depth===1?1:depth===2?.65:.4)*Math.max(.5,1-regionReports/100);
 const centre=Math.max(p.overall,Math.min(99,p.potential+judgementError));
 return `${Math.max(p.overall,Math.round(centre-uncertainty))}–${Math.min(99,Math.round(centre+uncertainty))}`;
}
export function knownProspect(db:AppDatabase,c:any,id:string){
 const hidden=db.prepare('SELECT careerId FROM hidden_prospects WHERE playerId=?').get(id);
 return !hidden||hidden.careerId===c.id&&!!db.prepare("SELECT 1 FROM scout_assignments WHERE careerId=? AND playerId=? AND status='completed'").get(c.id,id);
}
