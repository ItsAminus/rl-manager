import {BrowserWindow,ipcMain,screen} from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export class BroadcastOverlay {
  private window:BrowserWindow|null=null;
  private state:any=null;
  constructor(){ipcMain.handle('broadcast:state',()=>this.state);}
  prepare(context:any){
    this.close();if(!context)return;
    this.state={context,blue:0,orange:0,remaining:300,overtime:false,players:[]};
    const overlay=this.window=new BrowserWindow({width:840,height:430,show:false,transparent:true,frame:false,
      focusable:false,resizable:false,skipTaskbar:true,hasShadow:false,alwaysOnTop:true,
      webPreferences:{contextIsolation:true,nodeIntegration:false,devTools:false,preload:path.join(__dirname,'preload.js'),backgroundThrottling:false}});
    overlay.setIgnoreMouseEvents(true);overlay.setAlwaysOnTop(true,'screen-saver');
    const html=path.join(__dirname,'../dist/index.html');
    const loaded=process.env.VITE_DEV_SERVER_URL?overlay.loadURL(process.env.VITE_DEV_SERVER_URL+'?broadcast=1'):
      fs.existsSync(html)?overlay.loadFile(html,{query:{broadcast:'1'}}):overlay.loadURL('http://localhost:5173/?broadcast=1');
    void loaded.catch(error=>{console.warn('[Broadcast] Display failed to load:',error);if(this.window===overlay)this.close();});
    overlay.on('closed',()=>{if(this.window===overlay)this.window=null;});
  }
  update(packet:any){
    if(!this.window||!this.state)return;
    if(![packet.blue,packet.orange,packet.remaining].every(Number.isFinite))return;
    this.state={...this.state,...packet};
    if(!packet.foreground||packet.ended){this.window.hide();return;}
    const b=packet.bounds;
    if(!b||![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.width<640||b.height<480){this.window.hide();return;}
    const dip=screen.screenToDipRect(this.window,{x:Math.round(b.x),y:Math.round(b.y),width:Math.round(b.width),height:Math.round(b.height)});
    const width=Math.min(840,dip.width),height=packet.scoreboard?Math.min(520,dip.height-16):106;
    const target={x:Math.round(dip.x+(dip.width-width)/2),y:dip.y+8,width,height};
    const current=this.window.getBounds();
    if(Object.keys(target).some(k=>target[k as keyof typeof target]!==current[k as keyof typeof current]))this.window.setBounds(target);
    this.window.webContents.send('broadcast:update',this.state);
    if(!this.window.isVisible())this.window.showInactive();
  }
  close(){this.window?.close();this.window=null;this.state=null;}
}
