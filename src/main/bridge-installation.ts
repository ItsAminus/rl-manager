import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

/** Refresh shipped code, never the runtime state, saves or user preferences. */
export function syncPlayerBridge(source:string,target:string,dataSource:string,dataTarget:string,version:string){
 const scripts:string[]=[];
 function collect(dir:string){for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  if(['runtime','local_runtime','__pycache__'].includes(entry.name))continue;
  const file=path.join(dir,entry.name);if(entry.isDirectory())collect(file);else if(entry.isFile()&&entry.name.endsWith('.py'))scripts.push(path.relative(source,file));
 }}
 for(const required of ['launcher.py','game_launcher.py','bakkesmod_startup.py','rocket_host.py'])if(!fs.existsSync(path.join(source,required)))throw Error('RLM’s installed match bridge is incomplete. Reinstall the application update.');
 collect(source);
 const hash=createHash('sha256');for(const file of scripts)hash.update(file).update(fs.readFileSync(path.join(source,file)));
 // Database/audio indexes can change in a locally rebuilt release too.
 for(const file of fs.readdirSync(dataSource).filter(f=>f.endsWith('.json')).sort())hash.update(file).update(fs.readFileSync(path.join(dataSource,file)));
 const expected=version+'\n'+hash.digest('hex'),stamp=path.join(target,'.release-version');
 const codeMatches=scripts.every(file=>{try{return fs.readFileSync(path.join(source,file)).equals(fs.readFileSync(path.join(target,file)));}catch{return false;}});
 if(!fs.existsSync(stamp)||fs.readFileSync(stamp,'utf8')!==expected||!codeMatches){
  fs.mkdirSync(target,{recursive:true});fs.cpSync(source,target,{recursive:true});
  fs.cpSync(dataSource,dataTarget,{recursive:true});
  // Commit the marker last. An interrupted copy is retried next launch.
  fs.writeFileSync(stamp,expected);return true;
 }
 return false;
}
