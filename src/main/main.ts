import {app,BrowserWindow,ipcMain,Menu,shell,dialog} from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import {setupIpcHandlers} from './ipc-handlers';
import {initDb,closeDb} from './database';
import {registerLocalRuntime} from './release-runtime';

app.setAppUserModelId('com.rlmanager.game');
// Preserve existing careers when switching from the source app to the installer.
app.setPath('userData',process.env.RLM_USER_DATA||path.join(app.getPath('appData'),'rl-manager'));
let mainWindow:BrowserWindow|null=null,splash:BrowserWindow|null=null,initialized=false;
let startup={percent:0,message:'Warming up the arena',error:false};
const allowDeveloperTools=!app.isPackaged&&process.env.RLM_ENABLE_DEVTOOLS==='1';
const publicRoot=path.join(__dirname,'../public');
const icon=path.join(publicRoot,'brand/app-icon.png');
const logs=path.join(app.getPath('userData'),'logs');
function log(message:string){try{fs.mkdirSync(logs,{recursive:true});const file=path.join(logs,'rl-manager.log');if(fs.existsSync(file)&&fs.statSync(file).size>2*1024*1024)fs.renameSync(file,file+'.previous');fs.appendFileSync(file,new Date().toISOString()+' '+message+'\n');}catch{/* Logging must never prevent a save or launch. */}}
for(const level of ['log','warn','error'] as const){const original=console[level].bind(console);console[level]=(...args:any[])=>{log(`[${level}] `+args.map(v=>v instanceof Error?v.stack:typeof v==='string'?v:JSON.stringify(v)).join(' '));if(!app.isPackaged)original(...args);};}
const update=(percent:number,message:string,error=false)=>{startup={percent:Math.max(startup.percent,percent),message,error};splash?.webContents.send('app:startupProgress',startup);};
async function openLink(value:string){try{const url=new URL(value);if(['https:','http:'].includes(url.protocol))await shell.openExternal(url.href);}catch{/* Reject local files and script URLs. */}}
function protect(win:BrowserWindow){
  win.setMenu(null);win.webContents.setWindowOpenHandler(({url})=>{void openLink(url);return {action:'deny'};});
  win.webContents.on('will-navigate',(event,url)=>{if(url!==win.webContents.getURL()){event.preventDefault();void openLink(url);}});
  win.webContents.on('before-input-event',(event,input)=>{
    if(!allowDeveloperTools&&(input.key==='F12'||((input.control||input.meta)&&input.shift&&['i','j','c'].includes(input.key.toLowerCase()))||((input.control||input.meta)&&['u','r'].includes(input.key.toLowerCase()))))event.preventDefault();
  });
}
function createWindow(){
  mainWindow=new BrowserWindow({width:1440,height:960,minWidth:1024,minHeight:720,icon,title:'RL Manager',titleBarStyle:'hidden',titleBarOverlay:{color:'#101916',symbolColor:'#e8eaed',height:32},show:false,backgroundColor:'#101916',
    webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,devTools:allowDeveloperTools,preload:path.join(__dirname,'preload.js')}});
  protect(mainWindow);
  mainWindow.webContents.on('render-process-gone',(_,details)=>{log('Renderer stopped: '+details.reason);dialog.showMessageBox({type:'error',title:'RL Manager needs to reopen this screen',message:'Your saved careers are safe. Reopen the screen to continue.',buttons:['Reopen screen','Quit'],defaultId:0}).then(({response})=>response===0?mainWindow?.reload():app.quit());});
  mainWindow.on('closed',()=>{mainWindow=null;app.quit();});
  const devUrl=!app.isPackaged?process.env.VITE_DEV_SERVER_URL:undefined;
  const loading=devUrl?mainWindow.loadURL(devUrl):mainWindow.loadFile(path.join(__dirname,'../dist/index.html'));
  loading.catch(error=>failStartup(error));
}
function failStartup(error:unknown){console.error('Startup failed',error);update(startup.percent,'RLM could not finish loading. Your careers have been kept safe. Close the game and retry; details are in the support log.',true);}
ipcMain.handle('app:startup',()=>startup);
ipcMain.on('app:rendererReady',event=>{
  if(event.sender!==mainWindow?.webContents)return;
  update(100,'Ready. Your next chapter awaits.');mainWindow.show();mainWindow.focus();splash?.close();splash=null;
});
ipcMain.on('app:quit',()=>app.quit());
ipcMain.handle('app:openLogs',()=>shell.openPath(logs));
ipcMain.handle('app:openLink',(_,url:string)=>openLink(url));
if(!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',()=>{const win=mainWindow||splash;if(win?.isMinimized())win.restore();win?.show();win?.focus();});
  app.whenReady().then(async()=>{
    Menu.setApplicationMenu(null);log('Starting RL Manager '+app.getVersion());registerLocalRuntime();
    try{
      splash=new BrowserWindow({width:1000,height:564,frame:false,resizable:false,icon,show:false,backgroundColor:'#080f16',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,devTools:false,preload:path.join(__dirname,'preload.js')}});
      protect(splash);splash.once('ready-to-show',()=>splash?.show());await splash.loadFile(path.join(publicRoot,'splash.html'));
      update(12,'Opening your career library');await new Promise(r=>setTimeout(r,40));
      await initDb();initialized=true;
      update(38,'Preparing teams, players and competitions');await new Promise(r=>setTimeout(r,40));
      setupIpcHandlers();
      update(82,'Bringing the club workspace to life');await new Promise(r=>setTimeout(r,40));createWindow();
    }catch(error){failStartup(error);}
  });
  app.on('before-quit',()=>{if(initialized){closeDb();initialized=false;}});
  app.on('window-all-closed',()=>app.quit());
  process.on('uncaughtException',error=>{console.error(error);if(!mainWindow)failStartup(error);});
  process.on('unhandledRejection',error=>console.error('Unhandled task',error));
}
