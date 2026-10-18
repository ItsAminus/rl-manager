import type {AppDatabase} from './database';
import {addDays,transferWindow} from '../game/career-rules';
import {v4 as uuid} from 'uuid';
export function transferDates(db:AppDatabase,id:string){
  const season=db.prepare('SELECT * FROM seasons WHERE careerId=? AND isActive=1').get(id);
  if(!season||!db.prepare("SELECT value FROM settings WHERE key='circuit_v2'").get())return undefined;
  const first=db.prepare("SELECT MIN(startDate) AS date FROM career_competitions WHERE careerId=? AND stage='QUALIFIER' AND cycle=1 AND startDate>=?").get(id,season.startDate)?.date||addDays(season.startDate,8);
  const second=db.prepare("SELECT MIN(startDate) AS date FROM career_competitions WHERE careerId=? AND stage='QUALIFIER' AND cycle=4 AND startDate>=?").get(id,season.startDate)?.date||addDays(season.startDate,106);
  return [{start:season.startDate,end:addDays(first,-1)},{start:addDays(second,-20),end:addDays(second,-1)}];
}
export function careerWindow(db:AppDatabase,id:string,date:string){
  return transferWindow(date,transferDates(db,id));
}
export function syncTransferCalendar(db:AppDatabase,c:any){
  const dates=transferDates(db,c.id);if(!dates)return;
  const key='transfer_calendar_v2',value=JSON.stringify(dates);
  if(db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value===value)return;
  db.prepare("DELETE FROM calendar_events WHERE careerId=? AND type='transfer_window' AND date>=?").run(c.id,c.currentDate);
  for(const w of dates)for(const [date,title] of [[w.start,'Transfer window opens'],[w.end,'Final transfer day'],[addDays(w.end,1),'Transfer window closed']])if(date>=c.currentDate)
    db.prepare('INSERT INTO calendar_events(id,careerId,date,type,title,description,isRead) VALUES (?,?,?,?,?,?,0)').run(uuid(),c.id,date,'transfer_window',title,`Career roster window: ${w.start} to ${w.end}. Player registrations close before qualifiers.`);
  db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES (?,?)').run(key,value);
  db.prepare('INSERT INTO inbox_items(id,careerId,date,type,title,body,isRead,actions) VALUES (?,?,?,?,?,?,0,?)').run(uuid(),c.id,c.currentDate,'general','Transfer calendar updated',`Transfers now use the career's preseason and between-split windows. ${careerWindow(db,c.id,c.currentDate).label}. Talks cannot complete outside these dates.`,JSON.stringify([{label:'View transfer market',action:'navigate',data:{href:'/transfers'}}]));
}
