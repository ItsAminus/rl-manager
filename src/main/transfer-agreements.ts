import type {AppDatabase} from './database';
import {addDays} from '../game/career-rules';
import {careerWindow} from './transfer-calendar';
import {knownProspect} from './talent-pool';

export function calendarMonth(date:string,months:number){
 const d=new Date(date+'T12:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);
 const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10);
}
export function paymentPlan(fee:number,upfrontPercent=100,months=0,date='2026-01-01'){
 if(!Number.isSafeInteger(fee)||fee<0||fee>100000000||!Number.isInteger(upfrontPercent)||upfrontPercent<30||upfrontPercent>100||![0,3,6,12].includes(months)||(!months&&upfrontPercent!==100)||(months&&upfrontPercent===100))throw Error('Choose a valid fee, 30–99% upfront with 3, 6 or 12 monthly instalments, or full cash.');
 const upfront=Math.ceil(fee*upfrontPercent/100),deferred=fee-upfront;
 const schedule=Array.from({length:months},(_,i)=>({dueDate:calendarMonth(date,i+1),amount:Math.floor(deferred/months)+(i<deferred%months?1:0)})).filter(p=>p.amount>0);
 return {fee,upfrontPercent,months,upfront,deferred,schedule};
}
export function transferObligations(db:AppDatabase,c:any){
 const rows=db.prepare(`SELECT p.*,pl.gamertag,b.name buyer,s.name seller FROM transfer_payments p LEFT JOIN players pl ON pl.id=p.playerId JOIN teams b ON b.id=p.buyerId JOIN teams s ON s.id=p.sellerId WHERE p.careerId=? AND (p.buyerId=? OR p.sellerId=?) ORDER BY p.dueDate,p.id`).all(c.id,c.teamId,c.teamId);
 const pending=rows.filter(r=>!r.paidDate);return {rows,payable:pending.filter(r=>r.buyerId===c.teamId).reduce((n,r)=>n+r.amount,0),receivable:pending.filter(r=>r.sellerId===c.teamId).reduce((n,r)=>n+r.amount,0)};
}
export function settleTransferPayments(db:AppDatabase,c:any){
 return db.transaction(()=>{
  for(const p of db.prepare('SELECT * FROM transfer_payments WHERE careerId=? AND paidDate IS NULL AND dueDate<=? ORDER BY dueDate,id').all(c.id,c.currentDate)){
   // The obligation survives resale/expiry. The seller receives its money; any
   // unfunded buyer balance enters the existing credit/recovery system.
   db.prepare('UPDATE teams SET cashBalance=cashBalance-? WHERE id=?').run(p.amount,p.buyerId);
   db.prepare('UPDATE teams SET cashBalance=cashBalance+? WHERE id=?').run(p.amount,p.sellerId);
   db.prepare('UPDATE transfer_payments SET paidDate=? WHERE id=? AND paidDate IS NULL').run(c.currentDate,p.id);
   for(const [team,amount] of [[p.buyerId,-p.amount],[p.sellerId,p.amount]])db.prepare('INSERT INTO club_ledger VALUES(?,?,?,?,?,?,?)').run(p.id+':'+team,c.id,team,c.currentDate,'Transfer instalment',amount,`Deal ${p.dealId}; due ${p.dueDate}`);
  }
 })();
}
export function clubFeeQuote(db:AppDatabase,c:any,playerId:string){
 if(!knownProspect(db,c,playerId))throw Error('Your scouts have not discovered this player.');
 const p=db.prepare('SELECT * FROM players WHERE id=?').get(playerId);if(!p)throw Error('Player not found.');
 if(!p.teamId||p.teamId===c.teamId)return null;
 const seller=db.prepare('SELECT * FROM teams WHERE id=?').get(p.teamId),co=db.prepare('SELECT * FROM contracts WHERE playerId=? AND isActive=1').get(p.id);
 const buyback=db.prepare('SELECT buybackFee FROM deal_clauses WHERE careerId=? AND playerId=? AND sellerId=? AND buyerId=? AND settled=0 AND buybackFee>0 AND buybackUntil>=? ORDER BY rowid DESC LIMIT 1').get(c.id,p.id,c.teamId,p.teamId,c.currentDate);
 const listing=db.prepare('SELECT * FROM transfer_listings WHERE careerId=? AND playerId=?').get(c.id,p.id);
 const core=db.prepare('SELECT COUNT(*) n FROM players WHERE teamId=? AND overall>?').get(p.teamId,p.overall).n<3;
 const expiring=co?.endDate&&co.endDate<=addDays(c.currentDate,180);
 const asking=buyback?Math.min(Math.max(co?.buyout||0,p.marketValue||0),buyback.buybackFee):Math.max(co?.buyout||0,p.marketValue||0,listing?.askingPrice||0);
 const pressured=(seller.cashBalance||0)<0,minimumUpfront=pressured?75:core&&!listing?60:40;
 const floor=Math.ceil(asking*(buyback?1:listing||expiring||p.morale<40?.74:core?.94:.84));
 const saved=db.prepare('SELECT * FROM club_fee_talks WHERE careerId=? AND playerId=?').get(c.id,p.id);
 const valid=saved&&saved.buyerId===c.teamId&&saved.sellerId===p.teamId&&saved.expiresDate>=c.currentDate;
 const talk=valid?{...saved,terms:JSON.parse(saved.terms),history:JSON.parse(saved.history)}:null;
 return {sellerId:p.teamId,seller:seller.name,asking,minimumUpfront,core,expiring:!!expiring,listed:!!listing,pressured,talk,
  reason:buyback?'Your saved buy-back option sets the cash price.':pressured?'The selling club needs immediate cash.':listing?'The player is available for transfer.':expiring?'Contract expiry gives you bargaining leverage.':core?'A key starter: the club needs a premium and a credible replacement.':'The club will consider a sensible package.',
  // Never expose the private acceptance floor to the renderer.
  floor};
}
export function agreedTransfer(db:AppDatabase,c:any,playerId:string){const q=clubFeeQuote(db,c,playerId);return q?.talk?.status==='agreed'?q.talk:null;}
export function negotiateClubFee(db:AppDatabase,c:any,playerId:string,input:any,acceptCounter=false){
 if(c.mode==='Path To Glory')throw Error('Transfers are unavailable in Path To Glory.');
 if(!careerWindow(db,c.id,c.currentDate).open)throw Error('The transfer window is closed.');
 const q=clubFeeQuote(db,c,playerId);if(!q)throw Error('Club bargaining requires a player at another club.');
 if(q.talk?.status==='agreed')throw Error('The club agreement is already fixed. Finish personal terms or wait for it to expire.');
 if(q.talk?.status==='withdrawn')throw Error(`The seller will not reopen talks before ${addDays(q.talk.expiresDate,1)}.`);
 if(acceptCounter&&q.talk?.status!=='counter')throw Error('There is no current counteroffer to accept.');
 const terms=acceptCounter?q.talk.terms:input;
 const plan=paymentPlan(terms.fee,terms.upfrontPercent,terms.months,c.currentDate);
 const rounds=(q.talk?.rounds||0)+1;
 // Deferred money is less attractive; discounts never erase the total liability.
 const required=Math.ceil(q.floor*(1+(1-plan.upfrontPercent/100)*.12));
 const accepted=(acceptCounter||plan.fee>=required)&&plan.upfrontPercent>=q.minimumUpfront;
 const status=accepted?'agreed':rounds>=4?'withdrawn':'counter';
 const counter=accepted?plan:{...paymentPlan(Math.max(required,Math.round(q.asking*(1-Math.min(rounds,3)*.015))),Math.max(plan.upfrontPercent,q.minimumUpfront),plan.months||0,c.currentDate)};
 const message=accepted?`${q.seller} accepts $${plan.fee.toLocaleString()}: $${plan.upfront.toLocaleString()} now and $${plan.deferred.toLocaleString()} over ${plan.months} months. Subject to personal terms, board affordability and registration.`:status==='withdrawn'?'The seller has ended these talks for seven days.':`${q.seller} counters at $${counter.fee.toLocaleString()}, ${counter.upfrontPercent}% upfront${counter.months?` and ${counter.months} monthly instalments`:''}.`;
 const history=[...(q.talk?.history||[]),{date:c.currentDate,offer:plan,response:message}];
 db.prepare('INSERT OR REPLACE INTO club_fee_talks VALUES(?,?,?,?,?,?,?,?,?)').run(c.id,playerId,c.teamId,q.sellerId,status,rounds,addDays(c.currentDate,7),JSON.stringify(counter),JSON.stringify(history));
 return {success:true,status,message};
}
