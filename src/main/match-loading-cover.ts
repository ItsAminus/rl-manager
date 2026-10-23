import {app,BrowserWindow,screen} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export function matchLoadingHtml(background:string){
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#030a12;color:#fff;font-family:Arial,sans-serif}
  .backdrop{position:absolute;width:100%;height:100%;object-fit:cover}.shade{position:absolute;inset:0;background:linear-gradient(transparent 48%,rgba(2,9,18,.94))}
  .status{position:absolute;bottom:7%;left:12%;right:12%;text-align:center}.spinner{display:inline-block;width:32px;height:32px;border:3px solid #ffffff30;border-top-color:#ffbd54;border-radius:50%;animation:spin 1s linear infinite}
  h1{font-size:clamp(18px,2vw,30px);font-weight:600;letter-spacing:.14em;margin:18px 0 10px}p{font-size:clamp(13px,1.2vw,18px);color:#d7dfeb;margin:0 0 24px}
  .track{height:3px;width:min(360px,80%);margin:auto;background:#ffffff28;overflow:hidden}.bar{width:35%;height:100%;background:#ffbd54;animation:travel 1.6s ease-in-out infinite}
  @keyframes spin{to{transform:rotate(360deg)}}@keyframes travel{from{transform:translateX(-110%)}to{transform:translateX(390%)}}
  @media(prefers-reduced-motion:reduce){.spinner{animation-duration:3s}.bar{animation-duration:4s}}
  </style></head><body><img class="backdrop" src="${background}" alt=""><div class="shade"></div><div class="status" role="status"><i class="spinner"></i><h1>PREPARING THE MATCH</h1><p>Getting all six players ready for kickoff</p><div class="track"><div class="bar"></div></div></div></body></html>`;
}

// Separate opaque window: native HUDs disappear during map travel. Prepare it
// hidden during introductions, then cover that entire loading interval.
export class MatchLoadingCover {
  private window:BrowserWindow|null=null;
  private loaded:Promise<void>|null=null;
  private requested=false;
  private expiry:ReturnType<typeof setTimeout>|undefined;
  prepare(){
    if(this.window&&!this.window.isDestroyed())return;
    const roots=[path.join(process.resourcesPath||'','app.asar.unpacked/public'),path.resolve(__dirname,'../public')];
    const image=roots.map(root=>path.join(root,'brand/match-loading.png')).find(p=>fs.existsSync(p));
    const background=image?pathToFileURL(image).href:'';
    const window=this.window=new BrowserWindow({show:false,frame:false,backgroundColor:'#030a12',focusable:true,
      skipTaskbar:true,alwaysOnTop:true,resizable:false,hasShadow:false,
      webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    window.setAlwaysOnTop(true,'screen-saver');
    window.setIgnoreMouseEvents(true);
    // Let an explicit Alt-Tab leave the cover; never trap the desktop behind it.
    window.on('blur',()=>{if(!window.isDestroyed())window.setAlwaysOnTop(false);});
    window.on('closed',()=>{if(this.window===window)this.window=null;});
    // The supplied PNG exceeds Chromium's data-URL length limit when embedded.
    // A tiny local page can reference the unchanged original image directly.
    const page=path.join(app.getPath('temp'),'rl-manager-match-loading.html');
    fs.writeFileSync(page,matchLoadingHtml(background),'utf8');
    this.loaded=window.loadFile(page);
    void this.loaded.catch(error=>{console.warn('[Match loading] Cover unavailable:',error);if(this.window===window)this.close();});
  }
  show(bounds?:{x:number;y:number;width:number;height:number}){
    this.prepare();this.requested=true;
    const window=this.window;
    const physical=bounds&&Object.values(bounds).every(Number.isFinite)&&bounds.width>0&&bounds.height>0?bounds:null;
    const rect=physical&&window?screen.screenToDipRect(window,physical):null;
    const display=rect?screen.getDisplayMatching(rect):screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    window?.setBounds(display.bounds);
    void this.loaded?.then(()=>{
      if(this.requested&&this.window===window&&!window?.isDestroyed()){
        // Taking focus is required to cover exclusive-fullscreen Rocket League
        // reliably during travel. The bridge restores game focus at readiness.
        window?.setAlwaysOnTop(true,'screen-saver');window?.show();window?.focus();
      }
    }).catch(()=>{});
    clearTimeout(this.expiry);
    this.expiry=setTimeout(()=>this.close(),240000);
  }
  close(){this.requested=false;clearTimeout(this.expiry);this.expiry=undefined;this.window?.close();this.window=null;this.loaded=null;}
}
