// Real CPU model quality check; no saved career, API request or GPU use.
import {createServer} from 'vite';
import path from 'node:path';
const vite=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom'});
const {LocalChirpText}=await vite.ssrLoadModule('/src/main/chirp-text.ts');
const text=new LocalChirpText(path.resolve('rl_bridge/local_runtime'),(id,body,accepted)=>console.log(JSON.stringify({id,body,accepted})),process.argv.includes('--3b')?'qwen2.5-3b-instruct-q4_k_m.gguf':undefined);
const matchContext={fixtureId:'test',status:'completed',competition:'Club series',format:'BO5',date:'2025-09-19',home:'Gentle Mates',away:'Manchester City',seriesScore:'2–3',
  games:[{game:1,blue:'Gentle Mates',orange:'Manchester City',score:'6–5'},{game:2,blue:'Gentle Mates',orange:'Manchester City',score:'4–2'},{game:3,blue:'Gentle Mates',orange:'Manchester City',score:'3–5'},{game:4,blue:'Gentle Mates',orange:'Manchester City',score:'2–3'},{game:5,blue:'Gentle Mates',orange:'Manchester City',score:'0–9'}],
  facts:['Manchester City won the series 3–2 against Gentle Mates.','Gentle Mates led the series 2–0, then Manchester City completed a reverse sweep to win 3–2.','Deciding game 5: Gentle Mates 0–9 Manchester City.'],incidents:[],statistics:[]};
let jobs=[
  {id:'receipt',context:{author:'Fraud Watch EU',role:'Fan',draft:'',topic:'Receipts',voice:'rival fan; casual, blunt, sarcastic',intent:'You are a rival fan teasing the Gentle Mates manager after their team lost. Quote their confidence back at them using a specific verified result or comeback. Do not speak as the manager or defend their boast.',thread:"We are NOT losing to this team again based on luck. Y'all suck",matchContext}},
  {id:'answer',context:{author:'Fraud Watch EU',role:'Fan',draft:'',topic:'Receipts',voice:'rival fan; casual, skeptical, sarcastic',intent:'The manager replied directly to YOU. Answer their specific response and defend your previous point about their boast. Do not pretend to be a different observer.',thread:'We will respond next series. You are celebrating too early.',conversation:[{author:'Fraud Watch EU',body:'you posted all that confidence and got reverse swept. the receipt is staying up.'}],matchContext}},
];
if(process.argv.includes('--one'))jobs=jobs.slice(0,1);
for(const job of jobs)job.context.managerClub='Gentle Mates';
try{const start=performance.now(),result={};for(let attempt=0;attempt<3;attempt++){
  const pending=jobs.filter(j=>!result[j.id]);if(!pending.length)break;Object.assign(result,await text.generate(pending));
}console.log(JSON.stringify({elapsedSeconds:(performance.now()-start)/1000,result},null,2));if(Object.keys(result).length!==jobs.length)process.exitCode=1;}
finally{text.close();await vite.close();}
