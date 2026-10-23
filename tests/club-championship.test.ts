import {beforeAll,beforeEach,describe,it,expect} from 'vitest';
import initSqlJs from 'sql.js';
import {sqlAdapter} from './sql-fixture';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {Tournament} from '../src/main/tournament';
import {ClubTournamentStages} from '../src/main/club-tournament-stages';
import {ClubChampionship,type ClubSetup} from '../src/main/club-championship';
import {CLUB_REGIONS,CLUB_CAPACITY,CLUB_FINALE_SLOTS,clubProfile,clubPoints,clubPlayerPrize,clubOwnerPrize} from '../src/game/club-championship-rules';
import {addDays} from '../src/game/career-rules';
let SQL:any,db:any,t:Tournament,teams:string[];
beforeAll(async()=>{SQL=await initSqlJs();});
beforeEach(()=>{db=sqlAdapter(new SQL.Database());runMigration(db);t=new Tournament(db);teams=Array.from({length:40},(_,i)=>'t'+i);for(const id of teams)db.prepare('INSERT INTO teams(id,name,region) VALUES(?,?,?)').run(id,id,'Europe');db.exec("INSERT INTO competitions(id,name,type,status) VALUES('e','Test','CLUB_FINALE','scheduled')");});
function enter(kind:string,n:number,extra:any={}){teams.slice(0,n).forEach((id,i)=>db.prepare('INSERT INTO competition_entries(competitionId,teamId,seed) VALUES(?,?,?)').run('e',id,i+1));t.prepare('e',teams.slice(0,n),'2026-12-09',{...clubProfile(kind),...extra});}
function wave(away=false){const rows=db.prepare("SELECT * FROM fixtures WHERE competitionId='e' AND status='scheduled'").all();for(const f of rows){const wins=f.seriesFormat==='BO7'?4:f.seriesFormat==='BO5'?3:2;db.prepare("UPDATE fixtures SET status='completed',homeScore=?,awayScore=? WHERE id=?").run(away?0:wins,away?wins:0,f.id);}t.progress('e','2027-12-31');return rows;}
function finish(){for(let i=0;i<80&&t.details('e')?.phase!=='completed';i++)wave();expect(t.details('e')?.phase).toBe('completed');}
describe('published Club Championship formats',()=>{
  it('transcribes points, player prizes and owner prizes independently',()=>{
    expect([1,2,3,4,5,7,9,13,17].map(p=>clubPoints('CLUB_KICKOFF','GLOBAL',p))).toEqual([80,60,50,40,30,20,15,10,5]);
    expect([1,2,3,5,7,9,12,15].map(p=>clubPoints('CLUB_FINALE','GLOBAL',p))).toEqual([120,90,60,45,30,24,18,12]);
    expect(clubPoints('CLUB_LEAGUE','Europe',1)).toBe(25);expect(clubPoints('CLUB_LEAGUE','MENA',1)).toBe(22);expect(clubPoints('CLUB_LEAGUE','Oceania',1)).toBe(18);
    expect(clubPlayerPrize('CLUB_KICKOFF','GLOBAL',1)).toBe(39000);expect(clubPlayerPrize('CLUB_FINALE','GLOBAL',1)).toBe(130000);expect(clubOwnerPrize(1)).toBe(150000);
    expect(Array.from({length:24},(_,i)=>clubPlayerPrize('CLUB_KICKOFF','GLOBAL',i+1)).reduce((a,b)=>a+b,0)).toBe(300000);
    expect(Array.from({length:16},(_,i)=>clubPlayerPrize('CLUB_FINALE','GLOBAL',i+1)).reduce((a,b)=>a+b,0)).toBe(500500);
  });
  it('uses the exact 24-team Kick-Off opening seeds and top-eight byes',()=>{
    enter('CLUB_KICKOFF',24,{kickoffLaterFormat:'BO7'});
    const initial=db.prepare('SELECT * FROM fixtures WHERE status=?').all('scheduled');
    const pairs=initial.map(f=>[f.homeTeamId,f.awayTeamId].map(id=>teams.indexOf(id)+1).sort((a,b)=>a-b).join(':'));
    expect(pairs.sort()).toEqual(['16:17','9:24','13:20','12:21','15:18','10:23','14:19','11:22'].sort());
    expect(initial.every(f=>f.seriesFormat==='BO5')).toBe(true);finish();
    const completed=db.prepare("SELECT * FROM fixtures WHERE status='completed'").all();expect(completed).toHaveLength(46);
    const losses=new Map<string,number>();for(const f of completed){const out=f.homeScore>f.awayScore?f.awayTeamId:f.homeTeamId;losses.set(out,(losses.get(out)||0)+1);}
    const winner=t.details('e')?.championId;for(const id of teams.slice(0,24))expect(losses.get(id)||0).toBe(id===winner?0:2);
    expect([...t.placements('e')!.values()].sort((a,b)=>a-b)).toEqual([1,2,3,4,5,5,7,7,9,9,9,9,13,13,13,13,17,17,17,17,17,17,17,17]);
  });
  it('requires a reset if the lower finalist wins the first Kick-Off final',()=>{
    enter('CLUB_KICKOFF',24,{kickoffLaterFormat:'BO5'});
    for(let i=0;i<30&&!db.prepare("SELECT fixtureId FROM tournament_nodes WHERE id='e:F'").get()?.fixtureId;i++)wave();
    const f=db.prepare("SELECT f.* FROM fixtures f JOIN tournament_nodes n ON n.fixtureId=f.id WHERE n.id='e:F'").get();expect(f).toBeTruthy();
    db.prepare("UPDATE fixtures SET status='completed',homeScore=0,awayScore=3 WHERE id=?").run(f.id);t.progress('e','2027-01-01');
    expect(t.details('e')?.phase).not.toBe('completed');const reset=db.prepare("SELECT fixtureId FROM tournament_nodes WHERE id='e:RESET'").get()?.fixtureId;expect(reset).toBeTruthy();
    db.prepare("UPDATE fixtures SET status='completed',homeScore=0,awayScore=3 WHERE id=?").run(reset);t.progress('e','2027-01-01');finish();
    expect(t.details('e')?.championId).toBe(f.homeTeamId);expect(t.placements('e')!.get(f.homeTeamId)).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM fixtures').get().n).toBe(47);
  });
  it('uses a single sixteen-team Swiss and then eight-team hybrid Finale',()=>{
    enter('CLUB_FINALE',16);expect(t.details('e')?.stageStandings.map((r:any)=>r.groupName).every((g:string)=>g==='A')).toBe(true);finish();
    const f=db.prepare("SELECT f.*,s.stage FROM fixtures f JOIN fixture_stages s ON s.fixtureId=f.id").all();
    expect(f.filter(r=>r.stage==='swiss')).toHaveLength(33);expect(f.filter(r=>r.stage==='club_hybrid')).toHaveLength(9);
    expect(f.filter(r=>r.stage==='swiss').every(r=>r.seriesFormat==='BO5')).toBe(true);expect(f.filter(r=>r.stage==='club_hybrid').every(r=>r.seriesFormat==='BO7')).toBe(true);
    const ps=[...t.placements('e')!.values()].sort((a,b)=>a-b);expect(ps).toEqual([1,2,3,3,5,5,7,7,9,9,9,12,12,12,15,15]);
  });
  it('seeds Club Open Swiss by double-elimination placement before the initial seed',()=>{
    enter('CLUB_OPEN',40,{schedule:{swiss:'2026-12-11',gsl:'2026-12-16',playoffs:'2026-12-17',finals:'2026-12-18'},clubAdvanceSpots:1});
    wave();wave(true);
    for(let i=0;i<30&&t.details('e')?.phase!=='swiss';i++)wave();
    const c=t.details('e')?.config,upper=c.upperEndpoints.map((s:string)=>t.resolve('e',s));
    expect(c.swissSeeds).toHaveLength(32);expect(c.swissSeeds.slice(0,16).every((id:string)=>upper.includes(id))).toBe(true);expect(c.swissSeeds.slice(16).some((id:string)=>upper.includes(id))).toBe(false);
  });
  for(const spots of [2,3,4,5,6,7,8])it(`stops a League Open hybrid when ${spots} places have been earned`,()=>{
    const config={...clubProfile('CLUB_OPEN'),nodeFormats:{},nodeStages:{},nodeDates:{},placements:{},schedule:{playoffs:'2026-12-10',finals:'2026-12-11'}};
    db.prepare('INSERT INTO tournament_state(competitionId,phase,config) VALUES(?,?,?)').run('e','gsl',JSON.stringify(config));
    teams.slice(0,8).forEach((id,i)=>db.prepare('INSERT INTO competition_entries(competitionId,teamId,seed) VALUES(?,?,?)').run('e',id,i+1));
    new ClubTournamentStages(db,t).hybrid('e',teams.slice(0,8),'2026-12-10',config,spots);finish();
    expect(JSON.parse(db.prepare("SELECT teams FROM qualification_results WHERE competitionId='e'").get().teams)).toHaveLength(spots);
    expect(db.prepare("SELECT id FROM tournament_nodes WHERE id='e:F'").get()).toBeUndefined();
    const hasTie=!!db.prepare("SELECT id FROM tournament_nodes WHERE id='e:T'").get();expect(hasTie).toBe([3,5,7].includes(spots));
  });
});

describe('career Club Championship circuit',()=>{
  function careerWorld(){
    db.exec("DELETE FROM teams; INSERT INTO careers(id,managerName,teamId,currentDate) VALUES('career','Manager','R0T0','2026-10-23'); INSERT INTO seasons(id,careerId,startDate,endDate,isActive) VALUES('season','career','2026-10-11','2027-09-20',1)");
    db.transaction(()=>{CLUB_REGIONS.forEach((region,r)=>{for(let n=0;n<48;n++){
      const id=`R${r}T${n}`;db.prepare('INSERT INTO teams(id,name,region,reputation,cashBalance) VALUES(?,?,?,?,100000)').run(id,id,region,100-n-r);
      for(let p=0;p<3;p++)db.prepare('INSERT INTO players(id,gamertag,teamId,region,age,overall) VALUES(?,?,?,?,20,80)').run(id+'P'+p,id+'P'+p,id,region);
    }});})();
    const service=new ClubChampionship(db);service.ensure({id:'career',currentDate:'2026-10-23'});const id=db.prepare("SELECT id FROM competitions WHERE type='CLUB_CHAMPIONSHIP'").get().id;
    const setup:ClubSetup={invitedTeamIds:service.previewInvitations(),kickoffStart:'2026-12-09',leagueOpenStart:'2027-01-08',leagueStart:'2027-01-29',finaleStart:'2027-04-23',kickoffLaterFormat:'BO5',acceptCareerAdministration:true};
    return {service,id,setup,career:{id:'career',teamId:'R0T0',currentDate:'2026-10-23'}};
  }
  it('adds an idempotent rules entry while unpublished inputs await review',()=>{
    const {service,id,career}=careerWorld();service.ensure(career);const result=service.details(career.id,id);
    expect(result.config.phase).toBe('setup');expect(result.clubChampionship.events).toHaveLength(0);expect(result.config.pendingOfficialDetails).toContain('unconfirmed');expect(result.config.seedingNote).toContain('not official');
    expect(db.prepare("SELECT COUNT(*) AS n FROM competitions WHERE type='CLUB_CHAMPIONSHIP'").get().n).toBe(1);
  });
  it('validates the full setup before creating stages, and preserves other competition data',()=>{
    const {service,id,setup,career}=careerWorld();
    expect(()=>service.configure(career,id,{...setup,acceptCareerAdministration:false})).toThrow(/Review/);
    expect(()=>service.configure(career,id,{...setup,invitedTeamIds:setup.invitedTeamIds.slice(1)})).toThrow(/twenty/);
    expect(()=>service.configure(career,id,{...setup,leagueStart:'2026-11-01'})).toThrow(/Leave time/);
    expect(service.details(career.id,id).clubChampionship.events).toHaveLength(0);service.configure(career,id,setup);
    expect(service.details(career.id,id).clubChampionship.events).toHaveLength(20);expect(db.prepare("SELECT id FROM competitions WHERE id='e'").get()).toBeTruthy();
    expect(()=>service.configure(career,id,setup)).toThrow(/already/);
  });
  it('does not deadlock the calendar or invent appearances when a locked roster loses a player',()=>{
    const {service,id,setup,career}=careerWorld();service.configure(career,id,setup);service.progress(career.id,'2026-11-13');
    const f=db.prepare("SELECT f.* FROM fixtures f JOIN competitions c ON c.id=f.competitionId WHERE c.type='CLUB_KICKOFF_OPEN' AND c.region='Europe' AND f.status='scheduled' LIMIT 1").get();expect(f).toBeTruthy();
    const p=service.registeredPlayers(f.competitionId,f.homeTeamId)[0];db.prepare('UPDATE players SET teamId=NULL WHERE id=?').run(p.id);
    db.prepare('INSERT INTO players(id,gamertag,teamId,overall,age) VALUES(?,?,?,99,20)').run('new-signing','New signing',f.homeTeamId);
    db.prepare('UPDATE careers SET teamId=?,currentDate=? WHERE id=?').run(f.homeTeamId,'2026-11-13',career.id);
    service.progress(career.id,'2026-11-13');const result=db.prepare('SELECT * FROM fixtures WHERE id=?').get(f.id);
    expect(result.status).toBe('completed');expect(result.homeScore).toBe(0);expect(result.awayScore).toBe(3);expect(db.prepare('SELECT id FROM game_results WHERE fixtureId=?').get(f.id)).toBeUndefined();
    expect(db.prepare("SELECT title FROM inbox_items WHERE careerId=? AND title='Club Championship — roster forfeit'").get(career.id)).toBeTruthy();
    expect(service.registeredPlayers(f.competitionId,f.homeTeamId).some(p=>p.id==='new-signing')).toBe(false);
  });
  it('runs every official stage, grants the bonus region place, and pays prizes exactly once',()=>{
    const {service,id,setup,career}=careerWorld();service.configure(career,id,setup);
    for(let day=0;day<200;day++){
      const date=addDays('2026-10-23',day);db.prepare('UPDATE careers SET currentDate=? WHERE id=?').run(date,career.id);
      for(let wave=0;wave<30;wave++){
        service.progress(career.id,date);
        const fixtures=db.prepare("SELECT f.* FROM fixtures f JOIN competitions c ON c.id=f.competitionId WHERE c.type LIKE 'CLUB_%' AND f.status='scheduled' AND f.scheduledDate<=?").all(date);
        if(!fixtures.length)break;
        for(const f of fixtures){const wins=f.seriesFormat==='BO7'?4:f.seriesFormat==='BO5'?3:2;db.prepare("UPDATE fixtures SET status='completed',homeScore=?,awayScore=0 WHERE id=?").run(wins,f.id);}
      }
      if(service.details(career.id,id).config.phase==='completed')break;
    }
    const result=service.details(career.id,id);expect(result.config.phase).toBe('completed');
    const events=result.clubChampionship.events,leagues=events.filter((e:any)=>e.type==='CLUB_LEAGUE'),finale=events.find((e:any)=>e.type==='CLUB_FINALE');
    for(const league of leagues){expect(db.prepare('SELECT COUNT(*) AS n FROM competition_entries WHERE competitionId=?').get(league.id).n).toBe(CLUB_CAPACITY[league.region]);expect(db.prepare('SELECT COUNT(*) AS n FROM fixtures WHERE competitionId=?').get(league.id).n).toBe(['Europe','North America'].includes(league.region)?66:28);expect(league.config.finalePlaces).toBe(CLUB_FINALE_SLOTS[league.region]+Number(result.clubChampionship.bonusRegion===league.region));}
    expect(db.prepare('SELECT COUNT(*) AS n FROM competition_entries WHERE competitionId=?').get(finale.id).n).toBe(16);
    expect(result.clubChampionship.leaderboard).toHaveLength(20);expect(result.clubChampionship.ownerPayouts).toHaveLength(20);expect(result.clubChampionship.playerPrizes.length).toBeGreaterThan(0);
    for(const team of db.prepare('SELECT id,cashBalance FROM teams').all())expect(team.cashBalance).toBe(100000+(result.clubChampionship.ownerPayouts.find((p:any)=>p.teamId===team.id)?.amount||0));
    const finalAwards=result.clubChampionship.playerPrizes.filter((p:any)=>p.competitionId===finale.id&&p.teamId===t.details(finale.id)?.championId);expect(finalAwards).toHaveLength(3);expect(finalAwards.reduce((n:number,p:any)=>n+Math.round(p.amount*100),0)).toBe(13000000);
    const winner=t.details(finale.id)?.championId,awards=db.prepare('SELECT * FROM career_player_awards WHERE competitionId=?').all(finale.id);expect(awards).toHaveLength(3);expect(awards.every((a:any)=>a.title===null&&a.teamId===winner)).toBe(true);
    const before=JSON.stringify(db.prepare('SELECT id,cashBalance FROM teams ORDER BY id').all()),awardCount=result.clubChampionship.playerPrizes.length;
    service.progress(career.id,'2027-12-31');expect(JSON.stringify(db.prepare('SELECT id,cashBalance FROM teams ORDER BY id').all())).toBe(before);expect(service.details(career.id,id).clubChampionship.playerPrizes).toHaveLength(awardCount);
  },60000);
});
