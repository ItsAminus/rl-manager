import {app} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {PlayerPreferences} from './player-preferences';
import {speechEnvironment} from './speech-settings';

// Python must run outside app.asar, with its generated files in a writable place.
export function playerBridge(){
  if(!app.isPackaged)return path.resolve(__dirname,'../rl_bridge/launcher.py');
  const source=path.join(process.resourcesPath,'rl_bridge'),target=path.join(app.getPath('userData'),'bridge');
  const stamp=path.join(target,'.release-version');
  if(!fs.existsSync(stamp)||fs.readFileSync(stamp,'utf8')!==app.getVersion()){
    fs.mkdirSync(target,{recursive:true});fs.cpSync(source,target,{recursive:true});fs.writeFileSync(stamp,app.getVersion());
    fs.cpSync(path.join(process.resourcesPath,'data'),path.join(app.getPath('userData'),'data'),{recursive:true});
  }
  return path.join(target,'launcher.py');
}
export function runtimePreferencesFile(){return path.join(app.getPath('userData'),'runtime-location.json');}
export function registerLocalRuntime(){
  if(app.isPackaged)return;
  const local=path.resolve(__dirname,'../rl_bridge/local_runtime');
  if(fs.existsSync(path.join(local,'llama'))){fs.mkdirSync(app.getPath('userData'),{recursive:true});fs.writeFileSync(runtimePreferencesFile(),JSON.stringify({path:local}));}
}
export function installedAiRuntime(){
  try{const local=JSON.parse(fs.readFileSync(runtimePreferencesFile(),'utf8')).path;
    if(typeof local==='string'&&fs.existsSync(local))return local;
  }catch{/* An AI installation is optional; recorded commentary remains available. */}
  const bundled=path.join(process.resourcesPath,'rl_bridge','local_runtime');
  return fs.existsSync(bundled)?bundled:'';
}
export function playerBridgeEnvironment(){
  const localHud=path.resolve(__dirname,'../bakkesmod/build');
  return {...process.env,...speechEnvironment(new PlayerPreferences(app.getPath('userData')).read().integration),RLM_AI_RUNTIME:installedAiRuntime()||path.resolve(__dirname,'../rl_bridge/local_runtime'),
    ...(app.isPackaged?{RLM_AUDIO_DEPS:path.join(process.resourcesPath,'audio-deps'),RLM_HUD_SOURCE:path.join(process.resourcesPath,'career-hud')}:
      fs.existsSync(path.join(localHud,'RLManagerHUD.dll'))&&fs.existsSync(path.join(localHud,'fonts','glyphs.json'))?{RLM_HUD_SOURCE:process.env.RLM_HUD_SOURCE||localHud}: {})};
}
