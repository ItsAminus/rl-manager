// Actual IPC and renderer review against disposable career worlds only.
import {createServer} from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const root=process.cwd(),folder=fs.mkdtempSync(path.join(root,'scratch','path-review-'));
globalThis.__dirname=path.join(root,'src/main');
const preview=process.argv.includes('--preview');
const vite=await createServer({configFile:false,appType:'custom',root,resolve:{alias:{electron:path.join(root,'tests/preview-electron.ts')}},server:{host:'127.0.0.1',port:5186,strictPort:true,watch:null},esbuild:{jsx:'automatic'}});
let database;
try{
  database=await vite.ssrLoadModule('/src/main/database.ts');await database.initDb(folder);
  const {RLBotDetector}=await vite.ssrLoadModule('/src/services/rlbot-detector.ts');
  RLBotDetector.prototype.detectRLBot=async()=>({found:true,path:path.join(os.homedir(),'AppData','Local','RLBotGUIX','Python311','python.exe'),pythonPath:path.join(os.homedir(),'AppData','Local','RLBotGUIX','Python311','python.exe'),version:'1.68.0'});
  const {setupIpcHandlers}=await vite.ssrLoadModule('/src/main/ipc-handlers.ts');setupIpcHandlers();
  const handlers=globalThis.__rlPreviewHandlers,call=(name,...args)=>handlers.get(name)({},...args);
  const candidates=await call('career:pathTeams');assert(candidates.length>=3,'No real starting squads');
  const chosen=candidates[0];
  const created=await call('career:create',{managerName:'Path QA',teamId:chosen.id,region:chosen.region,difficulty:'Hard',mode:'Path To Glory'});assert(created.success,created.error);
  const pathId=created.id,loaded=await call('career:load',pathId);assert(loaded.success,loaded.error);assert.equal(loaded.career.mode,'Path To Glory');assert.equal(loaded.players.length,3);assert.equal(loaded.team.cashBalance,0);
  const world=database.getCareerDatabase(pathId),roster=loaded.players;
  assert((await call('management:signingQuote',pathId,roster[0].id)).error.includes('Path To Glory'));
  assert((await call('management:setDifficulty',pathId,'Easy')).error.includes('Path To Glory'));
  const before=await call('rlbot:botPlan',{fixtureId:(await call('management:pathOverview',pathId)).nextFixture.id,gameNumber:1});assert(before.success,before.error);assert.equal(before.route,'Local');
  assert(before.assignments.filter(a=>a.type!=='Human'&&roster.some(p=>p.id===a.playerId)).every(a=>a.engine==='Career Rookie'||a.luckyGame&&a.engine==='Nexto'));
  assert(before.assignments.filter(a=>a.luckyGame).length<=1);
  const {CareerManagement}=await vite.ssrLoadModule('/src/main/career-management.ts'),manager=new CareerManagement(world);
  const f=(await call('management:pathOverview',pathId)).nextFixture;
  world.transaction(()=>{for(let n=1;n<=2;n++)manager.recordPlayedGame(pathId,{fixtureId:f.id,gameNumber:n,blueTeamId:loaded.team.id,orangeTeamId:f.awayTeamId,blueScore:4,orangeScore:1,wasPlayed:true,playedByHuman:true,playerStats:roster.map((p,i)=>({playerId:p.id,isHuman:i===0,goals:1,assists:1,saves:1,shots:3,demos:0,score:400}))});})();
  const progress=await call('management:pathOverview',pathId);assert.equal(progress.streak,2);assert(progress.players.every(p=>p.totalXp>0));assert(progress.achievements.some(a=>a.key==='first_sweep'));
  assert((await call('management:pathTutorial',pathId,4)).success);
  assert((await call('career:save',pathId)).success);
  const generated=await call('career:create',{managerName:'Rank QA',teamId:'path_generated',region:'Europe',difficulty:'Hard',mode:'Path To Glory',pathRank:'Supersonic Legend',customOrgName:'Rank Academy'});assert(generated.success,generated.error);
  const ranked=await call('career:load',generated.id);assert(ranked.success,ranked.error);assert(ranked.players.every(p=>p.overall<=80));assert.equal(ranked.team.name,'Rank Academy');
  const rankedState=await call('management:pathOverview',generated.id);assert.equal(rankedState.rank,'Supersonic Legend');assert.equal(rankedState.unlockedCutoff,79);assert.equal(rankedState.challenges.length,41);
  const rankedPlan=await call('rlbot:botPlan',{fixtureId:rankedState.nextFixture.id,gameNumber:1});assert(rankedPlan.success,rankedPlan.error);assert.equal(rankedPlan.route,'Local');assert(rankedPlan.assignments.some(a=>a.engine==='Nexto'));assert(rankedPlan.assignments.filter(a=>a.team===0&&a.type!=='Human').every(a=>['Necto','Element'].includes(a.engine)||a.luckyGame&&a.engine==='Nexto'));
  const ordinary=await call('career:create',{managerName:'Manager QA',teamId:'team_4',region:'Europe',difficulty:'Medium'});assert(ordinary.success,ordinary.error);
  const managerId=ordinary.id;assert((await call('career:load',managerId)).success);
  const training=await call('management:training',managerId);assert(training.earned.every(p=>p.points===0&&p.tier===null));
  // Candidate selection must not inherit any previous save's transfers.
  world.prepare('UPDATE players SET teamId=NULL WHERE id=?').run(roster[0].id);
  assert((await call('career:pathTeams')).some(t=>t.id===chosen.id));world.prepare('UPDATE players SET teamId=? WHERE id=?').run(loaded.team.id,roster[0].id);
  await call('career:load',pathId);assert.equal((await call('management:pathOverview',pathId)).tutorialStep,4);
  const saved=await call('career:list');assert.equal(saved.find(c=>c.id===pathId).mode,'Path To Glory');assert.equal(saved.find(c=>c.id===managerId).mode,'Manager Career');
  await call('career:save',pathId);
  // Reopen the files as an app restart would, not just an in-memory switch.
  for(const fn of globalThis.__rlPreviewLifecycle.get('before-quit')||[])fn();database.closeDb();
  await database.initDb(folder);setupIpcHandlers();await call('career:load',pathId);
  assert.equal((await call('management:pathOverview',pathId)).players[0].totalXp,progress.players[0].totalXp);
  assert.equal((await call('management:pathOverview',pathId)).tutorialStep,4);
  assert.equal((await call('career:list')).find(c=>c.id===pathId).mode,'Path To Glory');
  console.log(JSON.stringify({passed:true,candidates:candidates.length,startingTeam:chosen.name,pathId,managerId,checks:['real fixed roster','actual local bot preview','all-three XP','milestones','tutorial persistence','Manager development restored','independent world template','mode and XP survive restart']}));
  if(preview){
    fs.mkdirSync(path.join(root,'scratch/ui-review'),{recursive:true});
    fs.writeFileSync(path.join(root,'scratch/ui-review/path-review-state.json'),JSON.stringify({pathId,managerId,folder}));
    vite.middlewares.use('/__path/api',async(req,res)=>{try{let raw='';for await(const part of req)raw+=part;const {channel,args}=JSON.parse(raw);if(channel.startsWith('rlbot:')){res.end(JSON.stringify({overall:false,success:false,error:'Live launch disabled in isolated review.'}));return;}const value=await call(channel,...args);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value??null));}catch(e){res.statusCode=500;res.end(JSON.stringify({error:String(e)}));}});
    vite.middlewares.use('/__path',async(_,res)=>{
      const boot=`window.api={};for(const channel of ${JSON.stringify([...handlers.keys()])}){const [group,key]=channel.split(':');const g=group==='database'?'db':group;(window.api[g]||={})[key]=(...args)=>fetch('/__path/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel,args})}).then(r=>r.json());}window.api.rlbot.onProgress=()=>()=>{};window.api.rlbot.onStatusUpdate=()=>()=>{};window.__review={pathId:${JSON.stringify(pathId)},managerId:${JSON.stringify(managerId)}};`;
      const html=await vite.transformIndexHtml('/__path',`<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script>${boot}</script><script type="module">import '/src/renderer/main.tsx';import {useCareerStore} from '/src/stores/careerStore.ts';window.__store=useCareerStore;</script></body></html>`);res.setHeader('Content-Type','text/html');res.end(html);
    });
    await vite.listen();console.log('Path UI review http://127.0.0.1:5186/__path');
    await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
  }
}finally{
  for(const fn of globalThis.__rlPreviewLifecycle?.get('before-quit')||[])fn();database?.closeDb();await vite.close();
  assert(path.resolve(folder).startsWith(path.resolve(root,'scratch')+path.sep));fs.rmSync(folder,{recursive:true,force:true});
}
