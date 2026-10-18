const {app,BrowserWindow,nativeImage}=require('electron'),fs=require('node:fs');app.disableHardwareAcceleration();app.commandLine.appendSwitch('force-device-scale-factor','1');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1520,height:1100,webPreferences:{contextIsolation:true,offscreen:true,backgroundThrottling:false}});let code=0;
 const exports=[];
 win.webContents.session.on('will-download',(event,item)=>{event.preventDefault();const url=item.getURL();if(!url.startsWith('data:image/png;base64,'))return;const bytes=Buffer.from(url.split(',')[1],'base64');const size=nativeImage.createFromBuffer(bytes).getSize();exports.push(size);fs.writeFileSync('scratch/ui-review/jersey-export-'+exports.length+'.png',bytes);});
 const run=s=>win.webContents.executeJavaScript(s),wait=async s=>{for(let i=0;i<150;i++){if(await run(s))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+s);};
 win.webContents.on('console-message',(_,level,message)=>{if(level>=3)console.error(message);});
 const capture=async name=>{await run('document.fonts.ready');await new Promise(r=>setTimeout(r,350));fs.writeFileSync('scratch/ui-review/'+name+'.png',(await win.webContents.capturePage()).toPNG());};
 const input=async(label,value)=>run(`(()=>{const e=[...document.querySelectorAll('label')].find(l=>l.childNodes[0]?.textContent===${JSON.stringify(label)})?.querySelector('input');if(!e)throw Error('Missing input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const select=async(label,value)=>run(`(()=>{const e=[...document.querySelectorAll('label')].find(l=>l.childNodes[0]?.textContent===${JSON.stringify(label)})?.querySelector('select');if(!e)throw Error('Missing select');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const click=async text=>{await wait(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`);return run(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing button: '+${JSON.stringify(text)});b.click();})()`);};
 try{
  fs.mkdirSync('scratch/ui-review',{recursive:true});await win.loadURL('http://127.0.0.1:5183/__studio');await wait("!!document.querySelector('.club-studio .brand-lockup')");
  await input('Club name','Gentle Mates Atelier');await input('Broadcast abbreviation','M8A');await click('Create crest');await select('Emblem','bolt');await select('Kit pattern','stripes');await input('Sponsor / chest text','MATES');
  await click('Save identity');await wait("document.querySelector('[role=status]')?.textContent.includes('Club identity saved')");
  const saved=await run('window.api.management.clubBranding(window.__studioCareer)');if(!saved.branding.logo?.startsWith('data:image/png;base64,')||!saved.branding.banner||saved.branding.name!=='Gentle Mates Atelier')throw Error('Design not persisted');
  await capture('club-studio');
  await run("document.querySelectorAll('.jersey-pair .text-link')[0].click()");await wait("document.querySelector('[role=status]')?.textContent.includes('Jersey design exported')");
  await run("document.querySelectorAll('.jersey-pair .text-link')[1].click()");await new Promise(r=>setTimeout(r,600));
  if(exports.length!==2||exports.some(s=>s.width!==640||s.height!==720))throw Error('Jersey export failed or exported the nested crest');
  await click('Upload');
  await run(`(async()=>{const saved=await window.api.management.clubBranding(window.__studioCareer),bytes=Uint8Array.from(atob(saved.branding.logo.split(',')[1]),c=>c.charCodeAt(0)),file=new File([bytes],'crest.png',{type:'image/png'}),transfer=new DataTransfer();transfer.items.add(file);const input=document.querySelector('input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait("!!document.querySelector('.brand-crest img')");await click('Save identity');await wait("document.querySelector('[role=status]')?.textContent.includes('Club identity saved')");
  const uploaded=await run('window.api.management.clubBranding(window.__studioCareer)');if(uploaded.branding.logoMode!=='upload'||!uploaded.branding.logo?.startsWith('data:image/png'))throw Error('Image upload was not saved');
  await run("location.hash='/dashboard'");await wait("!!document.querySelector('.club-brand-strip img')");
  if(!await run("document.querySelector('.club-brand-strip .matchday-team-crest img').src.startsWith('data:image/png')"))throw Error('Dashboard still shows old crest');await capture('club-branded-dashboard');
  await run("location.hash='/garage'");await wait("document.querySelectorAll('.garage-player').length===3");
  await select('Body','4284');await input('Preset name','Mates Fennec');await click('Save player preset');await wait("document.querySelector('[role=status]')?.textContent.includes('Saved')");
  const garage=await run('window.api.management.squadGarage(window.__studioCareer)');if(garage.players[0].preset.bodyId!==4284||!garage.players[0].preset.enabled||garage.players[1].preset.bodyId!==23)throw Error('Player presets leaked across squad');
  await click('Coordinate club colours');await wait("document.querySelector('[role=status]')?.textContent.includes('Saved squad coordination')");
  const coordinated=await run('window.api.management.squadGarage(window.__studioCareer)');if(coordinated.players.some(p=>!p.preset.useClubColors)||coordinated.players[0].preset.bodyId!==4284)throw Error('Coordination changed bodies');
  await capture('squad-garage');
  await run('window.__studioStore.getState().loadCareer(window.__studioCareer)');await run("location.hash='/club-studio'");await wait("!!document.querySelector('.brand-lockup')");
  if(!await run("document.querySelector('.brand-lockup h2').textContent==='Gentle Mates Atelier'"))throw Error('Career reload lost branding');
  await win.setContentSize(1100,900);await new Promise(r=>setTimeout(r,400));
  if(await run('document.documentElement.scrollWidth>innerWidth'))throw Error('Editor overflows a narrower desktop window');
  console.log('PASS: real IPC saves crest/banner/name; uploads and both jersey PNG exports work; dashboard uses custom crest; player presets remain distinct; squad coordination preserves bodies; career reload retains designs; narrow layout fits.');
 }catch(e){console.error(e);console.error(await run('location.hash'));fs.writeFileSync('scratch/ui-review/studio-check-failure.png',(await win.webContents.capturePage()).toPNG());code=1;}finally{win.destroy();app.exit(code);}
});
