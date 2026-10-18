const {app,BrowserWindow}=require('electron'),fs=require('node:fs');app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1450,height:1050,webPreferences:{contextIsolation:true,offscreen:true,backgroundThrottling:false}});let code=0;
  win.webContents.on('console-message',(_,level,message)=>{if(level>=2)console.error(message);});
  const run=s=>win.webContents.executeJavaScript(s);
  const wait=async s=>{for(let i=0;i<300;i++){if(await run(s))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+s+' '+await run('document.body.innerText.slice(0,1500)'));};
  try{
    fs.mkdirSync('scratch/ui-review',{recursive:true});
    await win.loadURL('http://127.0.0.1:5182/__transfers#/inbox');
    await wait("document.body.innerText.includes('Open transfer news')");
    await run("[...document.querySelectorAll('button')].find(b=>b.textContent==='Open transfer news').click()");
    await wait("location.hash.startsWith('#/social')&&!!document.querySelector('.chirp-shell')");
    if(!await run("location.hash.includes('q=RosterMoves')&&window.__career.getState().career.id==='review'"))throw Error('News navigation lost its query or active save');
    await new Promise(r=>setTimeout(r,300));
    fs.writeFileSync('scratch/ui-review/transfer-news-chirp.png',(await win.webContents.capturePage()).toPNG());
    await run("location.hash='/negotiate/star'");await wait("!!document.querySelector('.terms-actions-bar')");
    if(!await run("[...document.querySelectorAll('.terms-actions-bar button')].slice(1).every(b=>b.disabled)&&document.body.innerText.includes('championship ambitions')"))throw Error('Elite refusal not displayed/enforced');
    if(!await run("document.body.innerText.includes('SKEPTICAL')&&document.body.innerText.includes('PROPOSED SQUAD ROLE')"))throw Error('Refusal still presented as an optimistic agreement');
    await run("document.querySelectorAll('.terms-actions-bar button')[1].click()");
    if(await run('window.__signCalls!==0'))throw Error('Refused player submitted a signing request');
    await new Promise(r=>setTimeout(r,300));
    fs.writeFileSync('scratch/ui-review/elite-recruitment-refusal.png',(await win.webContents.capturePage()).toPNG());
    await run("window.__career.setState({currentDate:'2025-09-26'})");await wait("document.body.innerText.includes('Negotiations are closed')");
    if(await run("!!document.querySelector('.terms-actions-bar')"))throw Error('Closed-window offer controls visible');
    await new Promise(r=>setTimeout(r,300));
    fs.writeFileSync('scratch/ui-review/negotiations-closed.png',(await win.webContents.capturePage()).toPNG());
    console.log('PASS: legacy inbox link opens Chirp with query and save preserved; unsuitable elite refusal blocks offers; closed-window negotiations show no signing controls.');
  }catch(e){console.error(e);code=1;}finally{win.destroy();app.exit(code);}
});
