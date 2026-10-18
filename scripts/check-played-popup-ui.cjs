// Tests the rendered match flow with a fake bridge and real isolated career IPC.
// No Rocket League process is launched.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1600,height:1100,webPreferences:{contextIsolation:true,offscreen:true,backgroundThrottling:false}});
  const run=code=>win.webContents.executeJavaScript(code);
  const wait=async code=>{for(let i=0;i<200;i++){if(await run(code))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout: '+code);};
  const sql=(query,params=[])=>run(`window.api.db.run(${JSON.stringify(query)},${JSON.stringify(params)})`);
  let careerId,failed=false;
  const fixture='qa-played-'+Date.now(),event=fixture+'-event';
  try{
    await win.webContents.session.clearCache();
    await win.loadURL('http://127.0.0.1:5179/__review');
    await wait('document.body.innerText.includes("Your starting three")');
    const created=await run("window.api.career.create({managerName:'Played result test',teamId:'team_15',region:'Middle East & North Africa',difficulty:'Normal'})");
    if(!created.success)throw Error(created.error);careerId=created.id;
    await run(`import('/src/stores/careerStore.ts').then(m=>m.useCareerStore.getState().loadCareer(${JSON.stringify(careerId)}))`);
    await sql("INSERT INTO competitions (id,name,type,status,config) VALUES (?,'Played result test','REGIONAL','scheduled','{}')",[event]);
    await sql("INSERT INTO career_competitions (competitionId,careerId,stage,cycle,startDate,sources) VALUES (?,?,'REGIONAL',1,'2026-10-11','[]')",[event,careerId]);
    await sql('INSERT INTO competition_entries (competitionId,teamId) VALUES (?,?)',[event,'team_15']);
    await sql('INSERT INTO competition_entries (competitionId,teamId) VALUES (?,?)',[event,'team_1']);
    await sql("INSERT INTO fixtures (id,competitionId,homeTeamId,awayTeamId,scheduledDate,status,seriesFormat) VALUES (?,?,'team_1','team_15','2026-10-11','scheduled','BO3')",[fixture,event]);
    await run(`window.__bridge={state:'idle'};
      window.api.rlbot.detect=async()=>({overall:true});
      window.api.rlbot.botPlan=async()=>({success:true,route:'Test bridge',assignments:[]});
      window.api.rlbot.launch=async cfg=>{window.__bridge={state:'running',phase:'playing',fixtureId:cfg.fixtureId,gameNumber:cfg.gameNumber,message:'Test game in progress'};return {success:true};};
      window.api.rlbot.status=async()=>window.__bridge;
      location.hash='/match-day/${fixture}';`);
    await wait('!!document.querySelector(".btn-hero-play") && !document.querySelector(".btn-hero-play").disabled');
    await run('document.querySelector(".btn-hero-play").click()');
    await wait('Array.from(document.querySelectorAll("button")).some(b=>b.innerText.includes("LAUNCH 3v3")&&!b.disabled)');
    await run('Array.from(document.querySelectorAll("button")).find(b=>b.innerText.includes("LAUNCH 3v3")).click()');
    await wait('!!document.querySelector(".match-running-overlay")');
    await run('document.querySelector(".running-actions button").click()');
    const before=await run(`window.api.fixtures.getById(${JSON.stringify(fixture)})`);
    if(before.games.length)throw Error('Recover button simulated an unfinished game');
    // The bridge has saved this exact played result before the commentary process exits.
    const saved=await run(`window.api.gameResults.create({fixtureId:${JSON.stringify(fixture)},gameNumber:1,blueTeamId:'team_15',orangeTeamId:'team_1',blueScore:2,orangeScore:5,playerStats:[],wasPlayed:true,playedByHuman:true})`);
    if(!saved.success)throw Error(saved.error);
    const score=await run(`window.api.fixtures.updateResult(${JSON.stringify(fixture)},0,1,'in_progress')`);
    if(!score.success)throw Error(score.error);
    await run(`window.__bridge={state:'completed',fixtureId:${JSON.stringify(fixture)},gameNumber:1,resultSaved:true,savedGameId:${JSON.stringify(saved.id)},result:{completed:true,blueScore:2,orangeScore:5},cleanupPending:true}`);
    await wait('!document.querySelector(".match-running-overlay") && !!document.querySelector(".last-game-card")');
    if(!await run('document.querySelector(".last-game-card").innerText.includes("2 - 5")'))throw Error('Actual played score not displayed');
    if(!await run('document.querySelector(".btn-hero-play").disabled'))throw Error('Next game enabled during commentary cleanup');
    // Navigate away and back: completion must not depend on the original launch callback.
    await run("location.hash='/dashboard'");await wait('document.body.innerText.includes("Your starting three")');
    await run(`location.hash='/match-day/${fixture}'`);
    await wait('!!document.querySelector(".last-game-card") && !document.querySelector(".match-running-overlay")');
    await run('window.__bridge.cleanupPending=false');
    await wait('!!document.querySelector(".btn-hero-play") && !document.querySelector(".btn-hero-play").disabled');
    const after=await run(`window.api.fixtures.getById(${JSON.stringify(fixture)})`);
    if(after.games.length!==1 || after.games[0].blueScore!==2 || after.games[0].orangeScore!==5 || !after.games[0].wasPlayed)throw Error('Played result duplicated or replaced');
    fs.mkdirSync('scratch/ui-review',{recursive:true});
    fs.writeFileSync('scratch/ui-review/played-popup-fixed.png',(await win.webContents.capturePage()).toPNG());
    console.log('PASS: recovery never simulates; popup closes for saved played result while commentary runs; next game waits for cleanup; navigation resumes; one unchanged played game saved.');
  }catch(e){failed=true;console.error(e);}
  finally{
    if(careerId)await run(`window.api.career.delete(${JSON.stringify(careerId)})`).catch(()=>{});
    await run("window.api.career.load('ui-preview')").catch(()=>{});
    fs.mkdirSync('scratch/ui-review',{recursive:true});
    fs.writeFileSync('scratch/ui-review/played-popup-check.json',JSON.stringify({passed:!failed}));
    win.destroy();app.exit(failed?1:0);
  }
});
