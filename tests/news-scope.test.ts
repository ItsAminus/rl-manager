import {beforeAll,beforeEach,expect,it} from 'vitest';
import initSqlJs from 'sql.js';
import {sqlAdapter} from './sql-fixture';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {inboxMessages} from '../src/main/inbox';
import {Chirp} from '../src/main/chirp';
let SQL:any,db:any;
beforeAll(async()=>{SQL=await initSqlJs();});
beforeEach(()=>{
  db=sqlAdapter(new SQL.Database());runMigration(db);
  db.exec(`INSERT INTO careers(id,managerName,teamId,region,currentDate) VALUES('c','Coach','eu','Europe','2026-10-11');
    INSERT INTO teams(id,name,region,reputation) VALUES('eu','Europe Club','Europe',80),('na','NA Club','North America',80),('na2','Another NA Club','North America',80);
    INSERT INTO players(id,gamertag,teamId,region,overall,potential) VALUES('eu1','Local pro','eu','Europe',80,90),('na1','Foreign pro','na','North America',80,90);
    INSERT INTO inbox_items(id,careerId,date,type,title,body,isRead,actions) VALUES('digest','c','2026-10-11','transfer_news','Roundup','All events',0,'[]'),('urgent','c','2026-10-11','transfer_offer','Your offer','Needs decision',0,'[]');
    INSERT INTO market_news_events VALUES('regional','c','2026-10-11','na','eu','Cross-region signing'),('foreign','c','2026-10-11','na','na2','Foreign signing');`);
});
it('filters transfer roundups by either club region without hiding actionable offers or deleting events',()=>{
  expect(inboxMessages(db,'c').find(m=>m.type==='transfer_news').body).toContain('Foreign signing');
  db.exec("INSERT INTO settings VALUES('regional_news_only','true')");
  const list=inboxMessages(db,'c');expect(list).toHaveLength(2);
  expect(list.find(m=>m.type==='transfer_news').body).toBe('Cross-region signing');
  expect(list.find(m=>m.type==='transfer_offer').body).toBe('Needs decision');
  expect(db.prepare('SELECT COUNT(*) n FROM market_news_events').get().n).toBe(2);
  db.exec("UPDATE settings SET value='false' WHERE key='regional_news_only'");expect(inboxMessages(db,'c').find(m=>m.type==='transfer_news').body).toContain('Foreign signing');
});
it('collapses legacy transfer email floods into one daily roundup while retaining every message in storage',()=>{
  db.exec('DELETE FROM market_news_events;DELETE FROM inbox_items WHERE id=\'digest\'');
  for(let i=0;i<100;i++)db.prepare("INSERT INTO inbox_items(id,careerId,date,type,title,body,isRead,actions) VALUES(?,'c','2026-10-11','transfer_news','Old news',?,0,'[]')").run(`legacy${i}`,`News ${i}`);
  expect(inboxMessages(db,'c')).toHaveLength(2);expect(inboxMessages(db,'c').find(m=>m.type==='transfer_news').body).toContain('News 99');
  expect(db.prepare('SELECT COUNT(*) n FROM inbox_items').get().n).toBe(101);
});
it('regional Chirp filters posts, search, suggestions and trends and cannot be overridden by an explore region',()=>{
  const chirp=new Chirp(db);chirp.tick('c');
  const foreign=db.prepare("SELECT id FROM chirp_accounts WHERE careerId='c' AND region='North America' AND kind='Player'").get().id;
  db.prepare(`INSERT INTO chirp_posts(id,careerId,accountId,date,position,body,topic,sourceKey) VALUES('foreignpost','c',?,'2026-10-11',99999,'foreign spotlight','ForeignOnly','manual:foreign')`).run(foreign);
  db.exec("INSERT INTO chirp_publications(postId,careerId,published) VALUES('foreignpost','c',1)");
  expect(chirp.feed('c',{},false).posts.some(p=>p.id==='foreignpost')).toBe(true);
  db.exec("INSERT INTO settings VALUES('regional_news_only','true')");
  const filtered=chirp.feed('c',{region:'North America',query:'foreign'},false);
  expect(filtered.posts).toHaveLength(0);expect(filtered.people).toHaveLength(0);expect(filtered.trends.some(t=>t.topic==='ForeignOnly')).toBe(false);
  expect(filtered.suggestions.every(a=>a.region==='Europe')).toBe(true);expect(filtered.regions).toEqual(['Europe']);
  expect(()=>chirp.thread('c','foreignpost')).toThrow(/regional/);
  db.exec("UPDATE settings SET value='false' WHERE key='regional_news_only'");expect(chirp.feed('c',{},false).posts.some(p=>p.id==='foreignpost')).toBe(true);chirp.close();
});
