import {beforeAll,beforeEach,expect,it} from 'vitest';
import initSqlJs from 'sql.js';
import {sqlAdapter} from './sql-fixture';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {calendarMonth,paymentPlan,clubFeeQuote,negotiateClubFee,agreedTransfer,settleTransferPayments,transferObligations} from '../src/main/transfer-agreements';
import {boardVision,negotiateVision,reviewBoardVision} from '../src/main/board-visions';
import {ClubEconomy} from '../src/main/club-economy';
import {CareerManagement} from '../src/main/career-management';
import {RecruitmentNetwork} from '../src/main/recruitment-network';
let SQL:any,db:any;
const c={id:'save',teamId:'own',currentDate:'2026-01-01',mode:'Manager Career'};
beforeAll(async()=>{SQL=await initSqlJs();});
beforeEach(()=>{db=sqlAdapter(new SQL.Database());runMigration(db);db.exec(`INSERT INTO teams(id,name,region,cashBalance,reputation,sponsorIncome,coachRating,facilityLevel) VALUES('own','Own','Europe',500000,90,20000,60,1),('other','Other','Europe',100000,70,20000,60,1);
 INSERT INTO careers(id,managerName,teamId,currentDate) VALUES('save','Manager','own','2026-01-01');
 INSERT INTO players(id,gamertag,teamId,region,age,overall,potential,morale,marketValue,reputation) VALUES('p','Target','other','Europe',20,75,85,70,50000,45);
 INSERT INTO player_traits(playerId) VALUES('p');INSERT INTO player_attributes(playerId) VALUES('p');
 INSERT INTO contracts(id,playerId,teamId,salary,duration,startDate,endDate,buyout,isActive) VALUES('old','p','other',7000,24,'2025-01-01','2027-01-01',50000,1);`);});
it('uses calendar months, conserves every dollar and rejects malformed schedules',()=>{
 expect(calendarMonth('2028-01-31',1)).toBe('2028-02-29');expect(calendarMonth('2027-01-31',1)).toBe('2027-02-28');
 const plan=paymentPlan(10001,40,6,'2026-01-31');expect(plan.upfront+plan.schedule.reduce((n,r)=>n+r.amount,0)).toBe(10001);expect(plan.schedule[0].dueDate).toBe('2026-02-28');expect(plan.schedule[1].dueDate).toBe('2026-03-31');
 for(const terms of [[100,0,6],[100,40,0],[NaN,100,0],[100,100,6]])expect(()=>paymentPlan(...terms as [number,number,number])).toThrow();
});
it('persists seller counters, accepts terms separately, and expires on ownership/date changes',()=>{
 const first=negotiateClubFee(db,c,'p',{fee:20000,upfrontPercent:40,months:6});expect(first.status).toBe('counter');
 const counter=clubFeeQuote(db,c,'p')!.talk.terms;expect(counter.upfrontPercent).toBe(60);
 expect(negotiateClubFee(db,c,'p',null,true).status).toBe('agreed');expect(agreedTransfer(db,c,'p')!.terms.fee).toBe(counter.fee);
 expect(agreedTransfer(db,{...c,id:'foreign'},'p')).toBeNull();expect(agreedTransfer(db,{...c,currentDate:'2026-01-09'},'p')).toBeNull();
 db.exec("UPDATE players SET teamId='own' WHERE id='p'");expect(agreedTransfer(db,c,'p')).toBeNull();
});
it('ends repeated low offers, refuses closed-window talks and requires a counter before accepting',()=>{
 expect(()=>negotiateClubFee(db,c,'p',null,true)).toThrow(/no current/);
 for(let i=0;i<4;i++)negotiateClubFee(db,c,'p',{fee:1,upfrontPercent:100,months:0});
 expect(()=>negotiateClubFee(db,c,'p',{fee:50000,upfrontPercent:100,months:0})).toThrow(/reopen/);
 expect(()=>negotiateClubFee(db,{...c,currentDate:'2026-11-01'},'p',{fee:50000,upfrontPercent:100,months:0})).toThrow(/closed/);
});
it('settles liabilities once, across missed dates, even after resale, without touching another career',()=>{
 for(const [id,career,date,amount] of [['a','save','2026-02-01',1000],['b','save','2026-03-01',1001],['x','foreign','2026-02-01',9000]])db.prepare('INSERT INTO transfer_payments VALUES(?,?,?,?,?,?,?,?,NULL)').run(id,career,'deal','p','own','other',date,amount);
 db.exec("UPDATE players SET teamId=NULL WHERE id='p';UPDATE contracts SET isActive=0");
 settleTransferPayments(db,{...c,currentDate:'2026-03-02'});settleTransferPayments(db,{...c,currentDate:'2026-03-02'});
 expect(db.prepare("SELECT cashBalance FROM teams WHERE id='own'").get().cashBalance).toBe(497999);
 expect(db.prepare("SELECT cashBalance FROM teams WHERE id='other'").get().cashBalance).toBe(102001);
 expect(db.prepare('SELECT COUNT(*) n FROM club_ledger').get().n).toBe(4);expect(transferObligations(db,c).payable).toBe(0);expect(transferObligations(db,{...c,id:'foreign'}).payable).toBe(9000);
});
it('registers only upfront cash, the full transfer valuation and persistent instalments together',()=>{
 const m=new CareerManagement(db),n=new RecruitmentNetwork(db);
 negotiateClubFee(db,c,'p',{fee:55000,upfrontPercent:60,months:6});n.approach(c,'p');
 const q=m.signingQuote(c.id,'p'),r=m.sign(c.id,'p',{...q.demands,duration:24,buyout:200000,role:'Core Starter',clubAgreement:true});
 expect(r.deferred).toBe(22000);expect(r.upfront).toBe(33000);expect(db.prepare('SELECT fee FROM transfers WHERE playerId=?').get('p').fee).toBe(55000);
 expect(transferObligations(db,c).payable).toBe(22000);expect(db.prepare("SELECT cashBalance FROM teams WHERE id='other'").get().cashBalance).toBe(133000);
 expect(db.prepare("SELECT cashBalance FROM teams WHERE id='own'").get().cashBalance).toBe(500000-33000-q.demands.salary-q.demands.bonus);
});
it('blocks an unaffordable deferred purchase and rolls back all transfer changes',()=>{
 const m=new CareerManagement(db);negotiateClubFee(db,c,'p',{fee:55000,upfrontPercent:60,months:6});new RecruitmentNetwork(db).approach(c,'p');
 db.exec("UPDATE teams SET cashBalance=70000,sponsorIncome=0 WHERE id='own';UPDATE club_accounts SET corporateIncome=0 WHERE teamId='own'");
 const q=m.signingQuote(c.id,'p');new ClubEconomy(db).initialise(c);db.exec("UPDATE club_accounts SET corporateIncome=0,wageLimit=100000 WHERE teamId='own'");
 expect(()=>m.sign(c.id,'p',{...q.demands,duration:24,buyout:200000,role:'Core Starter',clubAgreement:true})).toThrow(/projected cash/);
 expect(db.prepare("SELECT teamId FROM players WHERE id='p'").get().teamId).toBe('other');expect(db.prepare('SELECT * FROM transfer_payments').all()).toHaveLength(0);
});
it('offers real board trade-offs, persists a signed vision and cannot renegotiate it daily',()=>{
 new ClubEconomy(db).initialise(c);expect(boardVision(db,c)!.counter.winRate).toBe(60);
 expect(negotiateVision(db,c,{winRate:45,wagePercent:125,youthPercent:0}).message).toContain('counters');
 expect(boardVision(db,c)!.status).toBe('negotiating');
 negotiateVision(db,c,{winRate:72,wagePercent:125,youthPercent:0});expect(boardVision(db,c)!.status).toBe('agreed');
 expect(()=>negotiateVision(db,c,{winRate:45,wagePercent:100,youthPercent:0})).toThrow(/annual review/);
 expect(boardVision(db,{...c,id:'other'})!.confidence).toBe(60);
});
it('reviews once, does not penalise too little match evidence, and retains the three-year vision',()=>{
 const e=new ClubEconomy(db);e.initialise(c);negotiateVision(db,c,null,true);const v=boardVision(db,c)!;
 reviewBoardVision(db,{...c,currentDate:'2027-01-01'});const next=boardVision(db,{...c,currentDate:'2027-01-01'})!;
 expect(next.confidence).toBe(65);expect(next.longDeadline).toBe(v.longDeadline);expect(next.status).toBe('negotiating');
 reviewBoardVision(db,{...c,currentDate:'2027-01-01'});expect(db.prepare("SELECT COUNT(*) n FROM inbox_items WHERE title='Annual board vision review'").get().n).toBe(1);
});
it('judges sporting and youth promises from actual career results and registered selections',()=>{
 new ClubEconomy(db).initialise(c);negotiateVision(db,c,{winRate:60,wagePercent:110,youthPercent:25});
 db.exec("INSERT INTO competitions(id,name) VALUES('event','Event'),('foreign','Foreign');INSERT INTO career_competitions(competitionId,careerId) VALUES('event','save'),('foreign','another');INSERT INTO competition_rosters(competitionId,careerId,teamId,playerId,starter) VALUES('event','save','own','p',1)");
 for(let i=0;i<11;i++){
  db.prepare("INSERT INTO fixtures(id,competitionId,homeTeamId,awayTeamId,scheduledDate,status,homeScore,awayScore) VALUES(?,'event','own','other',?,'completed',?,?)").run('f'+i,i===10?'2028-01-01':'2026-02-01',i<7?3:0,i<7?0:3);
  if(i<3){db.prepare("INSERT INTO game_results(id,fixtureId,blueTeamId,orangeTeamId) VALUES(?,?,'own','other')").run('g'+i,'f'+i);db.prepare('INSERT INTO game_player_stats(id,gameResultId,playerId) VALUES(?,?,?)').run('s'+i,'g'+i,'p');}
 }
 db.exec("INSERT INTO fixtures(id,competitionId,homeTeamId,awayTeamId,scheduledDate,status,homeScore,awayScore) VALUES('foreign-f','foreign','own','other','2026-02-01','completed',0,3)");
 const v=boardVision(db,{...c,currentDate:'2026-12-31'})!;expect(v.progress).toMatchObject({series:10,winRate:70,youthPercent:30});
 reviewBoardVision(db,{...c,currentDate:'2027-01-01'});expect(boardVision(db,{...c,currentDate:'2027-01-01'})!.confidence).toBe(75);
});
