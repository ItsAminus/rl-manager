import type {AppDatabase} from './database';
import {v4 as uuid} from 'uuid';
import {addDays} from '../game/career-rules';

export function realismSchema(db:AppDatabase){
  db.exec(`
    CREATE TABLE IF NOT EXISTS club_accounts(careerId TEXT,teamId TEXT,debt INTEGER DEFAULT 0,creditLimit INTEGER,wageLimit INTEGER,corporateIncome INTEGER,overhead INTEGER,warningDate TEXT,breaches INTEGER DEFAULT 0,lastMonth TEXT,PRIMARY KEY(careerId,teamId));
    CREATE TABLE IF NOT EXISTS club_ledger(id TEXT PRIMARY KEY,careerId TEXT,teamId TEXT,date TEXT,category TEXT,amount INTEGER,description TEXT);
    CREATE TABLE IF NOT EXISTS manager_employment(careerId TEXT PRIMARY KEY,status TEXT DEFAULT 'employed',dismissedDate TEXT,reason TEXT);
    CREATE TABLE IF NOT EXISTS agent_approaches(careerId TEXT,playerId TEXT,role TEXT,date TEXT,expiresDate TEXT,willing INTEGER,reasons TEXT,PRIMARY KEY(careerId,playerId));
    CREATE TABLE IF NOT EXISTS scout_observations(careerId TEXT,playerId TEXT,observedDate TEXT,depth INTEGER,overall INTEGER,potential INTEGER,attributes TEXT,traits TEXT,form INTEGER,tendency TEXT,PRIMARY KEY(careerId,playerId));
    CREATE TABLE IF NOT EXISTS scouting_regions(id TEXT PRIMARY KEY,careerId TEXT,region TEXT,startedDate TEXT,endDate TEXT,nextReport TEXT,status TEXT,cost INTEGER);
    CREATE TABLE IF NOT EXISTS contract_payments(contractId TEXT PRIMARY KEY,paidMonths INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS deal_clauses(contractId TEXT PRIMARY KEY,careerId TEXT,playerId TEXT,buyerId TEXT,sellerId TEXT,baseFee INTEGER,profitPercent INTEGER DEFAULT 0,buybackFee INTEGER DEFAULT 0,buybackUntil TEXT,contribution INTEGER DEFAULT 0,contributionUntil TEXT,playingTime INTEGER DEFAULT 0,lastReview TEXT,breaches INTEGER DEFAULT 0,settled INTEGER DEFAULT 0);
  `);
  const columns=db.prepare('PRAGMA table_info(club_accounts)').all().map(c=>c.name);
  for(const [name,type] of [['insolventSince','TEXT'],['insolventMonths','INTEGER DEFAULT 0'],['finalWarningDate','TEXT']])if(!columns.includes(name))db.exec(`ALTER TABLE club_accounts ADD COLUMN ${name} ${type}`);
}
/** A payout and its receipt commit together; retries cannot credit it twice. */
export function payClubPrize(db:AppDatabase,careerId:string,teamId:string,competitionId:string,date:string,amount:number,name:string){
  if(!Number.isFinite(amount)||amount<=0)return false;
  return db.transaction(()=>{
    const id=`prize:${competitionId}:${teamId}`;
    if(db.prepare('SELECT id FROM club_ledger WHERE id=?').get(id))return false;
    if(!db.prepare('SELECT id FROM teams WHERE id=?').get(teamId))throw Error('Prize recipient club not found.');
    db.prepare('UPDATE teams SET cashBalance=COALESCE(cashBalance,0)+? WHERE id=?').run(amount,teamId);
    db.prepare('INSERT INTO club_ledger VALUES(?,?,?,?,?,?,?)').run(id,careerId,teamId,date,'Prize money',amount,name);
    return true;
  })();
}
export function clubMessage(db:AppDatabase,c:any,title:string,body:string,href='/finances'){
  db.prepare('INSERT INTO inbox_items(id,careerId,date,type,title,body,isRead,actions) VALUES(?,?,?,?,?,?,0,?)').run(uuid(),c.id,c.currentDate,'general',title,body,JSON.stringify([{label:'Review',action:'navigate',data:{href}}]));
}
export class ClubEconomy{
  constructor(private db:AppDatabase){}
  assertEmployed(id:string){const e=this.db.prepare('SELECT * FROM manager_employment WHERE careerId=?').get(id);if(e?.status==='dismissed')throw Error(`Career ended: you were dismissed on ${e.dismissedDate}. ${e.reason} This save cannot be resumed.`);}
  initialise(c:any){
    this.db.prepare("INSERT OR IGNORE INTO manager_employment(careerId,status) VALUES(?,'employed')").run(c.id);
    for(const t of this.db.prepare('SELECT t.* FROM teams t WHERE NOT EXISTS(SELECT 1 FROM club_accounts a WHERE a.careerId=? AND a.teamId=t.id)').all(c.id)){
      const wage=this.db.prepare('SELECT COALESCE(SUM(salary),0) n FROM contracts WHERE teamId=? AND isActive=1').get(t.id).n;
      const corporate=Math.round(Math.min(100000,Math.sqrt(Math.max(0,t.fanbase||0))*25)+(t.reputation||20)*75);
      const revenue=(t.sponsorIncome||0)+corporate;
      this.db.prepare('INSERT OR IGNORE INTO club_accounts(careerId,teamId,creditLimit,wageLimit,corporateIncome,overhead,lastMonth) VALUES(?,?,?,?,?,?,?)').run(c.id,t.id,Math.max(50000,revenue*3),Math.round(Math.max(10000,wage*1.1,revenue*.75,Math.max(0,t.cashBalance||0)/24)),corporate,Math.round(2000+(t.facilityLevel||1)*800+(t.coachRating||30)*25),c.currentDate.slice(0,7));
    }
  }
  overview(c:any){
    this.initialise(c);
    const a=this.db.prepare('SELECT * FROM club_accounts WHERE careerId=? AND teamId=?').get(c.id,c.teamId),t=this.db.prepare('SELECT * FROM teams WHERE id=?').get(c.teamId);
    const wages=this.db.prepare('SELECT COALESCE(SUM(salary),0) n FROM contracts WHERE teamId=? AND isActive=1').get(c.teamId).n;
    const contributions=this.contributions(c.id,c.teamId,c.currentDate),interest=Math.round(a.debt*.01);
    const revenue=(t.sponsorIncome||0)+a.corporateIncome+contributions.received;
    const expenses=wages+a.overhead+interest+contributions.paid;
    return {...a,...this.boardReview(c),cash:t.cashBalance,wages,revenue,expenses,net:revenue-expenses,interest,contributions,employment:this.db.prepare('SELECT * FROM manager_employment WHERE careerId=?').get(c.id),ledger:this.db.prepare('SELECT * FROM club_ledger WHERE careerId=? AND teamId=? ORDER BY date DESC,rowid DESC LIMIT 60').all(c.id,c.teamId)};
  }
  private boardReview(c:any){
    const a=this.db.prepare('SELECT * FROM club_accounts WHERE careerId=? AND teamId=?').get(c.id,c.teamId);
    const trophy=this.db.prepare(`SELECT MAX(earnedDate) date FROM (
      SELECT t.earnedDate FROM trophy_ceremonies t JOIN competitions co ON co.id=t.competitionId WHERE t.careerId=? AND t.winnerId=? AND co.status='completed' AND t.earnedDate<=?
      UNION ALL SELECT a.earnedDate FROM career_player_awards a JOIN competitions co ON co.id=a.competitionId WHERE a.careerId=? AND a.teamId=? AND co.status='completed' AND a.earnedDate<=?)`).get(c.id,c.teamId,c.currentDate,c.id,c.teamId,c.currentDate)?.date;
    const protectedUntil=trophy?addDays(trophy,180):null;
    const recoveryDeadline=a.insolventSince?addDays(a.insolventSince,180):null;
    return {protectedUntil,recoveryDeadline:recoveryDeadline&&protectedUntil&&protectedUntil>recoveryDeadline?protectedUntil:recoveryDeadline,financialPolicy:'Only sustained unpaid obligations can lead to dismissal. Wage-limit warnings alone cannot end your career. At least 180 recovery days, six insolvent monthly settlements and a final 30-day warning are required. Club trophies protect your job for 180 days.'};
  }
  private contributions(id:string,team:string,date:string){
    const rows=this.db.prepare('SELECT d.* FROM deal_clauses d JOIN contracts c ON c.id=d.contractId WHERE d.careerId=? AND c.isActive=1 AND d.contributionUntil>=?').all(id,date);
    return {received:rows.filter(d=>d.buyerId===team).reduce((n,d)=>n+d.contribution,0),paid:rows.filter(d=>d.sellerId===team).reduce((n,d)=>n+d.contribution,0)};
  }
  tick(c:any){
    this.initialise(c);
    const month=c.currentDate.slice(0,7);
    for(const a of this.db.prepare('SELECT * FROM club_accounts WHERE careerId=?').all(c.id)){
      const t=this.db.prepare('SELECT * FROM teams WHERE id=?').get(a.teamId);if(!t)continue;
      if(a.lastMonth!==month){
        const wages=this.db.prepare('SELECT COALESCE(SUM(co.salary),0) n FROM contracts co LEFT JOIN contract_payments cp ON cp.contractId=co.id WHERE co.teamId=? AND co.isActive=1 AND (cp.contractId IS NULL OR cp.paidMonths<co.duration)').get(t.id).n;
        this.db.prepare('UPDATE contract_payments SET paidMonths=paidMonths+1 WHERE contractId IN(SELECT id FROM contracts WHERE teamId=? AND isActive=1 AND contract_payments.paidMonths<duration)').run(t.id);
        const contributions=this.contributions(c.id,t.id,c.currentDate);
        const entries:[string,number][]=[['Sponsorship',t.sponsorIncome||0],['Corporate and commercial revenue',a.corporateIncome],['Wage contributions received',contributions.received],['Player wages',-wages],['Club operations',-a.overhead],['Debt interest',-Math.round(a.debt*.01)],['Wage contributions paid',-contributions.paid]];
        let cash=t.cashBalance+entries.reduce((n,e)=>n+e[1],0),debt=a.debt;
        if(cash<0){const draw=Math.min(-cash,Math.max(0,a.creditLimit-debt));cash+=draw;debt+=draw;if(draw)entries.push(['Credit line drawn',draw]);}
        else if(debt>0){const repayment=Math.min(debt,Math.floor(cash*.1));cash-=repayment;debt-=repayment;if(repayment)entries.push(['Debt repayment',-repayment]);}
        const net=entries.filter(e=>!['Credit line drawn','Debt repayment'].includes(e[0])).reduce((n,e)=>n+e[1],0);
        const breach=cash<0||wages>a.wageLimit||debt>a.creditLimit*.85||(net<0&&cash< -net*3);
        const breaches=breach?a.breaches+1:Math.max(0,a.breaches-1);
        const warningDate=breach?(a.warningDate||c.currentDate):null;
        this.db.prepare('UPDATE teams SET cashBalance=? WHERE id=?').run(cash,t.id);
        this.db.prepare('UPDATE club_accounts SET debt=?,lastMonth=?,breaches=?,warningDate=?,insolventMonths=? WHERE careerId=? AND teamId=?').run(debt,month,breaches,warningDate,cash<0?(a.insolventMonths||0)+1:0,c.id,t.id);
        for(const [category,amount] of entries)if(amount)this.db.prepare('INSERT INTO club_ledger VALUES(?,?,?,?,?,?,?)').run(uuid(),c.id,t.id,c.currentDate,category,amount,`${month} settlement`);
        if(t.id===c.teamId){
          clubMessage(this.db,c,breach?'Board advice: review club finances':'Monthly club accounts',`Revenue $${((t.sponsorIncome||0)+a.corporateIncome).toLocaleString()}; wages $${wages.toLocaleString()} against a $${a.wageLimit.toLocaleString()} limit; debt $${debt.toLocaleString()}. ${breach?'Reduce costs and restore cash reserves. Wage-limit warnings alone will not get you fired. Dismissal requires prolonged unpaid obligations and a final recovery warning.':'The board is monitoring sustainable spending.'}`);
        }
      }
    }
    const a=this.db.prepare('SELECT * FROM club_accounts WHERE careerId=? AND teamId=?').get(c.id,c.teamId),t=this.db.prepare('SELECT cashBalance FROM teams WHERE id=?').get(c.teamId);
    if(t.cashBalance>=0){
      this.db.prepare('UPDATE club_accounts SET insolventSince=NULL,insolventMonths=0,finalWarningDate=NULL WHERE careerId=? AND teamId=?').run(c.id,c.teamId);
    }else{
      if(!a.insolventSince){
        this.db.prepare('UPDATE club_accounts SET insolventSince=?,finalWarningDate=NULL WHERE careerId=? AND teamId=?').run(c.currentDate,c.id,c.teamId);
        clubMessage(this.db,c,'Board recovery plan — 180 days','The club has unpaid obligations. You have at least 180 days to restore a non-negative cash balance. Recent club trophies extend your protection. A final 30-day warning must also be served before dismissal.');
      }
      const review=this.boardReview(c);
      if(review.recoveryDeadline&&c.currentDate<addDays(review.recoveryDeadline,-30)&&a.finalWarningDate)this.db.prepare('UPDATE club_accounts SET finalWarningDate=NULL WHERE careerId=? AND teamId=?').run(c.id,c.teamId);
      if(review.recoveryDeadline&&c.currentDate>=addDays(review.recoveryDeadline,-30)&&!a.finalWarningDate){
        this.db.prepare('UPDATE club_accounts SET finalWarningDate=? WHERE careerId=? AND teamId=?').run(c.currentDate,c.id,c.teamId);
        clubMessage(this.db,c,'Final financial recovery warning',`Unpaid obligations remain. Restore a non-negative cash balance to keep your job. No dismissal can happen before ${review.recoveryDeadline}, six insolvent monthly settlements, and 30 days from this warning.`);
      }
      if(review.recoveryDeadline&&c.currentDate>=review.recoveryDeadline&&(a.insolventMonths||0)>=6&&a.finalWarningDate&&c.currentDate>=addDays(a.finalWarningDate,30)){
        const reason='The club has had unpaid obligations for at least 180 days and six monthly settlements, despite a final 30-day recovery warning. Any trophy protection has expired.';
        this.db.prepare("UPDATE manager_employment SET status='dismissed',dismissedDate=?,reason=? WHERE careerId=? AND status='employed'").run(c.currentDate,reason,c.id);
        clubMessage(this.db,c,'Dismissed — career over',`${reason} Your management career has ended. A recovery archive is retained on disk.`);
      }
    }
    this.reviewPromises(c);
  }
  private reviewPromises(c:any){
    for(const d of this.db.prepare('SELECT d.*,p.teamId,p.gamertag FROM deal_clauses d JOIN players p ON p.id=d.playerId JOIN contracts co ON co.id=d.contractId WHERE d.careerId=? AND co.isActive=1 AND d.playingTime>0 AND (d.lastReview IS NULL OR d.lastReview<=?)').all(c.id,addDays(c.currentDate,-30))){
      const contract=this.db.prepare('SELECT startDate FROM contracts WHERE id=?').get(d.contractId);
      const fixtures=this.db.prepare("SELECT id,scheduledDate FROM fixtures WHERE status='completed' AND scheduledDate>=? AND scheduledDate<=? AND (homeTeamId=? OR awayTeamId=?) ORDER BY scheduledDate DESC LIMIT 10").all(contract.startDate,c.currentDate,d.buyerId,d.buyerId);
      if(fixtures.length<6||(d.lastReview&&fixtures[0].scheduledDate<=d.lastReview))continue;
      const played=fixtures.filter(f=>this.db.prepare('SELECT 1 FROM game_player_stats s JOIN game_results g ON g.id=s.gameResultId WHERE g.fixtureId=? AND s.playerId=? LIMIT 1').get(f.id,d.playerId)).length;
      const broken=played/fixtures.length<d.playingTime/100;
      this.db.prepare('UPDATE deal_clauses SET lastReview=?,breaches=? WHERE contractId=?').run(c.currentDate,broken?d.breaches+1:0,d.contractId);
      if(broken){this.db.prepare('UPDATE players SET morale=MAX(0,morale-10) WHERE id=?').run(d.playerId);if(d.breaches>=1)this.db.prepare('INSERT INTO manager_relationships(careerId,playerId,transferRequested) VALUES(?,?,1) ON CONFLICT(careerId,playerId) DO UPDATE SET transferRequested=1').run(c.id,d.playerId);if(d.buyerId===c.teamId)clubMessage(this.db,c,`${d.gamertag}: playing-time promise broken`,`Promised involvement in ${d.playingTime}% of series, selected in ${played}/${fixtures.length}. Repeated breaches lead to a transfer request.`,'/dressing-room');}
    }
  }
}

export {clauseTerms} from '../game/deal-terms';
export function settleSellOn(db:AppDatabase,careerId:string,playerId:string,seller:string|null,buyer:string,fee:number){
  if(!seller)return;
  for(const d of db.prepare('SELECT * FROM deal_clauses WHERE careerId=? AND playerId=? AND buyerId=? AND settled=0').all(careerId,playerId,seller)){
    const amount=Math.round(Math.max(0,fee-d.baseFee)*d.profitPercent/100);
    if(amount&&d.sellerId&&d.sellerId!==seller){db.prepare('UPDATE teams SET cashBalance=cashBalance-? WHERE id=?').run(amount,seller);db.prepare('UPDATE teams SET cashBalance=cashBalance+? WHERE id=?').run(amount,d.sellerId);}
    db.prepare('UPDATE deal_clauses SET settled=1 WHERE contractId=?').run(d.contractId);
  }
}
