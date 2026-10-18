// Pure visual fixture: real SocialPage, no database or text generation.
import {createServer} from 'vite';
const vite=await createServer({configFile:false,root:process.cwd(),appType:'custom',server:{host:'127.0.0.1',port:5179},esbuild:{jsx:'automatic'}});
vite.middlewares.use('/__receipt',async(_,res)=>{
  const html=await vite.transformIndexHtml('/__receipt',`<html><head><meta charset="UTF-8"/></head><body style="margin:0"><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {SocialPage} from '/src/renderer/pages/SocialPage.tsx';import {useCareerStore} from '/src/stores/careerStore.ts';import '/src/renderer/styles/global.css';
const manager={id:'manager',displayName:'Coach',handle:'coach',kind:'Manager',color:'#99d9b0',region:'Europe'};
const a={id:'fan:EU:5',displayName:'Fraud Watch EU',handle:'fraudwatch',kind:'Fan',color:'#d8b3ff',region:'Europe'};
const p={id:'receipt',accountId:a.id,account:a,date:'2025-09-19',body:'you called it luck then bottled a 2–0 lead. bookmarked 😭',reactions:[],replies:6,likes:560,reposts:81,views:8900,
media:{kind:'receipt',caption:'Career series receipt',quote:"We are NOT losing to this team again based on luck. Y'all suck",home:'Gentle Mates',away:'Manchester City',score:'2–3',format:'BO5',competition:'Club practice series',headline:'REVERSE SWEEP RECEIPTS',games:[{game:1,blue:'Gentle Mates',orange:'Manchester City',score:'6–5'},{game:2,blue:'Gentle Mates',orange:'Manchester City',score:'4–2'},{game:3,blue:'Gentle Mates',orange:'Manchester City',score:'3–5'},{game:4,blue:'Gentle Mates',orange:'Manchester City',score:'2–3'},{game:5,blue:'Gentle Mates',orange:'Manchester City',score:'0–9'}]}};
const feed={posts:[p],suggestions:[],people:[],regions:['Europe'],trends:[],manager,unread:0,cursor:null};
window.api={management:{chirpFeed:async()=>feed,chirpUpdates:async()=>({latest:'receipt',revision:1,unread:0}),chirpThread:async()=>({post:p,replies:[],ancestors:[],preparing:0})}};
useCareerStore.setState({career:{id:'review',managerName:'Coach'},team:{name:'Gentle Mates'},currentDate:'2025-09-19',roster:[]});
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(SocialPage)));
</script></body></html>`);res.setHeader('Content-Type','text/html');res.end(html);
});await vite.listen();console.log('Receipt-only UI review ready');
process.on('SIGINT',async()=>{await vite.close();process.exit(0);});
