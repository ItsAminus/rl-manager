import {beforeAll,beforeEach,it,expect} from 'vitest';
import initSqlJs from 'sql.js';
import {sqlAdapter} from './sql-fixture';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {TransferMarket} from '../src/main/transfer-market';
import {CareerManagement} from '../src/main/career-management';
let SQL:any,db:any,market:TransferMarket;
beforeAll(async()=>{SQL=await initSqlJs();});
beforeEach(()=>{
  db=sqlAdapter(new SQL.Database());runMigration(db);market=new TransferMarket(db);
  db.exec(`INSERT INTO careers(id,managerName,teamId,currentDate) VALUES('c','Coach','us','2026-10-11');
    INSERT INTO teams(id,name,region,cashBalance,reputation) VALUES('us','Our Club','Europe',1000000,80),('buyer','Buyer','Europe',500000,80),('seller','Seller','Europe',500000,80);
    INSERT INTO players(id,gamertag,teamId,region,overall,marketValue) VALUES('free','Free',NULL,'Europe',88,50000),('reserve','Reserve','seller','Europe',88,50000);
    INSERT INTO market_stories VALUES('deal','c','free',NULL,'buyer','2026-10-08','2026-10-11','rumour',0,16000,'A free-agent move');`);
  for(const club of ['us','buyer','seller'])for(let i=0;i<3;i++)db.prepare('INSERT INTO players(id,gamertag,teamId,region,overall) VALUES(?,?,?,?,80)').run(club+i,club+i,club,'Europe');
});
it('converts a saved rumour into a real move and broadcasts the confirmed outcome once',()=>{
  // Use an identifier whose deterministic negotiation succeeds.
  for(let i=0;i<20;i++){
    const id='deal'+i;db.prepare('UPDATE market_stories SET id=? WHERE playerId=?').run(id,'free');market.tick('c');
    const story=db.prepare("SELECT * FROM market_stories WHERE playerId='free'").get();
    if(story.status==='completed')break;
    db.prepare("UPDATE market_stories SET status='rumour' WHERE playerId='free'").run();
  }
  const outcome=db.prepare("SELECT * FROM market_stories WHERE playerId='free'").get();
  expect(outcome.status,outcome.reason).toBe('completed');
  expect(db.prepare("SELECT teamId FROM players WHERE id='free'").get().teamId).toBe('buyer');
  expect(db.prepare("SELECT careerId FROM transfers WHERE playerId='free'").get().careerId).toBe('c');
  expect(db.prepare("SELECT salary,isActive FROM contracts WHERE playerId='free'").get()).toEqual({salary:16000,isActive:1});
  const count=db.prepare("SELECT COUNT(*) AS n FROM transfers WHERE playerId='free'").get().n;
  market.tick('c');expect(db.prepare("SELECT COUNT(*) AS n FROM transfers WHERE playerId='free'").get().n).toBe(count);
});
it('closes negotiations outside the window without moving a player',()=>{
  db.exec("UPDATE careers SET currentDate='2026-11-01'");market.tick('c');
  expect(db.prepare("SELECT status FROM market_stories WHERE id='deal'").get().status).toBe('collapsed');
  expect(db.prepare("SELECT teamId FROM players WHERE id='free'").get().teamId).toBeNull();
});
it('never completes an automatic transfer involving the manager’s club',()=>{
  db.exec("UPDATE market_stories SET toTeamId='us'");market.tick('c');
  expect(db.prepare("SELECT status FROM market_stories WHERE id='deal'").get().status).toBe('collapsed');
  expect(db.prepare("SELECT teamId FROM players WHERE id='free'").get().teamId).toBeNull();
});
it('AI clubs submit real bids to improve a weak starting position and sellers can counter',()=>{
  db.exec("DELETE FROM market_stories;UPDATE players SET overall=50 WHERE id='free'");
  market.tick('c');
  let story=db.prepare("SELECT * FROM market_stories WHERE toTeamId='buyer' AND playerId='reserve'").get();
  expect(story).toBeTruthy();expect(story.reason).toContain('weakest starting position');
  const terms=db.prepare('SELECT * FROM market_negotiations WHERE storyId=?').get(story.id);expect(terms.askingFee).toBeGreaterThan(story.fee);
  let hash=2166136261;for(const x of 'success1')hash=Math.imul(hash^x.charCodeAt(0),16777619);expect((hash>>>0)%5).not.toBe(0);
  db.prepare("UPDATE market_stories SET id='success1' WHERE id=?").run(story.id);db.prepare("UPDATE market_negotiations SET storyId='success1' WHERE storyId=?").run(story.id);
  db.exec("UPDATE careers SET currentDate='2026-10-14'");market.tick('c');
  expect(db.prepare("SELECT sellerResponse FROM market_negotiations WHERE storyId='success1'").get().sellerResponse).toBe('countered');
  expect(db.prepare("SELECT teamId FROM players WHERE id='reserve'").get().teamId).toBe('seller');
  db.exec("UPDATE careers SET currentDate='2026-10-16'");market.tick('c');
  story=db.prepare("SELECT * FROM market_stories WHERE id='success1'").get();expect(story.status,story.reason).toBe('completed');
  expect(db.prepare("SELECT teamId FROM players WHERE id='reserve'").get().teamId).toBe('buyer');
  expect(db.prepare("SELECT signingBonus FROM contracts WHERE playerId='reserve' AND isActive=1").get().signingBonus).toBeGreaterThan(0);
  expect(db.prepare("SELECT sellerResponse FROM market_negotiations WHERE storyId='success1'").get().sellerResponse).toBe('accepted');
  const core=new CareerManagement(db).orderRoster('c','buyer',db.prepare("SELECT * FROM players WHERE teamId='buyer'").all()).slice(0,3);
  expect(core.some(p=>p.id==='reserve')).toBe(true);
  expect(db.prepare("SELECT COUNT(*) n FROM inbox_items WHERE careerId='c' AND date='2026-10-14' AND type='transfer_news'").get().n).toBe(1);
});
it('does not generate transfers for Path To Glory or purchase weaker bench depth instead of upgrades',()=>{
  db.exec("DELETE FROM market_stories;UPDATE players SET overall=70 WHERE id IN ('free','reserve')");market.tick('c');
  expect(db.prepare('SELECT COUNT(*) n FROM market_stories').get().n).toBe(0);
  db.prepare("INSERT INTO career_modes VALUES('c','Path To Glory')").run();
  db.exec("UPDATE players SET overall=88 WHERE id='reserve'");market.tick('c');
  expect(db.prepare('SELECT COUNT(*) n FROM market_stories').get().n).toBe(0);
});
