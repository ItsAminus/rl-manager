const {app,BrowserWindow}=require('electron');const fs=require('node:fs');app.disableHardwareAcceleration();
app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:1450,height:1050,webPreferences:{contextIsolation:true,offscreen:true,backgroundThrottling:false}});let code=0;
try{await win.loadURL('http://127.0.0.1:5179/__receipt');for(let i=0;i<100;i++){if(await win.webContents.executeJavaScript('!!document.querySelector(".chirp-receipt")'))break;await new Promise(r=>setTimeout(r,100));}
const result=await win.webContents.executeJavaScript(`(()=>{const el=document.querySelector('.chirp-receipt');if(!el)return {text:document.body.innerText};const r=el.getBoundingClientRect();return {text:el.innerText,games:el.querySelectorAll('.chirp-receipt-games > div').length,width:r.width,right:r.right,viewport:innerWidth};})()`);
if(result.games!==5||!result.text.includes('0–9')||!result.text.includes('REVERSE SWEEP RECEIPTS')||result.right>result.viewport)throw Error(JSON.stringify(result));
fs.writeFileSync('scratch/ui-review/chirp-receipt.png',(await win.webContents.capturePage()).toPNG());console.log(JSON.stringify({passed:true,...result}));
}catch(e){console.error(e);code=1;}finally{win.destroy();app.exit(code);}});
