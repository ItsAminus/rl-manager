import {beforeAll,beforeEach,describe,it,expect,vi,afterEach} from 'vitest';
import initSqlJs from 'sql.js';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {sqlAdapter} from './sql-fixture';
import {FifaWorldCup} from '../src/main/fifae-world-cup';
import {TrophyCeremonies} from '../src/main/trophy-ceremonies';
import {CareerHonours} from '../src/main/career-honours';
import * as simulation from '../src/game/match-simulation';
let SQL:any,db:any,event:FifaWorldCup,id:string,start:string;
beforeAll(async()=>{SQL=await initSqlJs();});
beforeEach(()=>{
  db=sqlAdapter(new SQL.Database());runMigration(db);event=new FifaWorldCup(db);
  db.exec(`INSERT INTO careers(id,managerName,teamId,currentDate) VALUES('career','Manager','club','2026-01-01');
    INSERT INTO seasons(id,careerId,startDate,endDate,isActive) VALUES('season','career','2026-01-01','2026-12-31',1);
    INSERT INTO teams(id,name,cashBalance) VALUES('club','Original club',100000);`);
  const nations=['FR','US','SA','BR','AU','CA','DE','ES','MA','IT','NL','DK','ZA','AR','JP','SG'];
  nations.forEach((code,n)=>{for(let p=0;p<3;p++)db.prepare('INSERT INTO players(id,gamertag,teamId,nationality,overall,age) VALUES(?,?,?,?,?,20)').run(code+p,code+p,'club',code,90-n);});
  event.ensure({id:'career',currentDate:'2026-01-01'});
  const row=db.prepare("SELECT c.id,cc.startDate FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE c.type='FIFAE'").get();id=row.id;start=row.startDate;
});
afterEach(()=>vi.restoreAllMocks());
const current=()=>event.details(db.prepare('SELECT * FROM competitions WHERE id=?').get(id));
describe('FIFAe career edition',()=>{
  it('adds one national event per season, with its own rules and calendar',()=>{
    event.ensure({id:'career',currentDate:'2026-02-01'});
    expect(db.prepare("SELECT COUNT(*) AS n FROM competitions WHERE type='FIFAE'").get().n).toBe(1);
    expect(current().config.sourceVersion).toContain('2025');
    expect(current().config.careerSelectionRule).toContain('not a recreation');
    expect(db.prepare('SELECT COUNT(*) AS n FROM calendar_events WHERE relatedId=?').get(id).n).toBe(4);
    expect(current().national.phase).toBe('selection');
  });
  it('locks nationality-based squads without changing a club, contract or club fixture',()=>{
    event.progress('career',start,()=>.4);const result=current();
    expect(result.entries).toHaveLength(16);
    expect(result.national.entrants.find((n:any)=>n.name==='Saudi Arabia')).toBeTruthy();
    for(const n of result.national.entrants){expect(n.players).toHaveLength(3);expect(new Set(n.players.map((p:any)=>p.nationality)).size).toBe(1);expect(n.players[0].overall).toBeUndefined();}
    expect(db.prepare("SELECT COUNT(*) AS n FROM players WHERE teamId='club'").get().n).toBe(48);
    expect(db.prepare('SELECT COUNT(*) AS n FROM fixtures').get().n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM teams').get().n).toBe(1);
  });
  it('plays exactly two games per group matchup, supports draws and awards one point',()=>{
    let count=0;vi.spyOn(simulation,'simulateGame').mockImplementation((h:any,a:any)=>({blueTeamId:h.id,orangeTeamId:a.id,blueScore:++count%2?1:0,orangeScore:count%2?0:1,overtime:false,stats:{}}));
    event.progress('career','2026-12-31',()=>.4);const result=current();
    const groups=result.fixtures.filter((m:any)=>m.stage==='groups');expect(groups).toHaveLength(112);
    for(const m of groups){expect(m.games).toHaveLength(2);expect(m.homeScore).toBe(1);expect(m.awayScore).toBe(1);}
    for(const g of result.national.groups)for(const r of g.standings){expect(r.played).toBe(14);expect(r.draws).toBe(14);expect(r.points).toBe(14);}
  });
  it('builds the crossed single-elimination bracket and awards the winners once',()=>{
    event.progress('career','2026-12-31',()=>.4);const result=current();
    expect(result.status).toBe('completed');expect(result.national.phase).toBe('completed');
    expect(result.fixtures.filter((m:any)=>m.stage!=='groups')).toHaveLength(7);
    for(const m of result.fixtures.filter((m:any)=>m.stage!=='groups')){expect(m.seriesFormat).toBe('BO7');expect(Math.max(m.homeScore,m.awayScore)).toBe(4);}
    const quarterfinals=result.fixtures.filter((m:any)=>m.stage==='quarterfinals');
    for(const q of quarterfinals){const home=result.national.entrants.find((n:any)=>n.id===q.homeTeamId),away=result.national.entrants.find((n:any)=>n.id===q.awayTeamId);expect(home.group).not.toBe(away.group);}
    const medals=db.prepare('SELECT * FROM career_player_awards WHERE competitionId=?').all(id);expect(medals).toHaveLength(3);expect(medals.every((a:any)=>a.title===null)).toBe(true);
    expect(new CareerHonours(db).introductionHistory('career',medals[0].playerId,'2026-12-31')).toEqual({debut:null,worlds:null});
    event.progress('career','2027-01-01');expect(db.prepare('SELECT COUNT(*) AS n FROM career_player_awards').get().n).toBe(3);
    expect(db.prepare("SELECT cashBalance FROM teams WHERE id='club'").get().cashBalance).toBe(100000);
    const trophy=new TrophyCeremonies(db);expect(trophy.pending('career').winnerId).toBe(result.national.championId);trophy.dismiss('career',id);expect(trophy.pending('career')).toBeNull();
  });
  it('keeps an incomplete field pending instead of inventing nationalities',()=>{
    db.prepare("UPDATE players SET nationality=NULL WHERE nationality='SG'").run();event.progress('career','2026-12-31');
    expect(current().national.phase).toBe('selection');expect(current().fixtures).toHaveLength(0);expect(current().config.fieldPendingReason).toContain('No nationality');
  });
});
