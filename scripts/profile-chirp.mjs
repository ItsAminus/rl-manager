// Reads a save into a private in-memory database. Never writes to the source file.
import {createServer} from 'vite';
import initSqlJs from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';
const source=process.argv[2]||path.resolve('scratch/ui-preview-data/database/rlmanager.sqlite');
const vite=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom'});
const {Chirp}=await vite.ssrLoadModule('/src/main/chirp.ts');
const SQL=await initSqlJs(),raw=new SQL.Database(fs.readFileSync(source));
const timings=new Map();let nested=false;
const timed=(sql,fn)=>{const t=performance.now();try{return fn();}finally{const v=timings.get(sql)||{ms:0,calls:0};v.ms+=performance.now()-t;v.calls++;timings.set(sql,v);}};
const db={exec:s=>raw.exec(s),prepare:s=>({all:(...a)=>timed(s,()=>{const q=raw.prepare(s);q.bind(a);const rows=[];while(q.step())rows.push(q.getAsObject());q.free();return rows;}),get:(...a)=>timed(s,()=>{const q=raw.prepare(s);q.bind(a);const r=q.step()?q.getAsObject():undefined;q.free();return r;}),run:(...a)=>timed(s,()=>{raw.run(s,a);return {changes:raw.getRowsModified()};})}),transaction:fn=>()=>{if(nested)return fn();nested=true;raw.run('BEGIN');try{const r=fn();raw.run('COMMIT');return r;}catch(e){raw.run('ROLLBACK');throw e;}finally{nested=false;}}};
if(process.argv.includes('--migrate')){const {runMigration}=await vite.ssrLoadModule('/src/database/migrations/001_initial_schema.ts');runMigration(db);}
const career=db.prepare('SELECT * FROM careers ORDER BY updatedAt DESC LIMIT 1').get();
console.log('Save size MB:',(fs.statSync(source).size/1024/1024).toFixed(1));
for(const table of ['players','fixtures','chirp_accounts','chirp_posts','game_player_stats'])console.log(table,db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n);
const chirp=new Chirp(db),results={};
const measure=(label,fn)=>{const t=performance.now(),result=fn();results[label]=Math.round(performance.now()-t);console.log(label,results[label]+'ms');return result;};
const feed=measure('home',()=>chirp.feed(career.id));
measure('following',()=>chirp.feed(career.id,{mode:'following'}));
measure('profile',()=>chirp.profile(career.id,'gibbs'));
measure('thread',()=>chirp.thread(career.id,feed.posts[0].id));
measure('like',()=>chirp.react(career.id,feed.posts[0].id,'like'));
measure('search',()=>chirp.feed(career.id,{query:'zen'}));
measure('export',()=>raw.export());
console.log('Slowest queries:',JSON.stringify([...timings].sort((a,b)=>b[1].ms-a[1].ms).slice(0,10).map(([sql,t])=>({sql:sql.slice(0,180),...t,ms:Math.round(t.ms)})),null,2));
await vite.close();raw.close();
