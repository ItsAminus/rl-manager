import {createServer} from 'vite';import initSqlJs from 'sql.js';import fs from 'node:fs';
const vite=await createServer({configFile:false,root:process.cwd(),appType:'custom',server:{host:'127.0.0.1',port:5184,strictPort:true,watch:null},esbuild:{jsx:'automatic'}});
const {sqlAdapter}=await vite.ssrLoadModule('/tests/sql-fixture.ts'),{runMigration}=await vite.ssrLoadModule('/src/database/migrations/001_initial_schema.ts');
const {Tournament}=await vite.ssrLoadModule('/src/main/tournament.ts'),{officialRules}=await vite.ssrLoadModule('/src/game/official-competition-rules.ts');
const SQL=await initSqlJs(),db=sqlAdapter(new SQL.Database());runMigration(db);
const clubs=JSON.parse(fs.readFileSync('data/teams.json','utf8')).slice(0,32);clubs.forEach(t=>db.prepare('INSERT INTO teams(id,name,region) VALUES (?,?,?)').run(t.id,t.name,t.region));
const snapshots={};
for(const [key,kind,cycle,count] of [['swiss','REGIONAL',1,32],['major','MAJOR',2,16],['ewc','INVITATIONAL',1,16]]){
  const config=officialRules(kind,cycle),id='review-'+key;
  db.prepare("INSERT INTO competitions(id,name,status,config) VALUES (?,?,'scheduled',?)").run(id,'RLCS '+key,JSON.stringify(config));
  clubs.slice(0,count).forEach((t,i)=>db.prepare('INSERT INTO competition_entries(competitionId,teamId,seed) VALUES (?,?,?)').run(id,t.id,i+1));
  const tournament=new Tournament(db);tournament.prepare(id,clubs.slice(0,count).map(t=>t.id),'2026-05-20',config);tournament.progress(id,'2026-05-18');
  if(key==='major'){
    tournament.progress(id,'2026-05-20');
    db.prepare("UPDATE fixtures SET status='completed',homeScore=3,awayScore=1 WHERE competitionId=?").run(id);tournament.progress(id,'2026-05-21');
  }
  snapshots[key]={id,name:key==='major'?'RLCS Paris Major':key==='ewc'?'Esports World Cup':'RLCS Europe Open 1',type:kind,entries:clubs.slice(0,count).map(t=>({teamId:t.id,teamName:t.name})),tournament:tournament.details(id)};
}
vite.middlewares.use('/__official',async(req,res)=>{
  const request=new URL(req.url,'http://localhost'),key=request.pathname.split('/').filter(Boolean).pop()||request.searchParams.get('view')||'major',competition=snapshots[key];
  if(!competition){res.statusCode=404;res.end();return;}
  const html=await vite.transformIndexHtml('/__official/'+key,`<html><head><meta charset="UTF-8"></head><body style="margin:0"><div id="root"></div><script type="module">import React from 'react';import {createRoot} from 'react-dom/client';import {TournamentStages} from '/src/renderer/components/TournamentStages.tsx';import '/src/renderer/styles/global.css';import '/src/renderer/styles/modern.css';createRoot(document.getElementById('root')).render(React.createElement('main',{style:{padding:32}},React.createElement('h1',null,${JSON.stringify(competition.name)}),React.createElement(TournamentStages,{competition:${JSON.stringify(competition)},teamId:${JSON.stringify(clubs[0].id)},onOpen:()=>{}})));</script></body></html>`);
  res.setHeader('Content-Type','text/html');res.end(html);
});
await vite.listen();console.log('Official competition preview ready on 5184; no user save or game is opened.');
process.on('SIGINT',async()=>{db.close();await vite.close();process.exit(0);});
