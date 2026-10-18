const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{contextIsolation:true,offscreen:true}});
  let failed=false;
  try{
    await win.loadURL('http://127.0.0.1:5179/__review');
    const run=code=>win.webContents.executeJavaScript(code);
    for(let i=0;i<150;i++){
      if(await run('document.querySelectorAll(".featured-series .matchday-team-crest img").length===2 && Array.from(document.querySelectorAll(".featured-series .matchday-team-crest img")).every(i=>i.complete&&i.naturalWidth>0)'))break;
      if(i===149)throw Error('Dashboard did not load both team crests');
      await new Promise(r=>setTimeout(r,100));
    }
    const state=await run(`(()=>{const card=document.querySelector('.featured-series'),box=card.getBoundingClientRect();return {images:[...card.querySelectorAll('.matchday-team-crest img')].map(i=>({alt:i.alt,source:i.src,width:i.getBoundingClientRect().width})),legacy:card.querySelectorAll('.club-monogram').length,bounds:{x:Math.floor(box.x),y:Math.floor(box.y),width:Math.ceil(box.width),height:Math.ceil(box.height)}}})()`);
    if(state.legacy||state.images.some(i=>i.width!==60))throw Error('Unexpected dashboard logo sizing');
    fs.writeFileSync('scratch/dashboard-crest-check.png',(await win.webContents.capturePage(state.bounds)).toPNG());
    console.log(JSON.stringify({passed:true,...state}));
  }catch(error){failed=true;console.error(error.stack);}
  finally{win.destroy();app.exit(failed?1:0);}
});
