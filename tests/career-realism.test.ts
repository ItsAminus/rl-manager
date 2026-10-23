import {beforeAll,beforeEach,expect,it} from 'vitest';
import initSqlJs from 'sql.js';
import {sqlAdapter} from './sql-fixture';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {ClubEconomy,settleSellOn,payClubPrize} from '../src/main/club-economy';
import {RecruitmentNetwork} from '../src/main/recruitment-network';
import {CareerManagement} from '../src/main/career-management';
import {clauseTerms} from '../src/game/deal-terms';
import {Tournament} from '../src/main/tournament';
import {officialRules} from '../src/game/official-competition-rules';
let SQL:any,raw:any,db:any,m:CareerManagement;
beforeAll(async()=>{SQL=await initSqlJs();});
beforeEach(()=>{
  raw=new SQL.Database();db=sqlAdapter(raw);runMigration(db);m=new CareerManagement(db);
  db.exec(`INSERT INTO careers(id,managerName,teamId,currentDate) VALUES('c','Coach','us','2025-09-01');
    INSERT INTO teams(id,name,region,reputation,cashBalance,sponsorIncome,fanbase) VALUES('us','Our Club','Europe',90,1000000,20000,10000),('seller','Selling Club','Europe',70,300000,10000,2000),('third','Third Club','Europe',90,500000,30000,10000);
    INSERT INTO players(id,gamertag,teamId,region,overall,potential,reputation,morale,marketValue) VALUES('target','Target','seller','Europe',80,89,75,80,50000),('unknown','Unknown',NULL,'Europe',73,91,50,70,10000);
    INSERT INTO contracts(id,playerId,teamId,salary,duration,startDate,endDate,buyout,isActive) VALUES('old','target','seller',5000,24,'2025-01-01','2027-01-01',50000,1);`);
  for(let i=0;i<3;i++)db.prepare('INSERT INTO players(id,gamertag,teamId,region,overall,potential,reputation,marketValue) VALUES(?,?,?,\'Europe\',80,85,75,50000)').run('us'+i,'Starter '+i,'us');
});
const career=()=>m.career('c');
const date=(d:string)=>db.prepare("UPDATE careers SET currentDate=? WHERE id='c'").run(d);
const terms=()=>({salary:10000,bonus:30000,duration:24,buyout:150000,role:'Core Starter',playingTime:60});
const consent=()=>new RecruitmentNetwork(db).approach(career(),'target');
it('requires saved agent permission and expires it, without touching cash or rosters',()=>{
  expect(()=>m.sign('c','target',terms())).toThrow(/agent/);
  expect(consent().willing).toBe(true);
  date('2025-10-02');expect(m.signingQuote('c','target').needsApproach).toBe(true);
  expect(db.prepare("SELECT teamId FROM players WHERE id='target'").get().teamId).toBe('seller');
  expect(db.prepare("SELECT cashBalance FROM teams WHERE id='us'").get().cashBalance).toBe(1000000);
});
it('explains sporting refusal and does not reroll an agent response by reopening',()=>{
  db.exec("UPDATE players SET overall=95,reputation=95 WHERE id='target';UPDATE teams SET reputation=40 WHERE id='us'");
  const n=new RecruitmentNetwork(db),a=n.approach(career(),'target');
  expect(a.willing).toBe(false);expect(a.reasons.join(' ')).toMatch(/continental reputation/);
  expect(n.approach(career(),'target')).toMatchObject({willing:false,reasons:a.reasons});
  expect(db.prepare('SELECT COUNT(*) n FROM inbox_items').get().n).toBe(1);
});
it('requires full transfer value before an approach, including when clauses could discount it',()=>{
  db.exec("UPDATE teams SET cashBalance=49999 WHERE id='us'");
  expect(consent().reasons.join(' ')).toMatch(/at least \$50,000/);
  expect(()=>m.sign('c','target',{...terms(),profitPercent:50})).toThrow(/Insufficient transfer/);
});
it('redacts hidden attributes at the API boundary and reveals only completed scouting knowledge',()=>{
  const n=new RecruitmentNetwork(db),p={...db.prepare("SELECT * FROM players WHERE id='target'").get(),attributes:{mechanics:81},traits:{confidence:80},ratingSources:'secret underlying rating'};
  expect(n.visible(career(),p)).toMatchObject({overall:null,potential:null,attributes:null,traits:null,ratingSources:null});
  m.dispatchScout('c','target');expect(n.visible(career(),p).overall).toBeNull();
  expect(db.prepare('SELECT dueDate FROM scout_assignments').get().dueDate).toBe('2025-09-29');
  db.exec("UPDATE scout_assignments SET status='completed'");
  expect(n.visible(career(),p)).toMatchObject({overall:null,estimatedOverall:'75–89'});
  db.exec('UPDATE scout_assignments SET depth=3');expect(n.visible(career(),p).overall).toBe(80);expect(n.visible(career(),p).potential).toBeNull();
  expect(n.visible(career(),{...p,teamId:'us'}).attributes.mechanics).toBe(81);
});
it('regional assignments cost real money, share capacity and cannot produce reports twice',()=>{
  const n=new RecruitmentNetwork(db);n.dispatchRegion(career(),'Europe',3);
  expect(db.prepare("SELECT cashBalance FROM teams WHERE id='us'").get().cashBalance).toBe(976000);
  expect(()=>n.dispatchRegion(career(),'Europe',1)).toThrow(/already/);
  date('2025-10-01');n.tick(career());const count=db.prepare('SELECT COUNT(*) n FROM scout_assignments').get().n;
  expect(count).toBeGreaterThan(0);n.tick(career());expect(db.prepare('SELECT COUNT(*) n FROM scout_assignments').get().n).toBe(count);
  expect(db.prepare('SELECT nextReport FROM scouting_regions').get().nextReport).toBe('2025-10-31');
});
it('settles monthly income, debt and costs once per period, including after a database reload',()=>{
  const e=new ClubEconomy(db);e.initialise(career());date('2025-10-01');e.tick(career());
  const first=e.overview(career());expect(first.ledger.some((r:any)=>r.category==='Corporate and commercial revenue')).toBe(true);
  e.tick(career());expect(e.overview(career()).cash).toBe(first.cash);
  const loaded=sqlAdapter(new SQL.Database(raw.export()));runMigration(loaded);new ClubEconomy(loaded).tick(loaded.prepare("SELECT * FROM careers WHERE id='c'").get());
  expect(loaded.prepare("SELECT cashBalance FROM teams WHERE id='us'").get().cashBalance).toBe(first.cash);
});
it('warns before financial dismissal, permanently locks that career, and leaves other careers alone',()=>{
  const e=new ClubEconomy(db);e.initialise(career());
  db.exec("UPDATE teams SET cashBalance=1000 WHERE id='us';UPDATE club_accounts SET corporateIncome=0,overhead=100000,creditLimit=10000 WHERE teamId='us'");
  date('2025-10-01');e.tick(career());expect(e.overview(career()).warningDate).toBe('2025-10-01');expect(()=>e.assertEmployed('c')).not.toThrow();
  date('2025-11-01');e.tick(career());expect(()=>m.career('c')).not.toThrow();
  for(const day of ['2025-12-01','2026-01-01','2026-02-01','2026-03-01']){date(day);e.tick(career());expect(()=>m.career('c')).not.toThrow();}
  expect(e.overview(career()).finalWarningDate).toBe('2026-03-01');
  date('2026-04-01');e.tick(career());expect(()=>m.career('c')).toThrow(/Career ended/);
  const loaded=sqlAdapter(new SQL.Database(raw.export()));runMigration(loaded);expect(()=>new ClubEconomy(loaded).assertEmployed('c')).toThrow(/cannot be resumed/);expect(()=>new ClubEconomy(loaded).assertEmployed('other')).not.toThrow();
});
it('never fires a solvent club for wage-limit warnings',()=>{
  const e=new ClubEconomy(db);e.initialise(career());
  db.exec("UPDATE teams SET cashBalance=10000000,sponsorIncome=100000 WHERE id='us';UPDATE contracts SET teamId='us',salary=50000 WHERE id='old';UPDATE club_accounts SET wageLimit=10000,breaches=30,warningDate='2025-01-01' WHERE teamId='us'");
  for(const day of ['2025-10-01','2025-11-01','2025-12-01','2026-01-01','2026-02-01','2026-03-01','2026-04-01']){date(day);e.tick(career());expect(()=>m.career('c')).not.toThrow();}
  expect(e.overview(career()).insolventMonths).toBe(0);expect(e.overview(career()).recoveryDeadline).toBeNull();
});
it('grants champions 180 days of protection, including when the ceremony has been watched',()=>{
  const e=new ClubEconomy(db);e.initialise(career());
  db.exec("UPDATE teams SET cashBalance=-1000 WHERE id='us';UPDATE club_accounts SET insolventSince='2025-01-01',insolventMonths=8,finalWarningDate='2025-01-01',lastMonth='2025-09',corporateIncome=0 WHERE teamId='us';INSERT INTO competitions(id,name,type,status) VALUES('trophy','RLCS Open','REGIONAL','completed');INSERT INTO trophy_ceremonies VALUES('c','trophy','us','Our Club','2025-08-31',1)");
  e.tick(career());expect(()=>m.career('c')).not.toThrow();expect(e.overview(career()).protectedUntil).toBe('2026-02-27');expect(e.overview(career()).finalWarningDate).toBeNull();
});
it('clears an unpaid-obligations recovery plan as soon as prize money restores cash',()=>{
  const e=new ClubEconomy(db);e.initialise(career());
  db.exec("UPDATE teams SET cashBalance=-1000 WHERE id='us';UPDATE club_accounts SET insolventSince='2025-01-01',insolventMonths=8,finalWarningDate='2025-01-01' WHERE teamId='us'");
  payClubPrize(db,'c','us','event','2025-09-01',50000,'RLCS Open winner');e.tick(career());
  expect(()=>m.career('c')).not.toThrow();expect(e.overview(career())).toMatchObject({cash:49000,insolventSince:null,insolventMonths:0,finalWarningDate:null});
});
it('credits tournament receipts exactly once across retries and reloads',()=>{
  expect(payClubPrize(db,'c','us','one','2025-09-01',10000,'First trophy')).toBe(true);
  expect(payClubPrize(db,'c','us','two','2025-09-01',20000,'Second trophy')).toBe(true);
  expect(payClubPrize(db,'c','us','one','2025-09-01',10000,'First trophy')).toBe(false);
  const loaded=sqlAdapter(new SQL.Database(raw.export()));runMigration(loaded);expect(payClubPrize(loaded,'c','us','two','2025-09-01',20000,'Second trophy')).toBe(false);
  expect(loaded.prepare("SELECT cashBalance FROM teams WHERE id='us'").get().cashBalance).toBe(1030000);
  expect(loaded.prepare("SELECT description FROM club_ledger WHERE category='Prize money' ORDER BY rowid").all()).toEqual([{description:'First trophy'},{description:'Second trophy'}]);
});
it('credits two actual completed Major wins, preserving both payouts after reload',()=>{
  for(let n=0;n<13;n++)db.prepare("INSERT INTO teams(id,name,region) VALUES(?,?,'Europe')").run('extra'+n,'Extra '+n);
  const teams=db.prepare('SELECT id FROM teams ORDER BY id').all().map((t:any)=>t.id),tournament=new Tournament(db);
  for(const id of ['major-one','major-two']){
    const config=officialRules('MAJOR',1);
    db.prepare("INSERT INTO competitions(id,name,type,status,region,config,prizePool) VALUES(?,?,'MAJOR','scheduled','GLOBAL',?,354000)").run(id,id,JSON.stringify(config));
    db.prepare("INSERT INTO career_competitions VALUES(?,'c','MAJOR',1,'2025-09-01','[]')").run(id);
    for(const [i,team] of teams.entries())db.prepare('INSERT INTO competition_entries(competitionId,teamId,seed) VALUES(?,?,?)').run(id,team,i+1);
    tournament.prepare(id,teams,'2025-09-01',config);tournament.progress(id,'2025-09-01');
    for(let wave=0;wave<50&&tournament.details(id)?.phase!=='completed';wave++){
      for(const f of db.prepare("SELECT * FROM fixtures WHERE competitionId=? AND status='scheduled'").all(id)){
        const wins=Math.floor(Number(f.seriesFormat.slice(2))/2)+1,away=f.awayTeamId==='us';db.prepare("UPDATE fixtures SET homeScore=?,awayScore=?,status='completed' WHERE id=?").run(away?0:wins,away?wins:0,f.id);
      }
      m.progressCircuit('c','2025-10-01');
    }
    expect(tournament.details(id)?.championId).toBe('us');expect(db.prepare("SELECT value FROM settings WHERE key=?").get('prizes_paid:'+id)?.value).toBe('1');
  }
  expect(db.prepare("SELECT cashBalance FROM teams WHERE id='us'").get().cashBalance).toBe(1204000);
  const loaded=sqlAdapter(new SQL.Database(raw.export()));runMigration(loaded);new CareerManagement(loaded).progressCircuit('c','2025-10-01');
  expect(loaded.prepare("SELECT cashBalance FROM teams WHERE id='us'").get().cashBalance).toBe(1204000);
  expect(loaded.prepare("SELECT SUM(amount) n,COUNT(*) receipts FROM club_ledger WHERE teamId='us' AND category='Prize money'").get()).toEqual({n:204000,receipts:2});
});
it('persists negotiated clauses and makes future profit payable once on resale',()=>{
  consent();m.sign('c','target',{...terms(),profitPercent:20,buybackFee:80000,contributionPercent:25,contributionMonths:6});
  const d=db.prepare("SELECT * FROM deal_clauses WHERE playerId='target'").get();expect(d).toMatchObject({profitPercent:20,buybackFee:80000,contribution:2500,playingTime:60});
  const before=db.prepare("SELECT cashBalance FROM teams WHERE id='seller'").get().cashBalance;
  settleSellOn(db,'c','target','us','third',100000);const payment=Math.round((100000-d.baseFee)*.2);
  expect(db.prepare("SELECT cashBalance FROM teams WHERE id='seller'").get().cashBalance).toBe(before+payment);
  settleSellOn(db,'c','target','us','third',100000);expect(db.prepare("SELECT cashBalance FROM teams WHERE id='seller'").get().cashBalance).toBe(before+payment);
});
it('charges selling-club wage contributions monthly and stops them at their deadline',()=>{
  new ClubEconomy(db).initialise(career());consent();m.sign('c','target',{...terms(),contributionPercent:25,contributionMonths:1});
  const e=new ClubEconomy(db);expect(e.overview(career()).contributions.received).toBe(2500);
  date('2025-10-02');expect(e.overview(career()).contributions.received).toBe(0);
});
it('rejects invalid clauses atomically and cannot promise less than the agreed playing role',()=>{
  consent();expect(()=>m.sign('c','target',{...terms(),profitPercent:51})).toThrow(/Invalid/);
  expect(()=>m.sign('c','target',{...terms(),playingTime:10})).toThrow(/playing-time guarantee/);
  expect(db.prepare('SELECT * FROM transfers').all()).toHaveLength(0);expect(db.prepare("SELECT isActive FROM contracts WHERE id='old'").get().isActive).toBe(1);
  expect(()=>clauseTerms({...terms(),buybackFee:1},'seller',50000)).toThrow(/at least match/);
});

it('keeps scouting snapshots historical and makes old reports require renewed observation',()=>{
  const n=new RecruitmentNetwork(db);db.exec("INSERT INTO scout_assignments VALUES('report','c','target','2025-08-01','2025-09-01',3,'completed')");
  n.observe(career(),'target',3);db.exec("UPDATE players SET overall=93 WHERE id='target'");
  expect(n.visible(career(),db.prepare("SELECT * FROM players WHERE id='target'").get()).overall).toBe(80);
  date('2026-02-01');expect(n.depth('c','target')).toBe(2);expect(n.visible(career(),db.prepare("SELECT * FROM players WHERE id='target'").get()).overall).toBeNull();
  expect(()=>m.dispatchScout('c','target')).not.toThrow();
});
it('enforces playing-time promises against new played series without repeatedly punishing an idle calendar',()=>{
  consent();m.sign('c','target',terms());const e=new ClubEconomy(db);db.exec("INSERT INTO competitions(id,name) VALUES('event','Test Event')");
  const matches=(month:string)=>{for(let i=1;i<=6;i++){const id=month+i;db.prepare("INSERT INTO fixtures(id,competitionId,homeTeamId,awayTeamId,scheduledDate,status) VALUES(?,'event','us','seller',?,'completed')").run(id,`2025-${month}-${10+i}`);db.prepare("INSERT INTO game_results(id,fixtureId,gameNumber,blueTeamId,orangeTeamId,blueScore,orangeScore) VALUES(?,?,1,'us','seller',1,0)").run('g'+id,id);}};
  matches('09');date('2025-10-01');e.tick(career());expect(db.prepare("SELECT breaches FROM deal_clauses WHERE playerId='target'").get().breaches).toBe(1);
  date('2025-11-01');e.tick(career());expect(db.prepare("SELECT breaches FROM deal_clauses WHERE playerId='target'").get().breaches).toBe(1);
  matches('11');date('2025-12-01');e.tick(career());expect(db.prepare("SELECT transferRequested FROM manager_relationships WHERE playerId='target'").get().transferRequested).toBe(1);
});
it('honours an active buy-back option in the quoted and completed fee',()=>{
  db.exec("INSERT INTO deal_clauses(contractId,careerId,playerId,buyerId,sellerId,baseFee,buybackFee,buybackUntil) VALUES('prior','c','target','seller','us',20000,30000,'2026-09-01')");
  consent();expect(m.signingQuote('c','target').fee).toBe(30000);expect(m.sign('c','target',terms()).fee).toBe(30000);
});

it('does not charge a twenty-fifth wage after all guaranteed salary instalments were paid',()=>{
  consent();m.sign('c','target',terms());const e=new ClubEconomy(db);
  db.exec("UPDATE contract_payments SET paidMonths=24");date('2025-10-01');e.tick(career());
  expect(db.prepare("SELECT paidMonths FROM contract_payments").get().paidMonths).toBe(24);
  expect(db.prepare("SELECT * FROM club_ledger WHERE teamId='us' AND category='Player wages'").all()).toHaveLength(0);
});
it('simulates with private database ratings while returning only the game outcome',()=>{
  for(let i=0;i<2;i++)db.prepare("INSERT INTO players(id,gamertag,teamId,region,overall,potential) VALUES(?,?,'seller','Europe',95,99)").run('op'+i,'Opponent '+i);
  db.exec("INSERT INTO competitions(id,name,type,config) VALUES('event','Practice','SCRIM','{}');INSERT INTO career_competitions(competitionId,careerId,stage,cycle,startDate,sources) VALUES('event','c','SCRIM',0,'2025-09-01','[]');INSERT INTO competition_entries(competitionId,teamId) VALUES('event','us'),('event','seller');INSERT INTO fixtures(id,competitionId,homeTeamId,awayTeamId,scheduledDate,status,seriesFormat) VALUES('fixture','event','us','seller','2025-09-01','scheduled','BO3')");
  expect(new RecruitmentNetwork(db).visible(career(),db.prepare("SELECT * FROM players WHERE id='op0'").get()).overall).toBeNull();
  const result=m.simulation('c','fixture');expect(result.success).toBe(true);expect(Object.keys(result.stats)).toHaveLength(6);expect(result).not.toHaveProperty('homeProfile');expect(result).not.toHaveProperty('players');
});
