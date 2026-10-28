import {afterEach,describe,it,expect} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {LocalBotRuntime} from '../src/main/local-bot-runtime';
const roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rlm-bot-runtime-'));roots.push(root);
 const resources=path.join(root,'resources'),userData=path.join(root,'profile'),payload=path.join(resources,'local-bot-runtime');fs.mkdirSync(payload,{recursive:true});
 const sha='a'.repeat(64),target=path.join(userData,'local-bots','1.7.0-'+sha.slice(0,12));
 const manifest={version:'1.7.0',sha256:sha,bytes:4,policies:16,files:[{path:'python/python.exe',bytes:3}]};
 fs.writeFileSync(path.join(payload,'manifest.json'),JSON.stringify(manifest));
 fs.mkdirSync(path.join(target,'python'),{recursive:true});fs.writeFileSync(path.join(target,'python/python.exe'),'exe');fs.writeFileSync(path.join(target,'ready.json'),JSON.stringify({sha256:sha}));
 return {root,payload,target,manifest,manager:new LocalBotRuntime(resources,userData,()=>path.join(root,'bridge/launcher.py'))};
}
describe('bundled local bot recovery',()=>{
 it('reuses an audited installation when the inventory is intact',async()=>{
  const f=fixture();expect(await f.manager.ensure()).toBe(f.target);
 });
 it('does not trust a completion marker after a dependency disappears',async()=>{
  const f=fixture();fs.unlinkSync(path.join(f.target,'python/python.exe'));
  await expect(f.manager.ensure()).rejects.toThrow();
 });
 it('rejects damaged repair archives before replacing the installed runtime',async()=>{
  const f=fixture();fs.writeFileSync(path.join(f.target,'python/python.exe'),'damaged');fs.writeFileSync(path.join(f.payload,'local-bots.7z'),'bad');
  await expect(f.manager.ensure()).rejects.toThrow('integrity check');
  expect(fs.readFileSync(path.join(f.target,'python/python.exe'),'utf8')).toBe('damaged');
 });
 it('rejects unsupported policy inventories without touching user files',async()=>{
  const f=fixture();fs.writeFileSync(path.join(f.payload,'manifest.json'),JSON.stringify({...f.manifest,policies:1}));
  await expect(f.manager.ensure()).rejects.toThrow('manifest is invalid');
  expect(fs.existsSync(path.join(f.target,'python/python.exe'))).toBe(true);
 });
});
