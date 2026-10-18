import type {AppDatabase} from './database';
export function markAllInboxRead(db:AppDatabase,careerId:string){
  if(!db.prepare('SELECT id FROM careers WHERE id=?').get(careerId))throw new Error('Career not found.');
  const result=db.prepare('UPDATE inbox_items SET isRead=1 WHERE careerId=? AND isRead=0').run(careerId);
  return {success:true,changed:result.changes,unread:0};
}
