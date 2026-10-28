import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execute=promisify(execFile);
type Manifest={version:string;sha256:string;bytes:number;policies:number;files?:{path:string;bytes:number}[]};
export class LocalBotRuntime {
  private pending:Promise<string>|undefined;
  constructor(private resources:string,private userData:string,private bridge:()=>string){}
  ensure(){return this.pending??=this.install().catch(error=>{this.pending=undefined;throw error;});}
  private async install(){
    const payload=path.join(this.resources,'local-bot-runtime');
    const manifest:Manifest=JSON.parse(await fs.promises.readFile(path.join(payload,'manifest.json'),'utf8'));
    if(!/^\d+\.\d+\.\d+$/.test(manifest.version)||!/^([a-f0-9]{64})$/.test(manifest.sha256)||manifest.policies!==16||!manifest.files?.length)throw Error('The bundled local-bot repair manifest is invalid. Reinstall the RLM update.');
    const cache=path.resolve(this.userData,'local-bots');
    const target=path.join(cache,manifest.version+'-'+manifest.sha256.slice(0,12));
    const complete=path.join(target,'ready.json');
    const contained=(name:string)=>{const file=path.resolve(target,name);if(!file.startsWith(target+path.sep))throw Error('Invalid local-bot runtime file path');return file;};
    const intact=async()=>{
      for(let i=0;i<manifest.files!.length;i+=64){
        const results=await Promise.all(manifest.files!.slice(i,i+64).map(async row=>{try{return(await fs.promises.stat(contained(row.path))).size===row.bytes;}catch{return false;}}));
        if(results.some(value=>!value))return false;
      }
      return true;
    };
    try{if(JSON.parse(await fs.promises.readFile(complete,'utf8')).sha256===manifest.sha256&&await intact())return target;}catch{/* Repair an incomplete or older installation. */}
    console.log('[Local bots] Preparing the verified offline bot runtime. First launch may take a moment.');
    const archive=path.join(payload,'local-bots.7z');
    const hash=crypto.createHash('sha256');
    for await(const chunk of fs.createReadStream(archive))hash.update(chunk);
    if(hash.digest('hex')!==manifest.sha256)throw Error('The bundled local-bot repair archive failed its integrity check. Reinstall the RLM update.');
    await fs.promises.mkdir(cache,{recursive:true});
    if(fs.lstatSync(cache).isSymbolicLink())throw Error('Cannot safely repair a linked local-bot runtime folder.');
    // This folder is exclusively managed by RLM; never remove a linked path.
    if(fs.existsSync(target)){
      if(path.dirname(target)!==cache||fs.lstatSync(target).isSymbolicLink())throw Error('Cannot safely repair the local-bot runtime folder.');
      await fs.promises.rm(target,{recursive:true,force:true});
    }
    await fs.promises.mkdir(target,{recursive:true});
    await execute(path.join(payload,'7za.exe'),['x','-y','-bd',archive,'-o'+target],{windowsHide:true,timeout:300000,maxBuffer:1024*1024});
    if(!await intact())throw Error('Local-bot installation is incomplete. Check free disk space and retry.');
    const script=path.join(path.dirname(this.bridge()),'local_bot_health.py');
    const result=await execute(path.join(target,'python/python.exe'),['-B',script,'--botpack',path.join(target,'botpack'),'--report',path.join(target,'local-bot-health.json')],
      {windowsHide:true,timeout:300000,maxBuffer:1024*1024,env:{...process.env,PYTHONNOUSERSITE:'1',PYTHONPATH:''}}).catch(error=>{
        console.error('[Local bots] Verification failed:',error.stderr||error.message);
        throw Error('A bundled local bot could not load. Check the support log for its dependency error, then retry or reinstall the update.');
      });
    const report=JSON.parse(result.stdout);
    if(Object.keys(report).length!==manifest.policies||Object.values(report).some((row:any)=>!row.healthy))throw Error('The local-bot verification did not pass for every policy.');
    await fs.promises.writeFile(complete,JSON.stringify({sha256:manifest.sha256,policies:manifest.policies,verifiedAt:new Date().toISOString()}));
    console.log('[Local bots] All 16 local policies and their dependencies are installed and verified.');
    return target;
  }
}
