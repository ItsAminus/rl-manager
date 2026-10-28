// Real app/IPC smoke test with an isolated profile; never launches Rocket League.
const {app}=require('electron'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(root,'scratch/desk-check-'));
process.env.RLM_USER_DATA=folder;app.disableHardwareAcceleration();const windows=[];
app.on('browser-window-created',(_,win)=>{windows.push(win);win.show=()=>{};win.focus=()=>{};});
require('../dist-electron/main.js');const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{let code=0;try{
 let win;for(let i=0;i<900;i++){win=windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().includes('/dist/index.html'));if(win){win.webContents.on('console-message',(_,level,message)=>{if(level>=2)console.log('RENDERER',message.slice(0,400));});break;}await delay(100);}if(!win)throw Error('No main window');
 const run=async s=>{let r;try{r=await win.webContents.executeJavaScript(`(async()=>{try{return {value:await (${s})};}catch(e){return {failure:e.message,stack:e.stack};}})()`);}catch(e){throw Error(s.slice(0,250)+' : '+e.message);}if(r.failure)throw Error(r.failure+'\n'+r.stack);return r.value;};
 const wait=async s=>{for(let i=0;i<450;i++){if(await run(s))return;await delay(100);}throw Error('Timed out: '+s);};
 await wait("!!document.querySelector('.tour-intro .tour-secondary')");await run("document.querySelector('.tour-intro .tour-secondary').click()");await wait("!document.querySelector('.tour-intro')");

 const career=await run(`(async()=>{await window.api.tutorial.finish('skipped');const teams=await window.api.teams.getSelectable(),t=teams.find(t=>t.name==='Astronic Esports');if(!t)throw Error('Astronic not selectable');return window.api.career.create({managerName:'Desk check',teamId:t.id,region:t.region,difficulty:'Medium',mode:'Manager Career'});})()`);
 if(!career.success)throw Error(career.error);
 await run("location.hash='/career/load'");await wait("document.querySelectorAll('.save-item-card').length===1");await run("document.querySelector('.save-item-card').click()");await run("document.querySelector('.load-btn').click()");await wait("location.hash==='#/dashboard'");
 const tags=await run(`(await window.api.players.getByTeam('astronic_esports_ssa')).map(p=>p.gamertag).sort()`);if(JSON.stringify(tags)!==JSON.stringify(['Galaxy','Mercury','insp1re']))throw Error('Incorrect Astronic roster '+JSON.stringify(tags));
 const upcoming=await run(`(async()=>{const c=await window.api.career.load(${JSON.stringify(career.id)});return (await window.api.fixtures.getUpcoming(c.team.id,c.career.currentDate))[0];})()`);
 if(!upcoming)throw Error('No fixture');
 // The first generated fixture can be a scrim, which has no competition film.
 // Use a disposable RLCS event to exercise the actual video handoff.
 await run(`window.api.db.run("UPDATE competitions SET type='REGIONAL',name='RLCS Test Open' WHERE id=?",${JSON.stringify(upcoming.competitionId)})`);
 await run(`(async()=>{for(let n=0;n<15;n++){const c=await window.api.career.load(${JSON.stringify(career.id)});if(c.career.currentDate>=${JSON.stringify(upcoming.scheduledDate)})return;const r=await window.api.calendar.advanceDay(${JSON.stringify(career.id)});if(!r.success)throw Error(r.error);}throw Error('Unable to reach matchday');})()`);
 await run("location.hash='/career/load'");await wait("!!document.querySelector('.save-item-card')");await run("document.querySelector('.save-item-card').click()");await run("document.querySelector('.load-btn').click()");await wait("location.hash==='#/dashboard'");
 await run(`location.hash='/match-day/'+${JSON.stringify(upcoming.id)}`);await wait("!!document.querySelector('.desk-matchup')");
 if(!await run("document.querySelector('.prematch-desk').textContent.includes('Galaxy')"))throw Error('No lineup in desk');
 if(!await run("document.querySelector('.prematch-desk').getBoundingClientRect().height>400"))throw Error('Desk content is clipped');
 await wait("!!document.querySelector('.competition-intro[open]')");
 if(await run("!!document.querySelector('.desk-live')"))throw Error('Desk started before video ended');
 await run("document.querySelector('.competition-intro-skip').click()");await wait("!document.querySelector('.competition-intro[open]')");
 await run("document.querySelector('.prematch-desk').scrollIntoView({block:'start'})");win.webContents.setBackgroundThrottling(false);win.showInactive();await delay(600);
 const out=path.join(root,'scratch/verification/prematch-desk');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'briefing.png'),(await win.webContents.capturePage()).toPNG());
 await run("document.querySelector('.desk-play').click()");await wait("document.body.textContent.includes('Select')||!!document.querySelector('.modal-overlay')");
 await run("location.hash='/dashboard'");await wait("location.hash==='#/dashboard'");
 // Force only this disposable fixture into a final to check the longer desk route.
 await run(`window.api.db.run("UPDATE competitions SET type='MAJOR',name='RLCS Test Major' WHERE id=?",${JSON.stringify(upcoming.competitionId)})`);
 await run(`window.api.db.run("INSERT OR REPLACE INTO tournament_nodes(id,competitionId,label,fixtureId) VALUES('desk-final',?,'Grand Final',?)",${JSON.stringify(upcoming.competitionId)},${JSON.stringify(upcoming.id)})`);
 await run(`window.api.db.run("INSERT OR REPLACE INTO fixture_stages(fixtureId,competitionId,nodeId) VALUES(?,?,'desk-final')",${JSON.stringify(upcoming.id)},${JSON.stringify(upcoming.competitionId)})`);
 let mediaStarted=false;win.webContents.on('media-started-playing',()=>{mediaStarted=true;});win.webContents.setAudioMuted(true);
 await run(`location.hash='/match-day/'+${JSON.stringify(upcoming.id)}`);await wait("document.querySelector('.prematch-desk h2')?.textContent==='The big match desk'");
 if(!await run("document.querySelector('.match-stage-badge')?.textContent==='Final'"))throw Error('Final stage badge missing');
 const finalDesk=await run(`window.api.management.prematchDesk(${JSON.stringify(career.id)},${JSON.stringify(upcoming.id)})`);
 if(finalDesk.turns.filter(t=>t.category.startsWith('final_hype')).length!==3)throw Error('Final hype not selected');
 await wait("!!document.querySelector('.desk-discussion details')");await run("(()=>{document.querySelector('.desk-discussion details').open=true;document.querySelector('.prematch-desk').scrollIntoView({block:'start'});})()");await delay(400);
 fs.writeFileSync(path.join(out,'extended.png'),(await win.webContents.capturePage()).toPNG());
 await wait("!!document.querySelector('.desk-live')");
 for(let n=0;n<50&&!mediaStarted;n++)await delay(100);if(!mediaStarted)throw Error('Prepared audio did not start');
 await run("document.querySelector('.desk-audio-controls button').click()");
 if(!await run("document.querySelector('.desk-audio-controls button').getAttribute('aria-pressed')==='true'"))throw Error('Mute preference did not change');
 if(!await run("!!document.querySelector('.desk-live p')?.textContent"))throw Error('Subtitles missing');
 await run("document.querySelector('.desk-play').click()");await wait("!document.querySelector('.desk-live')");
 const status=await run(`window.api.management.deskAudioStatus(${JSON.stringify(career.id)},${JSON.stringify(upcoming.id)})`);if(status.state!=='ready')throw Error('Prepared bank was not immediately ready: '+JSON.stringify(status));
 console.log(JSON.stringify({passed:true,astronicLineup:tags,videoRestored:true,skipVideo:true,extendedFinal:true,playNowCancels:true,automaticAudio:mediaStarted,muteAndSubtitles:true,screenshots:out,profile:folder}));
 }catch(e){code=1;console.error(e.stack);}finally{app.exit(code);}})();
