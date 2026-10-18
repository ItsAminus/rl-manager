import {beforeAll,afterEach,describe,it,expect} from 'vitest';
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {CareerWorlds} from '../src/main/career-worlds';
import {sqlAdapter} from './sql-fixture';
let SQL:any;const folders:string[]=[];
beforeAll(async()=>{SQL=await initSqlJs();});
afterEach(()=>{for(const f of folders.splice(0)){if(!path.resolve(f).startsWith(path.resolve('scratch')+path.sep))throw new Error('Unsafe cleanup');fs.rmSync(f,{recursive:true,force:true});}});
function sample(){
  const base=sqlAdapter(new SQL.Database());runMigration(base);
  base.exec("INSERT INTO teams(id,name,cashBalance) VALUES('empor','EmporX',500000),('mates','Gentle Mates',800000),('old','Original Team',400000); INSERT INTO players(id,gamertag,teamId,overall,morale,fatigue) VALUES('atomic','AtomiK','old',95,70,0),('kofyr','kofyr',NULL,98,70,0),('archie','archie','mates',93,70,0),('encore','Encore','empor',70,70,0)");
  const master=sqlAdapter(new SQL.Database(base.exportBinary()));
  master.exec("INSERT INTO careers VALUES('a','Coach','empor','Europe','Hard','2027-02-04','',''),('b','Coach','mates','Europe','Hard','2025-09-24','',''); INSERT INTO seasons VALUES('sa','a',1,'2026-10-11','2027-06-30',1),('sb','b',1,'2025-09-01','2026-06-30',1); UPDATE players SET teamId='empor' WHERE id IN('atomic','kofyr'); INSERT INTO transfers(id,playerId,fromTeamId,toTeamId,fee,date,type) VALUES('t1','atomic','old','empor',100000,'2026-10-31','signing'),('t2','kofyr',NULL,'empor',0,'2026-10-13','signing'); INSERT INTO chirp_posts(id,careerId,accountId,body) VALUES('post-a','a','manager','A private career'),('post-b','b','manager','B private career')");
  const folder=fs.mkdtempSync(path.join(path.resolve('scratch'),'world-test-'));folders.push(folder);
  const factory=(bytes:Uint8Array,file:string)=>{const db=sqlAdapter(new SQL.Database(bytes),file);runMigration(db);return db;};
  return {base,master,folder,factory,worlds:new CareerWorlds(master,base,folder,factory)};
}
describe('independent career worlds',()=>{
  it('keeps tutorial squads in memory, outside the save list and every real world',()=>{
    const s=sample(),world=s.worlds.practice('tutorial-manager');
    world.exec("INSERT INTO careers VALUES('tutorial-manager','Coach','mates','Europe','Medium','2026-10-11','',''); UPDATE players SET overall=1 WHERE id='atomic'");
    s.worlds.sync('tutorial-manager');
    expect(s.worlds.list().map(c=>c.id)).not.toContain('tutorial-manager');
    expect(fs.existsSync(path.join(s.folder,'tutorial-manager.sqlite'))).toBe(false);
    expect(s.base.prepare("SELECT overall FROM players WHERE id='atomic'").get().overall).toBe(95);
    expect(s.worlds.get('a').prepare("SELECT overall FROM players WHERE id='atomic'").get().overall).toBe(95);
    expect(s.worlds.get('tutorial-manager')).toBe(world);s.worlds.close();s.master.close();
  });
  it('recovers EmporX transfers only in the save that made them',()=>{
    const {worlds,master}=sample(),a=worlds.get('a'),b=worlds.get('b');
    expect(a.prepare("SELECT teamId FROM players WHERE id='atomic'").get().teamId).toBe('empor');
    expect(b.prepare("SELECT teamId FROM players WHERE id='atomic'").get().teamId).toBe('old');
    expect(b.prepare("SELECT teamId FROM players WHERE id='kofyr'").get().teamId).toBeNull();
    expect(b.prepare('SELECT * FROM transfers').all()).toHaveLength(0);
    expect(b.prepare('SELECT careerId FROM chirp_posts').all()).toEqual([{careerId:'b'}]);
    expect(master.prepare('SELECT * FROM careers').all()).toHaveLength(2);worlds.close();master.close();
  });
  it('keeps later morale, money, rosters and contracts isolated across reloads',()=>{
    const s=sample(),a=s.worlds.get('a'),b=s.worlds.get('b');
    a.transaction(()=>{a.exec("UPDATE players SET morale=20,teamId='old' WHERE id='archie'; UPDATE teams SET cashBalance=123 WHERE id='mates'");})();
    expect(b.prepare("SELECT morale,teamId FROM players WHERE id='archie'").get()).toEqual({morale:70,teamId:'mates'});
    expect(b.prepare("SELECT cashBalance FROM teams WHERE id='mates'").get().cashBalance).toBe(800000);
    s.worlds.sync('a');s.worlds.sync('b');s.worlds.close();
    const base=sqlAdapter(new SQL.Database());runMigration(base);
    const restarted=new CareerWorlds(s.master,base,s.folder,s.factory);
    expect(restarted.get('a').prepare("SELECT morale FROM players WHERE id='archie'").get().morale).toBe(20);
    expect(restarted.get('b').prepare("SELECT morale FROM players WHERE id='archie'").get().morale).toBe(70);
    restarted.close();s.master.close();
  });
  it('creates a new world from the baseline, never another save’s mutations',()=>{
    const s=sample();s.worlds.get('a').exec("UPDATE players SET overall=30 WHERE id='atomic'");
    const fresh=s.worlds.get('new',true);
    expect(fresh.prepare("SELECT overall,teamId FROM players WHERE id='atomic'").get()).toEqual({overall:95,teamId:'old'});
    expect(fresh.prepare('SELECT * FROM transfers').all()).toHaveLength(0);s.worlds.close();s.master.close();
  });
});
