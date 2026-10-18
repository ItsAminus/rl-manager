// Actual local model check, isolated from saved careers.
import {createServer} from 'vite';
import path from 'node:path';
const vite=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom'});
const {LocalChirpText}=await vite.ssrLoadModule('/src/main/chirp-text.ts');
const text=new LocalChirpText(path.resolve('rl_bridge/local_runtime'),(id,body,accepted)=>console.log(JSON.stringify({id,body,accepted})),process.argv.includes('--3b')?'qwen2.5-3b-instruct-q4_k_m.gguf':undefined);
const jobs=[
  {id:'critical',context:{author:'Fan',role:'Fan',draft:'',topic:'UnderPressure',voice:'rival supporter; blunt, lowercase, sarcastic',intent:'Criticize the finishing in this exact post. Make a relevant dry joke; do not invent anything else.',thread:'PlayerOne missed four open nets in the deciding game. Hard to defend that finishing honestly.'}},
  {id:'rebuttal',context:{author:'Fan',role:'Fan',draft:'',topic:'Debate',voice:'opinionated fan; casual, direct, a bit annoyed',intent:'Disagree with the blame on mechanics. Explain that the lack of support is also important.',thread:'nah the second man gets blamed for everything. if the first guy just hits the shot we win.',conversation:[{author:'Analyst',body:'The scorer needs a passing option. The second man was nowhere near that attack.'}]}},
  {id:'rumour',context:{author:'Fan',role:'Fan',draft:'',topic:'RosterMoves',voice:'loyal fan, casual, skeptical of panic changes',intent:'Push back on the proposed roster change. Discuss role fit rather than just star names. This is a fan wishlist, not a real signing.',thread:'roster wishlist: drop the support player and get another mechanical star. would be unstoppable surely.'}},
];
try{const start=performance.now(),result=await text.generate(jobs);console.log(JSON.stringify({elapsedSeconds:(performance.now()-start)/1000,result},null,2));if(Object.keys(result).length!==jobs.length)process.exitCode=1;}
finally{text.close();await vite.close();}
