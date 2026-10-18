// Exercises the real IPC in a hidden window against the isolated preview save.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1600,height:1100,webPreferences:{contextIsolation:true,offscreen:true,backgroundThrottling:false}});
  const run=code=>win.webContents.executeJavaScript(code);
  const wait=async code=>{for(let i=0;i<160;i++){if(await run(code))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout: '+code);};
  let failed=false,careerId;
  try{
    await win.webContents.session.clearCache();
    await win.loadURL('http://127.0.0.1:5179/__review');
    await wait('document.body.innerText.includes("Your starting three")');
    const created=await run("window.api.career.create({managerName:'Lineup and sales test',teamId:'team_15',region:'Middle East & North Africa',difficulty:'Normal'})");
    if(!created.success)throw Error(created.error);careerId=created.id;
    await run(`import('/src/stores/careerStore.ts').then(m=>m.useCareerStore.getState().loadCareer(${JSON.stringify(careerId)}))`);
    await run("location.hash='/squad'");
    await wait('document.querySelectorAll(".starter-detailed-card").length===3 && document.querySelectorAll(".roster-row").length>=4');
    const roster=await run("window.api.players.getByTeam('team_15')");
    const reserve=roster[3];
    await run(`{
      const rows=Array.from(document.querySelectorAll('.roster-row'));
      const source=rows.find(r=>r.innerText.includes(${JSON.stringify(reserve.gamertag)}));
      const target=document.querySelectorAll('.starter-detailed-card')[1];
      const dt=new DataTransfer();dt.setData('application/x-rlmanager-player',${JSON.stringify(reserve.id)});
      source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));
      target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt}));
      target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));
    }`);
    await wait(`document.querySelectorAll('.starter-detailed-card')[1].innerText.includes(${JSON.stringify(reserve.gamertag)})`);
    const saved=await run("window.api.players.getByTeam('team_15')");
    if(saved[1].id!==reserve.id)throw Error('Drag selection not persisted');
    await run(`Array.from(document.querySelectorAll('.roster-row')).find(r=>r.innerText.includes(${JSON.stringify(roster[1].gamertag)})).querySelector('button').click()`);
    await run("document.querySelectorAll('.starter-detailed-card')[2].click()");
    await wait(`document.querySelectorAll('.starter-detailed-card')[2].innerText.includes(${JSON.stringify(roster[1].gamertag)})`);
    fs.mkdirSync('scratch/ui-review',{recursive:true});
    fs.writeFileSync('scratch/ui-review/drag-lineup.png',(await win.webContents.capturePage()).toPNG());
    await run("location.hash='/transfers?tab=outgoing'");
    await wait('document.querySelectorAll(".sale-player").length>=4');
    await wait("document.querySelector('.sale-player .player-avatar-wrapper').getBoundingClientRect().width <= 40");
    await run("document.querySelector('.sale-player button').click()");
    await wait("document.querySelector('.sale-player').innerText.includes('Transfer listed')");
    const listed=await run(`window.api.management.outgoingTransfers(${JSON.stringify(careerId)})`);
    if(listed.listings.length!==1)throw Error('Listing was not saved');
    const player=listed.listings[0].playerId;
    const insert="INSERT INTO outgoing_offers (id,careerId,playerId,sellerId,buyerId,fee,ceiling,salary,bonus,duration,status,createdDate,expiresDate,rounds,reason) VALUES ('ui-offer',?,?,'team_15','team_1',50000,80000,30000,60000,12,'pending','2026-10-11','2026-10-16',0,'Offer received')";
    await run(`window.api.db.run(${JSON.stringify(insert)},[${JSON.stringify(careerId)},${JSON.stringify(player)}])`);
    await run("location.hash='/squad'");await wait("document.querySelectorAll('.starter-detailed-card').length===3");
    await run("location.hash='/transfers?tab=outgoing'");await wait("document.querySelectorAll('.sale-offer').length===1");
    await run("document.querySelector('.sale-offer button').click()");
    await wait("document.querySelector('.sale-offer').innerText.includes('Player decision expected')");
    const offers=await run(`window.api.management.outgoingTransfers(${JSON.stringify(careerId)})`);
    if(offers.offers[0].status!=='player_talks')throw Error('Offer acceptance failed');
    fs.writeFileSync('scratch/ui-review/outgoing-sales.png',(await win.webContents.capturePage()).toPNG());
    await run("document.querySelector('.sale-offer').scrollIntoView({block:'center'})");
    await new Promise(r=>setTimeout(r,350));
    fs.writeFileSync('scratch/ui-review/sale-player-talks.png',(await win.webContents.capturePage()).toPNG());
    console.log('PASS: reserve dragged into slot 2 and persisted; click swap into slot 3; listing saved; real IPC agreement enters player talks.');
  }catch(e){failed=true;console.error(e);}
  finally{
    if(careerId){try{await run(`window.api.career.delete(${JSON.stringify(careerId)})`);await run("window.api.career.load('ui-preview')");}catch(e){console.error('Test cleanup:',e);}}
    fs.writeFileSync('scratch/ui-review/sales-lineup-check.json',JSON.stringify({passed:!failed}));
    win.destroy();app.exit(failed?1:0);
  }
});
