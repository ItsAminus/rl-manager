import type {AppDatabase} from './database';
import {careerMode} from '../game/career-mode';
import {v4 as uuid} from 'uuid';
import {addDays} from '../game/career-rules';
import {careerWindow} from './transfer-calendar';
import {recruitmentInterest} from './recruitment-interest';
const hash=(s:string)=>{let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};

/** Simulated market news has a real, saved lifecycle. A rumour can fail; a
 * completed move changes this save's roster/contracts/finances atomically. */
export class TransferMarket {
  constructor(private db:AppDatabase){}
  private news(c:any,story:any,status:string){
    const p=this.db.prepare('SELECT gamertag FROM players WHERE id=?').get(story.playerId);
    const seller=this.db.prepare('SELECT name FROM teams WHERE id=?').get(story.fromTeamId)?.name||'free agency';
    const buyer=this.db.prepare('SELECT name FROM teams WHERE id=?').get(story.toTeamId)?.name;
    const body=status==='rumour'?`${buyer} are exploring a move for ${p.gamertag} from ${seller}. ${story.reason} No agreement has been reached.`
      :status==='completed'?`${p.gamertag} has joined ${buyer} from ${seller}. The clubs completed a $${story.fee.toLocaleString()} move.`
      :`${buyer}'s approach for ${p.gamertag} has ended without an agreement. ${story.reason}`;
    this.db.prepare('INSERT INTO inbox_items(id,careerId,date,type,title,body,isRead,actions) VALUES (?,?,?,?,?,?,0,?)').run(uuid(),c.id,c.currentDate,'transfer_news',status==='rumour'?`Transfer watch: ${p.gamertag}`:status==='completed'?`Confirmed: ${p.gamertag} to ${buyer}`:`Talks end: ${p.gamertag}`,body,JSON.stringify([{label:'Open transfer news',action:'navigate',data:{href:'/social'}}]));
  }
  tick(careerId:string){
    if(careerMode(this.db,careerId)==='Path To Glory')return;
    const c=this.db.prepare('SELECT * FROM careers WHERE id=?').get(careerId);if(!c)return;
    this.db.transaction(()=>{
      const open=careerWindow(this.db,careerId,c.currentDate).open;
      for(const story of this.db.prepare("SELECT * FROM market_stories WHERE careerId=? AND status='rumour' AND (resolveDate<=? OR ?=0)").all(careerId,c.currentDate,open?1:0)){
        const p=this.db.prepare('SELECT * FROM players WHERE id=?').get(story.playerId),buyer=this.db.prepare('SELECT * FROM teams WHERE id=?').get(story.toTeamId);
        let reason=!open?'The transfer window closed.':!p||p.teamId!==story.fromTeamId?'The player is no longer available on those terms.':!buyer||buyer.cashBalance<story.fee+story.salary?'The buyer could not fund the deal.':'';
        if(!reason){const interest=recruitmentInterest(this.db,careerId,buyer.id,p,c.currentDate);if(!interest.willing)reason=interest.reasons[0];else if(story.salary<interest.demands.salary*.95)reason='The proposed salary did not meet the player’s contract demands.';}
        const sellerCount=story.fromTeamId?this.db.prepare('SELECT COUNT(*) AS n FROM players WHERE teamId=?').get(story.fromTeamId).n:0;
        if(!reason&&story.fromTeamId&&sellerCount<=3)reason='The selling team could not secure a replacement for its starting three.';
        if(!reason&&hash(story.id)%5===0)reason='Personal terms could not be agreed.';
        if(story.toTeamId===c.teamId||story.fromTeamId===c.teamId)reason='Your club requires the manager to approve its transfers.';
        if(reason){
          this.db.prepare("UPDATE market_stories SET status='collapsed',reason=? WHERE id=?").run(reason,story.id);this.news(c,{...story,reason},'collapsed');continue;
        }
        this.db.prepare('UPDATE teams SET cashBalance=cashBalance-? WHERE id=?').run(story.fee+story.salary,buyer.id);
        if(story.fromTeamId)this.db.prepare('UPDATE teams SET cashBalance=cashBalance+? WHERE id=?').run(story.fee,story.fromTeamId);
        this.db.prepare('UPDATE players SET teamId=?,morale=MIN(100,COALESCE(morale,50)+5) WHERE id=?').run(buyer.id,p.id);
        this.db.prepare('UPDATE contracts SET isActive=0 WHERE playerId=?').run(p.id);
        this.db.prepare('INSERT INTO contracts(id,playerId,teamId,salary,duration,startDate,endDate,signingBonus,buyout,isActive) VALUES (?,?,?,?,?,?,?,?,?,1)').run(uuid(),p.id,buyer.id,story.salary,24,c.currentDate,addDays(c.currentDate,730),0,story.fee);
        this.db.prepare('INSERT INTO transfers(id,playerId,fromTeamId,toTeamId,fee,date,type,careerId) VALUES (?,?,?,?,?,?,?,?)').run(uuid(),p.id,story.fromTeamId,buyer.id,story.fee,c.currentDate,'signing',careerId);
        this.db.prepare("UPDATE market_stories SET status='completed' WHERE id=?").run(story.id);this.news(c,story,'completed');
      }
      if(!open)return;
      const latest=this.db.prepare('SELECT date FROM market_stories WHERE careerId=? ORDER BY date DESC LIMIT 1').get(careerId);
      if(latest&&c.currentDate<addDays(latest.date,2))return;
      const teams=this.db.prepare('SELECT t.*,COUNT(p.id) AS rosterCount,AVG(p.overall) AS average FROM teams t JOIN players p ON p.teamId=t.id WHERE t.id<>? GROUP BY t.id HAVING COUNT(p.id)>=3 AND t.cashBalance>20000 ORDER BY t.id').all(c.teamId);
      if(!teams.length)return;
      const shift=hash(careerId+c.currentDate)%teams.length;
      for(let i=0;i<Math.min(teams.length,40);i++){
        const buyer=teams[(shift+i)%teams.length];
        const players=this.db.prepare(`SELECT p.*,t.name AS sellerName,(SELECT COUNT(*) FROM players x WHERE x.teamId=p.teamId) AS sellerCount
          FROM players p LEFT JOIN teams t ON t.id=p.teamId WHERE (p.teamId IS NULL OR p.teamId NOT IN (?,?)) AND p.region=?
          AND p.overall>=? AND p.overall<=?
          AND NOT EXISTS(SELECT 1 FROM market_stories s WHERE s.careerId=? AND s.playerId=p.id AND s.date>=?) ORDER BY p.overall DESC,p.id LIMIT 12`)
          .all(c.teamId,buyer.id,buyer.region,buyer.average-2,Math.min(99,buyer.average+10),careerId,addDays(c.currentDate,-21));
        const p=players.find(p=>(p.teamId?Math.round((p.marketValue||40000)*.7):0)+Math.max(3000,Math.round((p.marketValue||40000)/20))<buyer.cashBalance);
        if(!p)continue;
        const demand=recruitmentInterest(this.db,careerId,buyer.id,p,c.currentDate).demands;
        const story={id:uuid(),playerId:p.id,fromTeamId:p.teamId,toTeamId:buyer.id,fee:p.teamId?Math.round((p.marketValue||40000)*.7):0,salary:demand.salary,reason:p.teamId?'The buyer is exploring a change to its starting rotation; the player has not agreed to leave.':'The buyer is assessing a free-agent addition to its rotation.'};
        if(story.fee+story.salary>buyer.cashBalance)continue;
        this.db.prepare('INSERT INTO market_stories VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(story.id,c.id,p.id,p.teamId,buyer.id,c.currentDate,addDays(c.currentDate,3),'rumour',story.fee,story.salary,story.reason);
        this.news(c,story,'rumour');break;
      }
    })();
  }
}
