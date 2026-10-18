const {app,BrowserWindow}=require('electron'),fs=require('node:fs');app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1500,height:1100,webPreferences:{contextIsolation:true,offscreen:true,backgroundThrottling:false}}),run=s=>win.webContents.executeJavaScript(s);
  const wait=async s=>{for(let i=0;i<100;i++){if(await run(s))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+s);};let code=0;
  try{
    await win.loadURL('http://127.0.0.1:5185/__skills');await wait("document.querySelectorAll('.skill-player-card').length===3");
    if(!await run("document.querySelector('.skill-player-card').textContent.includes('Platinum')"))throw Error('Skill gate not shown');
    await run("document.querySelector('button[aria-label=\"Improve zen Passing for 2 points\"]').click()");
    await wait("document.querySelector('.skill-player-card header strong').textContent==='8 points'");
    if(!await run("document.querySelector('.skill-celebrating .skill-gold-wash') && getComputedStyle(document.querySelector('.skill-gold-wash')).animationName==='skill-gold-shine'"))throw Error('Gold allocation shine missing');
    if(!await run("document.querySelector('.skill-upgrade-receipt').textContent.includes('Diamond unlocked')"))throw Error('Promotion feedback missing');
    if(!await run("document.querySelector('.skill-player-card footer').textContent.includes('Diamond')"))throw Error('Eligible tier did not update');
    await run("document.querySelector('.earned-development').scrollIntoView()");await new Promise(r=>setTimeout(r,200));
    fs.mkdirSync('scratch/ui-review',{recursive:true});fs.writeFileSync('scratch/ui-review/skill-progression.png',(await win.webContents.capturePage()).toPNG());
    await win.reload();await wait("document.querySelector('.skill-player-card header strong')?.textContent==='8 points'");
    await win.setContentSize(900,1100);await new Promise(r=>setTimeout(r,200));if(await run('document.documentElement.scrollWidth>innerWidth'))throw Error('Narrow training page overflow');
    const state=await run("window.api.management.training('skill-preview')");if(state.earned[0].skills[0].value!==90)throw Error('Allocated skill not persisted');
    await run("document.querySelector('button[aria-label=\"Improve zen Passing for 3 points\"]').click()");await wait("document.querySelector('.skill-player-card header strong').textContent==='5 points'");
    win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    if(!await run("getComputedStyle(document.querySelector('.skill-gold-wash')).display==='none'"))throw Error('Reduced-motion preference ignored');win.webContents.debugger.detach();
    console.log('PASS: real allocation spends points, persists skills, unlocks Diamond eligibility, shows gold shine and unlock feedback, handles repeated allocation, fits a narrower window and respects reduced motion.');
  }catch(e){console.error(e);code=1;}finally{win.destroy();app.exit(code);}
});
