import {beforeAll,beforeEach,describe,it,expect} from 'vitest';
import initSqlJs from 'sql.js';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {Tournament,playoffSeeds} from '../src/main/tournament';
import {sqlAdapter} from './sql-fixture';
let SQL:any,db:any,t:Tournament,teams:string[];
beforeAll(async()=>{SQL=await initSqlJs();});
beforeEach(()=>{db=sqlAdapter(new SQL.Database());runMigration(db);t=new Tournament(db);teams=Array.from({length:20},(_,i)=>'team'+i);teams.forEach((id,i)=>db.prepare('INSERT INTO teams(id,name,region) VALUES(?,?,?)').run(id,'Team '+i,['EU','NA','SAM','MENA'][i%4]));db.exec("INSERT INTO competitions(id,name,status) VALUES('event','Test Major','scheduled')");});
function enter(count=16){teams.slice(0,count).forEach((id,i)=>db.prepare('INSERT INTO competition_entries(competitionId,teamId,seed) VALUES (?,?,?)').run('event',id,i+1));}
function completeGroups(){for(const f of db.prepare("SELECT f.* FROM fixtures f JOIN fixture_stages s ON s.fixtureId=f.id WHERE s.stage='groups'").all()){
  const a=Number(f.homeTeamId.slice(4)),b=Number(f.awayTeamId.slice(4));db.prepare("UPDATE fixtures SET status='completed',homeScore=?,awayScore=? WHERE id=?").run(a<b?3:0,a<b?0:3,f.id);
}t.progress('event','2026-10-05');}
describe('saved groups and hybrid playoffs',()=>{
  it('waits for draw day and gives every team exactly three unique opponents',()=>{
    enter();t.prepare('event',teams.slice(0,16),'2026-10-03',{kind:'MAJOR',advance:2});t.progress('event','2026-09-30');
    expect(db.prepare('SELECT * FROM fixtures').all()).toHaveLength(0);
    t.progress('event','2026-10-01');const fixtures=db.prepare('SELECT * FROM fixtures').all();expect(fixtures).toHaveLength(24);
    for(const id of teams.slice(0,16)){const own=fixtures.filter((f:any)=>[f.homeTeamId,f.awayTeamId].includes(id));expect(own).toHaveLength(3);expect(new Set(own.map((f:any)=>f.homeTeamId===id?f.awayTeamId:f.homeTeamId)).size).toBe(3);}
    expect(t.details('event')!.groups).toHaveLength(4);t.progress('event','2026-10-02');expect(db.prepare('SELECT * FROM fixtures').all()).toHaveLength(24);
  });
  for(const advance of [2,3])it(`runs ${advance===2?'eight':'twelve'}-team playoffs to one champion; upper losers get another chance`,()=>{
    enter();t.prepare('event',teams.slice(0,16),'2026-10-03',{kind:'MAJOR',advance});t.progress('event','2026-10-01');completeGroups();
    const initial=t.details('event')!,seeds=playoffSeeds(initial.groups,advance,'MAJOR');expect(seeds).toHaveLength(advance*4);
    const upper=initial.nodes.filter((n:any)=>n.lane==='Upper bracket');expect(upper).toHaveLength(2);
    for(let round=0;round<9;round++){
      const fixtures=db.prepare("SELECT f.* FROM fixtures f JOIN fixture_stages s ON s.fixtureId=f.id WHERE s.stage='playoffs' AND f.status='scheduled'").all();
      if(!fixtures.length)break;
      for(const f of fixtures)db.prepare("UPDATE fixtures SET status='completed',homeScore=0,awayScore=4 WHERE id=?").run(f.id);
      t.progress('event','2026-10-'+String(6+round).padStart(2,'0'));
    }
    const final=t.details('event')!;expect(final.phase).toBe('completed');expect(final.championId).toBeTruthy();
    for(const node of upper){const loser=node.homeTeamId;expect(final.nodes.filter((n:any)=>n.lane==='Lower bracket'&&[n.homeTeamId,n.awayTeamId].includes(loser)).length).toBeGreaterThan(0);}
    expect(final.nodes.filter((n:any)=>n.label.startsWith('Semifinal'))).toHaveLength(2);
    expect(db.prepare("SELECT COUNT(*) AS n FROM fixtures f JOIN fixture_stages s ON s.fixtureId=f.id WHERE s.stage='playoffs'").get().n).toBe(advance===2?9:13);
    const n=db.prepare('SELECT COUNT(*) AS n FROM fixtures').get().n;t.progress('event','2026-11-01');expect(db.prepare('SELECT COUNT(*) AS n FROM fixtures').get().n).toBe(n);
  });
  it('runs Worlds play-ins before the saved four-group draw',()=>{
    enter(20);t.prepare('event',teams,'2026-10-03',{kind:'WORLDS',advance:3});
    for(let i=0;i<4;i++){
      for(const f of db.prepare("SELECT * FROM fixtures WHERE status='scheduled'").all())db.prepare("UPDATE fixtures SET status='completed',homeScore=3,awayScore=0 WHERE id=?").run(f.id);
      t.progress('event','2026-10-'+String(3+i).padStart(2,'0'));
    }
    t.progress('event','2026-10-08');expect(t.details('event')!.groups.flatMap((g:any)=>g.standings)).toHaveLength(16);
    expect(db.prepare("SELECT COUNT(*) AS n FROM fixtures f JOIN fixture_stages s ON s.fixtureId=f.id WHERE s.stage='play_in'").get().n).toBe(10);
  });
});
