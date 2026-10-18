import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { runMigration } from '../src/database/migrations/001_initial_schema';
import { PlayerInteractions } from '../src/main/player-interactions';
import { CareerManagement } from '../src/main/career-management';
import { DEFAULT_TACTICS, MATCH_ROLES } from '../src/game/tactics';
import { DEFAULT_TRAINING } from '../src/game/career-rules';

let SQL: any, raw: any, db: any, interactions: PlayerInteractions;
const adapter = (sql: any) => {
  let nested = false;
  return { exec: (s: string) => sql.exec(s), prepare: (s: string) => ({
    all: (...args: any[]) => { const st = sql.prepare(s); try { st.bind(args); const rows = []; while (st.step()) rows.push(st.getAsObject()); return rows; } finally { st.free(); } },
    get: (...args: any[]) => { const st = sql.prepare(s); try { st.bind(args); return st.step() ? st.getAsObject() : undefined; } finally { st.free(); } },
    run: (...args: any[]) => { sql.run(s, args); return { changes: sql.getRowsModified() }; },
  }), transaction: (fn: any) => () => { if (nested) return fn(); nested = true; sql.run('BEGIN'); try { const r = fn(); sql.run('COMMIT'); return r; } catch (e) { sql.run('ROLLBACK'); throw e; } finally { nested = false; } } };
};
beforeAll(async () => { SQL = await initSqlJs(); });
beforeEach(() => {
  raw = new SQL.Database(); db = adapter(raw); runMigration(db); interactions = new PlayerInteractions(db);
  db.exec(`INSERT INTO careers (id,managerName,teamId,currentDate) VALUES ('career','Coach','us','2026-10-01'),('other','Other','them','2026-10-01');
    INSERT INTO teams (id,name,region) VALUES ('us','Us','Europe'),('them','Them','Europe');
    INSERT INTO competitions (id,name) VALUES ('event','Series');
    INSERT INTO career_competitions (competitionId,careerId) VALUES ('event','career');
    INSERT INTO career_lineup VALUES ('career','["p0","p1","p2"]');`);
  for (let i = 0; i < 4; i++) {
    db.prepare('INSERT INTO players (id,gamertag,teamId,overall,morale,fatigue,form,preferredTendency) VALUES (?, ?, ?, 80, 70, 10, 70, ?)').run('p' + i, 'Player' + i, 'us', 'Balanced');
    db.prepare('INSERT INTO player_traits (playerId,confidence,pressureResistance,professionalism) VALUES (?, 65, ?, 70)').run('p' + i, i === 1 ? 30 : 70);
  }
  db.exec("INSERT INTO players (id,gamertag,teamId) VALUES ('enemy','Enemy','them')");
});
const date = (value: string) => db.prepare('UPDATE careers SET currentDate = ? WHERE id = ?').run(value, 'career');
const fixture = (id: string, status = 'completed') => {
  db.prepare('INSERT INTO fixtures (id,competitionId,homeTeamId,awayTeamId,scheduledDate,status,seriesFormat,homeScore,awayScore) VALUES (?, ?, ?, ?, ?, ?, ?, 2, 0)').run(id, 'event', 'us', 'them', '2026-10-01', status, 'BO3');
  return db.prepare('SELECT * FROM fixtures WHERE id = ?').get(id);
};
const concern = (topic: string, id = 'p0') => {
  if (topic === 'confidence') db.prepare('UPDATE players SET morale = 35 WHERE id = ?').run(id);
  if (topic === 'transfer') { interactions.overview('career'); db.prepare('UPDATE players SET morale = 30 WHERE id = ?').run(id); db.prepare('UPDATE manager_relationships SET trust = 20 WHERE playerId = ?').run(id); }
  if (topic === 'workload') { db.prepare('UPDATE players SET fatigue = 80 WHERE id = ?').run(id); db.prepare('INSERT INTO career_training VALUES (?, ?)').run('career', JSON.stringify(DEFAULT_TRAINING.map(d => ({ ...d, category: 'Mechanics', intensity: 'High' })))); }
  if (topic === 'tactics') { db.prepare("UPDATE players SET preferredTendency = 'Support' WHERE id = ?").run(id); db.prepare('INSERT INTO career_tactics VALUES (?, ?)').run('career', JSON.stringify({ ...DEFAULT_TACTICS, passingStyle: 'Solo Focus' })); }
  return interactions.overview('career').conversations.find((c: any) => c.playerId === id && c.topic === topic);
};

describe('Player conversations, relationships and promises', () => {
  it('uses the saved lineup order for legacy roles instead of rating order',()=>{
    db.exec("UPDATE players SET overall=93,preferredTendency='STRIKER' WHERE id='p0'; UPDATE players SET overall=98 WHERE id='p1'; UPDATE players SET overall=96 WHERE id='p2'");
    db.prepare('INSERT INTO career_tactics VALUES (?,?)').run('career',JSON.stringify(DEFAULT_TACTICS));
    const state=interactions.overview('career');
    expect(state.conversations.find((c:any)=>c.playerId==='p0'&&c.topic==='tactics')).toBeUndefined();
    const management=new CareerManagement(db);
    const plan=management.tactics('career');
    expect(plan.rolesByPlayer.p0).toBe(MATCH_ROLES[0]);
    db.exec(`UPDATE career_lineup SET players='["p2","p1","p0"]' WHERE careerId='career'`);
    expect(management.tactics('career').rolesByPlayer.p0).toBe(MATCH_ROLES[0]);
    expect(interactions.overview('career').conversations.find((c:any)=>c.playerId==='p0'&&c.topic==='tactics')).toBeUndefined();
  });
  it('resolves an old defensive-role complaint when the player is already an attacker',()=>{
    db.exec("UPDATE players SET preferredTendency='STRIKER' WHERE id='p0'");
    db.prepare('INSERT INTO career_tactics VALUES (?,?)').run('career',JSON.stringify({...DEFAULT_TACTICS,roles:{...DEFAULT_TACTICS.roles,0:MATCH_ROLES[2]}}));
    const chat=interactions.overview('career').conversations.find((c:any)=>c.playerId==='p0'&&c.topic==='tactics');
    expect(chat.status).toBe('pending');
    db.prepare('UPDATE career_tactics SET plan=? WHERE careerId=?').run(JSON.stringify({...DEFAULT_TACTICS,rolesByPlayer:{p0:MATCH_ROLES[0],p1:MATCH_ROLES[1],p2:MATCH_ROLES[2]}}),'career');
    expect(interactions.overview('career').conversations.find((c:any)=>c.id===chat.id).status).toBe('resolved');
  });
  it('restores the lifecycle of an existing transfer request without duplicating it',()=>{
    const chat=concern('transfer');interactions.reply('career',chat.id,'refuse');
    db.exec("DELETE FROM player_unrest WHERE careerId='career' AND playerId='p0'");
    const before=db.prepare('SELECT COUNT(*) AS count FROM inbox_items').get().count;
    const state=interactions.overview('career');
    expect(state.players.find((p:any)=>p.id==='p0')).toMatchObject({transferRequested:1,requestedDate:'2026-10-01',requestStatus:'refused'});
    expect(db.prepare('SELECT COUNT(*) AS count FROM inbox_items').get().count).toBe(before);
    expect(state.conversations.filter((c:any)=>c.playerId==='p0'&&c.topic==='transfer')).toHaveLength(1);
  });
  it('records an official transfer request before approval and keeps it after refusal or reload',()=>{
    const chat=concern('transfer');
    expect(interactions.overview('career').players.find((p:any)=>p.id==='p0').transferRequested).toBe(1);
    expect(db.prepare('SELECT requestStatus,requestedDate FROM player_unrest WHERE careerId=? AND playerId=?').get('career','p0')).toMatchObject({requestStatus:'requested',requestedDate:'2026-10-01'});
    interactions.reply('career',chat.id,'refuse');
    const restored=new PlayerInteractions(adapter(new SQL.Database(raw.export())) as any);
    expect(restored.overview('career').players.find((p:any)=>p.id==='p0')).toMatchObject({transferRequested:1,requestStatus:'refused'});
    expect(db.prepare('SELECT * FROM transfer_listings').all()).toHaveLength(0);
    expect(db.prepare("SELECT teamId FROM players WHERE id='p0'").get().teamId).toBe('us');
  });
  it('escalates sustained ignored exhaustion, not a single tired day',()=>{
    concern('workload');
    expect(interactions.overview('career').players.find((p:any)=>p.id==='p0').transferRequested).toBe(0);
    date('2026-10-08');interactions.tick('career');
    date('2026-10-15');const state=interactions.overview('career');
    const request=state.conversations.find((c:any)=>c.playerId==='p0'&&c.topic==='transfer');
    expect(request).toBeTruthy();expect(request.transcript[0].text).toContain('exhausted for weeks');
    expect(state.players.find((p:any)=>p.id==='p0').transferRequested).toBe(1);
    expect(interactions.overview('career').conversations.filter((c:any)=>c.playerId==='p0'&&c.topic==='transfer')).toHaveLength(1);
  });
  it('lists accepted requests without punishment and withdraws them after real recovery',()=>{
    const chat=concern('transfer');const before=db.prepare("SELECT morale FROM players WHERE id='p0'").get().morale;
    interactions.reply('career',chat.id,'transfer');
    expect(db.prepare("SELECT morale FROM players WHERE id='p0'").get().morale).toBeGreaterThanOrEqual(before);
    expect(db.prepare("SELECT playerId FROM transfer_listings WHERE careerId='career'").get().playerId).toBe('p0');
    db.exec("UPDATE players SET morale=75,fatigue=10 WHERE id='p0';UPDATE player_traits SET confidence=70 WHERE playerId='p0';UPDATE manager_relationships SET trust=70 WHERE careerId='career' AND playerId='p0'");
    date('2026-10-09');const recovered=interactions.overview('career').players.find((p:any)=>p.id==='p0');
    expect(recovered).toMatchObject({transferRequested:0,requestStatus:'withdrawn'});
    expect(db.prepare('SELECT * FROM transfer_listings').all()).toHaveLength(0);
    expect(db.prepare("SELECT teamId FROM players WHERE id='p0'").get().teamId).toBe('us');
  });
  it('escalates sustained unhappiness but not low confidence on its own',()=>{
    concern('confidence');date('2026-10-08');interactions.tick('career');
    date('2026-10-15');expect(interactions.overview('career').players.find((p:any)=>p.id==='p0').transferRequested).toBe(1);
    db.exec("UPDATE player_traits SET confidence=20 WHERE playerId='p1'");
    date('2026-10-30');expect(interactions.overview('career').players.find((p:any)=>p.id==='p1').transferRequested).toBe(0);
  });
  it('sends a concern to the inbox once, preserves it after reload and resolves it only once', () => {
    const c = concern('confidence');
    expect(c.status).toBe('pending'); interactions.overview('career');
    expect(db.prepare('SELECT id FROM inbox_items').all()).toHaveLength(1);
    const restored = new PlayerInteractions(adapter(new SQL.Database(raw.export())) as any);
    expect(restored.overview('career').conversations[0].id).toBe(c.id);
    interactions.reply('career', c.id, 'reassure');
    expect(interactions.overview('career').players.find((p: any) => p.id === 'p0')!.trust).toBe(53);
    expect(() => interactions.reply('career', c.id, 'reassure')).toThrow('no longer');
  });
  it('ignoring a concern reduces trust once, and a cooldown prevents daily duplicates', () => {
    const c = concern('confidence'); date('2026-10-08'); interactions.tick('career');
    const after = interactions.overview('career'); expect(after.conversations[0].status).toBe('ignored');
    expect(after.players.find((p: any) => p.id === 'p0')!.trust).toBe(45);
    interactions.tick('career'); expect(interactions.overview('career').conversations).toHaveLength(1);
    expect(() => interactions.reply('career', c.id, 'reassure')).toThrow();
  });
  it('blocks other clubs, other careers, invalid responses and private-meeting spam', () => {
    expect(() => interactions.chat('career', 'enemy', 'praise')).toThrow('current players');
    const c = concern('confidence'); expect(() => interactions.reply('other', c.id, 'reassure')).toThrow('no longer');
    expect(() => interactions.reply('career', c.id, 'transfer')).toThrow('available');
    expect(() => interactions.chat('career', 'p0', 'support')).toThrow('existing concern');
    interactions.chat('career', 'p1', 'praise'); expect(() => interactions.chat('career', 'p1', 'praise')).toThrow('week');
    date('2026-10-08'); interactions.chat('career', 'p1', 'tactics');
  });
  it('bench time uses completed series and real appearances, not just the selected lineup', () => {
    for (let i = 0; i < 3; i++) {
      const f = fixture('f' + i);
      db.prepare('INSERT INTO game_results (id,fixtureId,gameNumber) VALUES (?, ?, 1)').run('g' + i, f.id);
      for (const id of ['p0','p1','p3']) db.prepare('INSERT INTO game_player_stats (id,gameResultId,playerId) VALUES (?, ?, ?)').run('s' + i + id, 'g' + i, id);
      new CareerManagement(db).resultStory('career', f);
    }
    const chats = interactions.overview('career').conversations;
    expect(chats.find((c: any) => c.playerId === 'p2')!.topic).toBe('playing_time');
    expect(chats.some((c: any) => c.playerId === 'p3')).toBe(false);
    interactions.reviewSeries('career', db.prepare('SELECT * FROM fixtures WHERE id = ?').get('f2'));
    expect(db.prepare('SELECT * FROM interaction_series').all()).toHaveLength(3);
  });
  it('a playing-time promise is fulfilled by three later starts and survives save/reload', () => {
    for (let i = 0; i < 3; i++) interactions.reviewSeries('career', fixture('before' + i));
    const c = interactions.overview('career').conversations.find((c: any) => c.playerId === 'p3')!;
    interactions.reply('career', c.id, 'playing_time');
    db.prepare('UPDATE career_lineup SET players = ? WHERE careerId = ?').run('["p0","p1","p3"]', 'career');
    const restored = new PlayerInteractions(adapter(new SQL.Database(raw.export())) as any);
    expect(restored.overview('career').promises[0].status).toBe('pending');
    for (let i = 0; i < 3; i++) interactions.reviewSeries('career', fixture('after' + i));
    const state = interactions.overview('career'); expect(state.promises[0].status).toBe('kept');
    expect(state.players.find((p: any) => p.id === 'p3')!.trust).toBe(59);
  });
  it('new signings do not complain about being benched before they joined the squad', () => {
    for (let i = 0; i < 3; i++) interactions.reviewSeries('career', fixture('before' + i));
    db.exec("INSERT INTO players (id,gamertag,teamId,overall,morale) VALUES ('new','New signing','us',70,70)");
    expect(interactions.overview('career').conversations.some((c: any) => c.playerId === 'new')).toBe(false);
  });
  it('broken promises cost trust once at the deadline even without scheduled matches', () => {
    const c = concern('workload'); interactions.reply('career', c.id, 'workload'); date('2026-10-09');
    const state = interactions.overview('career'); expect(state.promises[0].status).toBe('broken');
    expect(state.players.find((p: any) => p.id === 'p0')!.trust).toBe(39);
    interactions.tick('career'); expect(interactions.overview('career').players.find((p: any) => p.id === 'p0')!.trust).toBe(39);
  });
  it('workload promises require lighter training, and tactical promises require resolving the disagreement', () => {
    const c = concern('workload'); interactions.reply('career', c.id, 'workload');
    db.prepare('UPDATE career_training SET schedule = ?').run(JSON.stringify(DEFAULT_TRAINING));
    expect(interactions.overview('career').promises[0].status).toBe('kept');
    const tactical = concern('tactics', 'p1'); interactions.reply('career', tactical.id, 'tactics');
    db.prepare('UPDATE career_tactics SET plan = ?').run(JSON.stringify({ ...DEFAULT_TACTICS, passingStyle: 'Solo Focus', demoFreq: 'High' }));
    expect(interactions.overview('career').promises[0].status).toBe('pending');
    db.prepare('UPDATE career_tactics SET plan = ?').run(JSON.stringify(DEFAULT_TACTICS));
    expect(interactions.overview('career').promises[0].status).toBe('kept');
  });
  it('allows fulfilling a promise on its due date and uses the lineup captured before a series', () => {
    const c = concern('workload'); interactions.reply('career', c.id, 'workload'); date('2026-10-08');
    expect(interactions.overview('career').promises[0].status).toBe('pending');
    db.prepare('UPDATE career_training SET schedule = ?').run(JSON.stringify(DEFAULT_TRAINING));
    expect(interactions.overview('career').promises[0].status).toBe('kept');
    const f = fixture('match'); interactions.captureStarters('career', f.id);
    db.prepare('UPDATE career_lineup SET players = ?').run('["p0","p1","p3"]');
    interactions.reviewSeries('career', f);
    expect(JSON.parse(db.prepare('SELECT starters FROM interaction_series WHERE fixtureId = ?').get(f.id).starters)).toEqual(['p0','p1','p2']);
  });
  it('a transfer request is recorded without moving the player; leaving cancels unresolved promises', () => {
    const c = concern('transfer'); interactions.reply('career', c.id, 'transfer');
    expect(interactions.overview('career').players.find((p: any) => p.id === 'p0')!.transferRequested).toBe(1);
    expect(db.prepare('SELECT teamId FROM players WHERE id = ?').get('p0').teamId).toBe('us');
    const other = concern('workload', 'p1'); interactions.reply('career', other.id, 'workload');
    db.exec("UPDATE players SET teamId = 'them' WHERE id = 'p1'");
    expect(interactions.overview('career').promises[0].status).toBe('cancelled');
  });
});
describe('Pregame and postgame team talks', () => {
  it('allows one pregame talk before play starts, with individual reactions', () => {
    fixture('match', 'scheduled'); const result = interactions.teamTalk('career', 'match', 'pregame', 'challenge');
    expect(result.reactions.find(r => r.playerId === 'p0')!.confidence).toBeGreaterThan(0);
    expect(result.reactions.find(r => r.playerId === 'p1')!.confidence).toBeLessThan(0);
    expect(() => interactions.teamTalk('career', 'match', 'pregame', 'encourage')).toThrow('already');
    const restored = new PlayerInteractions(adapter(new SQL.Database(raw.export())) as any);
    expect(restored.talks('career', 'match').talks[0].tone).toBe('challenge');
  });
  it('blocks future fixtures, ongoing games, other careers and halftime talks', () => {
    fixture('match', 'scheduled'); db.exec("UPDATE fixtures SET scheduledDate = '2026-10-03'");
    expect(() => interactions.teamTalk('career', 'match', 'pregame', 'focus')).toThrow('not available');
    date('2026-10-03'); db.exec("INSERT INTO game_results (id,fixtureId) VALUES ('game','match')");
    expect(() => interactions.teamTalk('career', 'match', 'pregame', 'focus')).toThrow('not available');
    expect(() => interactions.teamTalk('other', 'match', 'postgame', 'praise')).toThrow('does not belong');
    expect(() => interactions.teamTalk('career', 'match', 'halftime', 'focus')).toThrow('before or after');
  });
  it('postgame talks follow completion and cannot farm old results', () => {
    fixture('match', 'scheduled'); expect(() => interactions.teamTalk('career', 'match', 'postgame', 'praise')).toThrow('not available');
    db.exec("UPDATE fixtures SET status = 'completed'");
    const result = interactions.teamTalk('career', 'match', 'postgame', 'praise'); expect(result.body).toContain('earned that series');
    expect(() => interactions.teamTalk('career', 'match', 'postgame', 'reassure')).toThrow('already');
    fixture('old'); date('2026-10-09'); expect(() => interactions.teamTalk('career', 'old', 'postgame', 'praise')).toThrow('not available');
  });
});
