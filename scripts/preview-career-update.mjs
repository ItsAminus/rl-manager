// Visual fixtures use the real components and tournament engine, with no career writes.
import {createServer} from 'vite';
import initSqlJs from 'sql.js';
import path from 'node:path';
import fs from 'node:fs';
const root=process.cwd();
const vite=await createServer({configFile:false,root,appType:'custom',server:{host:'127.0.0.1',port:5180,strictPort:true,watch:null},esbuild:{jsx:'automatic'}});
const {sqlAdapter}=await vite.ssrLoadModule('/tests/sql-fixture.ts');
const {runMigration}=await vite.ssrLoadModule('/src/database/migrations/001_initial_schema.ts');
const {Tournament}=await vite.ssrLoadModule('/src/main/tournament.ts');
const SQL=await initSqlJs(),db=sqlAdapter(new SQL.Database());runMigration(db);
const clubs=JSON.parse(fs.readFileSync(path.join(root,'data/teams.json'),'utf8')).slice(0,16);
clubs.forEach((t,i)=>{db.prepare('INSERT INTO teams(id,name,region) VALUES (?,?,?)').run(t.id,t.name,t.region);db.prepare('INSERT INTO competition_entries(competitionId,teamId,seed) VALUES (?,?,?)').run('review',t.id,i+1);});
db.exec("INSERT INTO competitions(id,name,status) VALUES('review','RLCS Major 2','scheduled')");
const t=new Tournament(db);t.prepare('review',clubs.map(t=>t.id),'2026-11-03',{kind:'MAJOR',advance:3});t.progress('review','2026-11-01');
for(const f of db.prepare('SELECT * FROM fixtures').all())db.prepare("UPDATE fixtures SET status='completed',homeScore=3,awayScore=1 WHERE id=?").run(f.id);
t.progress('review','2026-11-05');
const competition={id:'review',name:'RLCS Major 2',entries:clubs.map(t=>({teamId:t.id,teamName:t.name})),tournament:t.details('review')};
const shell=body=>`<html><head><meta charset="UTF-8"/></head><body style="margin:0"><div id="root"></div><script type="module">${body}</script></body></html>`;
vite.middlewares.use('/__tournament',async(_,res)=>{
  const html=await vite.transformIndexHtml('/__tournament',shell(`import React from 'react';import {createRoot} from 'react-dom/client';import {TournamentStages} from '/src/renderer/components/TournamentStages.tsx';import '/src/renderer/styles/global.css';import '/src/renderer/styles/modern.css';import '/src/renderer/pages/MatchDayPage.css';createRoot(document.getElementById('root')).render(React.createElement('div',{style:{padding:32,height:'100vh',boxSizing:'border-box',overflowY:'auto'}},React.createElement('h1',null,'RLCS Major 2'),React.createElement(TournamentStages,{competition:${JSON.stringify(competition)},teamId:${JSON.stringify(clubs[0].id)},onOpen:()=>{}})));`));
  res.setHeader('Content-Type','text/html');res.end(html);
});
vite.middlewares.use('/__difficulty',async(_,res)=>{
  const html=await vite.transformIndexHtml('/__difficulty',shell(`import React from 'react';import {createRoot} from 'react-dom/client';import {SettingsPage} from '/src/renderer/pages/SettingsPage.tsx';import {useCareerStore} from '/src/stores/careerStore.ts';import '/src/renderer/styles/global.css';import '/src/renderer/styles/modern.css';window.api={settings:{get:async()=>null},rlbot:{detect:async()=>null},management:{setDifficulty:async(id,difficulty)=>({success:true,difficulty})}};useCareerStore.setState({career:{id:'review',managerName:'Coach',difficulty:'Hard'},team:{name:'Gentle Mates'},roster:[]});createRoot(document.getElementById('root')).render(React.createElement(SettingsPage));`));
  res.setHeader('Content-Type','text/html');res.end(html);
});
vite.middlewares.use('/__training',async(_,res)=>{
  const html=await vite.transformIndexHtml('/__training',shell(`import React from 'react';import {createRoot} from 'react-dom/client';import {TrainingPage} from '/src/renderer/pages/TrainingPage.tsx';import {useCareerStore} from '/src/stores/careerStore.ts';import '/src/renderer/styles/global.css';import '/src/renderer/styles/modern.css';const players=[{id:'zen',gamertag:'zen',fatigue:15},{id:'nass',gamertag:'nass',fatigue:30},{id:'oski',gamertag:'Oski',fatigue:8}];window.api={management:{training:async()=>({schedule:Array.from({length:7},(_,day)=>({day,category:day===6?'Rest':'Team Play',intensity:'Low'})),logs:[],earned:players.map((p,i)=>({playerId:p.id,name:p.gamertag,overall:98-i,potential:99,trainingPercent:80-i*10,trainingDays:28+i,matchPercent:45+i*10,provenSeries:3+i,status:'Needs sustained match evidence'}))})}};useCareerStore.setState({career:{id:'review',difficulty:'Medium'},roster:players,currentDate:'2026-10-14'});createRoot(document.getElementById('root')).render(React.createElement(TrainingPage));`));res.setHeader('Content-Type','text/html');res.end(html);
});
await vite.listen();console.log('Career update visual review ready');
process.on('SIGINT',async()=>{db.close();await vite.close();process.exit(0);});
