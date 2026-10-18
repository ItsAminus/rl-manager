import type {AppDatabase} from './database';
import {RLCS_RULEBOOK} from '../game/official-competition-rules';

// Award names also occur in the identity-verified public title registry. Career
// wins change this save's presentation, never the shared IRL/account registry.
export function championTitle(kind:string,cycle:number,year:number){
  if(kind==='REGIONAL')return `RLCS ${year} Regional Champion`;
  if(kind==='MAJOR')return `RLCS ${year} ${cycle===1?'Boston':'Paris'} Major Champion`;
  if(kind==='WORLDS')return `RLCS ${year} World Champion`;
  return null; // EWC does not award an official Rocket League champion title.
}
export class CareerHonours {
  constructor(private db:AppDatabase){}
  register(careerId:string,competitionId:string,teamId:string,players:{id:string}[],date:string){
    if(this.db.prepare('SELECT playerId FROM competition_rosters WHERE competitionId=? AND teamId=? LIMIT 1').get(competitionId,teamId))return;
    players.slice(0,4).forEach((p,i)=>this.db.prepare('INSERT OR IGNORE INTO competition_rosters VALUES (?,?,?,?,?,?)').run(competitionId,careerId,teamId,p.id,i<3?1:0,date));
  }
  list(careerId:string,playerId:string){return this.db.prepare('SELECT a.*,c.name AS competitionName FROM career_player_awards a JOIN competitions c ON c.id=a.competitionId WHERE a.careerId=? AND a.playerId=? ORDER BY earnedDate DESC,a.rowid DESC').all(careerId,playerId);}
  equipped(careerId:string,playerId:string){return this.list(careerId,playerId).find(a=>a.title)||null;}
  award(careerId:string,competition:any,teamId:string,date:string){
    if(!teamId||!['REGIONAL','MAJOR','WORLDS','INVITATIONAL','KICKOFF'].includes(competition.stage||competition.type))return [];
    if(this.db.prepare('SELECT status FROM competitions WHERE id=?').get(competition.id)?.status!=='completed')return [];
    let config:any={};try{config=JSON.parse(competition.config||'{}');}catch{/* Old saves */}
    const year=config.seasonYear||Number(date.slice(0,4)),kind=competition.stage||competition.type,title=championTitle(kind,competition.cycle||config.cycle||1,year);
    const roster=this.db.prepare('SELECT playerId FROM competition_rosters WHERE competitionId=? AND teamId=?').all(competition.id,teamId);
    const added:string[]=[];
    for(const p of roster){
      const existing=this.db.prepare('SELECT playerId FROM career_player_awards WHERE careerId=? AND competitionId=? AND playerId=?').get(careerId,competition.id,p.playerId);if(existing)continue;
      this.db.prepare('INSERT INTO career_player_awards VALUES (?,?,?,?,?,?,?,?)').run(careerId,competition.id,p.playerId,teamId,title,date,year,config.source||RLCS_RULEBOOK);added.push(p.playerId);
    }return added;
  }
}
