import {ClubEconomy} from './club-economy';
import {PlayerIdentity,type IdentityPreview} from './player-identity';
import {applyTeamStatusAudit,selectableTeams} from './team-pool';
import {RecruitmentNetwork} from './recruitment-network';
import { ipcMain, dialog, app, BrowserWindow } from 'electron';
import { db, runInTransaction, getDbPath,configureCareerWorlds,careerWorld,activateCareerWorld,clearActiveCareerWorld,createPracticeWorld,syncCareerWorld,listCareerWorlds,deleteCareerWorld,getCareerDatabase,getCareerTemplate } from './database';
import {playerBridge,installedAiRuntime,runtimePreferencesFile,playerBridgeEnvironment} from './release-runtime';
import {PlayerPreferences,TUTORIAL_VERSION} from './player-preferences';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import * as child_process from 'child_process';
import { RLBotDetector } from '../services/rlbot-detector';
import { buildSeriesContext } from '../services/series-context';
import { CareerManagement } from './career-management';
import { addDays, transferWindow } from '../game/career-rules';
import { ensurePlayableRoster } from './amateur-pool';
import { applyRealRosterSnapshot } from './roster-sync';
import { PlayerInteractions } from './player-interactions';
import { OutgoingTransfers } from './outgoing-transfers';
import { MatchHandoff } from '../services/match-handoff';
import {InjectorConfirmation} from '../services/injector-confirmation';
import { playedMatchResult } from '../services/played-match-result';
import { Chirp } from './chirp';
import { LocalChirpText } from './chirp-text';
import {markAllInboxRead} from './inbox';
import { seriesMap } from '../services/series-maps';
import { broadcastMatch } from '../services/broadcast-assets';
import {FifaWorldCup} from './fifae-world-cup';
import {NationalManagement} from './national-management';
import {playerMatchRole,DEFAULT_TACTICS} from '../game/tactics';
import {TrophyCeremonies} from './trophy-ceremonies';
import {ClubChampionship,type ClubSetup} from './club-championship';
import {CareerHonours} from './career-honours';
import { ClubStudio } from './club-studio';
import { BroadcastOverlay } from './broadcast-overlay';
import {MatchLoadingCover} from './match-loading-cover';
import { fullscreenBroadcast } from './fullscreen-broadcast';
import { nextSeriesGame } from '../services/next-series-game';
import {Tournament} from './tournament';
import {TransferMarket} from './transfer-market';
import {botDifficulty,BOT_DIFFICULTIES} from '../game/bot-difficulty';
import {careerMode,isPath} from '../game/career-mode';
import {PathToGlory} from './path-to-glory';
import {SeriesTimeouts} from './series-timeouts';
import {FlagshipFormatRepair} from './flagship-format-repair';
import {careerWindow,transferDates,syncTransferCalendar} from './transfer-calendar';

export function setupIpcHandlers() {
  // Ensure database has initial master data seeded immediately
  ensureDatabaseSeeded();
  configureCareerWorlds(()=>ensureDatabaseSeeded());
  const management = new CareerManagement(db);
  const interactions = new PlayerInteractions(db);
  const outgoing = new OutgoingTransfers(db);
  const chirps=new Map<string,Chirp>();
  const chirp=new Proxy({} as Chirp,{get(_,key){
    if(key==='close')return()=>{for(const c of chirps.values())c.close();chirps.clear();};
    if(!activeCareerId)throw new Error('Load a career first.');
    if(careerMode(getCareerDatabase(activeCareerId),activeCareerId)==='Path To Glory'){if(key==='setGameplayActive'||key==='queueUpdates')return()=>{};throw Error('Chirp is unavailable in Path To Glory.');}
    let instance=chirps.get(activeCareerId);
    if(!instance){instance=new Chirp(getCareerDatabase(activeCareerId),activeCareerId.startsWith('tutorial-')?undefined:new LocalChirpText(installedAiRuntime()||path.join(path.dirname(getLauncherScriptPath()),'local_runtime')));chirps.set(activeCareerId,instance);}
    const value=(instance as any)[key];return typeof value==='function'?value.bind(instance):value;
  }});
  const broadcast = new BroadcastOverlay();
  const matchLoading = new MatchLoadingCover();
  app.on('before-quit',()=>{chirp.close();broadcast.close();matchLoading.close();});
  let activeCareerId: string | null = null;
  let practiceActive=false,practicePrevious:string|null=null;
  const practices=new Map<string,string>();
  const preferences=new PlayerPreferences(app.getPath('userData'));
  const integrationPaths=()=>{
    const saved=preferences.read().integration||{};
    const legacy=(key:string)=>{const value=db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value;try{return JSON.parse(value);}catch{return value;}};
    return {rocketLeague:saved.rocketLeague||legacy('rl_install_path')||'',botPack:saved.botPack||legacy('rlbot_path')||'',aiRuntime:installedAiRuntime(),speechPython:saved.speechPython||'',speechDevice:saved.speechDevice==='cpu'?'cpu':'auto'};
  };
  ipcMain.handle('app:integration',()=>integrationPaths());
  ipcMain.handle('app:saveIntegration',(_,values:any)=>{
    if(practiceActive)throw Error('Integration settings are read-only during practice.');
    for(const [key,value] of Object.entries(values||{})){
      if(key==='speechDevice'){if(value!=='auto'&&value!=='cpu')throw Error('Choose automatic or CPU voice processing.');continue;}
      if(!['rocketLeague','botPack','aiRuntime','speechPython'].includes(key)||typeof value!=='string'||value.length>2000||(value&&!fs.existsSync(value)))throw Error('Choose an existing game file or folder.');
      if(key==='speechPython'&&value&&(!value.toLowerCase().endsWith('.exe')||!fs.statSync(value).isFile()))throw Error('Choose the Python executable in your AMD speech environment.');
    }
    preferences.update({integration:{...preferences.read().integration,rocketLeague:values.rocketLeague||'',botPack:values.botPack||'',speechPython:values.speechPython||'',speechDevice:values.speechDevice==='cpu'?'cpu':'auto'}});
    if(values.aiRuntime)fs.writeFileSync(runtimePreferencesFile(),JSON.stringify({path:values.aiRuntime}));
    return {success:true};
  });
  // AsyncLocalStorage binds promises, timers and match-process callbacks to
  // their original save, even if another career is loaded before they finish.
  const handle=(channel:string,action:(event:any,...args:any[])=>any)=>ipcMain.handle(channel,async(event,...args)=>{
    if(practiceActive&&(['rlbot:launch','rlbot:testMatch','career:create','career:delete'].includes(channel)||channel==='career:load'&&!String(args[0]).startsWith('tutorial-')))
      throw Error('Finish or skip the practice tour before starting a real career or Rocket League match.');
    const id=channel==='career:load'||channel==='career:save'||channel==='career:delete'?args[0]:activeCareerId;
    const invoke=()=>action(event,...args);
    if(channel==='career:create'){
      if(matchHandoff.busy)throw new Error('Finish the live series before creating another career.');
      const result=await invoke();if(result.success)syncCareerWorld(result.id);return result;
    }
    if(channel==='career:list'||!id)return invoke();
    if((channel==='career:load'||channel==='career:delete')&&matchHandoff.busy)throw new Error('Finish the live series before switching or deleting careers.');
    try{return await careerWorld(id,invoke);}finally{syncCareerWorld(id);}
  });
  const visiblePlayer=(row:any)=>activeCareerId?new RecruitmentNetwork(db).visible(management.career(activeCareerId),mapPlayerRow(row)):mapPlayerRow(row);
  const activeCareer = () => {
    if (!activeCareerId) throw new Error('Load a career first.');
    return management.career(activeCareerId);
  };
  const requireCareer = (id: string) => {
    if (id !== activeCareerId) throw new Error('This is not the loaded career.');
    return management.career(id);
  };
  const manage = (name: string, action: (...args: any[]) => any) => handle('management:' + name, async (_, id: string, ...args: any[]) => {
    try { const c=requireCareer(id);if(isPath(c)&&(/^(finances|approachAgent|dispatchRegion|chirp|scouting|dispatchScout|signingQuote|sign$|outgoingTransfers|listForTransfer|respondToOffer|shortlist|social|supportPlayer|setDifficulty)/.test(name)))throw Error('This feature is not available in Path To Glory. Your squad stays together.');return action(id, ...args); }
    catch (err: any) { return { success: false, error: err.message }; }
  });
  const studio=new ClubStudio(db);
  for(const name of ['status','appoint','resign','callUp','saveTactics','match'] as const)handle('national:'+name,(_, ...args:any[])=>{
    try{
      const career=activeCareer();
      if(!['status','match'].includes(name)&&matchHandoff.busy)throw Error('Finish the live game and commentary before changing your national team.');
      const service=new NationalManagement(db);
      return (service[name] as Function).call(service,career.id,...args);
    }catch(error:any){return {success:false,error:error.message};}
  });
  const editStudio=(fn:()=>any)=>{if(matchHandoff.busy)throw Error('Finish the live game before saving club designs or car presets.');return fn();};
  manage('clubBranding',id=>({success:true,branding:studio.branding(id)}));
  manage('saveClubBranding',(id,design)=>editStudio(()=>studio.saveBranding(id,design)));
  manage('resetClubBranding',id=>editStudio(()=>studio.resetBranding(id)));
  manage('squadGarage',id=>studio.garage(id));
  manage('saveCarPreset',(id,player,preset)=>editStudio(()=>studio.savePreset(id,player,preset)));
  manage('resetCarPreset',(id,player)=>editStudio(()=>studio.resetPreset(id,player)));
  manage('coordinateCars',id=>editStudio(()=>studio.coordinate(id)));
  manage('copyCarPreset',(id,preset)=>editStudio(()=>studio.copyPreset(id,preset)));
  manage('overview', (id) => {
    const career = management.career(id);
    return { window: careerWindow(db,id,career.currentDate),
      openEvent: db.prepare("SELECT c.id, c.name, cc.startDate, (SELECT COUNT(*) FROM competition_entries ce WHERE ce.competitionId = c.id) AS entrantCount, EXISTS(SELECT 1 FROM competition_byes cb WHERE cb.competitionId = c.id AND cb.teamId = ?) AS hasBye FROM competitions c JOIN career_competitions cc ON cc.competitionId = c.id JOIN competition_entries own ON own.competitionId = c.id AND own.teamId = ? WHERE cc.careerId = ? AND cc.stage = 'QUALIFIER' AND c.status != 'completed' ORDER BY cc.startDate LIMIT 1").get(career.teamId, career.teamId, id),
      shortlist: db.prepare('SELECT playerId FROM career_shortlist WHERE careerId = ?').all(id).map((p: any) => p.playerId),
      history: db.prepare('SELECT tr.*, p.gamertag FROM transfers tr JOIN players p ON p.id = tr.playerId WHERE tr.toTeamId = ? OR tr.fromTeamId = ? ORDER BY date DESC').all(career.teamId, career.teamId),
      recent: db.prepare("SELECT f.*, ht.name AS homeTeamName, at.name AS awayTeamName FROM fixtures f JOIN career_competitions cc ON cc.competitionId = f.competitionId JOIN teams ht ON ht.id = f.homeTeamId JOIN teams at ON at.id = f.awayTeamId WHERE cc.careerId = ? AND (f.homeTeamId = ? OR f.awayTeamId = ?) AND f.status = 'completed' ORDER BY scheduledDate DESC LIMIT 5").all(id, career.teamId, career.teamId),
      social: db.prepare('SELECT * FROM social_posts WHERE careerId = ? ORDER BY date DESC, rowid DESC LIMIT 3').all(id) };
  });
  manage('setDifficulty',(id,difficulty)=>{
    requireCareer(id);
    if(!BOT_DIFFICULTIES.includes(difficulty))throw new Error('Choose Easy, Medium or Hard.');
    db.prepare('UPDATE careers SET difficulty=?,updatedAt=? WHERE id=?').run(difficulty,new Date().toISOString(),id);
    return {success:true,difficulty,applies:'next_game'};
  });
  manage('training', id => management.training(id));
  manage('pathOverview',id=>new PathToGlory(db).overview(id));
  manage('pathTutorial',(id,step)=>new PathToGlory(db).tutorial(id,step));
  manage('pathRank',(id,rank)=>new PathToGlory(db).setRank(id,rank));
  manage('pathFormReward',(id,key,player,fixture)=>{if(matchHandoff.busy)throw Error('Wait for the live game to finish.');return new PathToGlory(db).activateFormReward(id,key,player,fixture);});
  manage('seriesTimeout',(id,fixture,orders,tone)=>{if(matchHandoff.busy)throw Error('Wait for commentary and match cleanup to finish.');return management.timeout(id,fixture,orders,tone);});
  manage('seriesTimeoutState',(id,fixture)=>{if(!matchHandoff.busy)new SeriesTimeouts(db).considerOpponent(id,fixture);return management.timeoutState(id,fixture);});
  manage('activeSeriesTimeout',id=>new SeriesTimeouts(db).active(id));
  manage('startSeriesTimeout',(id,fixture)=>{if(matchHandoff.busy)throw Error('Wait for commentary and match cleanup to finish.');return management.startTimeout(id,fixture);});
  manage('saveTraining', (id, schedule) => management.saveTraining(id, schedule));
  manage('allocateSkill', (id,playerId,skill) => {if(matchHandoff.busy)throw new Error('Wait for the live game to finish before allocating skills.');return management.allocateSkill(id,playerId,skill);});
  manage('setLineup', (id, players) => { if (matchHandoff.busy) throw new Error('Wait until the live game and commentary finish before changing your lineup.'); return management.setLineup(id, players); });
  manage('tactics', id => management.tactics(id));
  manage('saveTactics', (id, plan) => management.saveTactics(id, plan));
  manage('simulation',(id,fixture)=>{if(matchHandoff.busy)throw Error('Finish the live game first.');return management.simulation(id,fixture);});
  manage('finances',id=>db.transaction(()=>new ClubEconomy(db).overview(management.career(id)))());
  manage('scoutingRegions',id=>new RecruitmentNetwork(db).regions(management.career(id)));
  manage('dispatchRegion',(id,region,months)=>db.transaction(()=>new RecruitmentNetwork(db).dispatchRegion(management.career(id),region,months))());
  manage('approachAgent',(id,player,role)=>db.transaction(()=>new RecruitmentNetwork(db).approach(management.career(id),player,role))());
  manage('scouting', id => management.scouting(id));
  manage('dispatchScout', (id, target) => management.dispatchScout(id, target));
  manage('signingQuote', (id, player) => management.signingQuote(id, player));
  manage('sign', (id, player, offer) => { if (matchHandoff.busy) throw new Error('Wait until the live game finishes before changing your squad.'); return management.sign(id, player, offer); });
  manage('outgoingTransfers', id => outgoing.overview(id));
  manage('listForTransfer', (id, player, price, listed) => outgoing.list(id, player, price, listed));
  manage('respondToOffer', (id, offer, action, price) => { if (matchHandoff.busy && action === 'accept') throw new Error('Wait until the live game and commentary finish before agreeing a transfer.'); return outgoing.respond(id, offer, action, price); });
  manage('shortlist', (id, player, add) => {
    if (!db.prepare('SELECT id FROM players WHERE id = ?').get(player)) throw new Error('Player not found');
    if (add) db.prepare('INSERT OR IGNORE INTO career_shortlist (careerId, playerId) VALUES (?, ?)').run(id, player);
    else db.prepare('DELETE FROM career_shortlist WHERE careerId = ? AND playerId = ?').run(id, player);
    return { success: true };
  });
  manage('social', id => db.prepare('SELECT sp.*, p.gamertag, p.morale, pt.confidence, pt.pressureResistance FROM social_posts sp JOIN players p ON p.id = sp.playerId LEFT JOIN player_traits pt ON pt.playerId = p.id WHERE sp.careerId = ? ORDER BY date DESC, sp.rowid DESC LIMIT 50').all(id));
  manage('supportPlayer', (id, post) => management.respond(id, post));
  manage('chirpFeed', (id, options) => chirp.feed(id, options, false));
  manage('chirpUpdates', (id) => chirp.updates(id));
  manage('chirpProfile', (id, account) => chirp.profile(id, account));
  manage('chirpThread', (id, post) => chirp.thread(id, post));
  manage('chirpFollow', (id, account) => chirp.follow(id, account));
  manage('chirpReact', (id, post, type) => chirp.react(id, post, type));
  manage('chirpPublish', (id, body, parent) => chirp.publish(id, body, parent));
  manage('chirpNotifications', (id, markRead) => chirp.notifications(id, markRead));
  manage('dressingRoom', id => interactions.overview(id));
  manage('replyToPlayer', (id, conversation, response) => interactions.reply(id, conversation, response));
  manage('chatWithPlayer', (id, player, topic) => interactions.chat(id, player, topic));
  manage('teamTalks', (id, fixture) => interactions.talks(id, fixture));
  manage('giveTeamTalk', (id, fixture, phase, tone) => interactions.teamTalk(id, fixture, phase, tone));

  // ============================================================
  // Database Operations (low-level, for advanced/developer use)
  // ============================================================
  handle('database:query', async (_, sql: string, params: any[] = []) => {
    if(app.isPackaged)throw Error('Direct database access is unavailable in the player release.');
    try {
      const stmt = db.prepare(sql);
      return stmt.get(...params);
    } catch (err: any) {
      console.error('[IPC] database:query error:', err.message);
      throw new Error(err.message);
    }
  });

  handle('database:run', async (_, sql: string, params: any[] = []) => {
    if(app.isPackaged)throw Error('Direct database editing is unavailable in the player release.');
    try {
      const stmt = db.prepare(sql);
      const info = stmt.run(...params);
      return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
    } catch (err: any) {
      console.error('[IPC] database:run error:', err.message);
      throw new Error(err.message);
    }
  });

  handle('database:all', async (_, sql: string, params: any[] = []) => {
    if(app.isPackaged)throw Error('Direct database access is unavailable in the player release.');
    try {
      const stmt = db.prepare(sql);
      return stmt.all(...params);
    } catch (err: any) {
      console.error('[IPC] database:all error:', err.message);
      throw new Error(err.message);
    }
  });

  // ============================================================
  // Career Operations
  handle('career:pathTeams',async(_,region?:string)=>new PathToGlory(getCareerTemplate()).candidates(region));
  // ============================================================
  const createCareer = async (_:any, data: {
    managerName: string;
    teamId: string;
    region: string;
    difficulty: string;
    customOrgName?: string;
    mode?:string;
    pathRank?:string;
  },practice=false) => {
    try {
      const id = (practice?'tutorial-':'')+uuidv4();
      if(practice)createPracticeWorld(id);
      const now = new Date().toISOString();
      const startDate = '2026-10-11'; // Start after the dated 2026 roster snapshot.

      return careerWorld(id,()=>runInTransaction(() => {
        // Ensure master data is seeded first
        ensureDatabaseSeeded();
        if(data.mode==='Path To Glory'&&data.pathRank){const generated=new PathToGlory(db).generateSquad(data.pathRank,data.region,data.customOrgName);data={...data,teamId:generated.id,region:generated.region};}

        // Handle custom organization if needed
        const existingTeam = db.prepare('SELECT id FROM teams WHERE id = ?').get(data.teamId);
        const rosterSource = db.prepare('SELECT status FROM team_roster_sources WHERE teamId = ?').get(data.teamId);
        if (rosterSource && (['inactive','incomplete','disbanded'].includes(rosterSource.status) || db.prepare('SELECT COUNT(*) AS count FROM players WHERE teamId = ?').get(data.teamId).count < 3)) throw new Error('This organization has no eligible complete roster. Choose another club or create your own.');
        if (!existingTeam) {
          const customName = data.customOrgName || (data.teamId === 'team_custom' ? 'Custom Esports' : 'New Franchise');
          const customShort = customName.slice(0, 3).toUpperCase();
          const mappedRegion = REGION_CODE_MAP[data.region] || data.region;
          db.prepare(`
            INSERT INTO teams (id, name, shortName, region, reputation, budget, cashBalance, coachRating, facilityLevel, fanbase, sponsorIncome, teamChemistry, teamForm)
            VALUES (?, ?, ?, ?, 60, 350000, 350000, 70, 1, 5000, 20000, 70, 70)
          `).run(data.teamId, customName, customShort, mappedRegion);

          // Assign 3 free agent players to custom team if available
          const freeAgents = db.prepare(`SELECT p.id FROM players p JOIN player_affiliations af ON af.playerId = p.id WHERE p.teamId IS NULL AND af.status IN ('free_agent','career') AND NOT EXISTS(SELECT 1 FROM generated_entities g WHERE g.id = p.id) ORDER BY p.overall DESC LIMIT 3`).all() as any[];
          if (freeAgents.length < 3) throw new Error('There are fewer than three confirmed available real free agents. Choose an existing real club with a complete roster.');
          for (const fa of freeAgents) {
            db.prepare(`UPDATE players SET teamId = ? WHERE id = ?`).run(data.teamId, fa.id);
          }
          ensurePlayableRoster(db, data.teamId, startDate);
        }

        // Create career
        db.prepare(`
          INSERT INTO careers (id, managerName, teamId, region, difficulty, currentDate, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, data.managerName, data.teamId, data.region, data.difficulty, startDate, now, now);
        const mode=data.mode==='Path To Glory'?'Path To Glory':'Manager Career';
        db.prepare('INSERT INTO career_modes(careerId,mode) VALUES (?,?)').run(id,mode);

        // Create first season
        const seasonId = uuidv4();
        db.prepare(`
          INSERT INTO seasons (id, careerId, number, startDate, endDate, isActive)
          VALUES (?, ?, 1, ?, ?, 1)
        `).run(seasonId, id, startDate, '2027-06-30');

        // Mark the selected team as player-managed
        db.prepare(`
          INSERT OR REPLACE INTO settings (key, value) VALUES ('career_' || ? || '_teamId', ?)
        `).run(id, data.teamId);

        // Link competitions to this active season
        db.prepare(`
          UPDATE competitions SET seasonId = ? WHERE seasonId = 'season_default' OR seasonId IS NULL
        `).run(seasonId);

        // Create initial calendar events
        if(mode==='Path To Glory'){if(data.pathRank)new PathToGlory(db).initialise(id,{rank:data.pathRank,generated:true});management.ensureCircuit(id);}else createInitialCalendarEvents(id, startDate);

        // Create welcome inbox message
        db.prepare(`
          INSERT INTO inbox_items (id, careerId, date, type, title, body, isRead, actions)
          VALUES (?, ?, ?, 'general', ?, ?, 0, NULL)
        `).run(uuidv4(), id, startDate,mode==='Path To Glory'?'Your climb begins':'Welcome to RL Manager!',mode==='Path To Glory'?'Your three players stay together for the whole journey. Play games to earn XP, allocate skill points in Training and win promotion trials. Open Your climb for the skippable tutorial.':'Congratulations on your appointment as manager. Check your squad, set up tactics, and prepare for the upcoming season. Good luck!');

        return { success: true, id, seasonId };
      }),true);
    } catch (err: any) {
      console.error('[IPC] career:create error:', err.message);
      return { success: false, error: err.message };
    }
  };
  handle('career:create',(event,data)=>createCareer(event,data));
  handle('app:playerInfo',()=>({version:app.getVersion(),packaged:app.isPackaged,preferences:preferences.read(),tutorialVersion:TUTORIAL_VERSION,aiAvailable:!!installedAiRuntime()}));
  handle('tutorial:start',async(event,mode:string)=>{
    if(matchHandoff.busy)throw Error('Finish the live match before opening the guide.');
    if(!['Manager Career','Path To Glory'].includes(mode))throw Error('Choose a valid game mode.');
    if(!practiceActive){practicePrevious=activeCareerId;practiceActive=true;}
    chirp.close();
    let id=practices.get(mode);
    if(!id){
      const team=getCareerTemplate().prepare("SELECT t.id,t.region FROM teams t WHERE (SELECT COUNT(*) FROM players p WHERE p.teamId=t.id)>=3 AND t.region IN ('Europe','EU') ORDER BY CASE WHEN t.name LIKE '%Gentle%' THEN 0 ELSE 1 END,t.reputation DESC LIMIT 1").get();
      if(!team)throw Error('The practice squad is unavailable. You can skip the guide and try again from Settings.');
      const result=await createCareer(event,{managerName:'Coach',teamId:team.id,region:team.region,difficulty:'Medium',mode,customOrgName:'RLM Academy',...(mode==='Path To Glory'?{pathRank:'Gold'}:{})},true);
      if(!('id' in result))throw Error(result.error||'Could not prepare the practice career.');
      const createdId=result.id;id=createdId;practices.set(mode,createdId);
      careerWorld(createdId,()=>{
        const career=management.career(createdId);
        const first=db.prepare("SELECT scheduledDate FROM fixtures WHERE (homeTeamId=? OR awayTeamId=?) AND status!='completed' ORDER BY scheduledDate LIMIT 1").get(career.teamId,career.teamId);
        if(first&&first.scheduledDate>career.currentDate)db.prepare('UPDATE careers SET currentDate=? WHERE id=?').run(first.scheduledDate,createdId);
      });
      if(mode==='Path To Glory')careerWorld(createdId,()=>{
        new PathToGlory(db).tutorial(createdId,4);
        management.training(createdId);
        db.prepare('UPDATE player_skill_development SET points=12,earnedPoints=12 WHERE careerId=?').run(createdId);
      });
    }
    if(!id)throw Error('Practice career not found');
    activeCareerId=id;activateCareerWorld(id);return {success:true,id};
  });
  handle('tutorial:finish',(_,outcome:string)=>{
    if(!['completed','skipped'].includes(outcome))throw Error('Invalid tutorial outcome');
    chirp.close();practiceActive=false;activeCareerId=practicePrevious;
    if(activeCareerId)activateCareerWorld(activeCareerId);else clearActiveCareerWorld();
    preferences.tutorial(outcome as 'completed'|'skipped');return {success:true,previousCareerId:practicePrevious};
  });

  handle('career:load', async (_, id: string) => {
    try {
      const career = db.prepare('SELECT * FROM careers WHERE id = ?').get(id) as any;
      if (!career) return { success: false, error: 'Career not found' };
      new ClubEconomy(db).assertEmployed(id);

      const season = db.prepare('SELECT * FROM seasons WHERE careerId = ? AND isActive = 1').get(id) as any;
      if(activeCareerId!==id)chirp.close();
      activeCareerId = id;
      activateCareerWorld(id);
      career.mode=careerMode(db,id);
      db.transaction(() => { applyTeamStatusAudit(db);management.tactics(id);management.ensureCircuit(id);if(!isPath(career)){syncTransferCalendar(db,career);interactions.tick(id);new TransferMarket(db).tick(id);}management.progressCircuit(id, career.currentDate); })();
      const teamId = career.teamId;

      // Load team
      const team = db.prepare('SELECT t.*, rs.status AS rosterStatus, rs.verifiedAt AS rosterVerifiedAt, rs.source AS rosterSource, rs.note AS rosterNote FROM teams t LEFT JOIN team_roster_sources rs ON rs.teamId = t.id WHERE t.id = ?').get(teamId) as any;

      // Load roster players
      const players = db.prepare(`
        SELECT p.*, af.status AS affiliationStatus, af.note AS affiliationNote, prs.confidence AS ratingConfidence, prs.method AS ratingMethod, prs.sources AS ratingSources, prs.reviewedAt AS ratingReviewedAt, pa.mechanical, pa.aerial, pa.groundControl, pa.shooting, pa.shotPower,
               pa.shotAccuracy, pa.passing, pa.defense, pa.goalkeeping, pa.positioning,
               pa.rotations, pa.boostManagement, pa.speed, pa.recovery, pa.fiftyFifty,
               pa.demolitions, pa.gameSense, pa.consistency as attrConsistency, pa.clutch,
               pt.aggression, pt.riskTolerance, pt.teamOrientation, pt.adaptability,
               pt.pressureResistance, pt.developmentRate, pt.professionalism, pt.confidence,
               pt.tiltTendency, c.salary, c.buyout as contractBuyout, c.endDate as contractEnd
        FROM players p
        LEFT JOIN player_affiliations af ON af.playerId = p.id
        LEFT JOIN player_rating_sources prs ON prs.playerId = p.id
        LEFT JOIN player_attributes pa ON p.id = pa.playerId
        LEFT JOIN player_traits pt ON p.id = pt.playerId
        LEFT JOIN contracts c ON c.playerId = p.id AND c.isActive = 1
        WHERE p.teamId = ?
      `).all(teamId);

      return {
        success: true,
        career:{...career,transferWindows:isPath(career)?[]:transferDates(db,id)},
        season,
        team:studio.decorate(team,id),
        players: management.orderRoster(id, teamId, players).map(visiblePlayer)
      };
    } catch (err: any) {
      console.error('[IPC] career:load error:', err.message);
      return { success: false, error: err.message };
    }
  });

  handle('career:save', async (_, id: string) => {
    try {
      const now = new Date().toISOString();
      db.prepare('UPDATE careers SET updatedAt = ? WHERE id = ?').run(now, id);
      return { success: true };
    } catch (err: any) {
      console.error('[IPC] career:save error:', err.message);
      return { success: false, error: err.message };
    }
  });

  handle('career:list', async () => {
    try {
      return listCareerWorlds();
    } catch (err: any) {
      console.error('[IPC] career:list error:', err.message);
      return [];
    }
  });

  handle('career:delete', async (_, id: string) => {
    try {
      runInTransaction(() => {
        db.prepare('DELETE FROM inbox_items WHERE careerId = ?').run(id);
        for (const table of ['chirp_publication_order','chirp_publications','player_unrest','chirp_post_meta','chirp_world_state','chirp_rivalries','chirp_text_jobs', 'chirp_notifications', 'chirp_reactions', 'chirp_bookmarks', 'chirp_follows', 'chirp_posts', 'chirp_accounts', 'chirp_days', 'social_posts', 'manager_relationships', 'player_conversations', 'player_promises', 'interaction_series', 'series_selections', 'series_squads', 'team_talks', 'transfer_listings', 'outgoing_offers']) db.prepare(`DELETE FROM ${table} WHERE careerId = ?`).run(id);
        db.prepare('DELETE FROM calendar_events WHERE careerId = ?').run(id);
        db.prepare('DELETE FROM seasons WHERE careerId = ?').run(id);
        db.prepare('DELETE FROM careers WHERE id = ?').run(id);
      });
      deleteCareerWorld(id);
      return { success: true };
    } catch (err: any) {
      console.error('[IPC] career:delete error:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ============================================================
  // Player Operations
  // ============================================================
  const identityImports=new Map<string,{careerId:string;preview:IdentityPreview;created:number}>();
  const identityEditor=()=>{
    activeCareer();
    if(practiceActive)throw Error('Finish or skip the tutorial before editing career data.');
    if(matchHandoff.busy)throw Error('Finish the live series before editing player information.');
    return new PlayerIdentity(db,()=>{
      const file=getDbPath(),folder=path.join(path.dirname(file),'identity-backups');
      fs.mkdirSync(folder,{recursive:true});
      fs.writeFileSync(path.join(folder,`${activeCareerId}-${Date.now()}-${uuidv4()}.sqlite`),Buffer.from(db.exportBinary()));
    });
  };
  handle('players:identity:get',(_,id:string)=>identityEditor().get(id));
  handle('players:identity:save',(_,id:string,details:any)=>{
    const editor=identityEditor();
    if(!details||typeof details!=='object'||Array.isArray(details))throw Error('Enter player information.');
    const preview=editor.preview([{realName:details.realName,age:details.age,nationality:details.nationality,id}]);
    return {updated:editor.apply(preview)};
  });
  handle('players:identity:preview',(_,text:string)=>{
    const editor=identityEditor();
    if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>32*1024*1024)throw Error('Choose a JSON file smaller than 32 MB.');
    let input;try{input=JSON.parse(text);}catch{throw Error('This file is not valid JSON.');}
    const preview=editor.preview(input),token=uuidv4();
    for(const [key,entry] of identityImports)if(Date.now()-entry.created>15*60*1000)identityImports.delete(key);
    if(identityImports.size>=5)identityImports.delete(identityImports.keys().next().value!);
    identityImports.set(token,{careerId:activeCareerId!,preview,created:Date.now()});
    return {token,...preview};
  });
  handle('players:identity:apply',(_,token:string)=>{
    const editor=identityEditor(),entry=identityImports.get(token);
    if(!entry||entry.careerId!==activeCareerId||Date.now()-entry.created>15*60*1000)throw Error('Import preview expired or belongs to another career. Review the file again.');
    const updated=editor.apply(entry.preview);identityImports.delete(token);return {updated};
  });
  handle('players:getAll', async () => {
    try {
      let players = db.prepare(`
        SELECT p.*, af.status AS affiliationStatus, af.note AS affiliationNote, prs.confidence AS ratingConfidence, prs.method AS ratingMethod, prs.sources AS ratingSources, prs.reviewedAt AS ratingReviewedAt, pa.mechanical, pa.aerial, pa.groundControl, pa.shooting, pa.shotPower,
               pa.shotAccuracy, pa.passing, pa.defense, pa.goalkeeping, pa.positioning,
               pa.rotations, pa.boostManagement, pa.speed, pa.recovery, pa.fiftyFifty,
               pa.demolitions, pa.gameSense, pa.consistency as attrConsistency, pa.clutch,
               pt.aggression, pt.riskTolerance, pt.teamOrientation, pt.adaptability,
               pt.pressureResistance, pt.developmentRate, pt.professionalism, pt.confidence,
               pt.tiltTendency,
               t.name as teamName
        FROM players p
        LEFT JOIN player_affiliations af ON af.playerId = p.id
        LEFT JOIN player_rating_sources prs ON prs.playerId = p.id
        LEFT JOIN player_attributes pa ON p.id = pa.playerId
        LEFT JOIN player_traits pt ON p.id = pt.playerId
        LEFT JOIN teams t ON p.teamId = t.id
        WHERE NOT EXISTS (SELECT 1 FROM generated_entities g WHERE g.id = p.id)
      `).all();
      if (players.length === 0) {
        seedDatabase();
        players = db.prepare(`
          SELECT p.*, af.status AS affiliationStatus, af.note AS affiliationNote, prs.confidence AS ratingConfidence, prs.method AS ratingMethod, prs.sources AS ratingSources, prs.reviewedAt AS ratingReviewedAt, pa.mechanical, pa.aerial, pa.groundControl, pa.shooting, pa.shotPower,
                 pa.shotAccuracy, pa.passing, pa.defense, pa.goalkeeping, pa.positioning,
                 pa.rotations, pa.boostManagement, pa.speed, pa.recovery, pa.fiftyFifty,
                 pa.demolitions, pa.gameSense, pa.consistency as attrConsistency, pa.clutch,
                 pt.aggression, pt.riskTolerance, pt.teamOrientation, pt.adaptability,
                 pt.pressureResistance, pt.developmentRate, pt.professionalism, pt.confidence,
                 pt.tiltTendency,
                 t.name as teamName
          FROM players p
        LEFT JOIN player_affiliations af ON af.playerId = p.id
        LEFT JOIN player_rating_sources prs ON prs.playerId = p.id
          LEFT JOIN player_attributes pa ON p.id = pa.playerId
          LEFT JOIN player_traits pt ON p.id = pt.playerId
          LEFT JOIN teams t ON p.teamId = t.id
          WHERE NOT EXISTS (SELECT 1 FROM generated_entities g WHERE g.id = p.id)
        `).all();
      }
      return players.map(visiblePlayer);
    } catch (err: any) {
      console.error('[IPC] players:getAll error:', err.message);
      return [];
    }
  });

  handle('players:getById', async (_, id: string) => {
    try {
      const row = db.prepare(`
        SELECT p.*, af.status AS affiliationStatus, af.note AS affiliationNote, prs.confidence AS ratingConfidence, prs.method AS ratingMethod, prs.sources AS ratingSources, prs.reviewedAt AS ratingReviewedAt, pa.mechanical, pa.aerial, pa.groundControl, pa.shooting, pa.shotPower,
               pa.shotAccuracy, pa.passing, pa.defense, pa.goalkeeping, pa.positioning,
               pa.rotations, pa.boostManagement, pa.speed, pa.recovery, pa.fiftyFifty,
               pa.demolitions, pa.gameSense, pa.consistency as attrConsistency, pa.clutch,
               pt.aggression, pt.riskTolerance, pt.teamOrientation, pt.adaptability,
               pt.pressureResistance, pt.developmentRate, pt.professionalism, pt.confidence,
               pt.tiltTendency,
               t.name as teamName,
               c.salary, c.endDate as contractEnd, c.buyout as contractBuyout
        FROM players p
        LEFT JOIN player_affiliations af ON af.playerId = p.id
        LEFT JOIN player_rating_sources prs ON prs.playerId = p.id
        LEFT JOIN player_attributes pa ON p.id = pa.playerId
        LEFT JOIN player_traits pt ON p.id = pt.playerId
        LEFT JOIN teams t ON p.teamId = t.id
        LEFT JOIN contracts c ON p.id = c.playerId AND c.isActive = 1
        WHERE p.id = ?
      `).get(id);
      if (!row) return null;
      const career=activeCareer(),honours=new CareerHonours(db);
      return {...visiblePlayer(row as any),careerTitle:honours.equipped(career.id,id)?.title||null,careerHonours:honours.list(career.id,id)};
    } catch (err: any) {
      console.error('[IPC] players:getById error:', err.message);
      return null;
    }
  });

  handle('players:getByTeam', async (_, teamId: string) => {
    try {
      const players = db.prepare(`
        SELECT p.*, af.status AS affiliationStatus, af.note AS affiliationNote, prs.confidence AS ratingConfidence, prs.method AS ratingMethod, prs.sources AS ratingSources, prs.reviewedAt AS ratingReviewedAt, pa.mechanical, pa.aerial, pa.groundControl, pa.shooting, pa.shotPower,
               pa.shotAccuracy, pa.passing, pa.defense, pa.goalkeeping, pa.positioning,
               pa.rotations, pa.boostManagement, pa.speed, pa.recovery, pa.fiftyFifty,
               pa.demolitions, pa.gameSense, pa.consistency as attrConsistency, pa.clutch,
               pt.aggression, pt.riskTolerance, pt.teamOrientation, pt.adaptability,
               pt.pressureResistance, pt.developmentRate, pt.professionalism, pt.confidence,
               pt.tiltTendency,
               c.salary, c.endDate as contractEnd
        FROM players p
        LEFT JOIN player_affiliations af ON af.playerId = p.id
        LEFT JOIN player_rating_sources prs ON prs.playerId = p.id
        LEFT JOIN player_attributes pa ON p.id = pa.playerId
        LEFT JOIN player_traits pt ON p.id = pt.playerId
        LEFT JOIN contracts c ON p.id = c.playerId AND c.isActive = 1
        WHERE p.teamId = ?
        ORDER BY p.overall DESC
      `).all(teamId);
      return (activeCareerId ? management.orderRoster(activeCareerId, teamId, players) : players).map(visiblePlayer);
    } catch (err: any) {
      console.error('[IPC] players:getByTeam error:', err.message);
      return [];
    }
  });

  handle('players:getFreeAgents', async () => {
    try {
      const players = db.prepare(`
        SELECT p.*, af.status AS affiliationStatus, af.note AS affiliationNote, prs.confidence AS ratingConfidence, prs.method AS ratingMethod, prs.sources AS ratingSources, prs.reviewedAt AS ratingReviewedAt, pa.mechanical, pa.aerial, pa.groundControl, pa.shooting, pa.shotPower,
               pa.shotAccuracy, pa.passing, pa.defense, pa.goalkeeping, pa.positioning,
               pa.rotations, pa.boostManagement, pa.speed, pa.recovery, pa.fiftyFifty,
               pa.demolitions, pa.gameSense, pa.consistency as attrConsistency, pa.clutch,
               pt.aggression, pt.riskTolerance, pt.teamOrientation, pt.adaptability,
               pt.pressureResistance, pt.developmentRate, pt.professionalism, pt.confidence,
               pt.tiltTendency
        FROM players p
        LEFT JOIN player_affiliations af ON af.playerId = p.id
        LEFT JOIN player_rating_sources prs ON prs.playerId = p.id
        LEFT JOIN player_attributes pa ON p.id = pa.playerId
        LEFT JOIN player_traits pt ON p.id = pt.playerId
        WHERE (p.teamId IS NULL OR p.teamId = '') AND (af.status IS NULL OR af.status IN ('free_agent', 'career')) AND NOT EXISTS (SELECT 1 FROM generated_entities g WHERE g.id = p.id)
        ORDER BY p.overall DESC
      `).all();
      return players.map(visiblePlayer);
    } catch (err: any) {
      console.error('[IPC] players:getFreeAgents error:', err.message);
      return [];
    }
  });

  handle('players:update', async (_, player: any) => {
    try {
      runInTransaction(() => {
        db.prepare(`
          UPDATE players SET gamertag=?, realName=?, nationality=?, region=?, age=?, teamId=?,
            preferredTendency=?, overall=?, potential=?, form=?, morale=?, fatigue=?,
            consistency=?, chemistry=?, reputation=?, careerEarnings=?, marketValue=?, scoutKnowledge=?
          WHERE id=?
        `).run(
          player.gamertag, player.realName, player.nationality, player.region, player.age,
          player.teamId, player.preferredTendency, player.overall, player.potential,
          player.form, player.morale, player.fatigue, player.consistency, player.chemistry,
          player.reputation, player.careerEarnings, player.marketValue, player.scoutKnowledge,
          player.id
        );

        if (player.attributes) {
          const a = player.attributes;
          db.prepare(`
            UPDATE player_attributes SET mechanical=?, aerial=?, groundControl=?, shooting=?,
              shotPower=?, shotAccuracy=?, passing=?, defense=?, goalkeeping=?, positioning=?,
              rotations=?, boostManagement=?, speed=?, recovery=?, fiftyFifty=?, demolitions=?,
              gameSense=?, consistency=?, clutch=?
            WHERE playerId=?
          `).run(
            a.mechanics, a.aerial, a.groundControl, a.shooting, a.shotPower, a.shotAccuracy,
            a.passing, a.defense, a.goalkeeping, a.positioning, a.rotations, a.boostManagement,
            a.speed, a.recovery, a.fiftyFifty, a.demolitions, a.gameSense, a.consistency, a.clutch,
            player.id
          );
        }
      });
      return { success: true };
    } catch (err: any) {
      console.error('[IPC] players:update error:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ============================================================
  // Team Operations
  // ============================================================
  handle('teams:getSelectable',()=>selectableTeams(getCareerTemplate()));
  handle('teams:getAll', async () => {
    try {
      let teams = db.prepare('SELECT t.*, rs.status AS rosterStatus, rs.verifiedAt AS rosterVerifiedAt, rs.source AS rosterSource, rs.note AS rosterNote FROM teams t LEFT JOIN team_roster_sources rs ON rs.teamId = t.id WHERE NOT EXISTS (SELECT 1 FROM generated_entities g WHERE g.id = t.id) ORDER BY t.reputation DESC').all() as any[];
      if (teams.length === 0) {
        seedDatabase();
        teams = db.prepare('SELECT * FROM teams ORDER BY reputation DESC').all() as any[];
      }
      const rosterByTeam = new Map<string, any[]>();
      for (const player of db.prepare('SELECT id, teamId, overall FROM players ORDER BY overall DESC').all()) {
        const rows = rosterByTeam.get(player.teamId) || []; rows.push(player); rosterByTeam.set(player.teamId, rows);
      }
      const managedId = activeCareerId ? activeCareer().teamId : null;
      return teams.map(t => {
        const roster = rosterByTeam.get(t.id) || [];
        const confirmed: string[] = JSON.parse(db.prepare('SELECT starterIds FROM team_roster_sources WHERE teamId = ?').get(t.id)?.starterIds || '[]');
        const ordered = activeCareerId && t.id === managedId ? management.orderRoster(activeCareerId, t.id, roster) : [...roster].sort((a,b) => Number(confirmed.includes(b.id))-Number(confirmed.includes(a.id)) || b.overall-a.overall);
        return { ...(t.id===managedId?studio.decorate(t,activeCareerId):t), roster: ordered.map(p => p.id), starters: ordered.slice(0, 3).map(p => p.id), isPlayerManaged: t.id === managedId };
      });
    } catch (err: any) {
      console.error('[IPC] teams:getAll error:', err.message);
      return [];
    }
  });

  handle('teams:getById', async (_, id: string) => {
    try {
      const team = db.prepare('SELECT t.*, rs.status AS rosterStatus, rs.verifiedAt AS rosterVerifiedAt, rs.source AS rosterSource, rs.note AS rosterNote FROM teams t LEFT JOIN team_roster_sources rs ON rs.teamId = t.id WHERE t.id = ?').get(id) as any;
      if (!team) return null;
      const roster = db.prepare('SELECT id, overall FROM players WHERE teamId = ? ORDER BY overall DESC').all(id) as any[];
      const confirmed: string[] = JSON.parse(db.prepare('SELECT starterIds FROM team_roster_sources WHERE teamId = ?').get(id)?.starterIds || '[]');
      const ordered = activeCareerId ? management.orderRoster(activeCareerId, id, roster) : [...roster].sort((a,b) => Number(confirmed.includes(b.id))-Number(confirmed.includes(a.id)) || b.overall-a.overall);
      return {
        ...studio.decorate(team,activeCareerId),
        roster: ordered.map(p => p.id),
        starters: ordered.slice(0, 3).map(p => p.id),
        isPlayerManaged: activeCareerId ? id === activeCareer().teamId : false
      };
    } catch (err: any) {
      console.error('[IPC] teams:getById error:', err.message);
      return null;
    }
  });

  // ============================================================
  // Competition & Fixture Operations
  // ============================================================
  handle('competitions:ceremony',(_,eventId?:string)=>{
    const row=new TrophyCeremonies(db).pending(activeCareer().id,eventId);if(!row)return null;
    const file=`competitions/ceremonies/${String(row.type).toLowerCase()}.mp4`;
    const roots=[path.resolve(__dirname,'../public'),path.resolve(__dirname,'../dist'),path.join(process.resourcesPath||'','app.asar.unpacked/public')];
    const video=roots.some(root=>fs.existsSync(path.join(root,file)))?'/'+file:null;
    return {...row,video};
  });
  handle('competitions:dismissCeremony',(_,id:string)=>new TrophyCeremonies(db).dismiss(activeCareer().id,id));
  handle('competitions:getAll', async () => {
    try {
      const career = activeCareer();
      return db.prepare(`SELECT c.*, cc.startDate,cc.sources,cc.stage,cc.cycle, (SELECT COUNT(*) FROM competition_entries entries WHERE entries.competitionId = c.id) AS entrantCount, CASE WHEN ce.teamId IS NOT NULL THEN 1 ELSE 0 END AS entered
        FROM competitions c JOIN career_competitions cc ON cc.competitionId = c.id
        LEFT JOIN competition_entries ce ON ce.competitionId = c.id AND ce.teamId = ?
        WHERE cc.careerId = ? AND cc.stage<>'ARCHIVED' AND c.status<>'cancelled' ORDER BY cc.startDate, c.name`).all(career.teamId, career.id);
    } catch (err: any) {
      console.error('[IPC] competitions:getAll error:', err.message);
      return [];
    }
  });

  handle('competitions:configureClubChampionship',(_,id:string,setup:ClubSetup)=>{
    const career=activeCareer();return new ClubChampionship(db).configure(career,id,setup);
  });

  handle('competitions:getById', async (_, id: string) => {
    try {
      const comp = db.prepare('SELECT * FROM competitions WHERE id = ?').get(id);
      if (!comp) return null;
      if(comp.type==='CLUB_CHAMPIONSHIP')return new ClubChampionship(db).details(activeCareer().id,id);
      if(comp.type==='FIFAE')return new FifaWorldCup(db).details(comp,activeCareer().id);
      const entries = db.prepare('SELECT ce.*,t.name AS teamName FROM competition_entries ce JOIN teams t ON t.id=ce.teamId WHERE competitionId = ? ORDER BY ce.seed').all(id);
      const fixtures = db.prepare(`
        SELECT f.*, ht.name as homeTeamName, at.name as awayTeamName,st.stage,st.groupName,st.nodeId
        FROM fixtures f
        LEFT JOIN teams ht ON f.homeTeamId = ht.id
        LEFT JOIN teams at ON f.awayTeamId = at.id
        LEFT JOIN fixture_stages st ON st.fixtureId=f.id
        WHERE f.competitionId = ?
        ORDER BY f.round,f.scheduledDate,f.id
      `).all(id);
      const config = JSON.parse((comp as any).config || '{}');
      const byes=db.prepare('SELECT b.*,t.name AS teamName FROM competition_byes b JOIN teams t ON t.id=b.teamId WHERE b.competitionId=? ORDER BY b.round,t.name').all(id);
      const qualifiedIds=JSON.parse(db.prepare('SELECT teams FROM qualification_results WHERE competitionId=?').get(id)?.teams||'[]');
      const repair=new FlagshipFormatRepair(db,key=>management.ranking(key)).preview(activeCareer().id,id);
      return { ...(comp as any), entries, fixtures, config,byes,formatRepair:repair,tournament:new Tournament(db).details(id),clubLeague:comp.type==='CLUB_LEAGUE'?new ClubChampionship(db).leagueStandings(id):null,qualified:qualifiedIds.map((teamId:string)=>({id:teamId,name:entries.find(e=>e.teamId===teamId)?.teamName||teamId})), entered: entries.some((e: any) => e.teamId === activeCareer().teamId) };
    } catch (err: any) {
      console.error('[IPC] competitions:getById error:', err.message);
      return null;
    }
  });

  handle('competitions:repairFormat',(_,id:string)=>{
    if(matchHandoff.busy)throw Error('Finish the live match before repairing the event.');
    const career=activeCareer(),result=new FlagshipFormatRepair(db,key=>management.ranking(key)).apply(career.id,id);
    management.message(career.id,career.currentDate,'general','Tournament format repaired',`The event now follows the four-group tournament route. ${result.completedSeriesPreserved} earlier series remain in the linked prior-format history.`, '/competition/'+(result.replacementId||id)+'?tab=bracket');
    return result;
  });

  handle('fixtures:getByDate', async (_, date: string) => {
    try {
      return db.prepare(`
        SELECT f.*, ht.name as homeTeamName, at.name as awayTeamName, c.name as competitionName
        FROM fixtures f
        LEFT JOIN teams ht ON f.homeTeamId = ht.id
        LEFT JOIN teams at ON f.awayTeamId = at.id
        LEFT JOIN competitions c ON f.competitionId = c.id
        WHERE f.scheduledDate = ?
        ORDER BY f.round
      `).all(date);
    } catch (err: any) {
      console.error('[IPC] fixtures:getByDate error:', err.message);
      return [];
    }
  });

  handle('fixtures:getById', async (_, id: string) => {
    try {
      const fixture = db.prepare(`
        SELECT f.*, ht.name as homeTeamName, at.name as awayTeamName, c.name as competitionName, c.type as competitionType
        FROM fixtures f
        LEFT JOIN teams ht ON f.homeTeamId = ht.id
        LEFT JOIN teams at ON f.awayTeamId = at.id
        LEFT JOIN competitions c ON f.competitionId = c.id
        WHERE f.id = ?
      `).get(id);
      if (!fixture) return null;

      const games = db.prepare('SELECT * FROM game_results WHERE fixtureId = ? ORDER BY gameNumber').all(id);
      const gameIds = games.map((g: any) => g.id);
      let playerStats: any[] = [];
      if (gameIds.length > 0) {
        const placeholders = gameIds.map(() => '?').join(',');
        playerStats = db.prepare(`SELECT * FROM game_player_stats WHERE gameResultId IN (${placeholders})`).all(...gameIds);
      }
      let playError = '';
      try { management.assertFixture(activeCareer().id, id); } catch (err: any) { playError = err.message; }
      return { ...(fixture as any), games: games.map((g: any) => ({ ...g, playerStats: playerStats.filter(s => s.gameResultId === g.id) })), playerStats, playError };
    } catch (err: any) {
      console.error('[IPC] fixtures:getById error:', err.message);
      return null;
    }
  });

  handle('fixtures:getUpcoming', async (_, teamId: string, currentDate: string) => {
    try {
      return db.prepare(`
        SELECT f.*, ht.name as homeTeamName, at.name as awayTeamName, c.name as competitionName
        FROM fixtures f
        LEFT JOIN teams ht ON f.homeTeamId = ht.id
        LEFT JOIN teams at ON f.awayTeamId = at.id
        LEFT JOIN competitions c ON f.competitionId = c.id
        WHERE (f.homeTeamId = ? OR f.awayTeamId = ?)
          AND (f.scheduledDate >= ? OR f.status = 'in_progress')
          AND f.status IN ('scheduled', 'in_progress')
          AND EXISTS (SELECT 1 FROM career_competitions cc WHERE cc.competitionId = f.competitionId AND cc.careerId = ? AND cc.stage <> 'ARCHIVED')
        ORDER BY f.scheduledDate
        LIMIT 25
      `).all(teamId, teamId, currentDate, activeCareer().id);
    } catch (err: any) {
      console.error('[IPC] fixtures:getUpcoming error:', err.message);
      return [];
    }
  });

  handle('fixtures:updateResult', async (_, fixtureId: string, homeScore: number, awayScore: number, status: string) => {
    try {
      const career = activeCareer();
      const fixture = management.assertFixture(career.id, fixtureId);
      if (!['in_progress', 'completed'].includes(status)) throw new Error('Invalid series status.');
      const games = db.prepare('SELECT blueScore, orangeScore FROM game_results WHERE fixtureId = ?').all(fixtureId);
      const blue = games.filter((g: any) => g.blueScore > g.orangeScore).length;
      const orange = games.filter((g: any) => g.orangeScore > g.blueScore).length;
      if (homeScore !== blue || awayScore !== orange) throw new Error('The series score does not match its saved games.');
      const required = Math.ceil(Number(String(fixture.seriesFormat).replace(/\D/g, '')) / 2);
      if (status === 'completed' && Math.max(blue, orange) !== required) throw new Error('The series has not reached the winning score.');
      runInTransaction(() => {
        const swap = fixture.awayTeamId === career.teamId;
        db.prepare('UPDATE fixtures SET homeScore = ?, awayScore = ?, status = ? WHERE id = ?')
          .run(swap ? awayScore : homeScore, swap ? homeScore : awayScore, status, fixtureId);
        if (status === 'completed') {
          const final = db.prepare('SELECT * FROM fixtures WHERE id = ?').get(fixtureId);
          management.resultStory(career.id, final);
          management.progressCircuit(career.id, career.currentDate);
        }
      });
      return { success: true };
    } catch (err: any) {
      console.error('[IPC] fixtures:updateResult error:', err.message);
      return { success: false, error: err.message };
    }
  });

  handle('gameResults:create', async (_, result: any) => {
    try { if (matchHandoff.busy || (activeMatchStatus.fixtureId === result.fixtureId && activeMatchStatus.result && !activeMatchStatus.resultSaved)) throw new Error('The played result is still finishing or awaiting recovery. Recover it instead of simulating.'); return management.recordGame(activeCareer().id, result); }
    catch (err: any) { return { success: false, error: err.message }; }
  });

  // ============================================================
  // Calendar & Inbox
  // ============================================================
  handle('calendar:getEvents', async (_, careerId: string, month?: string) => {
    try {
      const career = requireCareer(careerId);
      const region = db.prepare('SELECT region FROM teams WHERE id = ?').get(career.teamId)?.region;
      return db.prepare(`SELECT ev.* FROM calendar_events ev LEFT JOIN competitions c ON c.id = ev.relatedId WHERE ev.careerId = ? AND ev.date LIKE ? AND (c.id IS NULL OR c.region IN (?, 'GLOBAL')) ORDER BY ev.date`).all(careerId, month ? month + '%' : '%', region);
    } catch (err: any) {
      console.error('[IPC] calendar:getEvents error:', err.message);
      return [];
    }
  });

  const finishAdvance=(result:any)=>{
    if(result.careerEnded){chirp.close();activeCareerId=null;clearActiveCareerWorld();}
    return result;
  };
  handle('calendar:advanceDay', async (_, id: string) => {
    try { if (matchHandoff.busy) throw new Error('Wait until the live game and commentary finish before advancing the calendar.'); const career = requireCareer(id); return finishAdvance(management.advance(id, addDays(career.currentDate, 1))); }
    catch (err: any) { return { success: false, error: err.message }; }
  });
  handle('calendar:advanceToEvent', async (_, id: string) => {
    try {
      if (matchHandoff.busy) throw new Error('Wait until the live game and commentary finish before advancing the calendar.');
      const career = requireCareer(id);
      const fixture = db.prepare("SELECT MIN(f.scheduledDate) AS date FROM fixtures f JOIN career_competitions cc ON cc.competitionId = f.competitionId WHERE cc.careerId = ? AND cc.stage <> 'ARCHIVED' AND (f.homeTeamId = ? OR f.awayTeamId = ?) AND f.status IN ('scheduled', 'in_progress')").get(id, career.teamId, career.teamId) as any;
        const region = db.prepare('SELECT region FROM teams WHERE id = ?').get(career.teamId)?.region;
        const event = db.prepare("SELECT MIN(ev.date) AS date FROM calendar_events ev LEFT JOIN competitions c ON c.id = ev.relatedId WHERE ev.careerId = ? AND ev.date > ? AND (c.id IS NULL OR c.region IN (?, 'GLOBAL'))").get(id, career.currentDate, region) as any;
      const scout = db.prepare("SELECT MIN(dueDate) AS date FROM scout_assignments WHERE careerId = ? AND status = 'pending'").get(id) as any;
      const regionReport=db.prepare("SELECT MIN(nextReport) date FROM scouting_regions WHERE careerId=? AND status='active'").get(id);
      const targets = [fixture?.date, event?.date, scout?.date,regionReport?.date].filter(Boolean).sort();
      return finishAdvance(management.advance(id, targets[0] || addDays(career.currentDate, 7)));
    } catch (err: any) { return { success: false, error: err.message }; }
  });

  handle('inbox:getAll', async (_, careerId: string) => {
    try {
      return db.prepare('SELECT * FROM inbox_items WHERE careerId = ? ORDER BY date DESC, rowid DESC').all(careerId).map((m: any) => ({ ...m, isRead: !!m.isRead, actions: m.actions ? JSON.parse(m.actions) : [] }));
    } catch (err: any) {
      console.error('[IPC] inbox:getAll error:', err.message);
      return [];
    }
  });

  handle('inbox:markRead', async (_, id: string) => {
    try {
      db.prepare('UPDATE inbox_items SET isRead = 1 WHERE id = ?').run(id);
      return { success: true };
    } catch (err: any) {
      return { success: false };
    }
  });

  handle('inbox:markAllRead',async(_,careerId:string)=>{
    try{requireCareer(careerId);return markAllInboxRead(db,careerId);}
    catch(err:any){return {success:false,error:err.message};}
  });

  handle('inbox:getUnreadCount', async (_, careerId: string) => {
    try {
      const result = db.prepare('SELECT COUNT(*) as count FROM inbox_items WHERE careerId = ? AND isRead = 0').get(careerId) as any;
      return result?.count || 0;
    } catch (err: any) {
      return 0;
    }
  });

  // ============================================================
  // Settings
  // ============================================================
  handle('settings:get', async (_, key: string) => {
    try {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
      return row ? JSON.parse(row.value) : null;
    } catch (err: any) {
      return null;
    }
  });

  handle('settings:set', async (_, key: string, value: any) => {
    try {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
      return true;
    } catch (err: any) {
      return false;
    }
  });

  // ============================================================
  // RLBot Integration
  // ============================================================
  const rlbotDetector = new RLBotDetector(installedAiRuntime);
  let activeMatchStatus: any = { state: 'idle', message: 'Ready' };
  const injectorConfirmation=new InjectorConfirmation();
  const matchHandoff = new MatchHandoff();
  let recoverActiveMatch = () => {};

  function getLauncherScriptPath(): string {
    if(app.isPackaged)return playerBridge();
    const candidates = [
      path.join(process.cwd(), 'rl_bridge', 'launcher.py'),
      path.join(app.getAppPath(), 'rl_bridge', 'launcher.py'),
      path.join(__dirname, '..', '..', 'rl_bridge', 'launcher.py'),
      path.join(__dirname, '..', 'rl_bridge', 'launcher.py'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return candidates[0];
  }

  function botPlayerDetails(p: any,fixtureId?:string) {
    const career=activeCareer(),team=db.prepare('SELECT teamChemistry FROM teams WHERE id=?').get(p.teamId);
    const trust=p.teamId===career.teamId?db.prepare('SELECT trust FROM manager_relationships WHERE careerId=? AND playerId=?').get(career.id,p.id)?.trust:50;
    const roles=p.teamId===career.teamId?management.tactics(career.id).rolesByPlayer:{};
    return {
      playerId: p.id, gamertag: p.gamertag, rating: p.overall, age:p.age, introductionDate:career.currentDate,
      generatedPlayer:!!db.prepare('SELECT id FROM generated_entities WHERE id=? AND kind=?').get(p.id,'player'),
      ...(isPath(career)&&p.teamId===career.teamId?{pathTierCap:db.prepare('SELECT unlockedCutoff FROM path_campaigns WHERE careerId=?').get(career.id)?.unlockedCutoff||0}:{}),
      careerTitle:new CareerHonours(db).equipped(career.id,p.id),
      careerHistory:new CareerHonours(db).introductionHistory(career.id,p.id,career.currentDate),
      tendency: p.preferredTendency || 'Balanced / Flex', consistency: p.consistency,
      attributes: db.prepare('SELECT * FROM player_attributes WHERE playerId = ?').get(p.id) || {},
      traits: db.prepare('SELECT * FROM player_traits WHERE playerId = ?').get(p.id) || {},
      matchRole:roles[p.id]||p.preferredTendency,
      matchTactics:p.teamId===career.teamId?management.tactics(career.id):fixtureId?new SeriesTimeouts(db).opponentPlan(career.id,fixtureId):{},
      ...(fixtureId&&isPath(career)?{pathForm:new PathToGlory(db).formFor(career.id,p.id,fixtureId)}:{}),
      condition:{form:p.form??50,morale:p.morale??50,fatigue:p.fatigue??0,chemistry:p.chemistry??50,teamChemistry:team?.teamChemistry??50,trust:trust??50},
    };
  }

  handle('rlbot:botPlan', async (_, config: any) => {
    try {
      const career = activeCareer();
      const national=config.nationalMatchId?new NationalManagement(db).context(career.id,config.nationalMatchId,config.gameNumber):null;
      if(national&&config.fixtureId!==national.match.id)throw Error('National match identifiers do not match.');
      const fixture = national?.match||management.assertFixture(career.id, config.fixtureId);
      if (!fixture) throw new Error('Match fixture not found');
      const blue = national?.bluePlayers||management.roster(career.id, career.teamId).slice(0, 3);
      const orangeId=fixture.homeTeamId === career.teamId ? fixture.awayTeamId : fixture.homeTeamId;
      const clubFixture=!national&&db.prepare('SELECT type FROM competitions WHERE id=?').get(fixture.competitionId)?.type?.startsWith('CLUB_');
      const orange = national?.orangePlayers||(clubFixture?new ClubChampionship(db).registeredPlayers(fixture.competitionId,orangeId).slice(0,3):db.prepare('SELECT * FROM players WHERE teamId = ? ORDER BY overall DESC LIMIT 3').all(orangeId) as any[]);
      if (blue.length !== 3 || orange.length !== 3) throw new Error('Both teams need three starters');
      const humanId = config.humanPlayerId || blue[0].id;
      if (!blue.some(p => p.id === humanId)) throw new Error('Choose a starting player on blue');
      const payload = { careerId: career.id, fixtureId: config.fixtureId, gameNumber: config.gameNumber || 1,
        gameMode:career.mode,pathHostedUnlocked:isPath(career)&&((db.prepare('SELECT unlockedCutoff FROM path_campaigns WHERE careerId=?').get(career.id)?.unlockedCutoff||0)>=84),
        difficulty:botDifficulty(career.difficulty),
        botSelectionRevision: Number.isSafeInteger(config.botSelectionRevision) && config.botSelectionRevision >= 0 ? config.botSelectionRevision : 0,
        blueTeam: { players: blue.map((p,i) => ({ ...botPlayerDetails(p,national?undefined:config.fixtureId), ...(national?{matchRole:playerMatchRole(national.tactics,p.id,i),matchTactics:national.tactics}:{}),isHuman: p.id === humanId })) },
        orangeTeam: { players: orange.map((p,i) => ({ ...botPlayerDetails(p,national?undefined:config.fixtureId), ...(national?{matchRole:playerMatchRole(DEFAULT_TACTICS,p.id,i),matchTactics:DEFAULT_TACTICS}:{}),isHuman: false })) } };
      const rlbot = await rlbotDetector.detectRLBot();
      if (!rlbot.found || !rlbot.pythonPath) throw new Error('RLBot Python runtime is missing');
      const script = path.join(path.dirname(getLauncherScriptPath()), 'bot_plan.py');
      return await new Promise((resolve) => {
        const proc = child_process.execFile(rlbot.pythonPath!, [script],
          { windowsHide: true, timeout: 30000, maxBuffer: 256 * 1024 }, (error, stdout) => {
            try { resolve(JSON.parse(stdout)); }
            catch { resolve({ success: false, error: error?.message || 'Unable to read bot assignments' }); }
          });
        proc.stdin?.end(JSON.stringify(payload));
      });
    } catch (err: any) { return { success: false, error: err.message }; }
  });

  let audioTestRunning = false;
  handle('rlbot:testAudio', async () => {
    if(audioTestRunning)return {success:false,error:'An audio test is already running.'};
    if(!['idle','completed','error'].includes(activeMatchStatus.state))return {success:false,error:'Finish the active match before testing audio.'};
    audioTestRunning=true;
    try {
      const python=await rlbotDetector.detectRLBot();
      if(!python.found)return {success:false,error:'Install the complete RLM download to add its match audio runtime.'};
      const script=path.join(path.dirname(getLauncherScriptPath()),'commentary','audio_check.py');
      return await new Promise(resolve=>{
        child_process.execFile(python.pythonPath,[script,'--play'],{windowsHide:true,env:playerBridgeEnvironment(),timeout:90000,maxBuffer:256*1024},(error,stdout,stderr)=>{
          if(stderr)console.warn('[Match audio test]',stderr);
          try{const result=JSON.parse(stdout.trim().split(/\r?\n/).pop()||'');console.log('[Match audio test]',result);resolve(result);}
          catch{const detail=stderr.trim()||error?.message||'The match audio test did not respond.';console.error('[Match audio test]',detail);resolve({success:false,error:detail});}
        });
      });
    } finally {audioTestRunning=false;}
  });

  handle('rlbot:detect', async () => {
    try {
      const customRl = db.prepare(`SELECT value FROM settings WHERE key = 'rl_install_path'`).get() as any;
      const customBot = db.prepare(`SELECT value FROM settings WHERE key = 'rlbot_path'`).get() as any;
      const configured=integrationPaths();
      const status = await rlbotDetector.validatePrerequisites(configured.rocketLeague,configured.botPack);
      return status;
    } catch (err: any) {
      console.error('[IPC] rlbot:detect error:', err);
      return {
        rocketLeague: { found: false, path: '', platform: 'unknown' },
        rlbot: { found: false, path: '', pythonPath: '', version: '' },
        botPack: { found: false, path: '', botCount: 0, bots: [] },
        overall: false,
      };
    }
  });

  handle('rlbot:testMatch', async () => {
    try {
      if (matchHandoff.busy) throw new Error('Finish the current career match before starting a test exhibition.');
      const customRl = db.prepare(`SELECT value FROM settings WHERE key = 'rl_install_path'`).get() as any;
      const customBot = db.prepare(`SELECT value FROM settings WHERE key = 'rlbot_path'`).get() as any;
      const configured=integrationPaths();
      const prereqs = await rlbotDetector.validatePrerequisites(configured.rocketLeague,configured.botPack);

      if (!prereqs.rocketLeague.found) {
        return { success: false, error: 'Rocket League executable was not found. Please verify Rocket League installation.' };
      }
      if (!prereqs.rlbot.found) {
        return { success: false, error: 'RLBot / Python environment was not found.' };
      }

      const pyExe = prereqs.rlbot.pythonPath || 'python';
      const launcherScript = getLauncherScriptPath();
      const rlExe = prereqs.rocketLeague.path;
      const botpackPath = prereqs.botPack.path || '';

      console.log(`[RLBot] Spawning test exhibition: py="${pyExe}", script="${launcherScript}", rl="${rlExe}", botpack="${botpackPath}"`);

      const proc = child_process.spawn(pyExe, [
        launcherScript,
        '--mode', 'test',
        '--rl-path', rlExe,
        '--botpack-path', botpackPath,
      ], {
        detached: false,windowsHide:true,
        env:playerBridgeEnvironment(),
      });

      proc.stdout?.on('data', (d) => console.log(`[RLBot] ${d.toString().trim()}`));
      proc.stderr?.on('data', (d) => console.error(`[RLBot-Err] ${d.toString().trim()}`));

      activeMatchStatus = { state: 'running', message: 'Test exhibition match started in Rocket League' };
      return { success: true, message: 'Rocket League 3v3 test exhibition launched with 1 Human + 5 Bots!' };
    } catch (err: any) {
      console.error('[RLBot] testMatch error:', err);
      return { success: false, error: err.message || String(err) };
    }
  });

  const launchMatch = async (event: any, config: any): Promise<any> => {
    let launchToken: number | undefined;
    let spawned = false;
    try {
      recoverActiveMatch();
      if (activeMatchStatus.fixtureId === config?.fixtureId && activeMatchStatus.result && !activeMatchStatus.resultSaved)
        throw new Error('Recover the previous played result before starting another game.');
      launchToken = matchHandoff.start();
      chirp.setGameplayActive(true);
      const career = activeCareer();
      const national=config?.nationalMatchId?new NationalManagement(db).context(career.id,config.nationalMatchId,config.gameNumber):null;
      if(national&&config.fixtureId!==national.match.id)throw Error('National match identifiers do not match.');
      if(!national){management.assertFixture(career.id, config?.fixtureId);new SeriesTimeouts(db).assertCanLaunch(career.id,config?.fixtureId);}
      const customRl = db.prepare(`SELECT value FROM settings WHERE key = 'rl_install_path'`).get() as any;
      const customBot = db.prepare(`SELECT value FROM settings WHERE key = 'rlbot_path'`).get() as any;
      const configured=integrationPaths();
      const prereqs = await rlbotDetector.validatePrerequisites(configured.rocketLeague,configured.botPack);

      if (!prereqs.rocketLeague.found || !prereqs.rlbot.found) {
        return { success: false, error: 'Prerequisites not met. Rocket League or RLBot missing.' };
      }

      const pyExe = prereqs.rlbot.pythonPath || 'python';
      const launcherScript = getLauncherScriptPath();
      const rlExe = prereqs.rocketLeague.path;
      const botpackPath = prereqs.botPack.path || '';

      let matchPayload: any = {
        careerId: career.id,
        gameMode:career.mode,pathHostedUnlocked:isPath(career)&&((db.prepare('SELECT unlockedCutoff FROM path_campaigns WHERE careerId=?').get(career.id)?.unlockedCutoff||0)>=84),
        difficulty:botDifficulty(career.difficulty),
        fixtureId: config?.fixtureId,
        gameNumber: config?.gameNumber || 1,
        botRouting: 'ratings-v2',
        bakkesmodConfirmation: true,
        botSelectionRevision: Number.isSafeInteger(config?.botSelectionRevision) && config.botSelectionRevision >= 0 ? config.botSelectionRevision : 0,
        rocketHostRegion: config?.rocketHostRegion === 'EU-HEL' ? 'EU-HEL' : 'US-CENTRAL',
      };

      if(national){
        const human=config.humanPlayerId||national.bluePlayers[0].id;
        if(!national.bluePlayers.some(p=>p.id===human))throw Error('Choose a called-up player from your country to control.');
        matchPayload.series=national.series;
        const arena=seriesMap(matchPayload.gameNumber,matchPayload.series.bestOf);
        Object.assign(matchPayload,{arena:arena.code,arenaUpk:arena.upk,arenaName:arena.name,nationalMatchId:national.match.id});
        const bluePlayers=national.bluePlayers.map((p,i)=>({...botPlayerDetails(p),matchRole:playerMatchRole(national.tactics,p.id,i),matchTactics:national.tactics,garageLoadout:studio.loadout(career.id,p,0),isHuman:p.id===human}));
        const orangePlayers=national.orangePlayers.map((p,i)=>({...botPlayerDetails(p),matchRole:playerMatchRole(DEFAULT_TACTICS,p.id,i),matchTactics:DEFAULT_TACTICS,isHuman:false}));
        const blueTeam={id:national.blue.id,name:national.blue.name,shortName:national.blue.code},orangeTeam={id:national.orange.id,name:national.orange.name,shortName:national.orange.code};
        matchPayload.blueTeam={...blueTeam,players:bluePlayers};matchPayload.orangeTeam={...orangeTeam,players:orangePlayers};
        matchPayload.broadcast=broadcastMatch({blueTeam,orangeTeam,bluePlayers,orangePlayers,competition:national.competition,round:national.match.stage,series:matchPayload.series,arena:arena.name});
        try{matchPayload.broadcast=fullscreenBroadcast(matchPayload.broadcast);}catch(error){console.warn('[Broadcast] National display preparation failed:',error);}
        matchPayload.commentaryContext={teams:[blueTeam,orangeTeam].map(n=>({team:n.name,recentSeries:national.state.matches.filter(m=>m.status==='completed'&&[m.homeTeamId,m.awayTeamId].includes(n.id)).slice(-5).map(m=>{const a=m.homeTeamId===n.id?m.homeScore!:m.awayScore!,b=m.homeTeamId===n.id?m.awayScore!:m.homeScore!;return {result:a>b?'win':a<b?'loss':'draw'};})}))};
      } else if (config?.fixtureId) {
        const fixture = db.prepare(`SELECT * FROM fixtures WHERE id = ?`).get(config.fixtureId) as any;
        if (fixture) {
          const blueId = career.teamId;
          const orangeId = fixture.homeTeamId === blueId ? fixture.awayTeamId : fixture.homeTeamId;
          const homeTeam = studio.decorate(db.prepare(`SELECT * FROM teams WHERE id = ?`).get(blueId),career.id) as any;
          const awayTeam = studio.decorate(db.prepare(`SELECT * FROM teams WHERE id = ?`).get(orangeId),career.id) as any;

          const homePlayers = management.roster(career.id, blueId).slice(0, 3);
          const clubFixture=db.prepare('SELECT type FROM competitions WHERE id=?').get(fixture.competitionId)?.type?.startsWith('CLUB_');
          const awayPlayers = clubFixture?new ClubChampionship(db).registeredPlayers(fixture.competitionId,orangeId).slice(0,3):db.prepare(`SELECT * FROM players WHERE teamId = ? ORDER BY overall DESC LIMIT 3`).all(orangeId) as any[];
          if (homePlayers.length !== 3 || awayPlayers.length !== 3) throw new Error('Both teams need three starting players.');
          if (config.humanPlayerId && !homePlayers.some(p => p.id === config.humanPlayerId)) throw new Error('You must control a starter on your own team.');

          matchPayload.series = buildSeriesContext(fixture.seriesFormat,
            db.prepare('SELECT gameNumber, blueScore, orangeScore FROM game_results WHERE fixtureId = ? ORDER BY gameNumber')
              .all(fixture.id) as any[], matchPayload.gameNumber);
          const arena = seriesMap(matchPayload.gameNumber,matchPayload.series.bestOf);
          matchPayload.arena=arena.code;
          matchPayload.arenaUpk=arena.upk;
          matchPayload.arenaName=arena.name;
          const playerDetails = (p:any)=>botPlayerDetails(p,config.fixtureId);

          const bluePlayers = homePlayers.map((p) => ({
            ...playerDetails(p),
            garageLoadout:studio.loadout(career.id,p,0),
            isHuman: config.humanPlayerId ? p.id === config.humanPlayerId : p.id === homePlayers[0]?.id,
          }));

          const orangePlayers = awayPlayers.map((p) => ({
            ...playerDetails(p),
            isHuman: false,
          }));

          matchPayload.blueTeam = { id: blueId, name: homeTeam?.name || 'Home', players: bluePlayers };
          matchPayload.orangeTeam = { id: orangeId, name: awayTeam?.name || 'Away', players: orangePlayers };
          matchPayload.broadcast=broadcastMatch({blueTeam:homeTeam,orangeTeam:awayTeam,bluePlayers,orangePlayers,
            competition:db.prepare('SELECT id,name FROM competitions WHERE id=?').get(fixture.competitionId),
            round:fixture.round,series:matchPayload.series,arena:arena.name});
          try {matchPayload.broadcast=fullscreenBroadcast(matchPayload.broadcast);}
          catch(error){console.warn('[Broadcast] Fullscreen display preparation failed:',error);}
          // Commentary stories use this saved career's completed results.
          const recentForm = (teamId: string, teamName: string) => {
            const recent = db.prepare(`
              SELECT homeTeamId, homeScore, awayScore FROM fixtures
              WHERE (homeTeamId = ? OR awayTeamId = ?) AND status = 'completed'
                AND id != ? AND scheduledDate <= ?
                AND homeScore IS NOT NULL AND awayScore IS NOT NULL
              ORDER BY scheduledDate DESC, id DESC LIMIT 5
            `).all(teamId, teamId, fixture.id, fixture.scheduledDate) as any[];
            return { team: teamName, recentSeries: recent.map((f) => {
              const ours = f.homeTeamId === teamId ? f.homeScore : f.awayScore;
              const theirs = f.homeTeamId === teamId ? f.awayScore : f.homeScore;
              return { result: ours > theirs ? 'win' : ours < theirs ? 'loss' : 'draw' };
            }) };
          };
          matchPayload.commentaryContext = { teams: [
            recentForm(blueId, homeTeam?.name || 'Home'),
            recentForm(orangeId, awayTeam?.name || 'Away'),
          ] };
        }
      }

      const tmpConfigPath = path.join(app.getPath('temp'), `rl_match_${Date.now()}.json`);
      fs.writeFileSync(tmpConfigPath, JSON.stringify(matchPayload, null, 2), 'utf-8');

      const tmpResultPath = path.join(app.getPath('temp'), `rl_result_${Date.now()}.json`);

      console.log(`[RLBot] Launching official match with config at ${tmpConfigPath}, result path: ${tmpResultPath}`);

      const proc = child_process.spawn(pyExe, [
        launcherScript,
        '--mode', 'match',
        '--config', tmpConfigPath,
        '--rl-path', rlExe,
        '--botpack-path', botpackPath,
        '--result-file', tmpResultPath,
      ], {
        detached: false,windowsHide:true,
        env:playerBridgeEnvironment(),
      });
      spawned = true;
      const token = launchToken;
      const managerWindow = BrowserWindow.fromWebContents(event.sender);
      let returnedToManager = false, commentaryCompleted = false;
      let bridgeError: string | undefined;
      const returnToManager = () => {
        if(returnedToManager || !managerWindow || managerWindow.isDestroyed())return;
        returnedToManager=true;
        if(managerWindow.isMinimized())managerWindow.restore();
        managerWindow.show();
        managerWindow.focus();
      };
      // Fullscreen HUD is drawn by BakkesMod. Do not create another GPU renderer.
      broadcast.close();matchLoading.close();
      const publishResult = (result: any) => {
        if (activeMatchStatus.matchToken !== token) return;
        matchHandoff.stage(token, result);
        returnToManager();
        if (activeMatchStatus.resultSaved) return;
        try {
          const played=playedMatchResult(matchPayload,result);
          const saved = national?new NationalManagement(db).recordPlayedGame(career.id,played):management.recordPlayedGame(career.id,played);
          activeMatchStatus = { ...activeMatchStatus, state: 'completed', phase: 'postgame',
            message: 'Game finished. Please wait for the postgame commentary and next game preparation.',
            result, resultSaved: true, savedGameId: saved.id, saveError: undefined,
            cleanupPending: matchHandoff.busy };
        } catch (err: any) {
          activeMatchStatus = { ...activeMatchStatus, result, phase: 'result_pending',
            message: `Played score received, but saving failed: ${err.message}. Use Recover played result to retry.`, saveError: err.message };
        }
      };
      recoverActiveMatch = () => {
        if (activeMatchStatus.matchToken !== token) return;
        if (activeMatchStatus.result && !activeMatchStatus.resultSaved) publishResult(activeMatchStatus.result);
        if (!activeMatchStatus.resultSaved && fs.existsSync(tmpResultPath)) {
          try { publishResult(JSON.parse(fs.readFileSync(tmpResultPath, 'utf-8'))); }
          catch { /* A write may still be completing; the next poll retries. */ }
        }
      };
      const filePoll = setInterval(recoverActiveMatch, 2000);
      let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
      const finishProcess = (code: number | null) => {
        if (!matchHandoff.owns(token)) return;
        injectorConfirmation.clear(token);
        activeMatchStatus.injectorRequestId=undefined;
        broadcast.close();matchLoading.close();
        clearInterval(filePoll);
        if (cleanupTimer) clearTimeout(cleanupTimer);
        recoverActiveMatch();
        const staged = matchHandoff.close(token);
        // stdout is a valid fallback even when the file is missing or unreadable.
        if (staged && !activeMatchStatus.resultSaved) publishResult(staged);
        if (activeMatchStatus.resultSaved) {
          activeMatchStatus = { ...activeMatchStatus, cleanupPending: false, message: 'Played result saved. Ready for the next game.' };
          const next = matchPayload.series && nextSeriesGame(matchPayload.series,activeMatchStatus.result);
          chirp.setGameplayActive(false);
          if(next&&national){activeMatchStatus={...activeMatchStatus,phase:'between_games',message:`National game saved. Continue to game ${next}.`};}
          else if(next){
            const timeout=new SeriesTimeouts(db).considerOpponent(career.id,config.fixtureId);
            activeMatchStatus={...activeMatchStatus,phase:'between_games',message:timeout.active?.side==='opponent'?`${timeout.opponentName} have called a 60-second tactical timeout.`:`Game saved. Continue to game ${next}, or use your one series timeout.`};
          }
        } else {
          chirp.setGameplayActive(false);
          activeMatchStatus = { ...activeMatchStatus, state: 'failed', cleanupPending: false,
            message: activeMatchStatus.saveError
              ? `Played result could not be saved: ${activeMatchStatus.saveError}. Recover the result to retry; do not simulate this game.`
              : bridgeError || `The match bridge stopped (code ${code}) without a completed result.` };
          returnToManager();
        }
      };

      let matchLogBuffer = '';
      proc.stdout?.on('data', (d) => {
        if (!matchHandoff.owns(token)) return;
        const text = d.toString().trim();
        // HUD packets arrive ten times per second; keep them out of persistent logs.
        if(!text.includes('"event": "BROADCAST"')) console.log(`[RLBot-Match] ${text}`);
        matchLogBuffer += d.toString();
        const lines = matchLogBuffer.split(/\r?\n/);
        matchLogBuffer = lines.pop() || '';
        if (matchLogBuffer.length > 65536) matchLogBuffer = '';
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.event === 'BROADCAST') broadcast.update(parsed);
            if(parsed.event==='PLAYER_INTRO_START')matchLoading.prepare();
            if(parsed.event==='PLAYER_INTRO_TRANSITION')matchLoading.show(parsed.bounds);
            if (parsed.event === 'CONFIG_PLAYER') {
              const assignments = activeMatchStatus.assignments || [];
              activeMatchStatus.assignments = [...assignments.filter((p: any) => p.slot !== parsed.slot), parsed];
            }
            if(parsed.event==='BAKKESMOD_CONFIRM_REQUIRED'&&injectorConfirmation.request(token,matchPayload.fixtureId,parsed.requestId,text=>new Promise<void>((resolve,reject)=>{
              if(!proc.stdin?.writable){reject(Error('The match launcher closed. Retry the match.'));return;}
              proc.stdin.write(text,error=>error?reject(error):resolve());
            }))){
              activeMatchStatus={...activeMatchStatus,phase:'awaiting_injector_confirmation',injectorRequestId:parsed.requestId,message:parsed.message};
              returnedToManager=false;returnToManager();
            }
            if (parsed.event === 'MATCH_STARTED') {
              matchLoading.close();
              returnedToManager = false;
              activeMatchStatus.phase = 'playing';
              activeMatchStatus.message = parsed.message || 'All players ready; match started';
              // Release manager focus so the restored fullscreen game can take
              // input. The bridge restores Rocket League at this same boundary.
              if(config.autoContinueSeries && managerWindow && !managerWindow.isDestroyed())managerWindow.minimize();
            }
            if (parsed.event === 'BOT_RECOVERY' && typeof parsed.message === 'string') {
              activeMatchStatus = { ...activeMatchStatus, state: 'running', phase: 'preparing',
                message: parsed.message };
              returnToManager();
            }
            if (parsed.event === 'STATUS' && typeof parsed.message === 'string') {
              if (parsed.message.startsWith('Postgame desk:')) activeMatchStatus.phase = 'postgame';
              if (activeMatchStatus.state === 'running') activeMatchStatus.message = parsed.message;
              if (parsed.message.startsWith('Clip commentary unavailable:') ||
                  parsed.message.startsWith('Hybrid commentary warning:')) {
                activeMatchStatus.commentaryWarning = parsed.message;
              } else if (parsed.message.startsWith('Clip commentary ACTIVE:') ||
                         parsed.message.startsWith('Hybrid commentary speech ready:')) {
                activeMatchStatus.commentaryWarning = '';
              }
            }
            if (parsed.event === 'ERROR' && typeof parsed.message === 'string') {
              matchLoading.close();
              bridgeError = parsed.message;
              activeMatchStatus = { ...activeMatchStatus,
                state: activeMatchStatus.resultSaved ? 'completed' : 'failed', message: parsed.message };
            }
            if (parsed.event === 'MATCH_COMPLETED' && parsed.result) {
              publishResult(parsed.result);
              broadcast.close();chirp.queueUpdates(career.id);
            }
            if (parsed.event === 'COMMENTARY_COMPLETED' && !cleanupTimer) {
              commentaryCompleted=true;
              // Speech has finished: a stuck bot shutdown must not lock the next game.
              cleanupTimer = setTimeout(() => {
                if (!matchHandoff.owns(token)) return;
                proc.kill();
                finishProcess(null);
              }, 30000);
            }
          } catch { /* RLBot also writes plain-text output. */ }
        }
      });

      proc.stderr?.on('data', (d) => console.error(`[RLBot-Match-Err] ${d.toString().trim()}`));

      proc.on('error', (err) => {
        if (!matchHandoff.owns(token)) return;
        bridgeError = err.message;
        activeMatchStatus = { ...activeMatchStatus, state: activeMatchStatus.resultSaved ? 'completed' : 'failed', message: err.message };
        finishProcess(null);
      });

      proc.on('exit', finishProcess);
      proc.on('close', finishProcess);

      const launchMessage = 'Preparing local Rocket League match';
      activeMatchStatus = { state: 'running', phase: 'preparing', message: launchMessage,
        fixtureId: matchPayload.fixtureId, gameNumber: matchPayload.gameNumber, matchToken: token };
      return { success: true, message: launchMessage };
    } catch (err: any) {
      console.error('[RLBot] launch error:', err);
      return { success: false, error: err.message || String(err) };
    } finally {
      if (!spawned && launchToken !== undefined) {matchHandoff.close(launchToken);chirp.setGameplayActive(false);}
    }
  };
  handle('rlbot:launch', launchMatch);

  handle('rlbot:confirmBakkesmod',async(_,fixtureId:string,requestId:string)=>{
    try{
      if(activeMatchStatus.state!=='running'||activeMatchStatus.phase!=='awaiting_injector_confirmation')throw Error('There is no BakkesMod startup awaiting confirmation.');
      await injectorConfirmation.confirm(activeMatchStatus.matchToken,fixtureId,requestId);
      activeMatchStatus={...activeMatchStatus,phase:'injecting',injectorRequestId:undefined,message:'Starting / restarting BakkesMod. Waiting for verified injection and the career HUD...'};
      return {success:true};
    }catch(error:any){return {success:false,error:error.message};}
  });

  handle('rlbot:status', async () => {
    recoverActiveMatch();
    return { ...activeMatchStatus, cleanupPending: !!activeMatchStatus.cleanupPending || (matchHandoff.busy && activeMatchStatus.resultSaved) };
  });

  // ============================================================
  // System Dialogs
  // ============================================================
  handle('dialog:openFile', async (_, options: any) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(options || {});
    if (canceled || filePaths.length === 0) return null;
    return filePaths[0];
  });

  handle('dialog:openDirectory', async (_, options: any) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      ...(options || {}),
      properties: ['openDirectory']
    });
    if (canceled || filePaths.length === 0) return null;
    return filePaths[0];
  });

  // App
  handle('app:getPath', async (_, name: any) => {
    return app.getPath(name);
  });

  // ============================================================
  // Statistics
  // ============================================================
  handle('stats:getPlayerLeaderboard', async (_, stat: string, limit: number = 20) => {
    try {
      const validStats = ['goals', 'assists', 'saves', 'shots', 'demos', 'mvps', 'wins', 'games'];
      if (!validStats.includes(stat)) return [];
      const career=activeCareer();
      const sort=stat==='games'?'games':stat==='mvps'?'mvps':stat==='wins'?'wins':stat;
      return db.prepare(`SELECT p.id,p.gamertag,p.teamId,p.overall,t.name AS teamName,COUNT(DISTINCT g.id) games,SUM(s.goals) goals,SUM(s.assists) assists,SUM(s.saves) saves,SUM(s.shots) shots,SUM(s.demos) demos,0 mvps,0 wins FROM game_player_stats s JOIN game_results g ON g.id=s.gameResultId JOIN fixtures f ON f.id=g.fixtureId JOIN career_competitions cc ON cc.competitionId=f.competitionId JOIN players p ON p.id=s.playerId LEFT JOIN teams t ON t.id=p.teamId WHERE cc.careerId=? GROUP BY p.id ORDER BY ${sort} DESC,p.gamertag LIMIT ?`).all(career.id,Math.max(1,Math.min(1000,limit))).map((p:any)=>({...p,overall:new RecruitmentNetwork(db).visible(career,p).overall}));
    } catch (err: any) {
      return [];
    }
  });

  handle('stats:getTeamStandings', async (_, competitionId: string) => {
    try { return management.ranking(competitionId); } catch { return []; }
  });
}

// ============================================================
// Helper Functions
// ============================================================
function mapPlayerRow(row: any) {
  return {
    id: row.id,
    gamertag: row.gamertag,
    realName: row.realName?.endsWith(' Name') ? '' : row.realName,
    nationality: row.nationality,
    region: row.region,
    age: row.age,
    teamId: row.teamId,
    teamName: row.teamName || null,
    affiliationStatus: row.affiliationStatus || null,
    affiliationNote: row.affiliationNote || null,
    ratingConfidence: row.ratingConfidence || null,
    ratingMethod: row.ratingMethod || null,
    ratingSources: row.ratingSources || null,
    ratingReviewedAt: row.ratingReviewedAt || null,
    preferredTendency: row.preferredTendency,
    overall: row.overall,
    potential: row.potential,
    form: row.form,
    morale: row.morale,
    fatigue: row.fatigue,
    consistency: row.consistency,
    chemistry: row.chemistry,
    reputation: row.reputation,
    careerEarnings: row.careerEarnings,
    marketValue: row.marketValue,
    salary: row.salary || 0,
    buyout: row.contractBuyout || 0,
    scoutKnowledge: row.scoutKnowledge || 'Unknown',
    contractEnd: row.contractEnd || null,
    attributes: {
      mechanics: row.mechanical || 50,
      aerial: row.aerial || 50,
      groundControl: row.groundControl || 50,
      shooting: row.shooting || 50,
      shotPower: row.shotPower || 50,
      shotAccuracy: row.shotAccuracy || 50,
      passing: row.passing || 50,
      defense: row.defense || 50,
      goalkeeping: row.goalkeeping || 50,
      positioning: row.positioning || 50,
      rotations: row.rotations || 50,
      boostManagement: row.boostManagement || 50,
      speed: row.speed || 50,
      recovery: row.recovery || 50,
      fiftyFifty: row.fiftyFifty || 50,
      demolitions: row.demolitions || 50,
      gameSense: row.gameSense || 50,
      consistency: row.attrConsistency || 50,
      clutch: row.clutch || 50,
    },
    traits: {
      aggression: row.aggression || 50,
      riskTolerance: row.riskTolerance || 50,
      teamOrientation: row.teamOrientation || 50,
      adaptability: row.adaptability || 50,
      pressureResistance: row.pressureResistance || 50,
      developmentRate: row.developmentRate || 50,
      professionalism: row.professionalism || 50,
      confidence: row.confidence || 50,
      tiltTendency: row.tiltTendency || 50,
    }
  };
}

const REGION_CODE_MAP: Record<string, string> = {
  EU: 'Europe',
  NA: 'North America',
  MENA: 'MENA',
  OCE: 'Oceania',
  SAM: 'South America',
  APAC: 'Asia-Pacific',
  SSA: 'Sub-Saharan Africa',
  Europe: 'Europe',
  'North America': 'North America',
  Oceania: 'Oceania',
  'South America': 'South America',
  'Asia-Pacific': 'Asia-Pacific',
  'Sub-Saharan Africa': 'Sub-Saharan Africa',
  GLOBAL: 'GLOBAL',
};

function findDataDir(): string {
  const candidates = [
    path.join(__dirname, '../data'),
    path.join(__dirname, '../../data'),
    path.join(process.cwd(), 'data'),
    path.join(app ? app.getAppPath() : process.cwd(), 'data'),
    path.join(process.resourcesPath || '', 'data'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.existsSync(path.join(dir, 'teams.json'))) {
      return dir;
    }
  }
  return path.join(process.cwd(), 'data');
}

export function ensureDatabaseSeeded(careerId?: string, seasonId?: string) {
  try {
    const teamCount = db.prepare('SELECT COUNT(*) as count FROM teams').get() as any;
    if (!teamCount || Number(teamCount.count) === 0) {
      console.log('[Seed] Database is empty, seeding base data...');
      db.transaction(() => seedDatabase(careerId, seasonId))();
    }
    const dataDir = findDataDir();
    const snapshotPath = path.join(dataDir, 'real-rosters.json');
    if (fs.existsSync(snapshotPath)) {
      const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
      applyRealRosterSnapshot(db, snapshot,
        JSON.parse(fs.readFileSync(path.join(dataDir, 'players.json'), 'utf-8')),
        JSON.parse(fs.readFileSync(path.join(dataDir, 'teams.json'), 'utf-8')), () => {
          const databasePath = getDbPath();
          const backupPath = `${databasePath}.before-rosters-${snapshot.version}.bak`;
          if (databasePath && !fs.existsSync(backupPath)) fs.writeFileSync(backupPath, Buffer.from(db.exportBinary()));
        });
    }
    applyTeamStatusAudit(db);
  } catch (err: any) {
    console.error('[Seed] ensureDatabaseSeeded error:', err.message);
  }
}

export function seedDatabase(careerId?: string, seasonId?: string) {
  try {
    const dataDir = findDataDir();
    console.log('[Seed] Using data directory:', dataDir);

    // Load and insert players
    const playersPath = path.join(dataDir, 'players.json');
    if (fs.existsSync(playersPath)) {
      const players = JSON.parse(fs.readFileSync(playersPath, 'utf-8'));
      const insertPlayer = db.prepare(`
        INSERT OR IGNORE INTO players (id, gamertag, realName, nationality, region, age, teamId, preferredTendency,
          overall, potential, form, morale, fatigue, consistency, chemistry, reputation, careerEarnings, marketValue, scoutKnowledge)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertAttrs = db.prepare(`
        INSERT OR IGNORE INTO player_attributes (playerId, mechanical, aerial, groundControl, shooting, shotPower,
          shotAccuracy, passing, defense, goalkeeping, positioning, rotations, boostManagement, speed, recovery,
          fiftyFifty, demolitions, gameSense, consistency, clutch)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertTraits = db.prepare(`
        INSERT OR IGNORE INTO player_traits (playerId, aggression, riskTolerance, teamOrientation, adaptability,
          pressureResistance, developmentRate, professionalism, confidence, tiltTendency)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertContract = db.prepare(`
        INSERT OR IGNORE INTO contracts (id, playerId, teamId, salary, duration, startDate, endDate, signingBonus, buyout, isActive)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);

      for (const p of players) {
        const region = REGION_CODE_MAP[p.region] || p.region;
        insertPlayer.run(
          p.id, p.gamertag, p.realName, p.nationality, region, p.age, p.teamId,
          p.preferredTendency, p.overall, p.potential, p.form, p.morale, p.fatigue,
          p.consistency, p.chemistry, p.reputation, p.careerEarnings, p.marketValue,
          p.scoutKnowledge || 'Unknown'
        );
        if (p.attributes) {
          const a = p.attributes;
          insertAttrs.run(
            p.id, a.mechanical, a.aerial, a.groundControl, a.shooting, a.shotPower,
            a.shotAccuracy, a.passing, a.defense, a.goalkeeping, a.positioning,
            a.rotations, a.boostManagement, a.speed, a.recovery, a.fiftyFifty,
            a.demolitions, a.gameSense, a.consistency, a.clutch
          );
        }
        if (p.traits) {
          const t = p.traits;
          insertTraits.run(
            p.id, t.aggression, t.riskTolerance, t.teamOrientation, t.adaptability,
            t.pressureResistance, t.developmentRate, t.professionalism, t.confidence, t.tiltTendency
          );
        }
        // Generate contract for players with teams
        if (p.teamId) {
          const salary = p.marketValue ? Math.floor(p.marketValue / 12) : 5000;
          insertContract.run(
            uuidv4(), p.id, p.teamId, salary, 24, '2026-10-11', '2028-10-11', 0, salary * 6
          );
        }
      }
      console.log(`[Seed] Inserted ${players.length} players`);
    }

    // Load and insert teams
    const teamsPath = path.join(dataDir, 'teams.json');
    if (fs.existsSync(teamsPath)) {
      const teams = JSON.parse(fs.readFileSync(teamsPath, 'utf-8'));
      const insertTeam = db.prepare(`
        INSERT OR IGNORE INTO teams (id, name, shortName, region, reputation, budget, cashBalance, coachRating,
          facilityLevel, fanbase, sponsorIncome, teamChemistry, teamForm)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const t of teams) {
        const region = REGION_CODE_MAP[t.region] || t.region;
        insertTeam.run(
          t.id, t.name, t.shortName, region, t.reputation, t.budget, t.cashBalance,
          t.coachRating, t.facilityLevel, t.fanbase, t.sponsorIncome, t.teamChemistry, t.teamForm
        );
      }
      console.log(`[Seed] Inserted ${teams.length} teams`);
    }

    // Competitions are created by the career qualification circuit.
    console.log('[Seed] Database seeded successfully');
  } catch (err) {
    console.error('[Seed] Error seeding database:', err);
  }
}


function createInitialCalendarEvents(careerId: string, startDate: string) {
  const insertEvent = db.prepare(`
    INSERT INTO calendar_events (id, careerId, date, type, title, description, isRead)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `);

  // Season start
  insertEvent.run(uuidv4(), careerId, startDate, 'other', 'Season Start', 'The new competitive season begins today!');

  // Transfer window opens
  insertEvent.run(uuidv4(), careerId, startDate, 'transfer_window', 'Transfer Window Open', 'The transfer window is now open. You can sign and release players.');

  // Transfer window closes (2 months later)
  const window = transferWindow(startDate);
  if (window.closes) insertEvent.run(uuidv4(), careerId, window.closes, 'transfer_window', 'Final Transfer Day', 'The transfer window closes at the end of today.');
}
