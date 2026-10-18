// Real renderer/routes and real signing quotes, using a disposable in-memory world.
import {createServer} from 'vite';
import initSqlJs from 'sql.js';
const vite=await createServer({configFile:false,root:process.cwd(),appType:'custom',server:{host:'127.0.0.1',port:5182,strictPort:true,watch:null},esbuild:{jsx:'automatic'}});
const {sqlAdapter}=await vite.ssrLoadModule('/tests/sql-fixture.ts');
const {runMigration}=await vite.ssrLoadModule('/src/database/migrations/001_initial_schema.ts');
const {CareerManagement}=await vite.ssrLoadModule('/src/main/career-management.ts');
const SQL=await initSqlJs(),db=sqlAdapter(new SQL.Database());runMigration(db);
db.exec(`INSERT INTO careers(id,managerName,teamId,currentDate) VALUES('review','Coach','us','2025-09-01');
INSERT INTO seasons(id,careerId,startDate,endDate,isActive) VALUES('season','review','2025-09-01','2026-06-30',1);
INSERT INTO settings(key,value) VALUES('circuit_v2','review');
INSERT INTO career_competitions(competitionId,careerId,stage,cycle,startDate) VALUES('q1','review','QUALIFIER',1,'2025-09-09'),('q4','review','QUALIFIER',4,'2025-12-16');
INSERT INTO teams(id,name,region,reputation,cashBalance) VALUES('us','Our Club','Europe',65,100000000),('elite','Team Vitality','Europe',96,10000000);
INSERT INTO players(id,gamertag,teamId,overall,potential,region,reputation,morale,age,marketValue) VALUES('star','zen','elite',99,99,'Europe',99,80,19,1000000);
INSERT INTO contracts(id,playerId,teamId,salary,duration,startDate,endDate,buyout,isActive) VALUES('contract','star','elite',40000,24,'2025-09-01','2027-09-01',2000000,1);`);
for(let i=0;i<3;i++)db.prepare('INSERT INTO players(id,gamertag,teamId,overall,region) VALUES(?,?,?,?,?)').run('us'+i,'Teammate '+i,'us',80,'Europe');
const player=db.prepare("SELECT * FROM players WHERE id='star'").get(),quote=new CareerManagement(db).signingQuote('review','star');
const career={id:'review',managerName:'Coach',teamId:'us',difficulty:'Medium',transferWindows:[{start:'2025-09-01',end:'2025-09-08'},{start:'2025-11-26',end:'2025-12-15'}]};
vite.middlewares.use('/__transfers',async(_,res)=>{
  const html=await vite.transformIndexHtml('/__transfers',`<html><head><meta charset="UTF-8"/></head><body style="margin:0"><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import App from '/src/renderer/App.tsx';import {useCareerStore} from '/src/stores/careerStore.ts';import '/src/renderer/styles/global.css';import '/src/renderer/styles/modern.css';
window.__career=useCareerStore;window.__signCalls=0;
window.api={players:{getById:async()=>(${JSON.stringify(player)})},inbox:{getAll:async()=>[{id:'story',date:'2025-09-26',type:'transfer_news',title:'Transfer watch: percy.',body:'Talks have ended without an agreement.',isRead:true,actions:[{label:'Open transfer news',action:'navigate',data:{href:'/chirp?view=explore&q=RosterMoves'}}]}]},management:{signingQuote:async()=>(${JSON.stringify(quote)}),sign:async()=>{window.__signCalls++;return {success:false,error:'Player declined'};},chirpFeed:async()=>({posts:[],suggestions:[],people:[],trends:[],regions:[],unread:0}),chirpUpdates:async()=>({revision:0,unread:0,latest:''})}};
useCareerStore.setState({career:${JSON.stringify(career)},currentDate:'2025-09-01',team:{id:'us',name:'Our Club'},roster:[],isLoaded:true});createRoot(document.getElementById('root')).render(React.createElement(App));
</script></body></html>`);res.setHeader('Content-Type','text/html');res.end(html);
});
await vite.listen();console.log('Transfer rule visual review ready');
process.on('SIGINT',async()=>{db.close();await vite.close();process.exit(0);});
