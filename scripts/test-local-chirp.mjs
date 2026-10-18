import {createServer} from 'vite';
import path from 'node:path';
const vite=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom'});
const {LocalChirpText}=await vite.ssrLoadModule('/src/main/chirp-text.ts');
const text=new LocalChirpText(path.resolve('rl_bridge/local_runtime'),(id,body,accepted)=>console.log(JSON.stringify({id,body,accepted})));
try {
  const start=performance.now();
  const result=await text.generate([
    {id:'fan',context:{author:'Backpost EU',role:'Fan',draft:'PlayerOne missed 4 confirmed open-net chances in game 2, including 4 in critical moments. my grandma is asking for a tryout after watching that 😭',topic:'UnderPressure',voice:'rival supporter; sarcastic, lowercase, blunt sports banter',tone:'frustrated about the missed chances; humour, not encouragement'}},
    {id:'analyst',context:{author:'Analyst',role:'Analyst',draft:'Team Blue win the series 3–2 against Team Orange. PlayerTwo: 5 goals, 2 assists and 3 saves across the series. Look at the support around the finishes.',topic:'Analysis'}},
    {id:'reply',context:{author:'Fan',role:'Fan',draft:'Backing Team Blue. Keep us posted on how the team is doing.',thread:'We are focusing on tighter rotations this week. What would you like us to work on?',topic:'ClubLife',voice:'casual fan; short lowercase replies, no motivational sign-off'}},
  ]);
  console.log(JSON.stringify({elapsedSeconds:(performance.now()-start)/1000,result},null,2));
  if(Object.keys(result).length!==3)process.exitCode=1;
}finally{text.close();await vite.close();}
