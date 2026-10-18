// Runs the real player entry point against a disposable user-data directory.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),scratch=path.join(root,'scratch');fs.mkdirSync(scratch,{recursive:true});
const folder=fs.mkdtempSync(path.join(scratch,'player-release-'));process.env.RLM_USER_DATA=folder;
app.disableHardwareAcceleration();const windows=[],errors=[];let startupShot=false;
app.on('browser-window-created',(_,win)=>{windows.push(win);win.webContents.on('console-message',(_,level,message)=>{if(level>=3)errors.push(message);});
  win.webContents.on('did-finish-load',async()=>{if(win.webContents.getURL().includes('splash.html')){await new Promise(r=>setTimeout(r,25));if(!win.isDestroyed()){fs.mkdirSync(path.join(scratch,'release-review'),{recursive:true});fs.writeFileSync(path.join(scratch,'release-review/splash.png'),(await win.webContents.capturePage()).toPNG());startupShot=true;}}});
});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
require('../dist-electron/main.js');
(async()=>{
 let win,code=0;try{
  for(let i=0;i<600;i++){win=windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().includes('/dist/index.html'));if(win&&await win.webContents.executeJavaScript("!!document.querySelector('.tour-intro')").catch(()=>false))break;await delay(100);}
  if(!win)throw Error('No player window');const run=s=>win.webContents.executeJavaScript(s);
  const wait=async(s,limit=400)=>{for(let i=0;i<limit;i++){if(await run(s))return;await delay(100);}throw Error('Timed out: '+s);};
  const click=async(selector)=>run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el||el.disabled)throw Error('Unavailable control: '+${JSON.stringify(selector)});el.click();})()`);
  const shot=async(name)=>{await delay(250);fs.mkdirSync(path.join(scratch,'release-review'),{recursive:true});fs.writeFileSync(path.join(scratch,'release-review',name+'.png'),(await win.webContents.capturePage()).toPNG());};
  await wait("!!document.querySelector('.tour-intro')");await shot('tutorial-intro');
  win.webContents.openDevTools({mode:'detach'});await delay(100);if(win.webContents.isDevToolsOpened()){win.webContents.closeDevTools();throw Error('Developer tools enabled');}
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'F12'});await delay(100);if(win.webContents.isDevToolsOpened())throw Error('F12 opened tools');
  const before=await run('window.api.career.list()');
  await click('.tour-intro .tour-primary');
  const steps=['office','difficulty','open-inbox','inbox','open-squad','squad','swap','talk','open-tactics','tactics','save-plan','schedule','market','scout','chirp','post','money','identity','calendar','events','bracket','matchday','comms','path','xp','open-development','upgrade','tiers','open-challenges','challenges','journey','finish'];
  for(const [index,id] of steps.entries()){
    console.log('Checking tour step:',id);
    await wait(`document.querySelector('.tour-root')?.dataset.step===${JSON.stringify(id)}&&!document.querySelector('.tour-coach-card').textContent.includes('Preparing your practice')`);
    await wait("!document.querySelector('.tour-error')");
    await wait("!!document.querySelector('.tour-outline')");
    if(id==='matchday'&&process.env.RLM_CHECK_INJECTOR_ONLY){
      const {ipcMain}=require('electron');
      const fixtureId=await run("location.hash.split('/').pop().split('?')[0]");
      // The practice series is two days ahead and cannot actually be launched.
      // Use its real teams for this read-only startup presentation check.
      const fixture=await run(`window.api.fixtures.getById(${JSON.stringify(fixtureId)})`);
      if(!fixture)throw Error('No practice fixture for injector screen');
      ipcMain.removeHandler('fixtures:getById');ipcMain.handle('fixtures:getById',()=>({...fixture,playError:''}));
      const requestId='a'.repeat(32);let confirmations=0;
      let status={state:'running',phase:'awaiting_injector_confirmation',fixtureId,injectorRequestId:requestId,message:'At Rocket League main menu? Confirm startup.'};
      ipcMain.removeHandler('rlbot:status');ipcMain.handle('rlbot:status',()=>status);
      ipcMain.removeHandler('rlbot:confirmBakkesmod');ipcMain.handle('rlbot:confirmBakkesmod',(_,fixture,request)=>{
        if(fixture!==fixtureId||request!==requestId)throw Error('Wrong startup confirmation');
        confirmations++;status={...status,phase:'injecting',injectorRequestId:undefined};return {success:true};
      });
      const matchHash=await run('location.hash');await run("location.hash='/dashboard'");await wait("!!document.querySelector('.overview-metrics')");
      await run(`location.hash=${JSON.stringify(matchHash)}`);
      await wait("!!document.querySelector('.injector-confirmation button')");
      const hideGuide=await win.webContents.insertCSS('.tour-root{visibility:hidden!important}');
      await shot('manual-bakkesmod-confirmation');
      // The practice guide deliberately blocks clicks outside its spotlight.
      // Invoke this real React handler while the guide is hidden for this check.
      await run("(()=>{const button=document.querySelector('.injector-confirmation button'),key=Object.keys(button).find(k=>k.startsWith('__reactProps$'));return button[key].onClick();})()");
      await wait("!document.querySelector('.injector-confirmation')");
      if(confirmations!==1)throw Error('Injector confirmation did not reach the launch exactly once');
      status={state:'failed',fixtureId,message:'Test startup finished without launching Rocket League'};
      await wait("!document.querySelector('.match-running-overlay')");
      await win.webContents.removeInsertedCSS(hideGuide);
    }
    const hint=await run("document.querySelector('.tour-task')?.textContent||''");
    if(hint&&!hint.startsWith('✓')){
      if(id==='tactics')await run("(()=>{const el=document.querySelector('.tactics-page select');el.selectedIndex=(el.selectedIndex+1)%el.options.length;el.dispatchEvent(new Event('change',{bubbles:true}));})()");
      else if(id==='swap'){await click('.starter-detailed-card:nth-child(1)');await click('.starter-detailed-card:nth-child(2)');}
      else if(id==='save-plan')await click('.tactics-header button');
      else if(id==='post'){await run("(()=>{const el=document.querySelector('.chirp-composer textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'First day in the office. Lets make this season count.');el.dispatchEvent(new Event('input',{bubbles:true}));})()");await wait("!document.querySelector('.chirp-composer .chirp-primary').disabled");await click('.chirp-composer .chirp-primary');}
      else if(id==='upgrade'){await click('.skill-player-card .skill-allocation-list button:not(:disabled)');await wait("!!document.querySelector('.skill-upgrade-receipt')");}
      else {const link={'open-inbox':'inbox','open-squad':'squad','open-tactics':'tactics','open-development':'training','open-challenges':'challenges'}[id];if(!link)throw Error('Unknown task '+id);await click(`.nav-item[href="#/${link}"]`);}
      await wait("document.querySelector('.tour-task')?.textContent.startsWith('✓')");
    }
    if(id==='identity'&&!process.env.RLM_CHECK_INJECTOR_ONLY){
      await wait("!!document.querySelector('.club-studio .brand-lockup')");
      const practice=await run("window.api.tutorial.start('Manager Career')");
      await run(`(()=>{const el=document.querySelector('.design-controls input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Practice Atelier');el.dispatchEvent(new Event('input',{bubbles:true}));[...document.querySelectorAll('.design-segments button')].find(b=>b.textContent==='Create crest').click();})()`);
      await wait("!document.querySelector('.design-heading-actions .btn-primary').disabled");await click('.design-heading-actions .btn-primary');
      await wait("document.querySelector('[role=status]')?.textContent.includes('Club identity saved')||!!document.querySelector('[role=alert]')");
      if(await run("!!document.querySelector('[role=alert]')"))throw Error('Club Studio builder failed under production CSP: '+await run("document.querySelector('[role=alert]').textContent"));
      const saved=await run(`window.api.management.clubBranding(${JSON.stringify(practice.id)})`);
      if(saved.branding.name!=='Practice Atelier'||!saved.branding.logo?.startsWith('data:image/png')||!saved.branding.banner?.startsWith('data:image/png'))throw Error('Builder images not persisted');
      await run("[...document.querySelectorAll('.design-segments button')].find(b=>b.textContent==='Upload').click()");
      const bytes=fs.readFileSync(path.join(root,'public/brand/chirp-emblem.png')).toString('base64');
      await run(`(()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(bytes)}),c=>c.charCodeAt(0)),file=new File([bytes],'crest.png',{type:'image/png'}),transfer=new DataTransfer();transfer.items.add(file);const el=document.querySelector('input[type=file]');el.files=transfer.files;el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await wait("!!document.querySelector('.brand-crest img')&&!document.querySelector('.design-heading-actions .btn-primary').disabled");await click('.design-heading-actions .btn-primary');
      await wait("document.querySelector('[role=status]')?.textContent.includes('Club identity saved')");
      const uploaded=await run(`window.api.management.clubBranding(${JSON.stringify(practice.id)})`);
      if(uploaded.branding.logoMode!=='upload'||!uploaded.branding.logo?.startsWith('data:image/png'))throw Error('Uploaded crest did not save');
      await run("location.hash='/dashboard'");await wait("!!document.querySelector('.overview-metrics')");await run("location.hash='/club-studio'");await wait("!!document.querySelector('.club-studio .brand-lockup')");
      if(!await run("document.querySelector('.brand-lockup h2').textContent==='Practice Atelier'&&!!document.querySelector('.brand-crest img')"))throw Error('Studio reload lost changes');await shot('club-studio-production');
    }
    if(id==='bracket'&&!process.env.RLM_CHECK_INJECTOR_ONLY){
      const originalHash=await run('location.hash');
      await run(`(async()=>{
        const practice=await window.api.tutorial.start('Manager Career'),career=await window.api.db.query('SELECT * FROM careers WHERE id=?',practice.id);
        const all=await window.api.db.all('SELECT t.id FROM teams t WHERE (SELECT COUNT(*) FROM players p WHERE p.teamId=t.id)>=3 AND NOT EXISTS(SELECT 1 FROM generated_entities g WHERE g.id=t.id) AND NOT EXISTS(SELECT 1 FROM team_roster_sources rs WHERE rs.teamId=t.id AND rs.status=?) ORDER BY CASE WHEN t.id=? THEN 0 ELSE 1 END,t.reputation DESC LIMIT 16','inactive',career.teamId);
        await window.api.db.run('INSERT INTO competitions(id,name,region,type,format,status,config) VALUES(?,?,?,?,?,?,?)','repair-ui','Legacy Major','GLOBAL','MAJOR','round_robin','scheduled',JSON.stringify({legacyRules:true,seriesFormat:'BO7'}));
        await window.api.db.run('INSERT INTO career_competitions VALUES(?,?,?,?,?,?)','repair-ui',practice.id,'MAJOR',3,career.currentDate,JSON.stringify(['repair-source']));
        await window.api.db.run('INSERT INTO competitions(id,name,region,type,status) VALUES(?,?,?,?,?)','repair-source','Completed qualifier','Europe','REGIONAL','completed');
        await window.api.db.run('INSERT INTO career_competitions VALUES(?,?,?,?,?,?)','repair-source',practice.id,'REGIONAL',3,career.currentDate,'[]');
        for(const [i,t] of all.entries()){
          await window.api.db.run('INSERT INTO competition_entries(competitionId,teamId,seed) VALUES(?,?,?)','repair-source',t.id,i+1);
          if(i<14)await window.api.db.run('INSERT INTO competition_entries(competitionId,teamId,seed) VALUES(?,?,?)','repair-ui',t.id,i+1);
        }
        await window.api.db.run('INSERT INTO fixtures(id,competitionId,round,homeTeamId,awayTeamId,scheduledDate,status,seriesFormat,homeScore,awayScore) VALUES(?,?,?,?,?,?,?,?,?,?)','repair-played','repair-ui',1,all[0].id,all[1].id,career.currentDate,'completed','BO7',4,1);
        location.hash='/competition/repair-ui?tab=bracket';
      })()`);
      await wait("!!document.querySelector('.event-format-repair')");
      await run("document.querySelector('.event-format-repair .btn-primary').click()");await wait("document.querySelectorAll('.repair-entrant-list>span').length===16");await shot('major-repair-review');
      await click('.repair-actions .btn-primary');await wait("document.querySelectorAll('.event-group').length===4");
      const event=await run("window.api.competitions.getById('repair-ui')");if(event.fixtures.length!==24||event.tournament.groups.some(g=>g.standings.length!==4))throw Error('Repaired group schedule malformed');
      await run("[...document.querySelectorAll('button')].find(b=>b.textContent==='Watch group draw').click()");await wait("!!document.querySelector('.group-draw-dialog[open]')");
      await run("[...document.querySelectorAll('.group-draw-dialog button')].find(b=>b.textContent==='Reveal all teams')?.click()");await wait("document.querySelectorAll('.draw-team.revealed').length===16");await shot('major-group-draw');
      await run("document.querySelector('.group-draw-dialog button[aria-label]').click()");await shot('major-four-groups');
      await run(`(async()=>{
        const practice=await window.api.tutorial.start('Manager Career'),career=await window.api.db.query('SELECT * FROM careers WHERE id=?',practice.id),entries=(await window.api.competitions.getById('repair-ui')).entries;
        const config={rulesVersion:3,tournamentVersion:1,kind:'MAJOR',cycle:1,advance:2,groupFormat:'BO5',playoffFormat:'BO7',seriesFormat:'BO5'};
        await window.api.db.run('INSERT INTO competitions(id,name,region,type,format,status,config) VALUES(?,?,?,?,?,?,?)','proper-ui','RLCS Official Major','GLOBAL','MAJOR','round_robin_hybrid','scheduled',JSON.stringify(config));
        await window.api.db.run('INSERT INTO career_competitions VALUES(?,?,?,?,?,?)','proper-ui',practice.id,'MAJOR',1,career.currentDate,'[]');
        await window.api.db.run('INSERT INTO tournament_state(competitionId,phase,drawDate,startDate,config) VALUES(?,?,?,?,?)','proper-ui','awaiting_draw',career.currentDate,career.currentDate,JSON.stringify(config));
        await window.api.db.run('INSERT INTO competitions(id,name,region,type,format,status,config) VALUES(?,?,?,?,?,?,?)','duplicate-ui','International Major 3','GLOBAL','MAJOR','round_robin','scheduled',JSON.stringify({legacyRules:true}));
        await window.api.db.run('INSERT INTO career_competitions VALUES(?,?,?,?,?,?)','duplicate-ui',practice.id,'MAJOR',3,career.currentDate,'[]');
        for(const [i,t] of entries.entries()){
          await window.api.db.run('INSERT INTO competition_entries(competitionId,teamId,seed) VALUES(?,?,?)','proper-ui',t.teamId,i+1);
          if(i<14)await window.api.db.run('INSERT INTO competition_entries(competitionId,teamId,seed) VALUES(?,?,?)','duplicate-ui',t.teamId,i+1);
        }
        await window.api.db.run('INSERT INTO fixtures(id,competitionId,round,homeTeamId,awayTeamId,scheduledDate,status,seriesFormat,homeScore,awayScore) VALUES(?,?,?,?,?,?,?,?,?,?)','duplicate-played','duplicate-ui',1,entries[0].teamId,entries[1].teamId,career.currentDate,'completed','BO7',4,1);
        location.hash='/competition/duplicate-ui?tab=bracket';
      })()`);
      await wait("!!document.querySelector('.event-format-repair')&&document.body.textContent.includes('International Major 3')");await click('.event-format-repair .btn-primary');
      await wait("document.querySelector('.repair-actions .btn-primary')?.textContent==='Retire league & open official event'");await click('.repair-actions .btn-primary');
      await wait("location.hash.includes('/competition/proper-ui')&&document.body.textContent.includes('RLCS Official Major')&&!document.querySelector('.event-format-repair')");await shot('major-official-draw-pending');
      await run(`location.hash=${JSON.stringify(originalHash)}`);await wait("!location.hash.includes('repair-ui')");
    }
    if([0,1,8,18,23,26,28].includes(index))await shot('tour-'+id);
    const fit=await run("(()=>{const b=document.querySelector('.tour-coach-card').getBoundingClientRect();return b.right<=innerWidth&&b.bottom<=innerHeight&&b.top>=32;})()");if(!fit)throw Error('Tutorial card outside viewport: '+id);
    await wait("!document.querySelector('.tour-coach-card .tour-primary').disabled");await click('.tour-coach-card .tour-primary');
  }
  await wait("!document.querySelector('.tour-root')&&!!document.querySelector('.welcome-page')");await shot('menu');
  const artwork=await run("(async()=>{const url=getComputedStyle(document.querySelector('.welcome-art')).backgroundImage.slice(5,-2);const image=new Image();image.src=url;await image.decode();return {width:image.naturalWidth,url};})()");if(artwork.width<1000)throw Error('Main-menu background did not load');
  for(const scene of ['Championship night','Into the arena']){
    await click(`.arena-backdrops button[aria-label="${scene}"]`);
    const image=await run("(async()=>{const el=new Image();el.src=getComputedStyle(document.querySelector('.welcome-art')).backgroundImage.slice(5,-2);await el.decode();return el.naturalWidth;})()");if(image<1000)throw Error('Missing arena backdrop');
    await shot('menu-'+scene.split(' ')[0].toLowerCase());
  }
  await win.setContentSize(1024,720);await delay(350);await shot('menu-1024');
  if(await run('document.documentElement.scrollWidth>innerWidth'))throw Error('Menu overflows narrow viewport');
  const after=await run('window.api.career.list()');if(JSON.stringify(after)!==JSON.stringify(before))throw Error('Practice was added to real career list');
  const info=await run('window.api.app.playerInfo()');if(info.preferences.tutorialOutcome!=='completed')throw Error('Completion not remembered');
  await run("location.hash='/settings'");await wait("!!document.querySelector('.settings-tabs')");if(await run("/Developer Mode|INJECT TREASURY|Force Advance/.test(document.body.textContent)"))throw Error('Cheats remain');await shot('settings');
  if(errors.some(e=>!e.includes('Failed to load resource')))throw Error(errors.join('\n'));
  console.log(JSON.stringify({passed:true,steps:steps.length,realCareersUnchanged:true,firstLaunchRemembered:true,devToolsDisabled:true,startupShot,folder}));
 }catch(e){code=1;console.error(e.stack);if(win&&!win.isDestroyed()){console.error(await win.webContents.executeJavaScript('document.body.innerText'));fs.mkdirSync(path.join(scratch,'release-review'),{recursive:true});fs.writeFileSync(path.join(scratch,'release-review/failure.png'),(await win.webContents.capturePage()).toPNG());}}
 finally{app.exit(code);}
})();
