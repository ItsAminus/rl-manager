import {beforeAll,beforeEach,it,expect} from 'vitest';
import initSqlJs from 'sql.js';
import {sqlAdapter} from './sql-fixture';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {CareerManagement} from '../src/main/career-management';
import {careerWindow,syncTransferCalendar,transferDates} from '../src/main/transfer-calendar';
import {TransferMarket} from '../src/main/transfer-market';
import {OutgoingTransfers} from '../src/main/outgoing-transfers';
import {transferWindow} from '../src/game/career-rules';
let SQL:any,db:any,m:CareerManagement;
beforeAll(async()=>{SQL=await initSqlJs();});
beforeEach(()=>{
  db=sqlAdapter(new SQL.Database());runMigration(db);m=new CareerManagement(db);
  db.exec(`INSERT INTO careers(id,managerName,teamId,currentDate) VALUES('c','Coach','us','2025-09-01');
  INSERT INTO seasons(id,careerId,startDate,endDate,isActive) VALUES('s','c','2025-09-01','2026-06-30',1);
  INSERT INTO teams(id,name,region,reputation,cashBalance) VALUES('us','Our Club','Europe',65,100000000),('elite','Elite Club','Europe',96,10000000),('other','Other','Europe',75,1000000);
  INSERT INTO settings(key,value) VALUES('circuit_v2','c');
  INSERT INTO career_competitions(competitionId,careerId,stage,cycle,startDate) VALUES('q1','c','QUALIFIER',1,'2025-09-09'),('q4','c','QUALIFIER',4,'2025-12-16');`);
  for(const team of ['us','elite','other'])for(let i=0;i<4;i++)db.prepare('INSERT INTO players(id,gamertag,teamId,region,overall,potential,reputation,morale,marketValue) VALUES(?,?,?,?,?,?,?,80,50000)').run(team+i,team+i,team,'Europe',team==='elite'?99:80,99,team==='elite'?99:70);
  db.exec("INSERT INTO players(id,gamertag,teamId,region,overall,reputation,morale,marketValue) VALUES('free','Free',NULL,'Europe',80,70,60,50000); INSERT INTO contracts(id,playerId,teamId,salary,duration,startDate,endDate,buyout,isActive) VALUES('zen-contract','elite0','elite',40000,24,'2025-09-01','2027-09-01',200000,1)");
});
const c=()=>db.prepare("SELECT * FROM careers WHERE id='c'").get();
const terms=(id:string)=>{const q=m.signingQuote('c',id);return {salary:q.demands.salary,bonus:q.demands.bonus,duration:24,buyout:100000,role:'Core Starter'};};
it('uses the same closed window in the UI, manager signing, NPC deals and sale acceptance',()=>{
  db.exec("UPDATE careers SET currentDate='2025-09-26'");
  const dates=transferDates(db,'c');expect(transferWindow(c().currentDate,dates).open).toBe(false);expect(careerWindow(db,'c',c().currentDate).open).toBe(false);
  expect(()=>m.sign('c','free',terms('free'))).toThrow(/closed/);
  db.exec("INSERT INTO market_stories VALUES('npc','c','free',NULL,'other','2025-09-08','2025-10-03','rumour',0,20000,'Terms pending'); INSERT INTO outgoing_offers(id,careerId,playerId,sellerId,buyerId,fee,ceiling,salary,bonus,duration,status,createdDate,expiresDate,rounds) VALUES('sale','c','us3','us','other',10000,20000,20000,10000,24,'pending','2025-09-08','2025-10-03',0)");
  new TransferMarket(db).tick('c');expect(db.prepare("SELECT status FROM market_stories WHERE id='npc'").get().status).toBe('collapsed');
  expect(()=>new OutgoingTransfers(db).respond('c','sale','accept')).toThrow(/closed/);
  expect(db.prepare('SELECT * FROM transfers').all()).toHaveLength(0);expect(db.prepare("SELECT teamId FROM players WHERE id='free'").get().teamId).toBeNull();
});
it('closes before qualifiers and opens a saved break before split two',()=>{
  expect(careerWindow(db,'c','2025-09-08').open).toBe(true);expect(careerWindow(db,'c','2025-09-09').open).toBe(false);
  expect(careerWindow(db,'c','2025-11-26').open).toBe(true);expect(careerWindow(db,'c','2025-12-16').open).toBe(false);
  syncTransferCalendar(db,c());const n=db.prepare('SELECT COUNT(*) AS n FROM calendar_events').get().n;syncTransferCalendar(db,c());expect(db.prepare('SELECT COUNT(*) AS n FROM calendar_events').get().n).toBe(n);
});
it('an enormous salary cannot buy an elite player into an unsuitable project',()=>{
  const q=m.signingQuote('c','elite0');expect(q.unavailableReason).toContain('championship');
  expect(()=>m.sign('c','elite0',{...terms('elite0'),salary:10000000,bonus:10000000})).toThrow(/championship/);
  expect(db.prepare("SELECT teamId FROM players WHERE id='elite0'").get().teamId).toBe('elite');
});
it('a settled elite player declines a sideways move even to a strong club',()=>{
  db.exec("UPDATE teams SET reputation=94 WHERE id='us'; UPDATE players SET overall=97 WHERE teamId='us'");
  expect(m.signingQuote('c','elite0').unavailableReason).toContain('committed');
  db.exec("UPDATE players SET morale=30 WHERE id='elite0'");expect(m.signingQuote('c','elite0').unavailableReason).toBe('');
  expect(()=>m.sign('c','elite0',{...terms('elite0'),role:'Substitute'})).toThrow(/starting role/);
  expect(()=>m.sign('c','elite0',{...terms('elite0'),duration:12})).toThrow(/24 months/);
});
it('a suitable willing player can still sign during the window',()=>{
  const result=m.sign('c','free',terms('free'));expect(result.success).toBe(true);expect(db.prepare("SELECT teamId FROM players WHERE id='free'").get().teamId).toBe('us');
});
it('NPC talks cannot register an unverified free agent either',()=>{
  db.exec("INSERT INTO player_affiliations(playerId,status) VALUES('free','unverified'); INSERT INTO market_stories VALUES('npc','c','free',NULL,'other','2025-09-01','2025-09-02','rumour',0,20000,'Terms pending'); UPDATE careers SET currentDate='2025-09-03'");
  new TransferMarket(db).tick('c');
  const story=db.prepare("SELECT * FROM market_stories WHERE id='npc'").get();
  expect(story.status).toBe('collapsed');expect(story.reason).toContain('confirmed available');
  expect(db.prepare("SELECT teamId FROM players WHERE id='free'").get().teamId).toBeNull();
});
