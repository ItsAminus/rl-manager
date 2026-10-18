import {beforeAll,beforeEach,describe,it,expect} from 'vitest';
import initSqlJs from 'sql.js';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {sqlAdapter} from './sql-fixture';
import {Tournament} from '../src/main/tournament';
import {officialRules,circuitPoints,placementPrize,seededGroupDraw,openSchedule} from '../src/game/official-competition-rules';
let SQL:any,db:any,t:Tournament,teams:string[];
beforeAll(async()=>{SQL=await initSqlJs();});
beforeEach(()=>{
  db=sqlAdapter(new SQL.Database());runMigration(db);t=new Tournament(db);
  teams=Array.from({length:134},(_,i)=>'t'+i);
  teams.forEach((id,i)=>db.prepare('INSERT INTO teams(id,name,region) VALUES (?,?,?)').run(id,id,['Europe','North America','MENA','South America'][i%4]));
  db.prepare("INSERT INTO competitions(id,name,type,status) VALUES('e','Official test','REGIONAL','scheduled')").run();
});
function prepare(kind:string,count:number,cycle=1,extra:any={}){
  const config={...officialRules(kind,cycle),...extra};
  teams.slice(0,count).forEach((id,i)=>db.prepare('INSERT INTO competition_entries(competitionId,teamId,seed) VALUES (?,?,?)').run('e',id,i+1));
  t.prepare('e',teams.slice(0,count),'2026-05-01',config);return config;
}
function wave(away=false){
  const fixtures=db.prepare("SELECT * FROM fixtures WHERE status='scheduled'").all();
  fixtures.forEach((f:any)=>{const wins=f.seriesFormat==='BO7'?4:f.seriesFormat==='BO5'?3:2;db.prepare("UPDATE fixtures SET status='completed',homeScore=?,awayScore=? WHERE id=?").run(away?0:wins,away?wins:0,f.id);});
  t.progress('e','2026-06-01');return fixtures;
}
function finish(){for(let i=0;i<60&&t.details('e')?.phase!=='completed';i++)wave();expect(t.details('e')?.phase).toBe('completed');}
describe('official 2026 competition rules',()=>{
  it('uses the four different RLCS point tables and zero points outside the top sixteen',()=>{
    const places=[1,2,3,5,7,9,13,17];
    expect(places.map(p=>circuitPoints('REGIONAL',1,p))).toEqual([15,10,7,5,3,2,1,0]);
    expect(places.map(p=>circuitPoints('REGIONAL',4,p))).toEqual([18,12,8,6,4,2,1,0]);
    expect(places.map(p=>circuitPoints('MAJOR',1,p))).toEqual([30,20,14,10,6,5,3,0]);
    expect(places.map(p=>circuitPoints('MAJOR',2,p))).toEqual([36,24,16,12,8,6,4,0]);
    expect(circuitPoints('INVITATIONAL',1,1)).toBe(0);expect(circuitPoints('WORLDS',1,1)).toBe(0);
    expect(placementPrize('MAJOR','GLOBAL',1,1)).toBe(102000);expect(placementPrize('WORLDS','GLOBAL',1,19)).toBe(6000);
    expect(placementPrize('REGIONAL','Europe',2,70)).toBe(450);expect(placementPrize('REGIONAL','Europe',1,70)).toBe(300);
  });
  it('preserves top seeds and satisfies exact region distribution through seed-band swaps',()=>{
    const regions=['EU','EU','EU','EU','EU','NA','NA','NA','NA','MENA','MENA','SAM','SAM','OCE','APAC','SSA'];
    const entries=regions.map((region,i)=>({region,seed:i+1})),groups=seededGroupDraw(entries);
    expect(groups.map(g=>g[0].seed)).toEqual([1,2,3,4]);
    expect(groups.map(g=>g.filter(t=>t.region==='EU').length).sort()).toEqual([1,1,1,2]);
    expect(groups.every(g=>g.filter(t=>t.region==='NA').length===1)).toBe(true);
    for(const g of groups)for(let band=1;band<4;band++)expect(g[band].seed).toBeGreaterThan(band*4);
  });
  for(const count of [128,134])it(`gives a ${count}-team Open qualifier two lives and advances exactly 32`,()=>{
    prepare('QUALIFIER',count);expect(db.prepare('SELECT id FROM fixtures').all()).toHaveLength(0);
    t.progress('e','2026-05-01');finish();
    const qualifiers=JSON.parse(db.prepare('SELECT teams FROM qualification_results WHERE competitionId=?').get('e').teams);
    expect(qualifiers).toHaveLength(32);expect(new Set(qualifiers).size).toBe(32);
    const losses=new Map<string,number>();for(const f of db.prepare('SELECT * FROM fixtures').all())losses.set(f.awayTeamId,(losses.get(f.awayTeamId)||0)+1);
    for(const team of teams.slice(0,count))expect(losses.get(team)||0).toBe(qualifiers.includes(team)?Math.min(losses.get(team)||0,1):2);
    expect(db.prepare("SELECT id FROM fixtures WHERE seriesFormat<>'BO5'").all()).toHaveLength(0);
  });
  it('bypasses the qualifier for the top eight in Opens 2/3/5/6, with 24 other qualifiers',()=>{
    prepare('QUALIFIER',128,2);t.progress('e','2026-05-01');finish();
    const qualifiers=JSON.parse(db.prepare('SELECT teams FROM qualification_results WHERE competitionId=?').get('e').teams);
    expect(qualifiers).toHaveLength(32);expect(qualifiers.slice(0,8)).toEqual(teams.slice(0,8));
    for(const id of teams.slice(0,8))expect(db.prepare('SELECT id FROM fixtures WHERE homeTeamId=? OR awayTeamId=?').all(id,id)).toHaveLength(0);
  });
  it('runs the two Swiss groups without rematches, then GSL and hybrid playoffs',()=>{
    prepare('REGIONAL',32);finish();
    const swiss=db.prepare("SELECT f.* FROM fixtures f JOIN fixture_stages s ON s.fixtureId=f.id WHERE s.stage='swiss'").all();
    expect(swiss).toHaveLength(66);
    expect(new Set(swiss.map((f:any)=>[f.homeTeamId,f.awayTeamId].sort().join(':'))).size).toBe(66);
    const rows=t.details('e')!.stageStandings.filter((r:any)=>r.stage==='swiss');
    expect(rows.filter((r:any)=>r.wins===3)).toHaveLength(16);expect(rows.filter((r:any)=>r.losses===3)).toHaveLength(16);
    const gsl=t.details('e')!.stageStandings.filter((r:any)=>r.stage==='gsl');expect(gsl).toHaveLength(16);
    expect(gsl.filter((r:any)=>r.wins===2)).toHaveLength(8);expect(gsl.filter((r:any)=>r.losses===2)).toHaveLength(8);
    expect(db.prepare("SELECT f.* FROM fixtures f JOIN fixture_stages s ON s.fixtureId=f.id WHERE s.stage='playoffs'").all()).toHaveLength(9);
    const places=t.placements('e')!;expect([...places.values()].filter(p=>p===17)).toHaveLength(16);
  });
  it('uses EWC GSL with different series lengths and a third-place match',()=>{
    prepare('INVITATIONAL',16);finish();
    const fixtures=db.prepare('SELECT f.*,s.stage FROM fixtures f JOIN fixture_stages s ON s.fixtureId=f.id').all();
    expect(fixtures.filter((f:any)=>f.stage==='gsl'&&f.seriesFormat==='BO5')).toHaveLength(12);
    expect(fixtures.filter((f:any)=>f.stage==='gsl'&&f.seriesFormat==='BO7')).toHaveLength(8);
    expect(fixtures.filter((f:any)=>f.stage==='playoffs')).toHaveLength(8);
    expect(t.details('e')!.nodes.find((n:any)=>n.id==='e:P3').seriesFormat).toBe('BO5');
    expect([...t.placements('e')!.values()].filter(p=>p===3)).toHaveLength(1);
  });
  for(const [kind,count,cycle,playoffs] of [['MAJOR',16,1,9],['MAJOR',16,2,13],['WORLDS',20,1,13]] as const)it(`finishes ${kind} ${cycle} with its official playoff field`,()=>{
    prepare(kind,count,cycle);t.progress('e','2026-05-01');finish();
    expect(t.details('e')!.groups).toHaveLength(4);
    const fixtures=db.prepare('SELECT f.*,s.stage FROM fixtures f JOIN fixture_stages s ON s.fixtureId=f.id').all();
    expect(fixtures.filter((f:any)=>f.stage==='groups')).toHaveLength(24);
    expect(fixtures.filter((f:any)=>f.stage==='playoffs')).toHaveLength(playoffs);
    expect(fixtures.filter((f:any)=>f.stage==='play_in')).toHaveLength(kind==='WORLDS'?10:0);
    expect(fixtures.filter((f:any)=>f.stage==='playoffs').every((f:any)=>f.seriesFormat==='BO7')).toBe(true);
    expect([...t.placements('e')!.values()].filter(p=>p===1)).toHaveLength(1);
  });
  it('runs four EWC LCQ pools and adds a reset only when the lower finalist wins',()=>{
    prepare('EWC_LCQ',32);t.progress('e','2026-05-01');
    for(let i=0;i<40;i++){
      const gf=db.prepare("SELECT f.* FROM fixtures f JOIN tournament_nodes n ON n.fixtureId=f.id WHERE n.id='e:GF' AND f.status='scheduled'").get();
      if(gf){db.prepare("UPDATE fixtures SET status='completed',homeScore=2,awayScore=4 WHERE id=?").run(gf.id);t.progress('e','2026-06-01');break;}wave();
    }
    expect(t.details('e')!.nodes.find((n:any)=>n.id==='e:F')?.label).toBe('Grand Final reset');finish();
    expect(JSON.parse(db.prepare('SELECT teams FROM qualification_results WHERE competitionId=?').get('e').teams)).toHaveLength(1);
  });
  for(let count=2;count<=6;count++)for(let spots=1;spots<count;spots++)it(`plays the published ${count}-team tie for ${spots} places`,()=>{
    prepare('TIEBREAKER',count,1,{spots});finish();
    const winners=JSON.parse(db.prepare('SELECT teams FROM qualification_results WHERE competitionId=?').get('e').teams);
    expect(winners).toHaveLength(spots);expect(new Set(winners).size).toBe(spots);
    expect(db.prepare("SELECT id FROM fixtures WHERE seriesFormat<>'BO7'").all()).toHaveLength(0);
  });
  it('uses the official regional calendar and shifts the template for later career seasons',()=>{
    expect(openSchedule('Europe',1).finals).toBe('2025-12-05');expect(openSchedule('North America',3).swiss).toBe('2026-02-01');
    expect(openSchedule('Europe',6,2027).double_elimination).toBe('2027-04-17');
    expect(openSchedule('MENA',4).gsl).toBe('2026-03-21');expect(openSchedule('MENA',4).playoffs).toBe('2026-03-21');expect(openSchedule('MENA',4).finals).toBe('2026-03-22');
  });
  for(const spots of [1,3,6])it(`plays an administrator-defined seven-team tie for ${spots} places`,()=>{
    prepare('TIEBREAKER',7,1,{spots});finish();
    const winners=JSON.parse(db.prepare('SELECT teams FROM qualification_results WHERE competitionId=?').get('e').teams);
    expect(winners).toHaveLength(spots);expect(new Set(winners).size).toBe(spots);
    expect(t.details('e')!.config.adminFormat).toContain('outside the published');
  });
});
