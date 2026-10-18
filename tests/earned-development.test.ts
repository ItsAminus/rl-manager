import {beforeAll,beforeEach,it,expect} from 'vitest';
import initSqlJs from 'sql.js';
import {sqlAdapter} from './sql-fixture';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {EarnedDevelopment} from '../src/main/earned-development';
import {CareerManagement} from '../src/main/career-management';
import {addDays} from '../src/game/career-rules';
let SQL:any,db:any,d:EarnedDevelopment,m:CareerManagement;
beforeAll(async()=>{SQL=await initSqlJs();});
beforeEach(()=>{
  db=sqlAdapter(new SQL.Database());runMigration(db);d=new EarnedDevelopment(db);m=new CareerManagement(db);
  db.exec(`INSERT INTO careers(id,managerName,teamId,currentDate,difficulty) VALUES('c','Coach','us','2026-10-01','Medium');
    INSERT INTO teams(id,name,coachRating,facilityLevel,region) VALUES('us','Us',80,2,'Europe'),('them','Them',80,2,'Europe');
    INSERT INTO competitions(id,name,type) VALUES('event','RLCS Open','REGIONAL');INSERT INTO career_competitions(competitionId,careerId) VALUES('event','c');
    INSERT INTO competition_entries(competitionId,teamId) VALUES('event','us'),('event','them');`);
  for(const team of ['us','them'])for(let i=0;i<3;i++){
    db.prepare('INSERT INTO players(id,gamertag,teamId,overall,potential,age,fatigue,morale,form,preferredTendency) VALUES(?,?,?,80,85,19,0,70,50,?)').run(team+i,team+i,team,'STRIKER');
    db.prepare('INSERT INTO player_traits(playerId,confidence,developmentRate,professionalism) VALUES(?,50,70,70)').run(team+i);
    db.prepare('INSERT INTO player_attributes(playerId,mechanical,passing,rotations) VALUES(?,80,80,80)').run(team+i);
  }
});
const career=()=>db.prepare("SELECT * FROM careers WHERE id='c'").get();
const p=()=>db.prepare("SELECT p.*,pt.developmentRate,pt.professionalism FROM players p JOIN player_traits pt ON pt.playerId=p.id WHERE p.id='us0'").get();
const train=(days=80)=>{for(let i=0;i<days;i++)d.train(career(),{...p(),fatigue:0},addDays('2026-10-01',i),1,{coachRating:80,facilityLevel:2});};
function series(index:number,weak=false,passenger=false){
  db.prepare('UPDATE careers SET currentDate=? WHERE id=?').run(addDays('2026-10-01',index),'c');
  if(weak)db.exec("UPDATE players SET overall=54 WHERE teamId='them'");
  const id='f'+index;db.prepare('INSERT INTO fixtures(id,competitionId,homeTeamId,awayTeamId,scheduledDate,status,seriesFormat) VALUES(?,?,?,?,?,?,?)').run(id,'event','us','them',career().currentDate,'scheduled','BO3');
  for(let game=1;game<=2;game++)m.recordGame('c',{fixtureId:id,gameNumber:game,blueTeamId:'us',orangeTeamId:'them',blueScore:4,orangeScore:1,
    playerStats:[{playerId:'us0',goals:passenger?0:2,assists:passenger?0:1,saves:0,shots:passenger?0:4,demos:0,score:passenger?20:600}]});
  db.prepare("UPDATE fixtures SET status='completed',homeScore=2,awayScore=0 WHERE id=?").run(id);
  const f=db.prepare('SELECT * FROM fixtures WHERE id=?').get(id);d.series(career(),f,m.tactics('c'));return f;
}
it('never awards permanent OVR from training alone or a winning passenger',()=>{
  train(150);expect(p().overall).toBe(80);
  for(let i=1;i<=12;i++)series(i,false,true);
  expect(p().overall).toBe(80);expect(d.overview(career())[0].provenSeries).toBe(0);
});
it('restores Manager Career automatic OVR after sustained credible performances and training',()=>{
  train(50);expect(p().overall).toBe(80);
  for(let i=1;i<=12;i++)series(50+i);
  expect(p().overall).toBe(81);expect(d.overview(career()).find(p=>p.playerId==='us0')!.points).toBe(0);
  const f=db.prepare("SELECT * FROM fixtures WHERE id='f62'").get();
  d.series(career(),f,m.tactics('c'));train(100);
  expect(p().overall).toBe(81);expect(d.overview(career()).find(p=>p.playerId==='us0')!.points).toBe(0);expect(db.prepare("SELECT COUNT(*) AS n FROM development_logs WHERE playerId='us0'").get().n).toBe(1);
});
it('does not let weak opposition farming substitute for credible series',()=>{
  train(100);for(let i=1;i<=20;i++)series(40+i,true);
  expect(p().overall).toBe(80);expect(d.overview(career())[0].provenSeries).toBe(0);
});
it('cannot gain in a few days, exceed potential, or credit duplicate training dates',()=>{
  for(let i=1;i<=12;i++)series(i);
  for(let i=0;i<100;i++)d.train(career(),{...p(),fatigue:0},'2026-10-02',1,{coachRating:100,facilityLevel:5});
  expect(p().overall).toBe(80);expect(db.prepare('SELECT trainingDays FROM earned_development WHERE playerId=?').get('us0').trainingDays).toBe(1);
  db.exec("UPDATE players SET potential=80 WHERE id='us0'");train(150);expect(p().overall).toBe(80);
});
it('halts exhausted-player development and slows elite-player growth',()=>{
  const c=career(),date='2026-10-01',team={coachRating:80,facilityLevel:2};
  expect(d.train(c,{...p(),fatigue:90},date,1,team)).toBe(0);
  const normal=d.train(c,{...p(),fatigue:0},addDays(date,1),1,team);
  db.exec("UPDATE players SET overall=96,potential=99 WHERE id='us0'");
  expect(d.train(c,{...p(),fatigue:0},addDays(date,2),1,team)).toBeLessThan(normal);
});
it('updates temporary form after each game without giving a passenger automatic improvement',()=>{
  series(1,false,true);expect(p().form).toBeLessThan(50);expect(p().overall).toBe(80);
  db.exec("UPDATE players SET form=50 WHERE id='us0'");series(2);
  expect(p().form).toBeGreaterThan(50);expect(p().overall).toBe(80);
});
it('spends points transactionally on core skills and derives OVR from accumulated skill gains',()=>{
  db.exec("INSERT INTO career_modes VALUES('c','Path To Glory')");
  d.overview(career());db.exec("UPDATE player_skill_development SET points=20 WHERE playerId='us0'");
  for(const skill of ['passing','dribbling','aerial','shooting'])d.allocate(career(),'us0',skill);
  expect(p().overall).toBe(80);expect(d.allocate(career(),'us0','saving').overall).toBe(81);
  const row=db.prepare("SELECT * FROM player_attributes WHERE playerId='us0'").get();
  expect(row.passing).toBe(81);expect(row.shooting).toBe(81);expect(row.shotAccuracy).toBe(81);expect(row.goalkeeping).toBe(81);
  expect(db.prepare("SELECT points FROM player_skill_development WHERE playerId='us0'").get().points).toBe(10);
  expect(()=>d.allocate(career(),'them0','passing')).toThrow('own squad');expect(()=>d.allocate(career(),'us0','sql')).toThrow('valid core');
  db.exec("UPDATE player_skill_development SET points=0 WHERE playerId='us0'");
  expect(()=>d.allocate(career(),'us0','passing')).toThrow('needs');expect(db.prepare("SELECT passing FROM player_attributes WHERE playerId='us0'").get().passing).toBe(81);
});
it('leaves Hard development alone and keeps point balances per career',()=>{
  expect(()=>d.allocate({...career(),difficulty:'Hard'},'us0','passing')).toThrow('Path To Glory');
  db.exec("INSERT INTO career_modes VALUES('c','Path To Glory'),('other','Path To Glory')");
  d.overview(career());db.exec("UPDATE player_skill_development SET points=10 WHERE careerId='c'");
  expect(d.overview({...career(),id:'other'}).every(p=>p.points===0)).toBe(true);
  expect(d.overview(career()).every(p=>p.points===10)).toBe(true);
});
it('does not convert human-controlled performances or unidentifiable legacy played results into AI growth',()=>{
  const f='human-game';db.prepare('INSERT INTO fixtures(id,competitionId,homeTeamId,awayTeamId,scheduledDate,status,seriesFormat) VALUES(?,?,?,?,?,?,?)').run(f,'event','us','them',career().currentDate,'scheduled','BO3');
  const stats=(id:string,isHuman?:boolean)=>({playerId:id,isHuman,goals:3,assists:1,saves:3,shots:5,demos:1,score:1000});
  m.recordGame('c',{fixtureId:f,gameNumber:1,blueTeamId:'us',orangeTeamId:'them',blueScore:5,orangeScore:1,wasPlayed:true,playerStats:[stats('us0',true),stats('us1',false)]});
  expect(db.prepare("SELECT * FROM game_development WHERE playerId='us0'").all()).toHaveLength(0);
  expect(db.prepare("SELECT * FROM game_development WHERE playerId='us1'").all()).toHaveLength(1);
  m.recordGame('c',{fixtureId:f,gameNumber:2,blueTeamId:'us',orangeTeamId:'them',blueScore:5,orangeScore:1,wasPlayed:true,playerStats:[stats('us0')]});
  expect(db.prepare("SELECT * FROM game_development WHERE playerId='us0'").all()).toHaveLength(0);
});
it('credits AI teammates for a whole human-played series and excludes only the controlled pro',()=>{
  const id='played-series';db.prepare('INSERT INTO fixtures(id,competitionId,homeTeamId,awayTeamId,scheduledDate,status,seriesFormat) VALUES(?,?,?,?,?,?,?)').run(id,'event','us','them',career().currentDate,'scheduled','BO3');
  for(let gameNumber=1;gameNumber<=2;gameNumber++)m.recordGame('c',{fixtureId:id,gameNumber,blueTeamId:'us',orangeTeamId:'them',blueScore:4,orangeScore:1,wasPlayed:true,playedByHuman:true,
    playerStats:[0,1,2].map(i=>({playerId:'us'+i,isHuman:i===0,goals:2,assists:1,saves:2,shots:4,demos:0,score:600}))});
  db.prepare("UPDATE fixtures SET status='completed',homeScore=2,awayScore=0 WHERE id=?").run(id);
  d.series(career(),db.prepare('SELECT * FROM fixtures WHERE id=?').get(id),m.tactics('c'));
  expect(db.prepare("SELECT * FROM development_evidence WHERE playerId='us0'").all()).toHaveLength(0);
  for(const playerId of ['us1','us2']){
    const rows=db.prepare('SELECT * FROM development_evidence WHERE playerId=?').all(playerId);expect(rows).toHaveLength(1);expect(rows[0].weight).toBe(1);expect(rows[0].performance).toBeGreaterThan(.55);
  }
});
it('improves a weaker component without reducing an already stronger component at the skill ceiling',()=>{
  db.exec("INSERT INTO career_modes VALUES('c','Path To Glory')");
  db.exec("UPDATE players SET potential=80 WHERE id='us0';UPDATE player_attributes SET defense=85,goalkeeping=75 WHERE playerId='us0'");
  d.overview(career());db.exec("UPDATE player_skill_development SET points=5 WHERE playerId='us0'");
  d.allocate(career(),'us0','saving');
  const a=db.prepare("SELECT defense,goalkeeping FROM player_attributes WHERE playerId='us0'").get();expect(a.defense).toBe(85);expect(a.goalkeeping).toBe(77);expect(p().overall).toBe(80);
});
