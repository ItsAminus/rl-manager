import {beforeAll,beforeEach,it,expect} from 'vitest';
import initSqlJs from 'sql.js';
import {sqlAdapter} from './sql-fixture';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {TransferMarket} from '../src/main/transfer-market';
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
