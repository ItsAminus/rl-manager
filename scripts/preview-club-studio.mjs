// Exercise real IPC and renderer pages in an isolated career, never a user's save.
import {createServer} from 'vite';import path from 'node:path';import fs from 'node:fs';
const root=process.cwd(),folder=fs.mkdtempSync(path.join(root,'scratch','studio-review-'));
globalThis.__dirname=path.join(root,'src/main');
const vite=await createServer({configFile:false,root,base:'/',appType:'custom',resolve:{alias:{electron:path.join(root,'tests/preview-electron.ts'),'./chirp-text':path.join(root,'tests/preview-chirp-text.ts')}},server:{host:'127.0.0.1',port:5183,strictPort:true,watch:null},esbuild:{jsx:'automatic'}});
const database=await vite.ssrLoadModule('/src/main/database.ts');await database.initDb(folder);
const {setupIpcHandlers}=await vite.ssrLoadModule('/src/main/ipc-handlers.ts');setupIpcHandlers();
const handlers=globalThis.__rlPreviewHandlers;
const created=await handlers.get('career:create')({},{managerName:'Design Coach',teamId:'team_4',region:'Europe',difficulty:'Medium'});if(!created.success)throw Error(created.error);
const channels={career:['load'],teams:['getById','getAll'],players:['getByTeam'],fixtures:['getUpcoming'],inbox:['getUnreadCount'],management:['overview','clubBranding','saveClubBranding','resetClubBranding','squadGarage','saveCarPreset','resetCarPreset','coordinateCars','copyCarPreset']};
const allowed=new Set(Object.entries(channels).flatMap(([group,methods])=>methods.map(m=>group+':'+m)));
vite.middlewares.use('/__studio-api',async(req,res)=>{try{let body='';for await(const chunk of req){body+=chunk;if(body.length>6000000)throw Error('Request too large');}const {channel,args}=JSON.parse(body);if(!allowed.has(channel))throw Error('Preview method unavailable');const out=await handlers.get(channel)({},...args);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(out));}catch(e){res.statusCode=500;res.end(JSON.stringify({success:false,error:String(e)}));}});
vite.middlewares.use('/__studio',async(_,res)=>{
  const boot=`window.api={};for(const [group,methods] of Object.entries(${JSON.stringify(channels)})){window.api[group]={};for(const m of methods)window.api[group][m]=(...args)=>fetch('/__studio-api',{method:'POST',body:JSON.stringify({channel:group+':'+m,args})}).then(r=>r.json());}window.__studioCareer=${JSON.stringify(created.id)};`;
  const html=await vite.transformIndexHtml('/__studio',`<html><head><meta charset="UTF-8"/></head><body><div id="root"></div><script>${boot}</script><script type="module">import React from 'react';import {createRoot} from 'react-dom/client';import App from '/src/renderer/App.tsx';import {useCareerStore} from '/src/stores/careerStore.ts';import '/src/renderer/styles/global.css';import '/src/renderer/styles/modern.css';window.__studioStore=useCareerStore;await useCareerStore.getState().loadCareer(window.__studioCareer);location.hash='/club-studio';createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`);res.setHeader('Content-Type','text/html');res.end(html);
});
await vite.listen();console.log('Isolated club studio ready');
const shutdown=async()=>{for(const fn of globalThis.__rlPreviewLifecycle.get('before-quit')||[])fn();database.closeDb();await vite.close();if(!path.resolve(folder).startsWith(path.resolve(root,'scratch')+path.sep))throw Error('Unsafe cleanup');fs.rmSync(folder,{recursive:true,force:true});process.exit(0);};
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
