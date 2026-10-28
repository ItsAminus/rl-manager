import {beforeAll,beforeEach,expect,it} from 'vitest';
import initSqlJs from 'sql.js';
import {sqlAdapter} from './sql-fixture';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {RecruitmentNetwork} from '../src/main/recruitment-network';
import {addAdditionalClubs} from '../src/main/additional-clubs';
import {opponentPreview} from '../src/main/opponent-preview';
import {addDays} from '../src/game/career-rules';
import {scoutDossier} from '../src/main/scout-dossier';
let SQL:any,db:any,network:RecruitmentNetwork;
const career={id:'save',teamId:'own',currentDate:'2026-01-01',mode:'Manager Career'};
beforeAll(async()=>{SQL=await initSqlJs();});
beforeEach(()=>{
  db=sqlAdapter(new SQL.Database());runMigration(db);network=new RecruitmentNetwork(db);
  db.exec(`INSERT INTO teams(id,name,region,cashBalance) VALUES('own','Our club','Europe',100000),('enemy','Opponent','Europe',100000);
    INSERT INTO careers(id,managerName,teamId,currentDate) VALUES('save','Manager','own','2026-01-01'),('other','Other','own','2026-01-01');
    INSERT INTO players(id,gamertag,teamId,region,overall,potential,preferredTendency) VALUES('p1','First','enemy','Europe',90,95,'STRIKER'),('p2','Second','enemy','Europe',80,85,'BALANCED');`);
});
it('charges once, hides ratings while pending and builds dated observations only when due',()=>{
  expect(network.dispatchTeam(career,'enemy')).toMatchObject({success:true,dueDate:'2026-01-08'});
  expect(network.teamReport(career,'enemy').players.every(p=>p.overall===null)).toBe(true);
  expect(()=>network.dispatchTeam(career,'enemy')).toThrow(/already/);
  expect(db.prepare('SELECT cashBalance FROM teams WHERE id=?').get('own').cashBalance).toBe(92500);
  network.tick({...career,currentDate:'2026-01-07'});expect(network.depth('save','p1')).toBe(0);
  network.tick({...career,currentDate:'2026-01-08'});
  expect(network.teamReport(career,'enemy')).toMatchObject({known:2});
  expect(network.teamReport(career,'enemy').players[0]).toMatchObject({lastScouted:'2026-01-08',overall:null,scoutKnowledge:'Basic'});
  expect(network.occupied('save')).toBe(0);network.tick({...career,currentDate:'2026-01-09'});expect(network.depth('save','p1')).toBe(1);
});
it('cancels each assignment type, retains observations, frees slots and never refunds',()=>{
  network.dispatchTeam(career,'enemy');network.dispatchRegion(career,'Europe',1);
  db.exec("INSERT INTO scout_assignments VALUES('individual','save','p1','2026-01-01','2026-02-01',1,'pending')");
  expect(network.occupied('save')).toBe(3);expect(()=>network.dispatchTeam(career,'own')).toThrow();
  const a=network.teamReport(career,'enemy').assignments[0];
  expect(()=>network.cancel({...career,id:'other'},'team',a.id)).toThrow();
  const funds=db.prepare("SELECT cashBalance FROM teams WHERE id='own'").get().cashBalance;
  network.cancel(career,'team',a.id);network.cancel(career,'player','individual');network.cancel(career,'region',network.regions(career).assignments[0].id);
  expect(network.occupied('save')).toBe(0);expect(db.prepare("SELECT cashBalance FROM teams WHERE id='own'").get().cashBalance).toBe(funds);
  network.tick({...career,currentDate:'2026-03-01'});expect(network.depth('save','p1')).toBe(0);
  expect(()=>network.cancel(career,'team',a.id)).toThrow();expect(()=>network.cancel(career,'players; DROP TABLE teams','x')).toThrow();
});
it('shares capacity across regional, individual and team work',()=>{
  network.dispatchTeam(career,'enemy');
  db.exec("INSERT INTO scout_assignments VALUES('a','save','p1','2026-01-01','2026-02-01',1,'pending'),('b','save','p2','2026-01-01','2026-02-01',1,'pending')");
  expect(()=>network.dispatchRegion(career,'Europe',1)).toThrow(/slots/);
});
it('retains completed knowledge after cancelling deeper work and after reloading',()=>{
  network.dispatchTeam(career,'enemy');network.tick({...career,currentDate:'2026-01-08'});
  network.dispatchTeam({...career,currentDate:'2026-01-09'},'enemy');
  const pending=network.teamReport(career,'enemy').assignments.find(a=>a.status==='pending');
  network.cancel(career,'team',pending.id);
  const restored=new RecruitmentNetwork(sqlAdapter(new SQL.Database(db.exportBinary())));
  expect(restored.depth('save','p1')).toBe(1);
  expect(restored.teamReport(career,'enemy').players[0].lastScouted).toBe('2026-01-08');
  expect(restored.occupied('save')).toBe(0);
});
it('does not observe departures, new signings or a different career',()=>{
  network.dispatchTeam(career,'enemy');db.exec("UPDATE players SET teamId=NULL WHERE id='p1';INSERT INTO players(id,gamertag,teamId,overall,potential) VALUES('new','New signing','enemy',99,99)");
  network.tick({...career,currentDate:'2026-01-08'});
  expect(network.depth('save','p1')).toBe(0);expect(network.depth('save','new')).toBe(0);expect(network.depth('save','p2')).toBe(1);
  expect(network.teamReport({...career,id:'other'},'enemy').known).toBe(0);
});
it('adds SCR once without changing career-owned club data or inventing players',()=>{
  addAdditionalClubs(db);db.exec("UPDATE teams SET cashBalance=123 WHERE id='scr_esports_ssa'");addAdditionalClubs(db);
  expect(db.prepare("SELECT * FROM teams WHERE id='scr_esports_ssa'").get()).toMatchObject({name:'SCR Esports',region:'Sub-Saharan Africa',cashBalance:123});
  expect(db.prepare("SELECT status FROM team_roster_sources WHERE teamId='scr_esports_ssa'").get().status).toBe('incomplete');
  expect(db.prepare("SELECT COUNT(*) n FROM players WHERE teamId='scr_esports_ssa'").get().n).toBe(0);
});
it('automatically previews an unscouted lineup without spending funds or awarding recruitment knowledge',()=>{
  db.exec("INSERT INTO player_attributes(playerId,shooting,passing,aerial,goalkeeping) VALUES('p1',92,85,84,75);INSERT INTO players(id,gamertag,teamId,overall) VALUES('own1','Ours','own',55),('bench','Bench','enemy',99)");
  const before=db.exportBinary(),r=opponentPreview(db,career,'enemy',['p1','p2','p1'],['own1']);
  expect(r).toMatchObject({caliber:'High-level contender',ratingBand:'85–89',keyPlayer:'First'});
  expect(r.players).toHaveLength(2);expect(r.players[0].strengths).toEqual(['Finishing','Passing']);
  expect(r.comparison).toContain('underdogs');expect(r.advice.length).toBeGreaterThan(1);expect(db.exportBinary()).toEqual(before);
  expect(network.depth('save','p1')).toBe(0);
  expect(opponentPreview(db,{...career,mode:'Path To Glory'},'enemy',['p1']).players).toHaveLength(1);
});
it('uses only completed series from this career up to the current date for automatic form',()=>{
  db.exec(`INSERT INTO competitions(id,name) VALUES('event','Event'),('otherEvent','Other');
    INSERT INTO career_competitions(competitionId,careerId) VALUES('event','save'),('otherEvent','other');
    INSERT INTO fixtures(id,competitionId,homeTeamId,awayTeamId,scheduledDate,status,homeScore,awayScore) VALUES
    ('played','event','enemy','own','2025-12-30','completed',3,1),('future','event','enemy','own','2026-02-01','completed',0,3),
    ('pending','event','enemy','own','2025-12-31','scheduled',0,0),('foreign','otherEvent','enemy','own','2025-12-31','completed',0,3);`);
  const r=opponentPreview(db,career,'enemy',['p1','p2']);
  expect(r.recent).toHaveLength(1);expect(r.recent[0]).toMatchObject({id:'played',won:true,score:'3–1'});expect(r.headToHead).toHaveLength(1);
});
it('makes longer regional assignments discover more players and deepen their earlier reports',()=>{
  db.exec('UPDATE players SET form=75');
  for(let i=0;i<35;i++)db.prepare('INSERT INTO players(id,gamertag,region,overall,potential,form) VALUES(?,?,?,?,?,?)').run(`regional${i}`,`Regional ${i}`,'Europe',65+i%20,90,75);
  network.dispatchRegion(career,'Europe',3);
  for(const [days,total] of [[30,6],[60,16],[90,30]]){
    network.tick({...career,currentDate:addDays(career.currentDate,days)});
    expect(network.regions(career).assignments[0].playersObserved).toBe(total);
  }
  const depths=db.prepare("SELECT playerId,MAX(depth) depth FROM scout_assignments WHERE careerId='save' AND status='completed' GROUP BY playerId").all();
  expect(depths.filter(p=>p.depth===3)).toHaveLength(6);expect(depths.filter(p=>p.depth===2)).toHaveLength(10);expect(depths.filter(p=>p.depth===1)).toHaveLength(14);
  expect(network.regions(career).assignments[0].status).toBe('completed');
  const earliest=depths.find(p=>p.depth===3).playerId;
  expect(network.visible(career,db.prepare('SELECT * FROM players WHERE id=?').get(earliest))).toMatchObject({scoutKnowledge:'Full',form:75});
});
it('finishes one- and two-month regional work at the corresponding coverage and respects small pools',()=>{
  network.dispatchRegion(career,'Europe',1);network.tick({...career,currentDate:addDays(career.currentDate,30)});
  expect(network.regions(career).assignments[0]).toMatchObject({status:'completed',playersObserved:2});
  const otherDb=sqlAdapter(new SQL.Database(db.exportBinary())),otherNet=new RecruitmentNetwork(otherDb);
  for(let i=0;i<25;i++)otherDb.prepare('INSERT INTO players(id,gamertag,region,overall,potential) VALUES(?,?,?,?,?)').run(`extra${i}`,`Extra ${i}`,'Europe',70,90);
  otherNet.dispatchRegion({...career,currentDate:'2026-02-01'},'Europe',2);
  otherNet.tick({...career,currentDate:'2026-03-03'});otherNet.tick({...career,currentDate:'2026-04-02'});
  expect(otherNet.regions(career).assignments[0]).toMatchObject({status:'completed',playersObserved:16,goodReports:6});
});
it('scout dossiers reveal broad, then narrower, then full skills and mentality from completed observations',()=>{
  db.exec("INSERT INTO player_attributes(playerId,shooting,passing,positioning,goalkeeping) VALUES('p1',93,84,77,70);INSERT INTO player_traits(playerId,confidence,tiltTendency,pressureResistance) VALUES('p1',80,75,30)");
  let d=scoutDossier(db,career,'p1');expect(d.sections.every(s=>s.skills.every(x=>x.assessment==='Not assessed'))).toBe(true);
  for(const depth of [1,2,3]){
    const start=addDays(career.currentDate,(depth-1)*30),due=addDays(start,30);
    db.prepare("INSERT INTO scout_assignments VALUES(?,?,?,?,?,?,'completed')").run(`report${depth}`,career.id,'p1',start,due,depth);network.observe(career,'p1',depth,due);
    d=scoutDossier(db,career,'p1');expect(d.depth).toBe(depth);expect(d.daysObserved).toBe(depth*30);
    const shooting=d.sections[0].skills.find(s=>s.key==='shooting').assessment;
    expect(shooting).toBe(depth===1?'80–99':depth===2?'90–99':'93');
    expect(d.personality.find(p=>p.key==='confidence').assessment).toBe(depth===1?'Not assessed':depth===2?'High':'80');
  }
  expect(d.concerns.join(' ')).toContain('frustrated');expect(d.assignments).toHaveLength(3);
  const other=scoutDossier(db,{...career,id:'other'},'p1');expect(other.depth).toBe(0);expect(other.lastObserved).toBeNull();
  db.exec("UPDATE player_attributes SET shooting=99 WHERE playerId='p1'");expect(scoutDossier(db,career,'p1').sections[0].skills.find(s=>s.key==='shooting').assessment).toBe('93');
});
