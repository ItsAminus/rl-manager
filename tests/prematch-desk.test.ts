import {beforeAll,beforeEach,expect,it} from 'vitest';
import initSqlJs from 'sql.js';
import {sqlAdapter} from './sql-fixture';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {deskTier,prematchDesk} from '../src/main/prematch-desk';
import {addAdditionalClubs} from '../src/main/additional-clubs';
import {matchStageLabel} from '../src/services/match-stage';
let SQL:any,db:any;
const career={id:'save',teamId:'own',currentDate:'2026-10-27'};
beforeAll(async()=>{SQL=await initSqlJs();});
beforeEach(()=>{
  db=sqlAdapter(new SQL.Database());runMigration(db);
  db.exec(`INSERT INTO teams(id,name,region) VALUES('own','Our Club','Europe'),('enemy','Opposition','Europe');
    INSERT INTO careers(id,managerName,teamId,currentDate) VALUES('save','Manager','own','2026-10-27');
    INSERT INTO competitions(id,name,type) VALUES('event','RLCS Major','MAJOR');
    INSERT INTO career_competitions(careerId,competitionId) VALUES('save','event');
    INSERT INTO fixtures(id,competitionId,homeTeamId,awayTeamId,status,scheduledDate,round,seriesFormat) VALUES('next','event','enemy','own','scheduled','2026-10-27',1,'BO7');
    INSERT INTO tournament_nodes(id,competitionId,label,fixtureId) VALUES('final','event','Grand Final','next');
    INSERT INTO fixture_stages(fixtureId,nodeId,competitionId) VALUES('next','final','event');
    INSERT INTO players(id,gamertag,teamId,overall,preferredTendency) VALUES('own1','Captain','own',99,'STRIKER'),('own2','Flex','own',94,'BALANCED'),('own3','Anchor','own',90,'DEFENSIVE_ANCHOR'),('own4','Reserve','own',80,'BALANCED'),('other','Star','enemy',95,'STRIKER');`);
});
it('selects ordinary graphics, major speech and extended final/semi-final analysis',()=>{
  expect(deskTier('REGIONAL','RLCS Europe Open','Group B')).toBe('graphics');
  expect(deskTier('QUALIFIER','Worlds LCQ','Round 1')).toBe('graphics');
  expect(deskTier('MAJOR','RLCS Major','Group A')).toBe('short');
  expect(deskTier('WORLDS','RLCS Worlds','Semifinal')).toBe('extended');
  expect(deskTier('MAJOR','RLCS Major','Grand Final')).toBe('extended');
  expect(deskTier('REGIONAL','Regional','Upper Final')).toBe('graphics');
});
it('labels groups and knockout rounds explicitly without mistaking bracket finals for the title match',()=>{
  expect(matchStageLabel('groups','B')).toBe('Group stage · Group B');
  expect(matchStageLabel(null as any,null as any,null as any,1)).toBe('Round 1');
  expect(matchStageLabel('playoffs','','Round of 16')).toBe('Round of 16');
  expect(matchStageLabel('quarterfinals')).toBe('Quarterfinal');
  expect(matchStageLabel('semifinals')).toBe('Semifinal');
  expect(matchStageLabel('playoffs','','Grand Final')).toBe('Final');
  expect(matchStageLabel('playoffs','','Lower Final')).toBe('Lower Final');
  expect(deskTier('REGIONAL','Regional Open',matchStageLabel('final'))).toBe('extended');
  db.exec("UPDATE fixture_stages SET stage='groups',groupName='C',nodeId=NULL WHERE fixtureId='next'");
  expect(prematchDesk(db,career,'next').round).toBe('Group stage · Group C');
});
it('uses the saved lineup rather than assuming home side or highest-rated reserves',()=>{
  db.exec(`INSERT INTO career_lineup(careerId,players) VALUES('save','["own2","own3","own4"]')`);
  const d=prematchDesk(db,career,'next');
  expect(d.own.id).toBe('own');expect(d.opponent.id).toBe('enemy');
  expect(d.own.players.map((p:any)=>p.gamertag)).toEqual(['Flex','Anchor','Reserve']);
  expect(d.tier).toBe('extended');expect(d.turns.length).toBeGreaterThanOrEqual(8);
  expect(d.turns.map(t=>t.text).join(' ')).not.toContain('Captain');
});
it('does not invent a rivalry, match facts or a live audience vote',()=>{
  const d=prematchDesk(db,career,'next');
  expect(d.preview.recent).toEqual([]);
  expect(d.turns.some(t=>/rematch|revenge|recurring_rivalry|nemesis|psychological_edge/.test(t.category))).toBe(false);
  expect(JSON.stringify(d)).not.toMatch(/Twitch|live poll|missed.*open net|completed.*comeback|%/i);
  expect(()=>prematchDesk(db,{...career,id:'another'},'next')).toThrow();
});
it('shows only completed event results and finds meetings beyond the last five series',()=>{
  db.exec(`INSERT INTO teams(id,name,region) VALUES('third','Other Club','Europe');
    INSERT INTO competitions(id,name,type) VALUES('old','Previous Event','REGIONAL');
    INSERT INTO career_competitions(careerId,competitionId) VALUES('save','old');
    INSERT INTO fixtures(id,competitionId,homeTeamId,awayTeamId,status,scheduledDate,round,homeScore,awayScore) VALUES
    ('meeting','old','enemy','own','completed','2026-09-01',1,1,3),
    ('route','event','own','third','completed','2026-10-20',1,3,0),
    ('future','event','own','third','completed','2026-11-01',2,3,0);`);
  for(let i=0;i<6;i++)db.prepare(`INSERT INTO fixtures(id,competitionId,homeTeamId,awayTeamId,status,scheduledDate,round,homeScore,awayScore) VALUES(?,'old','enemy','third','completed',?,1,3,0)`).run('recent'+i,`2026-10-${10+i}`);
  const d=prematchDesk(db,career,'next');
  expect(d.own.journey.map((r:any)=>r.id)).toEqual(['route']);
  expect(d.own.journey[0]).toMatchObject({score:'3–0',opponent:'Other Club',won:true});
  expect(d.preview.headToHead.map((r:any)=>r.id)).toEqual(['meeting']);
  expect(d.preview.headToHead[0].score).toBe('1–3');
});
it('new templates add complete dated clubs once and reuse known player IDs',()=>{
  db.exec('DELETE FROM careers');
  db.exec("INSERT INTO players(id,gamertag,overall,teamId) VALUES('known_inspire','insp1re',79,'enemy')");
  addAdditionalClubs(db);addAdditionalClubs(db);
  const players=db.prepare("SELECT id,gamertag FROM players WHERE teamId='astronic_esports_ssa' ORDER BY gamertag").all();
  expect(players.map((p:any)=>p.gamertag)).toEqual(['Galaxy','Mercury','insp1re']);
  expect(players.find((p:any)=>p.gamertag==='insp1re').id).toBe('known_inspire');
  expect(db.prepare("SELECT COUNT(*) n FROM teams WHERE id IN ('astronic_esports_ssa','white_rabbit_gaming_ssa','jchicken_esports_apac','t2g_esports_ssa','charmy_apac','mgl_esports_apac')").get().n).toBe(6);
  expect(db.prepare("SELECT status FROM team_roster_sources WHERE teamId='astronic_esports_ssa'").get().status).toBe('historical');
});
it('registers organizations without resetting an existing career’s transfers or ratings',()=>{
  db.exec("INSERT INTO players(id,gamertag,overall,teamId) VALUES('known_inspire','insp1re',93,'own')");
  addAdditionalClubs(db);
  expect(db.prepare("SELECT teamId,overall FROM players WHERE id='known_inspire'").get()).toEqual({teamId:'own',overall:93});
  expect(db.prepare("SELECT status FROM team_roster_sources WHERE teamId='astronic_esports_ssa'").get().status).toBe('incomplete');
});
