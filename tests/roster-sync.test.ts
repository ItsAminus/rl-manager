import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { readFileSync } from 'node:fs';
import { runMigration } from '../src/database/migrations/001_initial_schema';
import { applyRealRosterSnapshot, repairFutureRosterEntries } from '../src/main/roster-sync';
import { ensurePlayableRoster } from '../src/main/amateur-pool';

const fullSnapshot = JSON.parse(readFileSync('data/real-rosters.json', 'utf8'));
const fullPlayers = JSON.parse(readFileSync('data/players.json', 'utf8'));
const fullTeams = JSON.parse(readFileSync('data/teams.json', 'utf8'));
const snapshot = {...fullSnapshot,teams:fullSnapshot.teams.filter((t:any)=>t.id.startsWith('team_'))};
const coreIds = new Set(snapshot.teams.flatMap((t:any)=>[...t.starterIds,...t.reserveIds,...t.inactiveIds]));
const players = fullPlayers.filter((p:any)=>coreIds.has(p.id) || fullSnapshot.freeAgents.includes(p.gamertag));
const teams = fullTeams.filter((t:any)=>snapshot.teams.some((s:any)=>s.id===t.id));
let SQL: any, raw: any, db: any;
const adapter = (sql: any) => ({
  exec: (s: string) => sql.exec(s),
  prepare: (s: string) => ({
    all: (...args: any[]) => { const st = sql.prepare(s); try { st.bind(args); const rows=[]; while (st.step()) rows.push(st.getAsObject()); return rows; } finally { st.free(); } },
    get: (...args: any[]) => { const st = sql.prepare(s); try { st.bind(args); return st.step() ? st.getAsObject() : undefined; } finally { st.free(); } },
    run: (...args: any[]) => { sql.run(s,args); return { changes: sql.getRowsModified() }; },
  }),
  transaction: (fn: any) => () => { sql.run('BEGIN'); try { const result=fn(); sql.run('COMMIT'); return result; } catch(e) { sql.run('ROLLBACK'); throw e; } },
});
beforeAll(async () => { SQL = await initSqlJs(); });
beforeEach(() => { raw = new SQL.Database(); db = adapter(raw); runMigration(db); });

describe('Confirmed real roster update', () => {
  it('applies every reviewed club, including vacancies, to an existing database', () => {
    db.exec("INSERT INTO teams (id,name,region,cashBalance) VALUES ('team_1','Team Vitality','Europe',123456); INSERT INTO players (id,gamertag,teamId,overall) VALUES ('player_1','zen','team_1',99),('player_2','Vatira','team_1',98); INSERT INTO contracts (id,playerId,teamId,isActive,salary) VALUES ('old','player_2','team_1',1,10000);");
    let backups=0;
    expect(applyRealRosterSnapshot(db,snapshot,players,teams,()=>backups++)).toBe(true);
    expect(backups).toBe(1);
    expect(db.prepare('SELECT cashBalance FROM teams WHERE id = ?').get('team_1').cashBalance).toBe(123456);
    for (const club of snapshot.teams) {
      const tags = db.prepare('SELECT gamertag FROM players WHERE teamId = ?').all(club.id).map((p: any)=>p.gamertag).sort();
      expect(tags).toEqual([...club.starters,...(club.reserves || [])].sort());
    }
    expect(db.prepare('SELECT teamId FROM players WHERE id = ?').get('player_2').teamId).toBe('team_2');
    expect(db.prepare('SELECT isActive FROM contracts WHERE id = ?').get('old').isActive).toBe(0);
    expect(db.prepare('SELECT teamId FROM contracts WHERE playerId = ? AND isActive = 1').all('player_2')).toEqual([{teamId:'team_2'}]);
    // Out of the transfer window, vacancies remain explicit.
    ensurePlayableRoster(db,'team_11','2026-11-10');
    expect(db.prepare('SELECT id FROM players WHERE teamId = ?').all('team_11')).toHaveLength(2);
    ensurePlayableRoster(db,'team_7','2026-10-10');
    expect(db.prepare('SELECT id FROM players WHERE teamId = ?').all('team_7')).toHaveLength(0);
  });
  it('preserves career signings, training and results, and applies each version only once', () => {
    db.exec(`INSERT INTO teams (id,name,region) VALUES ('team_1','Vitality','Europe'),('custom','My club','Europe'); INSERT INTO players (id,gamertag,teamId,overall) VALUES ('player_1','zen','custom',97); INSERT INTO player_attributes (playerId,shooting) VALUES ('player_1',99); INSERT INTO transfers (id,playerId,toTeamId) VALUES ('signed','player_1','custom'); INSERT INTO careers (id,managerName,teamId,currentDate) VALUES ('career','Manager','custom','2026-10-10'); INSERT INTO career_lineup VALUES ('career','["player_1"]'); INSERT INTO fixtures (id,competitionId,status,homeTeamId,awayTeamId,homeScore,awayScore) VALUES ('played','comp','completed','custom','team_1',3,1);`);
    applyRealRosterSnapshot(db,snapshot,players,teams);
    expect(db.prepare('SELECT teamId,overall FROM players WHERE id = ?').get('player_1')).toEqual({teamId:'custom',overall:99});
    expect(db.prepare('SELECT shooting FROM player_attributes WHERE playerId = ?').get('player_1').shooting).toBe(99);
    expect(db.prepare('SELECT homeScore FROM fixtures WHERE id = ?').get('played').homeScore).toBe(3);
    expect(db.prepare('SELECT players FROM career_lineup WHERE careerId = ?').get('career').players).toBe('["player_1"]');
    const before = raw.export();
    expect(applyRealRosterSnapshot(db,snapshot,players,teams,()=>{throw new Error('Must not back up again');})).toBe(false);
    expect(raw.export()).toEqual(before);
  });
  it('replaces withdrawn future opponents without rewriting historical matches', () => {
    applyRealRosterSnapshot(db,snapshot,players,teams);
    db.exec("INSERT INTO careers (id,managerName,teamId,currentDate) VALUES ('career','Manager','team_1','2026-10-10'); INSERT INTO competitions (id,name,region,status) VALUES ('comp','Test event','Europe','scheduled'); INSERT INTO career_competitions (competitionId,careerId) VALUES ('comp','career'); INSERT INTO competition_entries (competitionId,teamId,seed) VALUES ('comp','team_3',1),('comp','team_1',2); INSERT INTO fixtures (id,competitionId,homeTeamId,awayTeamId,status,homeScore,awayScore) VALUES ('past','comp','team_1','team_3','completed',2,0),('future','comp','team_1','team_3','scheduled',0,0);");
    repairFutureRosterEntries(db,'career');
    expect(db.prepare('SELECT awayTeamId FROM fixtures WHERE id = ?').get('past').awayTeamId).toBe('team_3');
    const replacement = db.prepare('SELECT awayTeamId FROM fixtures WHERE id = ?').get('future').awayTeamId;
    expect(teams.some((t:any)=>t.id===replacement)).toBe(true);
    expect(db.prepare('SELECT id FROM generated_entities').all()).toHaveLength(0);
    expect(db.prepare('SELECT id FROM players WHERE teamId = ?').all(replacement)).toHaveLength(3);
    expect(db.prepare('SELECT teamId FROM competition_entries WHERE competitionId = ? AND teamId = ?').get('comp',replacement)).toBeTruthy();
    repairFutureRosterEntries(db,'career');
    expect(db.prepare('SELECT awayTeamId FROM fixtures WHERE id = ?').get('future').awayTeamId).toBe(replacement);
  });
  it('rejects conflicting roster assignments before taking a backup or changing data', () => {
    const broken = structuredClone(snapshot);
    broken.teams[1].starterIds[0]='player_1';
    expect(()=>applyRealRosterSnapshot(db,broken,players,teams,()=>{throw new Error('Backup must not happen');})).toThrow('duplicate');
    expect(db.prepare('SELECT id FROM teams').all()).toHaveLength(0);
  });
  it('archives invented identities but keeps historical scores and real career signings', () => {
    db.exec("INSERT INTO players (id,gamertag,teamId,overall) VALUES ('amateur_EU_4_p1','FluxEU41','team_1',80); INSERT INTO generated_entities VALUES ('amateur_EU_4_p1','player','Europe'); INSERT INTO contracts (id,playerId,teamId,isActive) VALUES ('fake','amateur_EU_4_p1','team_1',1);");
    applyRealRosterSnapshot(db,snapshot,players,teams);
    expect(db.prepare('SELECT teamId FROM players WHERE id = ?').get('amateur_EU_4_p1').teamId).toBeNull();
    expect(db.prepare('SELECT isActive FROM contracts WHERE id = ?').get('fake').isActive).toBe(0);
    expect(db.prepare('SELECT id FROM players WHERE id = ?').get('amateur_EU_4_p1')).toBeTruthy();
  });
  it('preserves earned improvements while replacing the old rating baseline exactly once', () => {
    const p=players.find((p:any)=>p.id==='player_12');
    db.exec("INSERT INTO careers (id,managerName,teamId) VALUES ('career','Coach','team_4');");
    db.prepare('INSERT INTO players (id,gamertag,overall,potential) VALUES (?,?,?,?)').run(p.id,p.gamertag,p.previousOverall+1,p.previousOverall+3);
    applyRealRosterSnapshot(db,snapshot,players,teams);
    expect(db.prepare('SELECT overall FROM players WHERE id = ?').get(p.id).overall).toBe(99);
    expect(db.prepare('SELECT baseline FROM player_rating_sources WHERE playerId = ?').get(p.id).baseline).toBe(98);
    expect(applyRealRosterSnapshot(db,snapshot,players,teams)).toBe(false);
  });
  it('never treats a fresh updated seed as earned training growth', () => {
    const p=players.find((p:any)=>p.id==='player_12');
    db.prepare('INSERT INTO players (id,gamertag,overall,potential) VALUES (?,?,?,?)').run(p.id,p.gamertag,p.overall,p.potential);
    applyRealRosterSnapshot(db,snapshot,players,teams);
    expect(db.prepare('SELECT overall FROM players WHERE id = ?').get(p.id).overall).toBe(98);
  });
});

describe('Real database source audit',()=>{
  it('contains thousands of source-backed real identities and no generated filler',()=>{
    expect(fullTeams.length).toBeGreaterThan(1500);
    expect(fullPlayers.length).toBeGreaterThan(4500);
    const byId=new Map(fullPlayers.map((p:any)=>[p.id,p]));
    const assigned=fullSnapshot.teams.flatMap((t:any)=>[...t.starterIds,...t.reserveIds,...(t.inactiveIds || [])]);
    expect(new Set(assigned).size).toBe(assigned.length);
    for (const t of fullSnapshot.teams) {
      expect(t.source).toMatch(/^https:\/\/(www\.)?(start\.gg|liquipedia\.net|blast\.tv)\//);
      expect(t.rosterDate).toMatch(/^2026-/);
      if(t.status==='active') expect(t.starterIds).toHaveLength(3);
      for (const id of t.starterIds) expect((byId.get(id) as any)?.teamId).toBe(t.id);
    }
    for(const p of fullPlayers) {
      expect(p.id).not.toMatch(/^(amateur_|academy_)/);
      expect(p.overall).toBeGreaterThanOrEqual(0); expect(p.overall).toBeLessThanOrEqual(99);
      expect(p.potential).toBeGreaterThanOrEqual(p.overall);
      if(p.ratingConfidence!=='unknown') expect(p.ratingSources.length).toBeGreaterThan(0);
      if(p.id.startsWith('sg_player_')) expect(p.age).toBeNull();
    }
    expect((byId.get('player_12') as any).overall).toBe(98);
  });
});

