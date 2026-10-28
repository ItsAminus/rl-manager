import type {AppDatabase} from './database';
import {regionalNewsOnly,regionSql} from './news-scope';
export function inboxMessages(db:AppDatabase,careerId:string){
  const c=db.prepare('SELECT region,teamId FROM careers WHERE id=?').get(careerId),limited=regionalNewsOnly(db);
  const region=db.prepare('SELECT region FROM teams WHERE id=?').get(c?.teamId)?.region||c?.region||'';
  const rows=db.prepare('SELECT * FROM inbox_items WHERE careerId=? ORDER BY date DESC,rowid DESC').all(careerId);
  const grouped=new Map<string,any>();const result:any[]=[];
  for(const row of rows){
    if(row.type!=='transfer_news'){result.push(row);continue;}
    if(grouped.has(row.date)){const first=grouped.get(row.date);if(!first.modern){first.body+='\n\n'+row.body;first.isRead=first.isRead&&row.isRead;}continue;}
    const events=db.prepare(`SELECT e.body FROM market_news_events e LEFT JOIN teams ft ON ft.id=e.fromTeamId LEFT JOIN teams tt ON tt.id=e.toTeamId WHERE e.careerId=? AND e.date=? ${limited?`AND (ft.region IN (${regionSql(region)}) OR tt.region IN (${regionSql(region)}))`:''} ORDER BY e.rowid`).all(careerId,row.date);
    const modern=!!db.prepare('SELECT id FROM market_news_events WHERE careerId=? AND date=? LIMIT 1').get(careerId,row.date);
    if(limited&&!events.length)continue;
    const item={...row,title:limited?'Regional transfer roundup':'Daily transfer roundup',body:modern?events.map(e=>e.body).join('\n\n'):row.body,modern};
    grouped.set(row.date,item);result.push(item);
  }
  return result.map(m=>({...m,isRead:!!m.isRead,actions:m.actions?JSON.parse(m.actions):[]}));
}
export function markAllInboxRead(db:AppDatabase,careerId:string){
  if(!db.prepare('SELECT id FROM careers WHERE id=?').get(careerId))throw new Error('Career not found.');
  const result=db.prepare('UPDATE inbox_items SET isRead=1 WHERE careerId=? AND isRead=0').run(careerId);
  return {success:true,changed:result.changes,unread:0};
}
