import type {AppDatabase} from './database';
export class TrophyCeremonies {
  constructor(private db:AppDatabase){}
  record(careerId:string,competition:any,winnerId:string,date:string,winnerName?:string){
    if(!winnerId||!['REGIONAL','MAJOR','WORLDS','INVITATIONAL','KICKOFF','FIFAE','CLUB_KICKOFF','CLUB_LEAGUE','CLUB_FINALE'].includes(competition.stage||competition.type))return;
    if(this.db.prepare('SELECT status FROM competitions WHERE id=?').get(competition.id)?.status!=='completed')return;
    const name=winnerName||this.db.prepare('SELECT name FROM teams WHERE id=?').get(winnerId)?.name;if(!name)return;
    this.db.prepare('INSERT OR IGNORE INTO trophy_ceremonies(careerId,competitionId,winnerId,winnerName,earnedDate,seen) VALUES (?,?,?,?,?,0)').run(careerId,competition.id,winnerId,name,date);
  }
  pending(careerId:string,eventId=''){
    return this.db.prepare(`SELECT t.*,c.name AS competitionName,c.type FROM trophy_ceremonies t JOIN competitions c ON c.id=t.competitionId
      WHERE t.careerId=? AND t.seen=0 AND c.status='completed'
      AND (t.winnerId=(SELECT teamId FROM careers WHERE id=t.careerId) OR c.region='GLOBAL' OR t.competitionId=?)
      ORDER BY t.earnedDate,t.rowid LIMIT 1`).get(careerId,eventId)||null;
  }
  dismiss(careerId:string,id:string){this.db.prepare('UPDATE trophy_ceremonies SET seen=1 WHERE careerId=? AND competitionId=?').run(careerId,id);return {success:true};}
}
