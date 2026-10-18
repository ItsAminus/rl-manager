const {app,BrowserWindow}=require('electron'),fs=require('node:fs');
app.disableHardwareAcceleration();app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1500,height:1100,webPreferences:{contextIsolation:true,offscreen:true,backgroundThrottling:false}});let code=0;
  const run=s=>win.webContents.executeJavaScript(s),wait=async s=>{for(let i=0;i<100;i++){if(await run(s))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+s);};
  win.webContents.on('console-message',(_,level,message)=>{if(level>=3)console.error(message);});
  try{
    fs.mkdirSync('scratch/ui-review',{recursive:true});
    for(const [key,groupCount] of [['swiss',2],['major',4],['ewc',2]]){
      await win.loadURL('http://127.0.0.1:5184/__official/'+key);await wait(`document.querySelectorAll('.event-group').length===${groupCount}`);
      await run('document.fonts.ready');await new Promise(r=>setTimeout(r,350));
      if(await run('document.documentElement.scrollWidth>innerWidth'))throw Error(key+' overflows page width');
      if(key==='swiss'&&!await run("document.body.textContent.includes('Buchholz')"))throw Error('Swiss tiebreak not shown');
      if(key==='major'){
        await run("[...document.querySelectorAll('button')].find(b=>b.textContent==='Show full bracket')?.click()");await wait("document.querySelectorAll('.event-node').length===13");
      }
      if(key==='ewc'&&!await run("document.body.textContent.includes('BO5 upper · BO7 lower')"))throw Error('EWC series format missing');
      fs.writeFileSync('scratch/ui-review/official-'+key+'.png',(await win.webContents.capturePage()).toPNG());
    }
    await win.setContentSize(1000,900);await new Promise(r=>setTimeout(r,300));
    if(await run('document.documentElement.scrollWidth>innerWidth'))throw Error('Narrow competition layout overflows');
    console.log('PASS: real tournament states render Swiss/GSL groups, Major 2’s 13-node full bracket, correct EWC lengths and responsive layouts.');
  }catch(e){console.error(e);console.error(await run('document.body.innerText'));fs.writeFileSync('scratch/ui-review/official-failure.png',(await win.webContents.capturePage()).toPNG());code=1;}finally{win.destroy();app.exit(code);}
});
