import fs from 'node:fs';
import path from 'node:path';
import type {DeskTurn} from './prematch-desk';

/** Prepared recordings only: no network, Python, GPU inference or API keys. */
export class DeskAudio {
  private key='';
  private job:{state:string;clips:Record<number,string>;message:string}={state:'idle',clips:{},message:''};
  prepare(key:string,turns:DeskTurn[],publicFolder:string){
    this.key=key;
    const clips:Record<number,string>={};
    for(const [index,turn] of turns.entries()){
      if(!turn.file||!/^audio\/desk-(?:analyst|team-names)\/[a-z0-9_-]+\.mp3$/.test(turn.file))continue;
      const file=path.join(publicFolder,turn.file);
      if(fs.existsSync(file)&&fs.statSync(file).size>1000)clips[index]=file;
    }
    const count=Object.keys(clips).length;
    this.job={state:count===turns.length?'ready':count?'partial':'unavailable',clips,
      message:count===turns.length?'Prepared analyst audio is ready. No online generation.':count?'Some prepared sections are available. Written analysis is ready.':'Prepared audio is not installed. Written analysis is ready.'};
    return this.snapshot(key);
  }
  snapshot(key:string){return key===this.key?{...this.job,clips:Object.keys(this.job.clips).map(Number)}:{state:'idle',clips:[],message:''};}
  audio(key:string,index:number){const file=key===this.key?this.job.clips[index]:null;return file&&fs.existsSync(file)?'data:audio/mpeg;base64,'+fs.readFileSync(file).toString('base64'):null;}
  cancel(key?:string){if(key&&key!==this.key)return;}
}
