import type {AppDatabase} from './database';
import additions from '../../data/additional-professional-clubs.json';
import {addSSACommunity} from './ssa-community';

/** Additive registration: never changes career transfers or invents a roster. */
export function addAdditionalClubs(db:AppDatabase){
  addSSACommunity(db);
  db.prepare(`INSERT OR IGNORE INTO teams(id,name,shortName,region,reputation,budget,cashBalance,coachRating,facilityLevel,fanbase,sponsorIncome,teamChemistry,teamForm)
    VALUES('scr_esports_ssa','SCR Esports','SCR','Sub-Saharan Africa',35,60000,40000,50,1,1500,1000,50,50)`).run();
  db.prepare(`INSERT OR IGNORE INTO team_roster_sources(teamId,status,verifiedAt,source,note,starterIds)
    VALUES('scr_esports_ssa','incomplete','2026-10-27',?,?,'[]')`).run(
    'https://liquipedia.net/rocketleague/Rocket_League_Championship_Series/2026/2v2/Sub-Saharan_Africa',
    'SSA organisation confirmed in 2026 2v2 competition. Current three-player roster unconfirmed; no fictional starters added. Club financial and reputation values are game estimates.');
  // Templates have no career header. Never move an existing save's signings to
  // satisfy a new real-world snapshot, and never duplicate a known player ID.
  const template=!db.prepare('SELECT id FROM careers LIMIT 1').get();
  for(const team of additions){
    db.prepare(`INSERT OR IGNORE INTO teams(id,name,shortName,region,reputation,budget,cashBalance,coachRating,facilityLevel,fanbase,sponsorIncome,teamChemistry,teamForm)
      VALUES(?,?,?,?,45,90000,60000,55,1,2500,1500,60,50)`).run(team.id,team.name,team.shortName,team.region);
    const existing=db.prepare('SELECT teamId FROM team_roster_sources WHERE teamId=?').get(team.id);
    if(existing)continue;
    const ids:string[]=[];
    if(template)for(const [index,p] of team.roster.entries()){
      const known=db.prepare('SELECT id,teamId,overall FROM players WHERE LOWER(gamertag)=LOWER(?) ORDER BY id LIMIT 1').get(p.tag);
      const id=known?.id||`${team.id}_player_${index+1}`;
      if(!known){
        db.prepare(`INSERT INTO players(id,gamertag,realName,nationality,region,age,teamId,preferredTendency,overall,potential,form,morale,fatigue,consistency,chemistry,reputation,careerEarnings,marketValue,scoutKnowledge)
          VALUES(?,?,?,?,?,NULL,?,'BALANCED',?,?,50,65,0,60,60,45,0,50000,'FULL')`).run(id,p.tag,('realName' in p?p.realName:null)||null,('nationality' in p?p.nationality:null)||null,team.region,team.id,p.rating,Math.min(90,p.rating+7));
        const fields=['mechanical','aerial','groundControl','shooting','shotPower','shotAccuracy','passing','defense','goalkeeping','positioning','rotations','boostManagement','speed','recovery','fiftyFifty','demolitions','gameSense','consistency','clutch'];
        db.prepare(`INSERT INTO player_attributes(playerId,${fields.join(',')}) VALUES(${Array(fields.length+1).fill('?').join(',')})`).run(id,...fields.map(()=>p.rating));
        db.prepare('INSERT INTO player_traits VALUES(?,50,50,65,60,60,60,65,65,40)').run(id);
      }else{
        db.prepare('UPDATE players SET teamId=?,region=? WHERE id=?').run(team.id,team.region,id);
        db.prepare('UPDATE contracts SET isActive=0 WHERE playerId=?').run(id);
        if(known.teamId&&known.teamId!==team.id)db.prepare("UPDATE team_roster_sources SET status='incomplete',note=note||' A starter moved to an additional verified club in the new-career template.' WHERE teamId=?").run(known.teamId);
      }
      ids.push(id);
      db.prepare(`INSERT OR IGNORE INTO contracts(id,playerId,teamId,salary,duration,startDate,endDate,signingBonus,buyout,isActive) VALUES(?,?,?,?,24,'2026-10-11','2028-10-11',0,?,1)`).run(`additional_${id}`,id,team.id,p.rating*100,p.rating*1000);
      db.prepare('INSERT OR REPLACE INTO player_affiliations(playerId,status,verifiedAt,source,note) VALUES(?,?,?,?,?)').run(id,'historical','2026-10-27',team.source,team.note);
    }
    db.prepare('INSERT INTO team_roster_sources(teamId,status,verifiedAt,source,note,starterIds) VALUES(?,?,?,?,?,?)').run(team.id,template?'historical':'incomplete',team.date,team.source,team.note+' Ratings, potential and finances are game estimates.'+(template?'':' Existing career rosters and transfers are preserved; this lineup is available in new careers.'),JSON.stringify(ids));
  }
}
