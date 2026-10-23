import type {AppDatabase} from './database';
import {RLCS_RULEBOOK} from '../game/official-competition-rules';
import {Tournament} from './tournament';

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
  introductionHistory(careerId:string,playerId:string,date:string){
    // Actual game participants retain their event history even after a transfer.
    // Registration alone does not establish a competitive debut.
    const appearances=this.db.prepare(`SELECT DISTINCT c.id,c.name,c.status,COALESCE(NULLIF(cc.stage,'ARCHIVED'),c.type) AS stage,f.scheduledDate,
      CASE WHEN EXISTS(SELECT 1 FROM competition_rosters r WHERE r.competitionId=c.id AND r.playerId=? AND r.teamId=g.blueTeamId)
        THEN g.blueTeamId WHEN EXISTS(SELECT 1 FROM competition_rosters r WHERE r.competitionId=c.id AND r.playerId=? AND r.teamId=g.orangeTeamId)
        THEN g.orangeTeamId ELSE NULL END AS registeredTeam,
      g.blueTeamId,g.orangeTeamId,g.id AS gameId
      FROM game_player_stats s JOIN game_results g ON g.id=s.gameResultId JOIN fixtures f ON f.id=g.fixtureId
      JOIN competitions c ON c.id=f.competitionId JOIN career_competitions cc ON cc.competitionId=c.id
      WHERE s.playerId=? AND cc.careerId=? AND f.scheduledDate<=? ORDER BY f.scheduledDate,c.id`).all(playerId,playerId,playerId,careerId,date);
    const debut=appearances.find(a=>['QUALIFIER','REGIONAL','MAJOR','LCQ','WORLDS','KICKOFF','CLUB_KICKOFF_OPEN','CLUB_KICKOFF','CLUB_LEAGUE_OPEN','CLUB_LEAGUE','CLUB_FINALE'].includes(a.stage));
    const finishes:{text:string;place:number;date:string}[]=[];
    const visited=new Set<string>();
    for(const a of appearances.filter(a=>a.stage==='WORLDS'&&a.status==='completed')){
      if(visited.has(a.id))continue;visited.add(a.id);
      const completedDate=this.db.prepare("SELECT MAX(scheduledDate) AS date FROM fixtures WHERE competitionId=? AND status='completed'").get(a.id)?.date;
      if(!completedDate||completedDate>date)continue;
      const team=a.registeredTeam;
      const place=team?new Tournament(this.db).placements(a.id)?.get(team):null;
      if(place)finishes.push({text:worldsPlacement(place),place,date:completedDate});
    }
    for(const award of this.list(careerId,playerId))if(/^RLCS \d{4} World Champion$/.test(award.title||'')&&award.earnedDate<=date)
      finishes.push({text:'WORLD CHAMPION',place:1,date:award.earnedDate});
    return {debut:debut?{text:debut.name,date:debut.scheduledDate}:null,worlds:finishes.sort((a,b)=>a.place-b.place||a.date.localeCompare(b.date))[0]||null};
  }
  register(careerId:string,competitionId:string,teamId:string,players:{id:string}[],date:string){
    if(this.db.prepare('SELECT playerId FROM competition_rosters WHERE competitionId=? AND teamId=? LIMIT 1').get(competitionId,teamId))return;
    players.slice(0,4).forEach((p,i)=>this.db.prepare('INSERT OR IGNORE INTO competition_rosters VALUES (?,?,?,?,?,?)').run(competitionId,careerId,teamId,p.id,i<3?1:0,date));
  }
  list(careerId:string,playerId:string){return this.db.prepare('SELECT a.*,c.name AS competitionName FROM career_player_awards a JOIN competitions c ON c.id=a.competitionId WHERE a.careerId=? AND a.playerId=? ORDER BY earnedDate DESC,a.rowid DESC').all(careerId,playerId);}
  equipped(careerId:string,playerId:string){return this.list(careerId,playerId).find(a=>a.title)||null;}
  award(careerId:string,competition:any,teamId:string,date:string){
    if(!teamId||!['REGIONAL','MAJOR','WORLDS','INVITATIONAL','KICKOFF','CLUB_KICKOFF','CLUB_LEAGUE','CLUB_FINALE'].includes(competition.stage||competition.type))return [];
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
export function worldsPlacement(place:number){
  return place===1?'WORLD CHAMPION':place===2?'RUNNER-UP':place<=4?'3RD-4TH':place<=6?'5TH-6TH':place<=8?'7TH-8TH':place<=12?'9TH-12TH':place<=16?'13TH-16TH':place<=18?'17TH-18TH':'19TH-20TH';
}
