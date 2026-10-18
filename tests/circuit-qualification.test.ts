import {beforeAll,describe,it,expect} from 'vitest';
import initSqlJs from 'sql.js';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {sqlAdapter} from './sql-fixture';
import {CircuitQualification} from '../src/main/circuit-qualification';
import {Tournament} from '../src/main/tournament';
import {BASE_MAJOR_QUOTAS,officialRules} from '../src/game/official-competition-rules';
let SQL:any;beforeAll(async()=>{SQL=await initSqlJs();});
function setup(){
  const db=sqlAdapter(new SQL.Database());runMigration(db);const career={id:'c'};
  const scores:any[]=[];for(const [region,count] of Object.entries(BASE_MAJOR_QUOTAS))for(let i=0;i<count+2;i++){
    const teamId=region+':'+i;db.prepare('INSERT INTO teams(id,name,region) VALUES (?,?,?)').run(teamId,teamId,region);
    scores.push({teamId,region,points:100-i*10,seasonPoints:100-i*10,awards:[100-i*10],recent:[100-i*10]});
  }
  db.prepare("INSERT INTO competitions(id,name,type,status,config) VALUES('target','Major','MAJOR','awaiting_qualification',?)").run(JSON.stringify(officialRules('MAJOR',1)));
  db.prepare("INSERT INTO career_competitions VALUES('target','c','MAJOR',1,'2026-02-19','[]')").run();
  const q=new CircuitQualification(db,()=>[]);q.scores=()=>scores;
  return {db,career,scores,q,target:{...db.prepare("SELECT * FROM competitions WHERE id='target'").get(),stage:'MAJOR',cycle:1}};
}
describe('official qualification routes',()=>{
  it('guarantees the Kick-Off champion a Major 1 place even outside its region’s top four',()=>{
    const {db,q,career,target}=setup();
    db.exec("INSERT INTO competitions(id,name,type,status) VALUES('kick','Kick-Off','KICKOFF','completed');INSERT INTO career_competitions VALUES('kick','c','KICKOFF',1,'2025-12-07','[]')");
    db.prepare('INSERT INTO qualification_results VALUES (?,?)').run('kick',JSON.stringify(['North America:5']));
    const selected=q.international(career,target,[],'2026-02-01')!;
    expect(selected).toHaveLength(16);expect(selected).toContain('North America:5');
    expect(selected.filter(id=>id.startsWith('North America:'))).toHaveLength(5);
    expect(selected.filter(id=>id.startsWith('Europe:'))).toHaveLength(4);
    expect(JSON.parse(db.prepare("SELECT config FROM competitions WHERE id='target'").get().config).regionSlotSeeds.NA5).toBeDefined();
  });
  it('plays a BO7 at a qualification cut instead of selecting a tied team by its ID',()=>{
    const {db,q,scores,career,target}=setup();
    const oce=scores.filter(s=>s.region==='Oceania');oce[0].points=20;oce[1].points=20;oce[2].points=10;
    expect(q.international(career,target,[],'2026-02-01')).toBeNull();
    const tie=db.prepare("SELECT c.id FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE cc.stage='TIEBREAKER'").get();
    const fixture=db.prepare('SELECT * FROM fixtures WHERE competitionId=?').get(tie.id);
    expect(fixture.seriesFormat).toBe('BO7');db.prepare("UPDATE fixtures SET status='completed',homeScore=0,awayScore=4 WHERE id=?").run(fixture.id);
    new Tournament(db).progress(tie.id,'2026-02-02');
    const selected=q.international(career,target,[],'2026-02-02')!;expect(selected).toContain(fixture.awayTeamId);expect(selected).not.toContain(fixture.homeTeamId);
    expect(db.prepare("SELECT id FROM competitions WHERE type='TIEBREAKER'").all()).toHaveLength(1);
  });
  it('counts Major points for Worlds, while Major qualification counts only its split’s Opens',()=>{
    const {db,career}=setup();
    for(const [id,stage,cycle] of [['o1','REGIONAL',1],['m1','MAJOR',1],['o4','REGIONAL',4]] as const){
      db.prepare("INSERT INTO competitions(id,name,type,status) VALUES (?,?,?,'completed')").run(id,id,stage);
      db.prepare('INSERT INTO career_competitions VALUES (?,?,?,?,?,?)').run(id,career.id,stage,cycle,'2026-01-01','[]');
    }
    const q=new CircuitQualification(db,id=>[{teamId:'Europe:0',placement:id==='m1'?2:1}]);
    expect(q.scores(career.id,['o1','m1','o4'])[0].points).toBe(53);
    expect(q.scores(career.id,['o1','m1'],1)[0].points).toBe(15);
    expect(q.scores(career.id,['o4'],2)[0].points).toBe(18);
    expect(q.scores(career.id,['o4'],2)[0].seasonPoints).toBe(53);
  });
});
