import {beforeAll,beforeEach,expect,it,vi} from 'vitest';
import initSqlJs from 'sql.js';
import {sqlAdapter} from './sql-fixture';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {PlayerIdentity} from '../src/main/player-identity';
let SQL:any,db:any,editor:PlayerIdentity,backup:ReturnType<typeof vi.fn>;
beforeAll(async()=>{SQL=await initSqlJs();});
beforeEach(()=>{
  db=sqlAdapter(new SQL.Database());runMigration(db);
  db.exec("INSERT INTO teams(id,name) VALUES('club','Club'); INSERT INTO players(id,gamertag,teamId,overall,age) VALUES('p1','Player One','club',90,20),('p2','Player Two','club',80,21); INSERT INTO contracts(id,playerId,teamId,salary,isActive) VALUES('c1','p1','club',10000,1)");
  backup=vi.fn();editor=new PlayerIdentity(db,backup);
});
it('previews without mutating, backs up before saving and preserves gameplay data',()=>{
  const before=db.exportBinary(),preview=editor.preview([{id:'p1',realName:' New Name ',age:22,nationality:'gb',overall:1,teamId:null,attributes:{shooting:1}}]);
  expect(db.exportBinary()).toEqual(before);expect(backup).not.toHaveBeenCalled();
  backup.mockImplementation(()=>expect(editor.get('p1').realName).toBeNull());
  expect(editor.apply(preview)).toBe(1);expect(backup).toHaveBeenCalledOnce();
  const row=db.prepare('SELECT * FROM players WHERE id=?').get('p1');
  expect(row).toMatchObject({realName:'New Name',age:22,nationality:'GB',overall:90,teamId:'club'});
  expect(db.prepare('SELECT salary FROM contracts WHERE id=?').get('c1').salary).toBe(10000);
  const reloaded=new PlayerIdentity(sqlAdapter(new SQL.Database(db.exportBinary())));
  expect(reloaded.get('p1')).toMatchObject({realName:'New Name',age:22,nationality:'GB'});
});
it('keeps corrections in one career rather than modifying other saves or the template',()=>{
  const template=db.exportBinary(),other=sqlAdapter(new SQL.Database(template));
  editor.apply(editor.preview({id:'p1',realName:'Local correction'}));
  expect(new PlayerIdentity(other).get('p1').realName).toBeNull();
  expect(new PlayerIdentity(sqlAdapter(new SQL.Database(template))).get('p1').realName).toBeNull();
});
it('matches unique gamertags, skips missing identities, and never falls back from a wrong ID',()=>{
  const p=editor.preview({players:[{gamertag:'player one',age:25},{id:'missing',gamertag:'Player Two',age:24},{id:'unknown',realName:'Nobody'}]});
  expect(p.changes.map(c=>c.id)).toEqual(['p1']);expect(p.skipped).toHaveLength(2);
  editor.apply(p);expect(editor.get('p2').age).toBe(21);
});
it('rejects ambiguous gamertags and duplicate records instead of silently choosing a player',()=>{
  db.exec("INSERT INTO players(id,gamertag) VALUES('duplicate','Player One')");
  expect(editor.preview({gamertag:'Player One',age:25}).skipped[0]).toContain('ambiguous');
  expect(()=>editor.preview([{id:'p2',age:25},{id:'p2',age:26}])).toThrow(/Duplicate/);
});
it('supports partial identity patches and explicit unknowns without resetting omitted fields',()=>{
  editor.apply(editor.preview({id:'p1',realName:'Known',nationality:'FR'}));
  editor.apply(editor.preview({id:'p1',realName:'',age:null}));
  expect(editor.get('p1')).toMatchObject({realName:null,age:null,nationality:'FR'});
  expect(editor.apply(editor.preview({id:'p1',overall:99}))).toBe(0);
});
it('validates all imported rows before applying any changes',()=>{
  for(const patch of [{age:-1},{age:2.5},{age:'22'},{age:121},{realName:'X'.repeat(121)},{realName:'bad\nname'},{nationality:'France'},{nationality:'ZZ'}]){
    expect(()=>editor.preview([{id:'p1',realName:'Good'},{id:'p2',...patch}])).toThrow();
    expect(editor.get('p1').realName).toBeNull();expect(backup).not.toHaveBeenCalled();
  }
});
it('rejects stale previews and aborts if backup creation fails',()=>{
  const preview=editor.preview({id:'p1',age:25});
  db.prepare('UPDATE players SET age=23 WHERE id=?').run('p1');
  expect(()=>editor.apply(preview)).toThrow(/changed since preview/);
  backup.mockImplementation(()=>{throw Error('Backup disk full');});
  expect(()=>editor.apply(editor.preview({id:'p1',age:25}))).toThrow(/Backup disk full/);
  expect(editor.get('p1').age).toBe(23);
});
it('rolls back an entire batch if an update fails',()=>{
  db.exec("CREATE TRIGGER reject_p2 BEFORE UPDATE ON players WHEN NEW.id='p2' BEGIN SELECT RAISE(ABORT,'blocked'); END");
  expect(()=>editor.apply(editor.preview([{id:'p1',age:25},{id:'p2',age:26}]))).toThrow(/blocked/);
  expect(editor.get('p1').age).toBe(20);expect(editor.get('p2').age).toBe(21);
});
