import {beforeAll,beforeEach,it,expect} from 'vitest';
import initSqlJs from 'sql.js';
import {sqlAdapter} from './sql-fixture';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {FlagshipFormatRepair} from '../src/main/flagship-format-repair';
import {CareerManagement} from '../src/main/career-management';
import {Tournament} from '../src/main/tournament';
import {officialRules} from '../src/game/official-competition-rules';
let SQL:any,db:any,repair:FlagshipFormatRepair,manager:CareerManagement;
beforeAll(async()=>{SQL=await initSqlJs();});
beforeEach(()=>{
 db=sqlAdapter(new SQL.Database());runMigration(db);manager=new CareerManagement(db);
 db.exec("INSERT INTO careers(id,managerName,teamId,currentDate) VALUES('c','Coach','t0','2027-02-13');INSERT INTO careers(id,managerName,teamId,currentDate) VALUES('other','Other coach','t1','2027-02-13');INSERT INTO competitions(id,name,region,type,format,status,config) VALUES('e','International Major 3','GLOBAL','MAJOR','round_robin','scheduled','{\"legacyRules\":true,\"seriesFormat\":\"BO7\"}');INSERT INTO career_competitions VALUES('e','c','MAJOR',3,'2027-02-03','[\"q\"]');INSERT INTO competitions(id,name,region,type,status) VALUES('q','Saved regional qualifier','Europe','REGIONAL','completed');INSERT INTO career_competitions VALUES('q','c','REGIONAL',3,'2027-01-10','[]')");
 for(let i=0;i<20;i++){
  const id='t'+i;db.prepare('INSERT INTO teams(id,name,region) VALUES(?,?,?)').run(id,'Real squad '+i,['Europe','North America','MENA','South America'][i%4]);
  for(let j=0;j<3;j++)db.prepare('INSERT INTO players(id,gamertag,teamId,overall) VALUES(?,?,?,70)').run(id+'p'+j,id+'p'+j,id);
  db.prepare('INSERT INTO competition_entries(competitionId,teamId,seed) VALUES (?,?,?)').run('q',id,i+1);
  if(i<14)db.prepare('INSERT INTO competition_entries(competitionId,teamId,seed) VALUES (?,?,?)').run('e',id,i+1);
 }
 db.exec("INSERT INTO fixtures(id,competitionId,round,homeTeamId,awayTeamId,scheduledDate,status,seriesFormat,homeScore,awayScore) VALUES('played','e',1,'t0','t1','2027-02-03','completed','BO7',4,1);INSERT INTO fixtures(id,competitionId,round,homeTeamId,awayTeamId,scheduledDate,status,seriesFormat) VALUES('future','e',12,'t0','t2','2027-02-14','scheduled','BO7');INSERT INTO game_results(id,fixtureId,gameNumber,blueTeamId,orangeTeamId,blueScore,orangeScore,wasPlayed,playedByHuman) VALUES('g','played',1,'t0','t1',8,2,1,'t0p0');INSERT INTO game_player_stats(id,gameResultId,playerId,goals) VALUES('stat','g','t0p0',5)");
 repair=new FlagshipFormatRepair(db,id=>Array.from({length:20},(_,i)=>({teamId:'t'+i,placement:i+1,wins:20-i})));
});
it('previews sixteen real qualified entrants without altering the started tournament',()=>{
 const view=repair.preview('c','e');expect(view.required).toBe(true);expect(view.canRepair).toBe(true);expect(view.completedSeries).toBe(1);
 expect(view.entrants).toHaveLength(16);expect(view.entrants.slice(14).map(e=>e.teamId)).toEqual(['t14','t15']);
 expect(new Tournament(db).has('e')).toBe(false);expect(db.prepare('SELECT id FROM fixtures WHERE competitionId=?').all('e')).toHaveLength(2);
});
it('preserves played fixture IDs, game results and player stats while replacing the league with 24 group series',()=>{
 const oldGame=db.prepare('SELECT * FROM game_results').all(),stats=db.prepare('SELECT * FROM game_player_stats').all();
 const result=repair.apply('c','e'),t=new Tournament(db),event=t.details('e')!;
 expect(event.groups).toHaveLength(4);expect(event.groups.every(g=>g.standings.length===4&&g.standings.every(r=>r.played===0))).toBe(true);
 const fixtures=db.prepare('SELECT * FROM fixtures WHERE competitionId=?').all('e');expect(fixtures).toHaveLength(24);expect(fixtures.every(f=>f.seriesFormat==='BO5')).toBe(true);
 for(let i=0;i<16;i++){const own=fixtures.filter(f=>[f.homeTeamId,f.awayTeamId].includes('t'+i));expect(own).toHaveLength(3);expect(new Set(own.map(f=>f.homeTeamId==='t'+i?f.awayTeamId:f.homeTeamId)).size).toBe(3);}
 expect(db.prepare('SELECT competitionId FROM fixtures WHERE id=?').get('played').competitionId).toBe(result.archiveId);
 expect(db.prepare('SELECT * FROM game_results').all()).toEqual(oldGame);expect(db.prepare('SELECT * FROM game_player_stats').all()).toEqual(stats);
 expect(db.prepare('SELECT id FROM fixtures WHERE id=?').get('future')).toBeUndefined();
 expect(db.prepare("SELECT stage FROM career_competitions WHERE competitionId=?").get(result.archiveId).stage).toBe('ARCHIVED');
 expect(db.prepare("SELECT id FROM calendar_events WHERE relatedId='e' AND type='group_draw'").all()).toHaveLength(1);
 expect(JSON.parse(db.prepare('SELECT value FROM settings WHERE key=?').get('flagship_format_backup:e').value).fixtures).toHaveLength(2);
 expect(()=>repair.apply('c','e')).toThrow();
});
it('runs a repaired Major through group qualification and its entire hybrid bracket to one final',()=>{
 repair.apply('c','e');const t=new Tournament(db);
 for(let wave=0;wave<12&&t.details('e')!.phase!=='completed';wave++){
  for(const f of db.prepare("SELECT * FROM fixtures WHERE competitionId='e' AND status='scheduled'").all())db.prepare("UPDATE fixtures SET status='completed',homeScore=?,awayScore=0 WHERE id=?").run(f.seriesFormat==='BO5'?3:4,f.id);
  t.progress('e','2027-03-01');
 }
 const event=t.details('e')!;expect(event.phase).toBe('completed');expect(event.championId).toBeTruthy();expect(event.nodes).toHaveLength(13);expect(event.nodes.filter(n=>n.label==='Grand Final')).toHaveLength(1);
});
it('refuses to invent filler entrants, repair a foreign save or interrupt a partly played series',()=>{
 db.prepare("UPDATE career_competitions SET sources='[]' WHERE competitionId='e'").run();expect(repair.preview('c','e').missing).toBe(2);expect(()=>repair.apply('c','e')).toThrow('more teams');
 expect(()=>repair.preview('other','e')).toThrow('does not belong');
 db.prepare("UPDATE career_competitions SET sources='[\"q\"]' WHERE competitionId='e'").run();db.prepare("UPDATE fixtures SET status='in_progress' WHERE id='future'").run();expect(()=>repair.apply('c','e')).toThrow('Finish the current series');
});
it('does not mistake a correctly configured event waiting for qualifiers for a legacy league',()=>{
 db.prepare('UPDATE competitions SET config=?,status=? WHERE id=?').run(JSON.stringify(officialRules('MAJOR',2)),'awaiting_qualification','e');expect(repair.preview('c','e').required).toBe(false);
});
it('upgrades an unplayed legacy event automatically even when its scheduled start is in the past',()=>{
 db.prepare('DELETE FROM game_player_stats').run();db.prepare('DELETE FROM game_results').run();db.prepare("UPDATE fixtures SET status='scheduled' WHERE competitionId='e'").run();
 (manager as any).repairUnstartedFlagships('c');expect(new Tournament(db).details('e')!.groups).toHaveLength(4);
});
it('never sends a fourteen-team Major through the generic round-robin fallback',()=>{
 db.prepare('DELETE FROM game_player_stats').run();db.prepare('DELETE FROM game_results').run();db.prepare("DELETE FROM fixtures WHERE competitionId='e'").run();
 expect((manager as any).enterTeams('e',Array.from({length:14},(_,i)=>'t'+i),'2027-02-20')).toBe(false);
 expect(db.prepare("SELECT id FROM fixtures WHERE competitionId='e'").all()).toHaveLength(0);expect(db.prepare("SELECT status FROM competitions WHERE id='e'").get().status).toBe('awaiting_qualification');
});
it('retires a duplicate legacy Major in favour of the already-qualified official event without adding a competition',()=>{
 db.prepare("INSERT INTO competitions(id,name,region,type,format,status,config) VALUES('official','RLCS 2027 Boston Major','GLOBAL','MAJOR','round_robin_hybrid','scheduled',?)").run(JSON.stringify(officialRules('MAJOR',1)));
 db.prepare("INSERT INTO career_competitions VALUES('official','c','MAJOR',1,'2027-02-19','[\"q\"]')").run();
 const teams=Array.from({length:16},(_,i)=>'t'+i);teams.forEach((team,i)=>db.prepare('INSERT INTO competition_entries(competitionId,teamId,seed) VALUES (?,?,?)').run('official',team,i+1));
 new Tournament(db).prepare('official',teams,'2027-02-19',officialRules('MAJOR',1));
 const before=JSON.stringify(db.prepare("SELECT * FROM tournament_state WHERE competitionId='official'").get());
 const plan=repair.preview('c','e');expect(plan.successorId).toBe('official');expect(plan.drawDate).toBe('2027-02-17');
 const count=db.prepare('SELECT COUNT(*) AS n FROM competitions').get().n,result=repair.apply('c','e');
 expect(result.replacementId).toBe('official');expect(result.archiveId).toBe('e');expect(db.prepare('SELECT COUNT(*) AS n FROM competitions').get().n).toBe(count);
 expect(db.prepare("SELECT competitionId FROM fixtures WHERE id='played'").get().competitionId).toBe('e');expect(db.prepare("SELECT id FROM fixtures WHERE id='future'").get()).toBeUndefined();
 expect(db.prepare("SELECT stage FROM career_competitions WHERE competitionId='e'").get().stage).toBe('ARCHIVED');
 expect(JSON.stringify(db.prepare("SELECT * FROM tournament_state WHERE competitionId='official'").get())).toBe(before);
 expect(db.prepare("SELECT id FROM game_results WHERE id='g'").get()).toBeTruthy();
});
