import {createServer} from 'vite';import initSqlJs from 'sql.js';
const vite=await createServer({configFile:false,root:process.cwd(),appType:'custom',server:{host:'127.0.0.1',port:5185,strictPort:true,watch:null},esbuild:{jsx:'automatic'}});
const {sqlAdapter}=await vite.ssrLoadModule('/tests/sql-fixture.ts'),{runMigration}=await vite.ssrLoadModule('/src/database/migrations/001_initial_schema.ts'),{CareerManagement}=await vite.ssrLoadModule('/src/main/career-management.ts');
const SQL=await initSqlJs(),db=sqlAdapter(new SQL.Database());runMigration(db);
db.exec("INSERT INTO careers(id,managerName,teamId,currentDate,difficulty) VALUES('skill-preview','Coach','us','2026-10-14','Medium');INSERT INTO teams(id,name,coachRating,facilityLevel) VALUES('us','Preview squad',80,2)");
for(const [i,name] of ['zen','nass','Oski'].entries()){
  const id='p'+i;db.prepare('INSERT INTO players(id,gamertag,teamId,overall,potential,fatigue,morale,form) VALUES(?,?,?,94,99,10,70,60)').run(id,name,'us');
  db.prepare('INSERT INTO player_attributes(playerId,passing,groundControl,aerial,shooting,shotAccuracy,defense,goalkeeping) VALUES(?,89,94,94,94,94,94,94)').run(id);
}
const management=new CareerManagement(db);management.training('skill-preview');db.exec("UPDATE player_skill_development SET points=10,earnedPoints=10");
vite.middlewares.use('/__progression-api',(req,res)=>{
  let input='';req.on('data',d=>input+=d);req.on('end',()=>{res.setHeader('Content-Type','application/json');try{
    const {method,args=[]}=JSON.parse(input||'{}');let data;
    if(method==='training')data=management.training('skill-preview');else if(method==='allocate')data=management.allocateSkill('skill-preview',...args);
    else if(method==='roster')data=db.prepare("SELECT * FROM players WHERE teamId='us'").all();else if(method==='team')data=db.prepare("SELECT * FROM teams WHERE id='us'").get();else throw Error('Unsupported preview method');
    res.end(JSON.stringify(data));
  }catch(e){res.end(JSON.stringify({error:String(e)}));}});
});
vite.middlewares.use('/__skills',async(req,res)=>{
  const html=await vite.transformIndexHtml('/__skills',`<html><head><meta charset="UTF-8"></head><body style="margin:0"><div id="root"></div><script type="module">import React from 'react';import {createRoot} from 'react-dom/client';import {TrainingPage} from '/src/renderer/pages/TrainingPage.tsx';import {useCareerStore} from '/src/stores/careerStore.ts';import '/src/renderer/styles/global.css';import '/src/renderer/styles/modern.css';const call=(method,...args)=>fetch('/__progression-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,args})}).then(r=>r.json());window.api={management:{training:()=>call('training'),allocateSkill:(_,p,s)=>call('allocate',p,s)},players:{getByTeam:()=>call('roster')},teams:{getById:()=>call('team')},inbox:{getUnreadCount:async()=>0}};useCareerStore.setState({career:{id:'skill-preview',difficulty:'Medium'},team:{id:'us'},roster:await call('roster'),currentDate:'2026-10-14'});createRoot(document.getElementById('root')).render(React.createElement('main',{style:{padding:32}},React.createElement(TrainingPage)));</script></body></html>`);res.setHeader('Content-Type','text/html');res.end(html);
});
await vite.listen();console.log('Skill progression preview on 5185; in-memory test squad only.');process.on('SIGINT',async()=>{db.close();await vite.close();process.exit(0);});
