const {app,BrowserWindow}=require('electron'),fs=require('node:fs');app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1450,height:1150,webPreferences:{contextIsolation:true,offscreen:true,backgroundThrottling:false}});let code=0;
  try{
    fs.mkdirSync('scratch/ui-review',{recursive:true});
    await win.loadURL('http://127.0.0.1:5180/__tournament');
    for(let i=0;i<100;i++){if(await win.webContents.executeJavaScript('document.querySelectorAll(".event-node").length===13'))break;await new Promise(r=>setTimeout(r,100));}
    const bracket=await win.webContents.executeJavaScript(`({groups:document.querySelectorAll('.event-group').length,nodes:document.querySelectorAll('.event-node').length,edges:document.querySelectorAll('.event-paths path').length,width:document.documentElement.scrollWidth,viewport:innerWidth})`);
    if(bracket.groups!==4||bracket.nodes!==13||bracket.edges!==14||bracket.width>bracket.viewport)throw Error(JSON.stringify(bracket));
    await win.webContents.executeJavaScript('Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))');
    await new Promise(r=>setTimeout(r,300));
    const oversized=await win.webContents.executeJavaScript("[...document.querySelectorAll('.event-stages .matchday-team-crest img')].some(i=>i.getBoundingClientRect().width>30||i.getBoundingClientRect().height>30)");
    if(oversized)throw Error('Tournament logo exceeds its allotted space');
    fs.writeFileSync('scratch/ui-review/tournament-groups.png',(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("document.querySelector('.event-bracket-scroll').scrollIntoView()");
    await new Promise(r=>setTimeout(r,300));
    const visible=await win.webContents.executeJavaScript("document.querySelector('.event-bracket-scroll').getBoundingClientRect().top");
    if(visible>win.getContentBounds().height)throw Error('Bracket failed to scroll into view');
    fs.writeFileSync('scratch/ui-review/tournament-bracket.png',(await win.webContents.capturePage()).toPNG());
    await win.loadURL('http://127.0.0.1:5180/__difficulty');
    for(let i=0;i<100;i++){if(await win.webContents.executeJavaScript('document.querySelectorAll(".difficulty-card").length===3'))break;await new Promise(r=>setTimeout(r,100));}
    await win.webContents.executeJavaScript("[...document.querySelectorAll('.difficulty-card')].find(el=>el.innerText.startsWith('Medium')).click()");
    for(let i=0;i<100;i++){if(await win.webContents.executeJavaScript("document.querySelector('.difficulty-card.selected')?.innerText.startsWith('Medium')"))break;await new Promise(r=>setTimeout(r,100));}
    const setting=await win.webContents.executeJavaScript("({selected:document.querySelector('.difficulty-card.selected').innerText,notice:document.querySelector('[role=status]').innerText})");
    if(!setting.selected.startsWith('Medium')||!setting.notice.includes('next game'))throw Error(JSON.stringify(setting));
    fs.writeFileSync('scratch/ui-review/difficulty-settings.png',(await win.webContents.capturePage()).toPNG());
    await win.loadURL('http://127.0.0.1:5180/__training');
    for(let i=0;i<100;i++){if(await win.webContents.executeJavaScript("document.querySelectorAll('.earned-development tbody tr').length===3"))break;await new Promise(r=>setTimeout(r,100));}
    const training=await win.webContents.executeJavaScript("({rows:document.querySelectorAll('.earned-development tbody tr').length,text:document.querySelector('.earned-development').innerText})");
    if(training.rows!==3||!training.text.includes('35+ days')||!training.text.includes('credible series'))throw Error(JSON.stringify(training));
    await new Promise(r=>setTimeout(r,300));
    fs.writeFileSync('scratch/ui-review/earned-development.png',(await win.webContents.capturePage()).toPNG());
    console.log(JSON.stringify({passed:true,bracket,setting}));
  }catch(e){console.error(e);code=1;}finally{win.destroy();app.exit(code);}
});
