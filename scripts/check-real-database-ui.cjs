// Verify real IPC and rendered provenance in a hidden window and isolated save.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1500,height:1000,webPreferences:{contextIsolation:true,backgroundThrottling:false,offscreen:true}});
  win.webContents.on('console-message',(_,level,message)=>{if(level>=2)console.log('Renderer:',message);});
  const run=async code=>{try{return await win.webContents.executeJavaScript(code);}catch(e){throw Error(code+': '+e.message);}};
  const wait=async code=>{for(let i=0;i<180;i++){if(await run(code))return;await new Promise(r=>setTimeout(r,150));}throw Error('Timed out: '+code);};
  let failed=false;
  try{
    await win.loadURL('http://127.0.0.1:5179/__review');
    await wait('document.body.innerText.includes("Your starting three")');
    const players=await run('window.api.players.getAll()');
    const teams=await run('window.api.teams.getAll()');
    if(players.length<5709 || teams.length<1704)throw Error('Real pool missing: '+players.length+' players, '+teams.length+' teams');
    if(players.some(p=>/^(amateur_|academy_)/.test(p.id)) || teams.some(t=>/^(amateur_|open_reserve_)/.test(t.id)))throw Error('Invented identities leaked into active recruitment');
    const nass=players.find(p=>p.id==='player_12');
    if(nass.overall!==98 || !nass.ratingSources || nass.ratingConfidence!=='high')throw Error('Nass rating/evidence missing');
    const pending=await run(`window.api.db.query("SELECT COUNT(*) AS count FROM fixtures f JOIN career_competitions cc ON cc.competitionId=f.competitionId WHERE cc.careerId='ui-preview' AND f.status='scheduled' AND (EXISTS(SELECT 1 FROM generated_entities g WHERE g.id=f.homeTeamId) OR EXISTS(SELECT 1 FROM generated_entities g WHERE g.id=f.awayTeamId))")`);
    if(pending.count)throw Error('Legacy generated opponents still scheduled: '+pending.count);
    await run('location.hash="/player/player_12"');
    await wait('document.body.innerText.includes("Rating review")');
    if(!await run('document.body.innerText.includes("1v1") && document.body.innerText.includes("2026-10-11")'))throw Error('Rating context missing from dossier');
    await new Promise(r=>setTimeout(r,500));
    fs.mkdirSync('scratch/ui-review',{recursive:true});
    fs.writeFileSync('scratch/ui-review/nass-rating-evidence.png',(await win.webContents.capturePage()).toPNG());
    await run('location.hash="/transfers"');
    await wait('document.querySelectorAll(".transfers-table tbody tr").length===50');
    await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.startsWith('Show more'))`);
    await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.startsWith('Show more')).click()`);
    await wait('document.querySelectorAll(".transfers-table tbody tr").length===100');
    const created=await run(`window.api.career.create({managerName:'Database verification',teamId:'team_2',region:'Europe',difficulty:'Normal'})`);
    if(!created.success)throw Error(created.error);
    const loaded=await run(`window.api.career.load(${JSON.stringify(created.id)})`);
    if(loaded.career.currentDate!=='2026-10-11')throw Error('New career starts before source snapshot');
    const europe=await run(`window.api.db.query("SELECT COUNT(*) AS count FROM competition_entries ce JOIN competitions c ON c.id=ce.competitionId JOIN career_competitions cc ON cc.competitionId=c.id WHERE cc.careerId=? AND c.type='QUALIFIER' AND c.region='Europe' AND cc.cycle=1",[${JSON.stringify(created.id)}])`);
    if(europe.count!==681)throw Error('Real European qualifier field incorrect: '+europe.count);
    await run(`window.api.career.delete(${JSON.stringify(created.id)})`);
    await run("window.api.career.load('ui-preview')");
    console.log('PASS: '+teams.length+' real teams; '+players.length+' real players; no generated pending opponents; Nass 98 with visible sources; 100 transfer rows; new career with 681 real European entrants.');
  }catch(e){failed=true;console.error(e);}
  win.destroy();app.exit(failed?1:0);
});
