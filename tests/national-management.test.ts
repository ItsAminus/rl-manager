import {beforeAll,beforeEach,describe,it,expect,vi} from 'vitest';
import initSqlJs from 'sql.js';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {sqlAdapter} from './sql-fixture';
import {FifaWorldCup} from '../src/main/fifae-world-cup';
import {NationalManagement} from '../src/main/national-management';
import {CareerManagement} from '../src/main/career-management';
import {nationalIdentity,eligibleForCountry} from '../src/game/national-eligibility';
import {buildSeriesContext} from '../src/services/series-context';
import {nextSeriesGame} from '../src/services/next-series-game';
import {seriesMap} from '../src/services/series-maps';
import {DEFAULT_TACTICS,MATCH_ROLES} from '../src/game/tactics';
import {nationalPrematchDesk} from '../src/main/national-desk';
let SQL:any,db:any,national:NationalManagement,cup:FifaWorldCup,eventId:string,start:string;
beforeAll(async()=>{SQL=await initSqlJs();});
beforeEach(()=>{
  db=sqlAdapter(new SQL.Database());runMigration(db);national=new NationalManagement(db);cup=new FifaWorldCup(db);
  db.exec(`INSERT INTO careers(id,managerName,teamId,currentDate) VALUES('career','Manager','club','2026-01-01');
    INSERT INTO seasons(id,careerId,startDate,endDate,isActive) VALUES('season','career','2026-01-01','2026-12-31',1);
    INSERT INTO teams(id,name,cashBalance) VALUES('club','French club',100000),('foreign','Foreign club',200000);`);
  ['FR','US','SA','BR','AU','CA','DE','ES','MA','IT','NL','DK','ZA','AR','JP','SG'].forEach((code,n)=>{for(let p=0;p<3;p++)db.prepare('INSERT INTO players(id,gamertag,teamId,nationality,overall,age) VALUES(?,?,?,?,?,20)').run(code+p,code+p,'foreign',code,90-n);});
  db.exec("INSERT INTO players(id,gamertag,teamId,nationality,overall,age) VALUES('FR3','FR3','club','FR',80,21),('unknown','Unknown','club',NULL,95,20),('GB','Ambiguous UK','club','GB',95,20)");
  cup.ensure({id:'career',currentDate:'2026-01-01'});
  const row=db.prepare("SELECT c.id,cc.startDate FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE c.type='FIFAE'").get();eventId=row.id;start=row.startDate;
});
function begin(){national.appoint('career','FR');db.prepare('UPDATE careers SET currentDate=? WHERE id=?').run(start,'career');cup.progress('career',start,()=>.4);return national.status('career');}
function result(id:string,gameNumber=1,blueScore=3,orangeScore=1){const c=national.context('career',id,gameNumber);return {fixtureId:id,gameNumber,blueTeamId:c.blue.id,orangeTeamId:c.orange.id,blueScore,orangeScore,wasPlayed:true,playerStats:[...c.bluePlayers,...c.orangePlayers].map(p=>({playerId:p.id,goals:0,assists:0,saves:0,shots:0,demos:0,score:0}))};}
describe('National eligibility',()=>{
  it('uses exact recorded nationality regardless of club and excludes unknown/ambiguous codes',()=>{
    expect(eligibleForCountry({nationality:'FR'},'FR')).toBe(true);expect(eligibleForCountry({nationality:'US'},'FR')).toBe(false);
    for(const value of [null,'','GB','UK','EU','XX','ZZ','France'])expect(nationalIdentity(value)).toBeNull();
    expect(eligibleForCountry({nationality:'GBENG'},'ENG')).toBe(true);expect(eligibleForCountry({nationality:'SCO'},'ENG')).toBe(false);
    expect(eligibleForCountry({},'ZZ')).toBe(false);
  });
  it('allows overseas players but never calls up a foreign player from a domestic club',()=>{
    national.appoint('career','FR');db.prepare("UPDATE players SET teamId='club' WHERE id='US0'").run();
    expect(()=>national.callUp('career',['FR0','FR1','US0'])).toThrow(/nationality/);
    expect(()=>national.callUp('career',['FR0','FR1','unknown'])).toThrow(/nationality/);
    expect(()=>national.callUp('career',['FR0','FR0','FR1'])).toThrow(/different/);
    national.callUp('career',['FR0','FR1','FR3']);expect(national.status('career').job.callups).toEqual(['FR0','FR1','FR3']);
    expect(db.prepare("SELECT teamId FROM players WHERE id='FR0'").get().teamId).toBe('foreign');
    expect(db.prepare('SELECT COUNT(*) n FROM teams').get().n).toBe(2);expect(db.prepare('SELECT COUNT(*) n FROM transfers').get().n).toBe(0);expect(db.prepare('SELECT COUNT(*) n FROM contracts').get().n).toBe(0);
    expect(db.prepare("SELECT cashBalance FROM teams WHERE id='club'").get().cashBalance).toBe(100000);
  });
  it('filters the pool to the managed country and hides unscouted reserves',()=>{
    national.appoint('career','FR');db.prepare("UPDATE players SET teamId='foreign' WHERE id='FR3'").run();
    const state=national.status('career');expect(state.pool).toHaveLength(4);expect(state.pool.every((p:any)=>p.nationality==='FR')).toBe(true);
    expect(state.pool.find((p:any)=>p.id==='FR3').overall).toBeNull();expect(state.pool.find((p:any)=>p.id==='FR3').estimatedOverall).toBe('Unscouted');
  });
});
describe('National management and played FIFAe games',()=>{
  it('builds an offline national desk and preserves draws without inventing club losses',()=>{
    const state=begin(),fixture=state.nextFixture;
    const comp=db.prepare('SELECT config FROM competitions WHERE id=?').get(eventId),config=JSON.parse(comp.config);
    config.national.matches.push({...fixture,id:'recent-national-draw',scheduledDate:start,status:'completed',homeScore:1,awayScore:1});
    db.prepare('UPDATE competitions SET config=? WHERE id=?').run(JSON.stringify(config),eventId);
    const desk=nationalPrematchDesk(db,'career',fixture.id);
    expect(desk.own.name).toBe('France');expect(desk.own.form).toContain('1 draws');
    expect(desk.own.recent.find(r=>r.id==='recent-national-draw')?.won).toBeNull();
    expect(desk.turns.every(t=>!t.category.includes('after_defeat'))).toBe(true);
    expect(desk.turns.filter(t=>t.category==='team_name').map(t=>t.text)).toContain('France');
  });
  it('locks the selected squad, skips managed NPC results and stops the calendar',()=>{
    const state=begin(),fixture=state.nextFixture;
    expect(state.locked).toBe(true);expect(state.fixtures.every((f:any)=>f.status==='scheduled')).toBe(true);
    expect(cup.details(db.prepare('SELECT * FROM competitions WHERE id=?').get(eventId)).fixtures.some((f:any)=>f.status==='completed')).toBe(true);
    expect(()=>national.callUp('career',['FR0','FR1','FR3'])).toThrow(/locked/);expect(()=>national.appoint('career','US')).toThrow(/active FIFAe/);expect(()=>national.resign('career')).toThrow(/active FIFAe/);
    expect(new CareerManagement(db).dueFixture('career',start).id).toBe(fixture.id);
    const calendar=new CareerManagement(db);vi.spyOn(calendar,'ensureCircuit').mockImplementation(()=>{});
    expect(calendar.advance('career','2026-12-31')).toMatchObject({success:true,newDate:start,blockedFixtureId:fixture.id});
    expect(db.prepare('SELECT COUNT(*) n FROM fixtures').get().n).toBe(0);
  });
  it('requires both group games, permits a split and saves idempotently',()=>{
    const id=begin().nextFixture.id,r=result(id);const one=national.recordPlayedGame('career',r);expect(one.seriesComplete).toBe(false);
    expect(()=>national.context('career',id,1)).toThrow(/next unsaved/);
    expect(national.recordPlayedGame('career',r).id).toBe(one.id);expect(()=>national.recordPlayedGame('career',{...r,blueScore:7})).toThrow(/different/);
    expect(()=>national.saveTactics('career',DEFAULT_TACTICS)).toThrow(/Finish this national series/);
    const two=national.recordPlayedGame('career',result(id,2,0,1));expect(two.seriesComplete).toBe(true);expect(national.match('career',id).fixture).toMatchObject({status:'completed',homeScore:1,awayScore:1});
    const row=cup.details(db.prepare('SELECT * FROM competitions WHERE id=?').get(eventId)).national.groups.flatMap((g:any)=>g.standings).find((n:any)=>n.id==='nation:France');expect(row.points).toBe(1);expect(row.draws).toBe(1);
    expect(db.prepare('SELECT COUNT(*) n FROM game_results').get().n).toBe(0);
  });
  it('counts goals correctly when the managed blue side is fixture-away',()=>{
    const state=begin(),f=state.fixtures.find((f:any)=>f.awayTeamId==='nation:France');expect(f).toBeTruthy();db.prepare('UPDATE careers SET currentDate=? WHERE id=?').run(f.scheduledDate,'career');
    national.recordPlayedGame('career',result(f.id,1,7,1));national.recordPlayedGame('career',result(f.id,2,4,0));
    const match=national.match('career',f.id).fixture;expect(match.homeScore).toBe(0);expect(match.awayScore).toBe(2);
    const row=cup.details(db.prepare('SELECT * FROM competitions WHERE id=?').get(eventId)).national.groups.flatMap((g:any)=>g.standings).find((n:any)=>n.id==='nation:France');expect(row.goalsFor).toBe(11);expect(row.goalDiff).toBe(10);expect(row.points).toBe(3);
  });
  it('rejects stale eligibility, other countries, future fixtures and forged results',()=>{
    const state=begin(),f=state.nextFixture,c=national.context('career',f.id);
    const npc=cup.fixtures('career').find(f=>![f.homeTeamId,f.awayTeamId].includes('nation:France'))!;expect(()=>national.context('career',npc.id)).toThrow(/only control/);
    const future=state.fixtures.find((f:any)=>f.scheduledDate>start);expect(()=>national.context('career',future.id)).toThrow(/date first/);
    const r=result(f.id);expect(()=>national.recordPlayedGame('career',{...r,orangeTeamId:'club'})).toThrow(/valid played/);
    const forged=structuredClone(r);forged.playerStats[0].playerId='US0';expect(()=>national.recordPlayedGame('career',forged)).toThrow(/statistics/);
    db.prepare("UPDATE players SET nationality='US' WHERE id=?").run(c.bluePlayers[0].id);expect(()=>national.context('career',f.id)).toThrow(/eligible national/);expect(()=>national.recordPlayedGame('career',r)).toThrow(/eligible national/);
  });
  it('keeps national tactics separate and applies changes to player roles',()=>{
    national.appoint('career','FR');national.saveTactics('career',{...DEFAULT_TACTICS,overallStyle:'Defensive',roles:{0:MATCH_ROLES[2],1:MATCH_ROLES[0],2:MATCH_ROLES[1]}});
    const job=national.status('career').job;expect(job.tactics.overallStyle).toBe('Defensive');expect(job.tactics.rolesByPlayer.FR0).toBe(MATCH_ROLES[2]);
    expect(db.prepare('SELECT COUNT(*) n FROM career_tactics').get().n).toBe(0);
  });
  it('does not expose national jobs to another save or Path To Glory',()=>{
    begin();db.prepare("INSERT INTO careers(id,managerName,teamId,currentDate) VALUES('other','Other','foreign',?)").run(start);
    expect(national.job('other')).toBeNull();expect(()=>national.context('other',national.status('career').nextFixture.id)).toThrow(/no national/);
    db.prepare("INSERT OR REPLACE INTO career_modes(careerId,mode) VALUES('other','Path To Glory')").run();expect(()=>national.appoint('other','US')).toThrow(/Manager Career/);
  });
  it('earns a national title through played groups and knockouts without club rewards',()=>{
    begin();db.prepare("UPDATE careers SET currentDate='2026-12-31' WHERE id='career'").run();
    cup.progress('career','2026-12-31',()=>.4);
    let games=0;
    for(let wave=0;wave<60;wave++){
      const next=national.status('career').nextFixture;if(!next)break;
      const match=national.match('career',next.id);
      national.recordPlayedGame('career',result(next.id,match.gameNumber,3,0));games++;
    }
    const final=cup.details(db.prepare('SELECT * FROM competitions WHERE id=?').get(eventId));
    expect(final.national.phase).toBe('completed');expect(final.national.championId).toBe('nation:France');expect(games).toBe(40);
    expect(db.prepare('SELECT COUNT(*) n FROM career_player_awards WHERE competitionId=?').get(eventId).n).toBe(3);
    expect(db.prepare('SELECT winnerId FROM trophy_ceremonies WHERE competitionId=?').get(eventId).winnerId).toBe('nation:France');
    expect(db.prepare("SELECT cashBalance FROM teams WHERE id='club'").get().cashBalance).toBe(100000);expect(db.prepare('SELECT COUNT(*) n FROM game_results').get().n).toBe(0);
    national.resign('career');expect(national.job('career')).toBeNull();
  });
  it('does not grant an invitation merely because a weak country appoints you',()=>{
    for(let i=0;i<3;i++)db.prepare("INSERT INTO players(id,gamertag,nationality,overall) VALUES(?,?,'IE',10)").run('IE'+i,'IE'+i);
    national.appoint('career','IE');expect(national.status('career').countries.find((n:any)=>n.code==='IE').projected).toBe(false);
    cup.progress('career','2026-12-31',()=>.4);expect(national.status('career').fixtures).toHaveLength(0);
    expect(cup.details(db.prepare('SELECT * FROM competitions WHERE id=?').get(eventId)).national.entrants.some((n:any)=>n.code==='IE')).toBe(false);
  });
});
describe('fixed two-game series',()=>{
  it('plays game two even after a win and never launches a third game',()=>{
    const first=buildSeriesContext('BO2',[],1);expect(seriesMap(2,2)).toBeTruthy();expect(nextSeriesGame(first,{completed:true,blueScore:1,orangeScore:0})).toBe(2);
    const second=buildSeriesContext('BO2',[{gameNumber:1,blueScore:1,orangeScore:0}],2);expect(nextSeriesGame(second,{completed:true,blueScore:0,orangeScore:1})).toBeNull();
    expect(()=>buildSeriesContext('BO2',[{gameNumber:1,blueScore:1,orangeScore:0},{gameNumber:2,blueScore:0,orangeScore:1}],3)).toThrow(/complete/);
  });
});
