import type {AppDatabase} from './database';
export function squadDynamics(db:AppDatabase,c:any){
 const players=db.prepare(`SELECT p.id,p.gamertag,p.morale,p.chemistry,p.reputation,p.fatigue,
   COALESCE(r.trust,50) trust,COALESCE(t.professionalism,50) professionalism,
   (SELECT MIN(startDate) FROM contracts WHERE playerId=p.id AND teamId=p.teamId AND isActive=1) joined
   FROM players p LEFT JOIN player_traits t ON t.playerId=p.id
   LEFT JOIN manager_relationships r ON r.playerId=p.id AND r.careerId=? WHERE p.teamId=?`).all(c.id,c.teamId);
 const average=(key:string)=>players.length?Math.round(players.reduce((n,p)=>n+(p[key]??50),0)/players.length):50;
 const voices=[...players].sort((a,b)=>((b.reputation||0)+b.professionalism+Math.max(0,(Date.parse(c.currentDate)-Date.parse(b.joined||c.currentDate))/86400000)*.02)-((a.reputation||0)+a.professionalism+Math.max(0,(Date.parse(c.currentDate)-Date.parse(a.joined||c.currentDate))/86400000)*.02));
 return {cohesion:Math.round(db.prepare('SELECT teamChemistry FROM teams WHERE id=?').get(c.teamId)?.teamChemistry??50),atmosphere:average('morale'),managerSupport:average('trust'),
   voices:voices.slice(0,Math.min(2,players.length)).map(p=>({id:p.id,name:p.gamertag,trust:p.trust})),
   concerns:players.filter(p=>p.morale<45||p.trust<40||p.fatigue>70).map(p=>({id:p.id,name:p.gamertag,reasons:[p.morale<45?'Low morale':null,p.trust<40?'Low manager trust':null,p.fatigue>70?'High workload':null].filter(Boolean)})),
   note:'Cohesion measures team understanding; atmosphere reflects morale; manager support reflects trust. Influential voices are estimated from club tenure, reputation and professionalism, not assigned by overall rating.'};
}
