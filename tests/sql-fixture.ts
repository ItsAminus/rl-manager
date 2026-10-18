import fs from 'fs';
import type {AppDatabase} from '../src/main/database';
export function sqlAdapter(sql:any,filename=''):AppDatabase{
  let nested=false;
  const save=()=>{if(filename&&!nested)fs.writeFileSync(filename,Buffer.from(sql.export()));};
  return {exec:s=>{sql.exec(s);save();},prepare:s=>({
    all:(...args:any[])=>{const q=sql.prepare(s);try{q.bind(args);const rows=[];while(q.step())rows.push(q.getAsObject());return rows;}finally{q.free();}},
    get:(...args:any[])=>{const q=sql.prepare(s);try{q.bind(args);return q.step()?q.getAsObject():undefined;}finally{q.free();}},
    run:(...args:any[])=>{sql.run(s,args);save();return{changes:sql.getRowsModified(),lastInsertRowid:0};},
  }),transaction:fn=>()=>{if(nested)return fn();nested=true;sql.run('BEGIN');try{const result=fn();sql.run('COMMIT');nested=false;save();return result;}catch(e){sql.run('ROLLBACK');nested=false;throw e;}},
  close:()=>sql.close(),exportBinary:()=>sql.export()};
}
