import {beforeAll,beforeEach,it,expect} from 'vitest';
import initSqlJs from 'sql.js';
import {sqlAdapter} from './sql-fixture';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {PathToGlory,pathPointCost} from '../src/main/path-to-glory';
import {CareerManagement} from '../src/main/career-management';
import {TransferMarket} from '../src/main/transfer-market';
import {OutgoingTransfers} from '../src/main/outgoing-transfers';
import {EarnedDevelopment} from '../src/main/earned-development';
import {officialRules} from '../src/game/official-competition-rules';
import {Tournament} from '../src/main/tournament';
import {CareerHonours} from '../src/main/career-honours';
import {PATH_RANKS} from '../src/game/path-start';
import {SeriesTimeouts,TIMEOUT_MS} from '../src/main/series-timeouts';
let SQL:any,db:any,path:PathToGlory,manager:CareerManagement;
beforeAll(async()=>{SQL=await initSqlJs();});
beforeEach(()=>{
  db=sqlAdapter(new SQL.Database());runMigration(db);path=new PathToGlory(db);manager=new CareerManagement(db);
  db.exec("INSERT INTO careers(id,managerName,teamId,currentDate,difficulty) VALUES('c','Coach','us','2026-10-01','Hard');INSERT INTO career_modes VALUES('c','Path To Glory');INSERT INTO seasons(id,careerId,number,startDate,endDate,isActive) VALUES('s','c',1,'2026-10-01','2027-09-30',1)");
  for(const [team,rating] of [['us',54],['rival',57],['other',61],['trial',64],['champ',85],['elite',96]] as const){
    db.prepare('INSERT INTO teams(id,name,region,teamChemistry,cashBalance,budget,sponsorIncome) VALUES(?,?,?,70,500000,500000,10000)').run(team,team,'Europe');
    for(let i=0;i<3;i++){
      const id=team+i;db.prepare('INSERT INTO players(id,gamertag,teamId,overall,potential,morale,fatigue,form,preferredTendency) VALUES(?,?,?,?,?,70,0,50,?)').run(id,id,team,rating,Math.max(80,rating),'BALANCED');
      db.prepare('INSERT INTO player_attributes(playerId,passing,groundControl,aerial,shooting,shotAccuracy,defense,goalkeeping) VALUES(?,?,?,?,?,?,?,?)').run(id,...Array(7).fill(rating));
      db.prepare('INSERT INTO player_traits(playerId,confidence) VALUES(?,60)').run(id);
      db.prepare("INSERT INTO contracts(id,playerId,teamId,salary,startDate,endDate,isActive) VALUES(?,?,?,10000,'2026-01-01','2026-10-02',1)").run(id,id,team);
    }
  }path.initialise('c');
});
function play(f:any,gameNumber:number,won=true){
  db.prepare("UPDATE careers SET currentDate=? WHERE id='c'").run(f.scheduledDate);
  return manager.recordPlayedGame('c',{fixtureId:f.id,gameNumber,blueTeamId:'us',orangeTeamId:f.homeTeamId==='us'?f.awayTeamId:f.homeTeamId,blueScore:won?4:1,orangeScore:won?1:4,wasPlayed:true,playedByHuman:true,
    playerStats:[0,1,2].map(i=>({playerId:'us'+i,isHuman:i===0,goals:1,assists:1,saves:1,shots:3,demos:0,score:400}))});
}
const next=()=>db.prepare("SELECT f.* FROM fixtures f JOIN path_series ps ON ps.fixtureId=f.id WHERE ps.careerId='c' AND f.status<>'completed' ORDER BY f.scheduledDate LIMIT 1").get();
it('starts with a real fixed trio, no financial balance and its own ladder',()=>{
  expect(path.roster('c')).toHaveLength(3);expect(path.roster('c').every(p=>p.overall===54&&p.potential===99)).toBe(true);
  expect(db.prepare("SELECT cashBalance FROM teams WHERE id='us'").get().cashBalance).toBe(0);
  expect(path.overview('c').tutorialStep).toBe(0);path.tutorial('c',4);expect(path.overview('c').tutorialStep).toBe(4);
  expect(db.prepare("SELECT stage FROM career_competitions WHERE careerId='c'").all().map((r:any)=>r.stage)).toEqual(['PATH']);
});
it('gives all three XP in human-played wins and losses, rewards streaks and rejects duplicate credit',()=>{
  const f=next(),saved=play(f,1);const first=path.overview('c');expect(first.players.every((p:any)=>p.totalXp>0)).toBe(true);expect(first.streak).toBe(1);
  manager.recordPlayedGame('c',{fixtureId:f.id,gameNumber:1,blueTeamId:'us',orangeTeamId:f.awayTeamId,blueScore:4,orangeScore:1,wasPlayed:true,playerStats:[]});
  expect(path.overview('c').players[0].totalXp).toBe(first.players[0].totalXp);
  play(f,2);expect(path.overview('c').streak).toBe(2);expect(path.overview('c').multiplier).toBeGreaterThan(first.multiplier);
  const old=path.overview('c').players[0].totalXp;play(next(),1,false);const lost=path.overview('c');expect(lost.streak).toBe(0);expect(lost.players[0].totalXp).toBeGreaterThan(old);
  expect(db.prepare('SELECT * FROM path_rewards WHERE gameResultId=?').all(saved.id)).toHaveLength(1);
});
it('awards clean sweeps once and keeps a recurring rival and a saved timeline',()=>{
  const f=next();play(f,1);play(f,2);const snapshot=path.overview('c');
  expect(snapshot.achievements.some((a:any)=>a.key==='first_sweep')).toBe(true);expect(snapshot.rival.wins).toBe(1);expect(snapshot.memories.some((m:any)=>m.kind==='series')).toBe(true);
  path.finishSeries('c',db.prepare('SELECT * FROM fixtures WHERE id=?').get(f.id));
  expect(path.overview('c').achievements.filter((a:any)=>a.key==='first_sweep')).toHaveLength(1);expect(path.overview('c').rival.wins).toBe(1);
});
it('requires all skills and a played trial victory before unlocking the next bot tier',()=>{
  db.exec("UPDATE players SET overall=59 WHERE teamId='us';UPDATE player_attributes SET passing=59,groundControl=59,aerial=59,shooting=59,shotAccuracy=59,defense=59,goalkeeping=59 WHERE playerId LIKE 'us%'");
  expect(path.readyForTrial('c')?.cutoff).toBe(59);expect(path.overview('c').unlockedCutoff).toBe(0);
  const f=next();play(f,1);play(f,2);const trial=next();expect(trial.seriesFormat).toBe('BO5');expect(db.prepare('SELECT trialCutoff FROM path_series WHERE fixtureId=?').get(trial.id).trialCutoff).toBe(59);
  play(trial,1,false);play(trial,2);play(trial,3);play(trial,4);expect(path.overview('c').unlockedCutoff).toBe(59);
  expect(path.overview('c').memories.some((m:any)=>m.kind==='promotion')).toBe(true);
});
it('keeps the world static: no transfers, expiry, Chirp or wage transactions when days advance',()=>{
  const f=next();play(f,1);play(f,2);const roster=db.prepare('SELECT id,teamId FROM players ORDER BY id').all(),cash=db.prepare('SELECT id,cashBalance FROM teams ORDER BY id').all();
  manager.advance('c','2026-11-02');new TransferMarket(db).tick('c');
  expect(db.prepare('SELECT id,teamId FROM players ORDER BY id').all()).toEqual(roster);expect(db.prepare('SELECT id,cashBalance FROM teams ORDER BY id').all()).toEqual(cash);
  for(const table of ['transfers','market_stories','chirp_posts','social_posts'])expect(db.prepare(`SELECT * FROM ${table}`).all()).toHaveLength(0);
  expect(()=>new OutgoingTransfers(db).list('c','us0',10000,true)).toThrow('unavailable');
  expect(()=>manager.recordGame('c',{fixtureId:next().id,blueTeamId:'us',orangeTeamId:next().awayTeamId,gameNumber:1,blueScore:4,orangeScore:1,wasPlayed:false})).toThrow('played games');
});
it('keeps a failed promotion locked and schedules another difficult trial',()=>{
  db.exec("UPDATE players SET overall=59 WHERE teamId='us';UPDATE player_attributes SET passing=59,groundControl=59,aerial=59,shooting=59,shotAccuracy=59,defense=59,goalkeeping=59 WHERE playerId LIKE 'us%'");
  const warmup=next();play(warmup,1);play(warmup,2);const trial=next();
  play(trial,1,false);play(trial,2,false);play(trial,3,false);
  expect(path.overview('c').unlockedCutoff).toBe(0);expect(next().seriesFormat).toBe('BO5');
  expect(db.prepare('SELECT trialCutoff FROM path_series WHERE fixtureId=?').get(next().id).trialCutoff).toBe(59);
  expect(path.overview('c').achievements.some((a:any)=>a.key==='promotion_59')).toBe(false);
});
it('remembers and rewards a real comeback from two games down only once',()=>{
  const f=next();db.prepare("UPDATE fixtures SET seriesFormat='BO5' WHERE id=?").run(f.id);
  play(f,1,false);play(f,2,false);play(f,3);play(f,4);play(f,5);
  const earned=path.overview('c');expect(earned.achievements.find((a:any)=>a.key==='reverse_sweep')?.xp).toBe(240);
  const xp=earned.players[0].totalXp;path.finishSeries('c',db.prepare('SELECT * FROM fixtures WHERE id=?').get(f.id));
  expect(path.overview('c').players[0].totalXp).toBe(xp);
  expect(earned.memories.some((m:any)=>m.title==='Our toughest loss')).toBe(true);
});
it('finishes at all three 99 without stopping future play or changing modes',()=>{
  db.exec("UPDATE players SET overall=99 WHERE teamId='us'");path.review('c');const first=path.overview('c');expect(first.completedAt).toBeTruthy();
  const f=next();play(f,1);play(f,2);expect(next()).toBeTruthy();expect(manager.career('c').mode).toBe('Path To Glory');path.review('c');
  expect(path.overview('c').achievements.filter((a:any)=>a.key==='all_99')).toHaveLength(1);expect(path.overview('c').completedAt).toBe(first.completedAt);
});
it('makes higher-level development costlier and keeps points/XP in this save',()=>{
  expect(pathPointCost(99)).toBeGreaterThan(pathPointCost(80));expect(pathPointCost(80)).toBeGreaterThan(pathPointCost(54));
  db.prepare("INSERT INTO careers(id,managerName,teamId,currentDate) VALUES('other-save','Other','other','2026-10-01')").run();
  expect(manager.career('other-save').mode).toBe('Manager Career');expect(()=>new EarnedDevelopment(db).allocate(manager.career('other-save'),'other0','passing')).toThrow('Path To Glory');
});
it('provides the official qualification circuit without granting unearned Major or Worlds entry',()=>{
  manager.ensureCircuit('c');
  const events=db.prepare("SELECT c.*,cc.stage FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE cc.careerId='c'").all();
  expect(events.some((e:any)=>e.name.includes('Major'))).toBe(true);expect(events.some((e:any)=>e.name.includes('World Championship'))).toBe(true);expect(events.some((e:any)=>e.stage==='LCQ')).toBe(true);
  for(const e of events.filter((e:any)=>['MAJOR','WORLDS'].includes(e.stage)))expect(db.prepare("SELECT * FROM competition_entries WHERE competitionId=? AND teamId='us'").all(e.id)).toHaveLength(0);
  expect(db.prepare("SELECT COUNT(*) AS n FROM competition_entries e JOIN career_competitions cc ON cc.competitionId=e.competitionId WHERE cc.careerId='c' AND cc.stage='QUALIFIER' AND e.teamId='us'").get().n).toBe(6);
  expect(path.overview('c').circuit.length).toBeGreaterThan(0);
});
it('can win an official Major with played games, earn XP and career titles, and keep money disabled',()=>{
  for(let n=0;n<10;n++){
    const id='extra'+n;db.prepare("INSERT INTO teams(id,name,region) VALUES(?,?,'Europe')").run(id,id);
    for(let i=0;i<3;i++)db.prepare('INSERT INTO players(id,gamertag,teamId,overall,potential) VALUES(?,?,?,80,90)').run(id+i,id+i,id);
  }
  const config={...officialRules('MAJOR',1),seasonYear:2026};
  db.prepare("INSERT INTO competitions(id,name,type,status,config,prizePool) VALUES('major','RLCS Boston Major','MAJOR','scheduled',?,354000)").run(JSON.stringify(config));
  db.exec("INSERT INTO career_competitions VALUES('major','c','MAJOR',1,'2026-10-01','[]')");
  const teams=db.prepare('SELECT id FROM teams ORDER BY id').all().map((r:any)=>r.id);
  teams.forEach((id:string,i:number)=>{db.prepare("INSERT INTO competition_entries(competitionId,teamId,seed) VALUES('major',?,?)").run(id,i+1);new CareerHonours(db).register('c','major',id,db.prepare('SELECT id FROM players WHERE teamId=?').all(id),'2026-10-01');});
  const tournament=new Tournament(db);tournament.prepare('major',teams,'2026-10-01',config);
  for(let wave=0;wave<40&&tournament.details('major')?.phase!=='completed';wave++){
    const fixtures=db.prepare("SELECT * FROM fixtures WHERE competitionId='major' AND status='scheduled'").all();
    for(const f of fixtures){const wins=Math.floor(Number(f.seriesFormat.slice(2))/2)+1;if([f.homeTeamId,f.awayTeamId].includes('us'))for(let g=1;g<=wins;g++)play(f,g);else db.prepare("UPDATE fixtures SET homeScore=?,awayScore=0,status='completed' WHERE id=?").run(wins,f.id);}
    manager.progressCircuit('c','2026-11-01');
  }
  expect(tournament.details('major')?.phase).toBe('completed');expect(db.prepare("SELECT championId FROM tournament_state WHERE competitionId='major'").get().championId).toBe('us');
  expect(path.overview('c').achievements.some((a:any)=>a.key==='champion_major'&&a.xp===700)).toBe(true);
  expect(new CareerHonours(db).equipped('c','us0')?.title).toContain('Major Champion');
  expect(path.overview('c').players.every((p:any)=>p.totalXp>700)).toBe(true);
  expect(db.prepare("SELECT cashBalance FROM teams WHERE id='us'").get().cashBalance).toBe(0);
});
it('offers another circuit season after Worlds without changing the fixed squad or progression',()=>{
  manager.ensureCircuit('c');const ids=path.roster('c').map(p=>p.id);
  db.exec("UPDATE careers SET currentDate='2028-10-01' WHERE id='c'");manager.ensureCircuit('c');
  expect(db.prepare("SELECT number FROM seasons WHERE careerId='c' AND isActive=1").get().number).toBe(2);
  expect(path.roster('c').map(p=>p.id)).toEqual(ids);
  expect(db.prepare("SELECT COUNT(*) AS n FROM career_competitions WHERE careerId='c' AND stage='QUALIFIER'").get().n).toBe(6);
  expect(db.prepare("SELECT COUNT(*) AS n FROM career_competitions WHERE careerId='c' AND stage='ARCHIVED'").get().n).toBeGreaterThan(0);
});
it('can reach 99 through actual allocations even when the initial core skills exceeded OVR',()=>{
  db.exec("INSERT INTO careers(id,managerName,teamId,currentDate,difficulty) VALUES('high-skills','Coach','other','2026-10-01','Hard');INSERT INTO career_modes VALUES('high-skills','Path To Glory');UPDATE player_attributes SET passing=65,groundControl=65,aerial=65,shooting=65,shotAccuracy=65,defense=65,goalkeeping=65 WHERE playerId LIKE 'other%'");
  path.initialise('high-skills');db.exec("UPDATE player_skill_development SET points=10000 WHERE careerId='high-skills'");
  const career=manager.career('high-skills'),earned=new EarnedDevelopment(db);
  for(const p of path.roster('high-skills')){
    for(let n=0;n<250;n++){
      const state=earned.overview(career).find((s:any)=>s.playerId===p.id)!;if(state.overall>=99)break;
      const skill=state.skills.filter((s:any)=>!s.atCap).sort((a:any,b:any)=>a.value-b.value)[0];expect(skill).toBeTruthy();earned.allocate(career,p.id,skill.id);
    }
  }
  path.review('high-skills');expect(path.roster('high-skills').every(p=>p.overall===99)).toBe(true);expect(path.overview('high-skills').completedAt).toBeTruthy();
});
it('generates a rank-based fixed squad capped at 80 and starts at its earned baseline bot tier',()=>{
  for(const [i,preset] of PATH_RANKS.entries()){
    const team=path.generateSquad(preset.rank,'Europe','Academy '+i),id='rank-'+i;
    db.prepare("INSERT INTO careers(id,managerName,teamId,currentDate,difficulty) VALUES(?,?,?,'2026-10-01','Hard')").run(id,'Coach',team.id);db.prepare("INSERT INTO career_modes VALUES(?,'Path To Glory')").run(id);
    path.initialise(id,{rank:preset.rank,generated:true});const state=path.overview(id);
    expect(state.players).toHaveLength(3);expect(state.players.every((p:any)=>p.overall<=80&&p.potential===99)).toBe(true);
    expect(Math.max(...state.players.map((p:any)=>p.overall))).toBe(Math.min(80,preset.start+1));
    expect(state.rank).toBe(preset.rank);expect(state.players.every((p:any)=>p.totalXp===0)).toBe(true);
    if(preset.start===80){expect(state.unlockedCutoff).toBe(79);expect(state.nextTier?.cutoff).toBe(84);}
  }
  expect(()=>path.generateSquad('invented','Europe')).toThrow('rank');
});
it('calibrates an existing save against stronger opponents without granting OVR or losing XP',()=>{
  const f=next();play(f,1);expect(()=>path.setRank('c','Supersonic Legend')).toThrow('Finish');play(f,2);
  const before=path.overview('c');path.setRank('c','Supersonic Legend');const after=path.overview('c');
  expect(after.rank).toBe('Supersonic Legend');expect(after.players.map((p:any)=>[p.overall,p.totalXp])).toEqual(before.players.map((p:any)=>[p.overall,p.totalXp]));
  expect(after.nextFixture.awayTeamId).toBe('elite');expect(after.unlockedCutoff).toBe(0);
});
it('shows unfinished challenges and awards played-game, assist and save bonuses exactly once',()=>{
  const first=path.overview('c');expect(first.challenges.every((ch:any)=>!ch.completed)).toBe(true);
  for(let series=0;series<5;series++){const f=next();play(f,1);play(f,2);}
  const earned=path.overview('c');for(const key of ['games_10','assists_20','saves_30'])expect(earned.challenges.find((ch:any)=>ch.key===key)?.completed).toBe(true);
  expect(earned.challenges.find((ch:any)=>ch.key==='wins_25')?.progress).toBe(10);
  const xp=earned.players.map((p:any)=>p.totalXp);path.overview('c');expect(path.overview('c').players.map((p:any)=>p.totalXp)).toEqual(xp);
});

it('lets a losing early squad develop and earn a banked form reward without winning',()=>{
  for(let n=0;n<3;n++){const f=next();play(f,1,false);play(f,2,false);}
  const view=path.overview('c');
  expect(view.challenges.length).toBeGreaterThanOrEqual(40);
  expect(new Set(view.challenges.map(ch=>ch.key)).size).toBe(view.challenges.length);
  for(const key of ['games_1','games_3','games_5','losses_3'])expect(view.challenges.find(ch=>ch.key===key)?.completed).toBe(true);
  expect(view.wins).toBe(0);
  expect(db.prepare("SELECT MIN(points) AS n FROM player_skill_development WHERE careerId='c'").get().n).toBeGreaterThanOrEqual(20);
  expect(pathPointCost(99)).toBeGreaterThan(pathPointCost(54)*7);
  const f=next(),before=path.roster('c').map(p=>p.overall);
  expect(()=>path.activateFormReward('c','games_5','not-ours',f.id)).toThrow();
  path.activateFormReward('c','games_5','us1',f.id);
  expect(path.formFor('c','us1',f.id)?.rating).toBe(92);
  expect(path.formFor('c','us2',f.id)).toBeNull();
  expect(path.roster('c').map(p=>p.overall)).toEqual(before);
  expect(()=>path.activateFormReward('c','games_5','us2',f.id)).toThrow();
  play(f,1,false);play(f,2,false);
  expect(path.formFor('c','us1',f.id)).toBeNull();
  expect(path.formFor('c','us1',next().id)).toBeNull();
});

it('saves a plan only during the one timed series timeout and applies its talk once',()=>{
  const f=next(),orders={us0:'balanced',us1:'defend',us2:'infield'};
  expect(()=>manager.timeout('c',f.id,orders,'encourage')).toThrow();
  play(f,1,false);
  expect(()=>manager.timeout('c',f.id,orders,'encourage')).toThrow();
  manager.startTimeout('c',f.id);
  const morale=path.roster('c')[0].morale;
  manager.timeout('c',f.id,orders,'encourage');
  expect(manager.tactics('c').ordersByPlayer).toEqual(orders);
  expect(path.roster('c')[0].morale).toBe(morale+2);
  manager.timeout('c',f.id,{...orders,us1:'demo'},'encourage');
  expect(path.roster('c')[0].morale).toBe(morale+2);
  expect(manager.tactics('c').ordersByPlayer.us1).toBe('demo');
  expect(()=>manager.timeout('c',f.id,{...orders,us1:'fly'},'encourage')).toThrow();
  const saved=manager.tactics('c');delete saved.ordersByPlayer;manager.saveTactics('c',saved);
  expect(manager.tactics('c').ordersByPlayer.us1).toBe('demo');
  expect(()=>play(f,2,false)).toThrow('timeout');
  db.prepare("UPDATE series_timeout_clocks SET endsAt=0 WHERE careerId='c' AND fixtureId=?").run(f.id);
  play(f,2,false);expect(()=>manager.timeout('c',f.id,orders,'encourage')).toThrow();
});

it('persists a sixty-second timeout, blocks early kickoff, and never resets its series allowance',()=>{
  const f=next();db.prepare("UPDATE fixtures SET seriesFormat='BO7' WHERE id=?").run(f.id);play(f,1,false);
  const clock=new SeriesTimeouts(db),started=clock.start('c',f.id,100000);
  expect(started.active?.remainingSeconds).toBe(60);expect(started.used).toBe(true);
  expect(clock.state('c',f.id,130000).active?.remainingSeconds).toBe(30);
  expect(clock.active('c',130000)).toMatchObject({fixtureId:f.id,active:{side:'manager',startedAt:100000,endsAt:160000}});
  expect(clock.active('other-career',130000).active).toBeNull();
  expect(()=>clock.assertCanLaunch('c',f.id,130000)).toThrow();
  expect(()=>clock.start('c',f.id,130000)).toThrow();
  expect(clock.state('c',f.id,100000+TIMEOUT_MS).active).toBeNull();
  expect(clock.active('c',100000+TIMEOUT_MS).active).toBeNull();
  expect(()=>clock.assertManagerActive('c',f.id,100000+TIMEOUT_MS)).toThrow();
  expect(()=>clock.assertCanLaunch('c',f.id,100000+TIMEOUT_MS)).not.toThrow();
  play(f,2,false);expect(()=>clock.start('c',f.id,200000)).toThrow();
  expect(()=>manager.saveTactics('c',manager.tactics('c'))).toThrow();
  play(f,3,false);play(f,4,false);const fresh=next();play(fresh,1,false);
  expect(clock.start('c',fresh.id,300000).active?.remainingSeconds).toBe(60);
});

it('opponents take one timeout when trailing badly, adapt local orders and cannot overlap another timeout',()=>{
  const f=next();db.prepare("UPDATE fixtures SET seriesFormat='BO7' WHERE id=?").run(f.id);play(f,1);play(f,2);
  const clock=new SeriesTimeouts(db,()=>0),called=clock.considerOpponent('c',f.id,100000);
  expect(called.active?.side).toBe('opponent');expect(called.opponentUsed).toBe(true);expect(called.used).toBe(false);
  expect(()=>clock.start('c',f.id,110000)).toThrow();
  const plan=clock.opponentPlan('c',f.id);expect(Object.values(plan.ordersByPlayer).sort()).toEqual(['defend','infield','press']);
  const opponent=f.awayTeamId,morale=db.prepare('SELECT morale FROM players WHERE teamId=? ORDER BY id').all(opponent);
  expect(clock.considerOpponent('c',f.id,130000).active?.remainingSeconds).toBe(30);
  expect(db.prepare('SELECT morale FROM players WHERE teamId=? ORDER BY id').all(opponent)).toEqual(morale);
  expect(clock.considerOpponent('c',f.id,160000).active).toBeNull();
  expect(clock.start('c',f.id,160000).active?.side).toBe('manager');
});

it('opponents do not take a timeout while leading 3-0 or level',()=>{
  const f=next();db.prepare("UPDATE fixtures SET seriesFormat='BO7' WHERE id=?").run(f.id);const clock=new SeriesTimeouts(db);
  play(f,1,false);play(f,2,false);play(f,3,false);
  expect(clock.considerOpponent('c',f.id).active).toBeNull();expect(clock.state('c',f.id).opponentUsed).toBe(false);
  play(f,4);play(f,5);play(f,6);expect(clock.considerOpponent('c',f.id).active).toBeNull();
});
it('a heavy first-game loss can trigger the opposing timeout, but a normal first loss does not',()=>{
  const f=next();db.prepare("UPDATE fixtures SET seriesFormat='BO7' WHERE id=?").run(f.id);play(f,1);
  const clock=new SeriesTimeouts(db);expect(clock.considerOpponent('c',f.id).active).toBeNull();
  db.prepare('UPDATE game_results SET blueScore=8 WHERE fixtureId=?').run(f.id);
  expect(clock.considerOpponent('c',f.id).active?.side).toBe('opponent');
});
