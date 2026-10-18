import fs from 'node:fs';
import path from 'node:path';
export const TUTORIAL_VERSION=1;
export class PlayerPreferences {
  constructor(private folder:string){}
  read(){try{return JSON.parse(fs.readFileSync(path.join(this.folder,'player-preferences.json'),'utf8'));}catch{return {};}}
  update(values:Record<string,unknown>){
    const current={...this.read(),...values};fs.mkdirSync(this.folder,{recursive:true});
    const file=path.join(this.folder,'player-preferences.json');
    fs.writeFileSync(file+'.tmp',JSON.stringify(current,null,2));fs.renameSync(file+'.tmp',file);return current;
  }
  tutorial(outcome:'completed'|'skipped'){
    return this.update({tutorialVersion:TUTORIAL_VERSION,tutorialOutcome:outcome,tutorialFinishedAt:new Date().toISOString()});
  }
}
