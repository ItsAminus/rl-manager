// Local UI review harness. Uses a separate database, never a user's save.
import { createServer } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
const root = process.cwd();
globalThis.__dirname = path.join(root, 'src/main');
const vite = await createServer({ configFile: false, appType: 'custom', root, base: '/', resolve: { alias: { electron: path.join(root, 'tests/preview-electron.ts'),...(process.env.RL_MANAGER_CHIRP_UI_FIXTURES==='1'?{'./chirp-text':path.join(root,'tests/preview-chirp-text.ts')}:{}) } }, server: { host: '127.0.0.1', port: 5179, watch: { ignored: ['scratch', 'GPT_SoVITS', 'rl_bridge'].map(folder => path.join(root, folder, '**').replaceAll('\\', '/')) } }, esbuild: { jsx: 'automatic' } });
const database = await vite.ssrLoadModule('/src/main/database.ts');
await database.initDb(path.join(root, 'scratch/ui-preview-data'));
const db = database.db;
const { setupIpcHandlers } = await vite.ssrLoadModule('/src/main/ipc-handlers.ts');
setupIpcHandlers();
const handlers = globalThis.__rlPreviewHandlers;
const {broadcastTeam}=await vite.ssrLoadModule('/src/services/broadcast-assets.ts');
const roster=JSON.parse(fs.readFileSync(path.join(root,'data/players.json'),'utf8'));
const clubs=JSON.parse(fs.readFileSync(path.join(root,'data/teams.json'),'utf8'));
const blue=clubs.find(t=>t.id==='team_1'),orange=clubs.find(t=>t.id==='team_2');
const overlayState={context:{blue:broadcastTeam(blue,roster.filter(p=>p.teamId===blue.id).slice(0,3).map(p=>({...p,playerId:p.id,rating:p.overall}))),orange:broadcastTeam(orange,roster.filter(p=>p.teamId===orange.id).slice(0,3).map(p=>({...p,playerId:p.id,rating:p.overall}))),event:'World Championship · UI review',round:4,arena:'Mannfield (Dusk)',series:{bestOf:7,gameNumber:4,blueWins:2,orangeWins:1}},blue:2,orange:1,remaining:235,overtime:false,scoreboard:true,players:Array.from({length:6},(_,slot)=>({slot,score:100+slot*30,goals:slot===0?2:0,assists:slot%2,saves:slot,shots:slot+1}))};
const reviewTeams=clubs.slice(0,80);
const fixture=(id,round,a,b,status='completed')=>({id,round,homeTeamId:reviewTeams[a].id,awayTeamId:reviewTeams[b].id,homeTeamName:reviewTeams[a].name,awayTeamName:reviewTeams[b].name,homeScore:status==='completed'?3:0,awayScore:status==='completed'?1:0,seriesFormat:'Bo5',status,scheduledDate:'2026-10-11'});
const bracketState={format:'single_elimination',fixtures:[fixture('r1a',1,0,1),fixture('r1b',1,2,3),fixture('r1c',1,4,5),fixture('r1d',1,6,7),fixture('r2a',2,0,2,'scheduled'),fixture('r2b',2,4,6,'scheduled')],byes:reviewTeams.slice(8,78).map(t=>({teamId:t.id,teamName:t.name,round:1})),qualified:[]};
if (!db.prepare("SELECT id FROM careers WHERE id = 'ui-preview'").get()) {
  const created = await handlers.get('career:create')({}, { managerName: 'Amine', teamId: 'team_1', region: 'Europe', difficulty: 'Normal' });
  db.prepare("UPDATE careers SET id = 'ui-preview' WHERE id = ?").run(created.id);
  db.prepare("UPDATE seasons SET careerId = 'ui-preview' WHERE careerId = ?").run(created.id);
  db.prepare("UPDATE calendar_events SET careerId = 'ui-preview' WHERE careerId = ?").run(created.id);
  db.prepare("UPDATE inbox_items SET careerId = 'ui-preview' WHERE careerId = ?").run(created.id);
}
const channels = {
  career: ['create', 'load', 'save', 'list', 'delete'], players: ['getAll', 'getById', 'getByTeam', 'getFreeAgents', 'update'], teams: ['getAll', 'getById'], competitions: ['getAll', 'getById'],
  fixtures: ['getByDate', 'getById', 'getUpcoming', 'updateResult'], calendar: ['getEvents', 'advanceDay', 'advanceToEvent'], inbox: ['getAll', 'markRead', 'markAllRead', 'getUnreadCount'], stats: ['getPlayerLeaderboard', 'getTeamStandings'], settings: ['get', 'set'], gameResults: ['create'],
  management: ['chirpFeed','chirpUpdates','chirpProfile','chirpThread','chirpFollow','chirpReact','chirpPublish','chirpNotifications','signingQuote','outgoingTransfers','listForTransfer','respondToOffer','overview', 'training', 'saveTraining', 'setLineup', 'tactics', 'saveTactics', 'scouting', 'dispatchScout', 'sign', 'shortlist', 'social', 'supportPlayer', 'dressingRoom', 'replyToPlayer', 'chatWithPlayer', 'teamTalks', 'giveTeamTalk'], rlbot: ['detect', 'botPlan', 'launch', 'status', 'testMatch'],
  db: ['query', 'run', 'all'], app: ['getPath'], dialog: ['openFile', 'openDirectory'],
};
vite.middlewares.use('/__review/api', async (req, res) => {
  try {
    let body = ''; for await (const chunk of req) body += chunk;
    const { channel, args } = JSON.parse(body);
    if (channel.startsWith('rlbot:')) { res.end(JSON.stringify({ overall: false, success: false, error: 'Live game launch is disabled in the isolated UI preview.' })); return; }
    const fn = handlers.get(channel);
    if (!fn) throw new Error('Preview channel unavailable: ' + channel);
    const result = await fn({}, ...args);
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result));
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })); }
});
vite.middlewares.use('/__broadcast',async(_,res)=>{
  const boot=`window.__broadcastState=${JSON.stringify(overlayState)};const listeners=new Set();window.api={broadcast:{state:async()=>window.__broadcastState,onUpdate:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}}};window.__emitBroadcast=patch=>{window.__broadcastState={...window.__broadcastState,...patch};listeners.forEach(fn=>fn(window.__broadcastState));};`;
  const html=await vite.transformIndexHtml('/__broadcast',`<html><head><meta charset="UTF-8"/></head><body><div id="root"></div><script>${boot}</script><script type="module">import '/src/renderer/main.tsx';</script></body></html>`);
  res.setHeader('Content-Type','text/html');res.end(html);
});
vite.middlewares.use('/__bracket',async(_,res)=>{
  const html=await vite.transformIndexHtml('/__bracket',`<html><head><meta charset="UTF-8"/></head><body><div id="root"></div><script>window.__bracketState=${JSON.stringify(bracketState)};window.__reviewTeam=${JSON.stringify(blue.id)};</script><script type="module">import React from 'react';import {createRoot} from 'react-dom/client';import {TournamentBracket} from '/src/renderer/components/TournamentBracket.tsx';import '/src/renderer/styles/global.css';import '/src/renderer/styles/modern.css';function Review(){const [c,set]=React.useState(window.__bracketState);window.__setBracket=set;return React.createElement(TournamentBracket,{competition:c,teamId:window.__reviewTeam,onOpen:id=>window.__clickedFixture=id});}createRoot(document.getElementById('root')).render(React.createElement(Review));</script></body></html>`);
  res.setHeader('Content-Type','text/html');res.end(html);
});
vite.middlewares.use('/__review', async (_, res) => {
  const boot = `window.api={}; const channels=${JSON.stringify(channels)}; for(const [group, methods] of Object.entries(channels)){window.api[group]={}; for(const method of methods){window.api[group][method]=(...args)=>fetch('/__review/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel:(group==='db'?'database':group)+':'+method,args})}).then(r=>r.json());}}`;
  const html = await vite.transformIndexHtml('/__review', `<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script>${boot}</script><script type="module">import '/src/renderer/main.tsx'; import {useCareerStore} from '/src/stores/careerStore.ts'; await useCareerStore.getState().loadCareer('ui-preview'); location.hash='/dashboard';</script></body></html>`);
  res.setHeader('Content-Type', 'text/html'); res.end(html);
});
await vite.listen();
console.log('Isolated UI preview: http://127.0.0.1:5179/__review');
const shutdown=async()=>{for(const fn of globalThis.__rlPreviewLifecycle.get('before-quit')||[])fn();database.closeDb();await vite.close();process.exit(0);};
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);

