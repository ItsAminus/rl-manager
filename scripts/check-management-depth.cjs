// Isolated real renderer/IPC check; never starts Rocket League or touches real saves.
const {app}=require('electron'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(root,'scratch/management-check-'));
process.env.RLM_USER_DATA=folder;app.disableHardwareAcceleration();const windows=[];
app.on('browser-window-created',(_,w)=>{windows.push(w);w.show=()=>{};w.focus=()=>{};});require('../dist-electron/main.js');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{let code=0;try{
 let win;for(let i=0;i<900;i++){win=windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().includes('/dist/index.html'));if(win)break;await delay(100);}if(!win)throw Error('No app window');
 const run=s=>win.webContents.executeJavaScript(`(async()=>(${s}))()`);
 const wait=async s=>{for(let i=0;i<450;i++){if(await run(s))return;await delay(100);}throw Error('Timed out: '+s);};
 await wait("!!document.querySelector('.tour-intro .tour-secondary')");await run("document.querySelector('.tour-intro .tour-secondary').click()");await wait("!document.querySelector('.tour-intro')");
 const created=await run(`(async()=>{await window.api.tutorial.finish('skipped');const t=(await window.api.teams.getSelectable()).find(t=>t.name==='Team Vitality');return window.api.career.create({managerName:'Management check',teamId:t.id,region:t.region,difficulty:'Medium',mode:'Manager Career'});})()`);
 if(!created.success)throw Error(created.error);
 await run("location.hash='/career/load'");await wait("!!document.querySelector('.save-item-card')");await run("document.querySelector('.save-item-card').click()");await run("document.querySelector('.load-btn').click()");await wait("location.hash==='#/dashboard'");
 const hidden=await run("window.api.db.all('SELECT playerId FROM hidden_prospects')");if(!hidden.length)throw Error('No grassroots intake');
 const list=await run("window.api.players.getFreeAgents()");if(list.some(p=>hidden.some(h=>h.playerId===p.id)))throw Error('Hidden prospect leaked');
 if(await run(`window.api.players.getById(${JSON.stringify(hidden[0].playerId)})`))throw Error('Direct profile leaked');
 win.webContents.setBackgroundThrottling(false);win.showInactive();
 for(const [route,selector,name] of [['/scouting','.scout-brief','scouting'],['/finances','.finances-page','finances'],['/dressing-room','.relationship-metrics','dynamics'],['/tactics','.local-comms-help','tactics'],['/settings','input[aria-label="Commentator voices"]','sound']]){
  await run(`location.hash=${JSON.stringify(route)}`);await wait(`!!document.querySelector(${JSON.stringify(selector)})`);await delay(350);fs.writeFileSync(path.join(folder,name+'.png'),(await win.webContents.capturePage()).toPNG());
 }
 const preferences=await run("window.api.app.integration()");await run(`window.api.app.saveIntegration(${JSON.stringify({...preferences,commentaryEnabled:false})})`);
 if((await run('window.api.app.integration()')).commentaryEnabled!==false)throw Error('Mute preference lost');
 const a=await run(`window.api.management.finances(${JSON.stringify(created.id)})`);if(!a.structure?.projections?.length)throw Error('Forecast missing');
 if(!a.vision||!a.obligations)throw Error('Board vision / instalment ledger missing');
 const vision=await run(`window.api.management.negotiateVision(${JSON.stringify(created.id)},{winRate:45,wagePercent:125,youthPercent:0})`);if(!vision.success)throw Error(vision.error);
 await run("location.hash='/finances'");await wait("document.body.innerText.includes('Negotiate your club vision')");await delay(250);fs.writeFileSync(path.join(folder,'board-negotiation.png'),(await win.webContents.capturePage()).toPNG());
 const agreed=await run(`window.api.management.negotiateVision(${JSON.stringify(created.id)},null,true)`);if(!agreed.success)throw Error(agreed.error);
 const target=await run(`window.api.db.query('SELECT p.id FROM players p JOIN teams t ON t.id=p.teamId WHERE p.teamId<>? AND p.overall BETWEEN 65 AND 75 AND p.marketValue>0 ORDER BY p.id LIMIT 1', ${JSON.stringify(created.teamId||'team_1')})`);
 if(!target)throw Error('No transfer target');console.log('Transfer target selected');
 await run(`location.hash='/negotiate/${target.id}'`);await wait("document.body.textContent.includes('Club-to-club talks')");await delay(250);fs.writeFileSync(path.join(folder,'club-bargaining.png'),(await win.webContents.capturePage()).toPNG());
 const quote=await run(`window.api.management.signingQuote(${JSON.stringify(created.id)},${JSON.stringify(target.id)})`);if(quote.club?.floor!==undefined)throw Error('Seller floor leaked');
 const club=await run(`window.api.management.negotiateClubFee(${JSON.stringify(created.id)},${JSON.stringify(target.id)},{fee:${quote.club.asking},upfrontPercent:100,months:0})`);if(!club.success||club.status!=='agreed')throw Error(club.error||'No club agreement');
 await run("location.hash='/finances'");await wait("document.body.innerText.includes('Signed agreement')");await delay(250);fs.writeFileSync(path.join(folder,'board-agreed.png'),(await win.webContents.capturePage()).toPNG());
 const ssa=await run("window.api.db.all(\"SELECT name FROM teams WHERE id LIKE '%_ssa'\")");if(!ssa.some(t=>t.name==='The Punishers'))throw Error('SSA additions missing');
 const hire=await run(`window.api.management.hireDepartment(${JSON.stringify(created.id)},'Recruitment')`);if(!hire.success)throw Error(hire.error);
 console.log(JSON.stringify({passed:true,hiddenProspectsProtected:true,briefs:true,staffAndForecast:true,dynamics:true,localTactics:true,mutePersists:true,screenshots:folder}));
 }catch(e){code=1;console.error(e.stack);const w=windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().includes('/dist/index.html'));if(w){console.error(await w.webContents.executeJavaScript('document.body.innerText'));fs.writeFileSync(path.join(folder,'failure.png'),(await w.webContents.capturePage()).toPNG());}}finally{app.exit(code);}})();
