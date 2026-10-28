import type {AppDatabase} from './database';
import supplied from '../../data/ssa-community-rosters.json';
const region='Sub-Saharan Africa';
const normal=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g,'');
const aliases:Record<string,string>={tykop:'tykop',yabu:'yab'};
/** User-provided snapshots are labelled, additive, and never overwrite a save's transfers. */
export function addSSACommunity(db:AppDatabase){
 const template=!db.prepare('SELECT id FROM careers LIMIT 1').get();
 const known=db.prepare('SELECT id,gamertag,teamId,region FROM players').all();
 const find=(tag:string)=>known.find(p=>p.region===region&&(normal(p.gamertag)===normal(tag)||normal(p.gamertag)===(aliases[normal(tag)]||normal(tag))));
 function create(tag:string,id:string,teamId:string|null,rating:number){
  db.prepare(`INSERT INTO players(id,gamertag,realName,nationality,region,age,teamId,preferredTendency,overall,potential,form,morale,fatigue,consistency,chemistry,reputation,careerEarnings,marketValue,scoutKnowledge) VALUES(?,?,NULL,NULL,?,NULL,?,'BALANCED',?,?,50,65,0,60,60,35,0,30000,'FULL')`).run(id,tag,region,teamId,rating,Math.min(88,rating+7));
  const fields=['mechanical','aerial','groundControl','shooting','shotPower','shotAccuracy','passing','defense','goalkeeping','positioning','rotations','boostManagement','speed','recovery','fiftyFifty','demolitions','gameSense','consistency','clutch'];
  const seed=Array.from(tag).reduce((n,c)=>n+c.charCodeAt(0),0);
  db.prepare(`INSERT INTO player_attributes(playerId,${fields.join(',')}) VALUES(${Array(fields.length+1).fill('?').join(',')})`).run(id,...fields.map((_,i)=>Math.max(35,Math.min(88,rating+((seed+i*7)%13)-6))));
  db.prepare('INSERT INTO player_traits VALUES(?,50,50,65,60,60,60,65,65,40)').run(id);
  db.prepare('INSERT INTO player_affiliations(playerId,status,verifiedAt,source,note) VALUES(?,?,?,?,?)').run(id,teamId?'historical':'free_agent',supplied.providedAt,'',supplied.note);
  known.push({id,gamertag:tag,teamId,region});return id;
 }
 for(const t of supplied.teams){
  if(db.prepare('SELECT id FROM teams WHERE id=? OR (LOWER(name)=LOWER(?) AND region=?)').get(t.id,t.name,region))continue;
  db.prepare(`INSERT INTO teams(id,name,shortName,region,reputation,budget,cashBalance,coachRating,facilityLevel,fanbase,sponsorIncome,teamChemistry,teamForm) VALUES(?,?,?, ?,35,75000,55000,50,1,1800,1200,55,50)`).run(t.id,t.name,t.shortName,region);
  const starters:string[]=[];
  for(const [i,tag] of [...t.roster,...t.substitutes].entries()){
   const existing=find(tag),id=existing?.id||`${t.id}_community_${i+1}`;
   // Existing-career ownership wins over a historical roster snapshot.
   if(existing&&existing.teamId!==t.id&&!template)continue;
   if(!existing)create(tag,id,t.id,i<3?66:61);
   else if(template){db.prepare('UPDATE players SET teamId=? WHERE id=?').run(t.id,id);db.prepare('UPDATE contracts SET isActive=0 WHERE playerId=?').run(id);if(existing.teamId)db.prepare("UPDATE team_roster_sources SET status='incomplete',note=note||' A starter is listed in a newer user-supplied SSA snapshot.' WHERE teamId=?").run(existing.teamId);existing.teamId=t.id;}
   db.prepare(`INSERT OR IGNORE INTO contracts(id,playerId,teamId,salary,duration,startDate,endDate,signingBonus,buyout,isActive) VALUES(?,?,?,?,24,'2026-10-28','2028-10-28',0,30000,1)`).run(`ssa_community_${id}`,id,t.id,i<3?6600:6100);
   if(i<3)starters.push(id);
  }
  db.prepare('INSERT OR IGNORE INTO team_roster_sources(teamId,status,verifiedAt,source,note,starterIds) VALUES(?,?,?,?,?,?)').run(t.id,starters.length===3?'historical':'incomplete',supplied.providedAt,'',supplied.note+(starters.length===3?'':' Some listed players already belong elsewhere in this save; they were not moved.'),JSON.stringify(starters));
 }
 // Names already known anywhere in SSA are not duplicated or forcibly released.
 for(const [i,tag] of supplied.freeAgents.entries())if(!find(tag)&&!db.prepare('SELECT id FROM players WHERE id=?').get(`ssa_community_fa_${i+1}`))create(tag,`ssa_community_fa_${i+1}`,null,60+(i%9));
}
