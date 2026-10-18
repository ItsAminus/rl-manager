import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { runMigration } from '../src/database/migrations/001_initial_schema';
import { CareerManagement } from '../src/main/career-management';
import { ensurePlayableRoster } from '../src/main/amateur-pool';
import { addDays, contractOfferScore, socialImpact, transferWindow, wageDemands } from '../src/game/career-rules';
import { DEFAULT_TACTICS, tacticalAdjustment } from '../src/game/tactics';
import { OutgoingTransfers } from '../src/main/outgoing-transfers';

let SQL: any;
let raw: any, db: any, management: CareerManagement;
function adapter(sql: any) {
  let nested = false;
  return { exec: (s: string) => sql.exec(s), prepare: (s: string) => ({
    all: (...args: any[]) => { const stmt = sql.prepare(s); stmt.bind(args); const rows = []; while (stmt.step()) rows.push(stmt.getAsObject()); stmt.free(); return rows; },
    get: (...args: any[]) => { const stmt = sql.prepare(s); stmt.bind(args); const row = stmt.step() ? stmt.getAsObject() : undefined; stmt.free(); return row; },
    run: (...args: any[]) => { sql.run(s, args); return { changes: sql.getRowsModified(), lastInsertRowid: 0 }; },
  }), transaction: (fn: any) => () => { if (nested) return fn(); nested = true; sql.run('BEGIN'); try { const result = fn(); sql.run('COMMIT'); return result; } catch (e) { sql.run('ROLLBACK'); throw e; } finally { nested = false; } } };
}
beforeAll(async () => { SQL = await initSqlJs(); });
beforeEach(() => {
  raw = new SQL.Database(); db = adapter(raw); runMigration(db); management = new CareerManagement(db);
  db.exec(`INSERT INTO careers VALUES ('career', 'Manager', 'us', 'Europe', 'Normal', '2025-09-01', '', '');
    INSERT INTO seasons VALUES ('season', 'career', 1, '2025-09-01', '2026-06-30', 1);
    INSERT INTO teams (id, name, region, reputation, budget, cashBalance, coachRating, facilityLevel, sponsorIncome, teamForm) VALUES ('us', 'Our Team', 'Europe', 90, 500000, 500000, 80, 2, 1000, 60), ('them', 'Other Team', 'Europe', 85, 100000, 100000, 60, 1, 1000, 60);
    INSERT INTO settings VALUES ('amateur_pool_v1', 'true');`);
  for (const team of ['us', 'them']) for (let i = 0; i < 3; i++) {
    const id = team + i;
    db.prepare('INSERT INTO players (id, gamertag, teamId, region, age, overall, potential, morale, fatigue, reputation, form, preferredTendency, marketValue) VALUES (?, ?, ?, ?, 19, 80, 85, 70, 0, 50, 60, ?, 50000)').run(id, id, team, 'Europe', 'Playmaker');
    db.prepare('INSERT INTO player_traits (playerId, confidence, pressureResistance, tiltTendency, developmentRate, professionalism) VALUES (?, 60, 60, 40, 70, 70)').run(id);
    db.prepare('INSERT INTO player_attributes (playerId, mechanical, groundControl, aerial, recovery, shooting, shotAccuracy, passing, rotations, positioning, gameSense, clutch, defense, goalkeeping, boostManagement, speed) VALUES (?, 80,80,80,80,80,80,80,80,80,80,80,80,80,80,80)').run(id);
  }
});
function fixture(id = 'match', away = false) {
  db.exec("INSERT OR IGNORE INTO competitions (id, name, type, status, config) VALUES ('event','Test Event','REGIONAL','scheduled','{}'); INSERT OR IGNORE INTO career_competitions VALUES ('event','career','REGIONAL',1,'2025-09-01','[]'); INSERT OR IGNORE INTO competition_entries (competitionId,teamId) VALUES ('event','us'),('event','them');");
  db.prepare('INSERT INTO fixtures (id, competitionId, homeTeamId, awayTeamId, scheduledDate, status, seriesFormat) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, 'event', away ? 'them' : 'us', away ? 'us' : 'them', '2025-09-01', 'scheduled', 'BO3');
}
describe('outgoing club negotiations',()=>{
  const reserve=()=>db.exec("INSERT INTO players (id,gamertag,teamId,region,overall,potential,marketValue,form,morale,reputation) VALUES ('reserve','Reserve','us','Europe',80,85,50000,60,70,50)");
  const offer=(id='consenting-offer')=>db.prepare("INSERT INTO outgoing_offers (id,careerId,playerId,sellerId,buyerId,fee,ceiling,salary,bonus,duration,status,createdDate,expiresDate,rounds) VALUES (?,'career','us0','us','them',30000,55000,11000,20000,12,'pending','2025-09-01','2025-09-06',0)").run(id);
  const date=(d:string)=>db.prepare('UPDATE careers SET currentDate=?').run(d);
  it('lists only own players, once, and validates money',()=>{
    const sales=new OutgoingTransfers(db);
    expect(()=>sales.list('career','them0',50000,true)).toThrow('own club');
    expect(()=>sales.list('career','us0',NaN,true)).toThrow('whole-dollar');
    sales.list('career','us0',50000,true);sales.list('career','us0',60000,true);
    expect(sales.overview('career').listings).toHaveLength(1);
    expect(db.prepare('SELECT morale FROM players WHERE id=?').get('us0').morale).toBe(66);
  });
  it('allows listings all year but expires offers at window closure',()=>{
    const sales=new OutgoingTransfers(db);offer();date('2025-11-01');sales.list('career','us0',50000,true);sales.tick('career');
    expect(sales.overview('career').offers[0].status).toBe('expired');
    expect(sales.overview('career').listings).toHaveLength(1);
  });
  it('waits for the buyer to consider a counter and withdraws above valuation',()=>{
    const sales=new OutgoingTransfers(db);offer();sales.respond('career','consenting-offer','counter',60000);
    expect(()=>sales.respond('career','consenting-offer','accept')).toThrow('Wait');
    date('2025-09-02');sales.tick('career');
    expect(sales.overview('career').offers[0].status).toBe('withdrawn');
    expect(db.prepare('SELECT teamId FROM players WHERE id=?').get('us0').teamId).toBe('us');
  });
  it('returns an accepted counter for manager approval, without an instant sale',()=>{
    const sales=new OutgoingTransfers(db);reserve();offer();sales.respond('career','consenting-offer','counter',45000);
    date('2025-09-02');sales.tick('career');expect(sales.overview('career').offers[0].status).toBe('pending');
    sales.respond('career','consenting-offer','accept');expect(sales.overview('career').offers[0].status).toBe('player_talks');
    expect(db.prepare('SELECT teamId FROM players WHERE id=?').get('us0').teamId).toBe('us');
  });
  it('agrees a fee with three players but holds completion for a replacement',()=>{
    const sales=new OutgoingTransfers(db);offer();db.exec("UPDATE teams SET reputation=100 WHERE id='them'");
    const response=sales.respond('career','consenting-offer','accept');
    expect(response.message).toContain('replacement');date('2025-09-03');sales.tick('career');
    expect(sales.overview('career').offers[0].status).toBe('player_talks');
    expect(db.prepare("SELECT COUNT(*) n FROM players WHERE teamId='us'").get().n).toBe(3);
    reserve();sales.tick('career');expect(sales.overview('career').offers[0].status).toBe('completed');
  });
  it('holds actual completion and lineup changes during a series, but allows fee talks',()=>{
    const sales=new OutgoingTransfers(db);offer();reserve();fixture();db.exec("UPDATE fixtures SET status='in_progress';UPDATE teams SET reputation=100 WHERE id='them'");
    expect(sales.respond('career','consenting-offer','accept').success).toBe(true);
    date('2025-09-03');sales.tick('career');expect(sales.overview('career').offers[0].reason).toContain('series');
    expect(()=>management.setLineup('career',['us0','us1','reserve'])).toThrow('series');
    db.exec("UPDATE fixtures SET status='completed'");sales.tick('career');expect(sales.overview('career').offers[0].status).toBe('completed');
  });
  it('resolves deadline-day agreement today and survives a save reload',()=>{
    const sales=new OutgoingTransfers(db);offer();reserve();date('2025-10-31');
    db.exec("UPDATE outgoing_offers SET expiresDate='2025-10-31';UPDATE teams SET reputation=100 WHERE id='them'");
    expect(sales.respond('career','consenting-offer','accept').status).toBe('completed');
    const restored = new OutgoingTransfers(adapter(new SQL.Database(raw.export())) as any);
    expect(restored.overview('career').offers[0].status).toBe('completed');
    expect(db.prepare("SELECT cashBalance FROM teams WHERE id='us'").get().cashBalance).toBe(530000);
  });
  it('completes a held deadline sale when a replacement signs on the same day',()=>{
    const sales=new OutgoingTransfers(db);offer();date('2025-10-31');
    db.exec("UPDATE outgoing_offers SET expiresDate='2025-10-31';UPDATE teams SET reputation=100 WHERE id='them'");
    expect(sales.respond('career','consenting-offer','accept').status).toBe('player_talks');
    const d=management.signingQuote('career','them0').demands;
    management.sign('career','them0',{salary:d.salary,bonus:d.bonus,duration:12,buyout:50000});
    expect(sales.overview('career').offers[0].status).toBe('completed');
    expect(db.prepare("SELECT COUNT(*) n FROM players WHERE teamId='us'").get().n).toBe(3);
  });
  it('completes an agreed sale atomically and removes old contracts and lineup',()=>{
    const sales=new OutgoingTransfers(db);reserve();offer();db.exec("UPDATE teams SET reputation=100 WHERE id='them';INSERT INTO contracts (id,playerId,teamId,salary,isActive) VALUES ('old','us0','us',8000,1)");
    management.setLineup('career',['us0','us1','reserve']);sales.respond('career','consenting-offer','accept');date('2025-09-03');sales.tick('career');
    expect(sales.overview('career').offers[0].status).toBe('completed');
    expect(db.prepare('SELECT cashBalance FROM teams WHERE id=?').get('us').cashBalance).toBe(530000);
    expect(db.prepare('SELECT cashBalance FROM teams WHERE id=?').get('them').cashBalance).toBe(39000);
    expect(db.prepare('SELECT teamId FROM players WHERE id=?').get('us0').teamId).toBe('them');
    expect(db.prepare('SELECT isActive FROM contracts WHERE id=?').get('old').isActive).toBe(0);
    expect(db.prepare('SELECT type FROM transfers WHERE playerId=?').get('us0').type).toBe('sale');
    expect(db.prepare('SELECT * FROM career_lineup').all()).toHaveLength(0);
  });
  it('player can decline a wage cut despite club agreement',()=>{
    const sales=new OutgoingTransfers(db);reserve();offer();db.exec("INSERT INTO contracts (id,playerId,teamId,salary,isActive) VALUES ('old','us0','us',50000,1)");
    sales.respond('career','consenting-offer','accept');date('2025-09-03');sales.tick('career');
    expect(sales.overview('career').offers[0].status).toBe('failed');expect(db.prepare('SELECT teamId FROM players WHERE id=?').get('us0').teamId).toBe('us');
    expect(db.prepare('SELECT * FROM transfers').all()).toHaveLength(0);
  });
  it('withdrawal cancels pending negotiations and prevents a later transfer',()=>{
    const sales=new OutgoingTransfers(db);reserve();offer();sales.list('career','us0',50000,true);sales.respond('career','consenting-offer','accept');sales.list('career','us0',0,false);
    date('2025-09-03');sales.tick('career');expect(sales.overview('career').offers[0].status).toBe('withdrawn');expect(db.prepare('SELECT * FROM transfers').all()).toHaveLength(0);
  });
  it('generates affordable interest on calendar days without rerolling or duplicating offers',()=>{
    const sales=new OutgoingTransfers(db);
    db.exec("UPDATE teams SET cashBalance=1000000 WHERE id='them'");
    sales.list('career','us0',40000,true);
    for(const d of ['2025-09-01','2025-09-08','2025-09-15','2025-09-22','2025-09-29']){
      date(d);sales.tick('career');if(sales.overview('career').offers.some((o:any)=>o.status==='pending'))break;
    }
    const offers=sales.overview('career').offers, pending=offers.find((o:any)=>o.status==='pending');
    expect(pending).toBeDefined();expect(pending.fee+pending.salary+pending.bonus).toBeLessThanOrEqual(1000000);
    sales.tick('career');expect(sales.overview('career').offers).toHaveLength(offers.length);
    expect(db.prepare("SELECT id FROM inbox_items WHERE type='transfer_offer'").all().length).toBeGreaterThan(1);
  });
  it('does not make unaffordable offers or penalize repeated listing changes',()=>{
    const sales=new OutgoingTransfers(db);db.exec("UPDATE teams SET cashBalance=100 WHERE id='them'");
    sales.list('career','us0',40000,true);sales.tick('career');
    expect(sales.overview('career').offers).toHaveLength(0);
  });
});
describe('Career rules and persistence', () => {
  it('fills vacancies with real available players only during the transfer window',()=>{
    db.exec("DELETE FROM players WHERE id='them2'; INSERT INTO players (id,gamertag,region,overall,teamId) VALUES ('available','Real test free agent','Europe',80,NULL); INSERT INTO player_affiliations (playerId,status) VALUES ('available','free_agent');");
    expect(ensurePlayableRoster(db,'them','2025-11-01')).toBe(false);
    expect(ensurePlayableRoster(db,'them','2026-01-01')).toBe(true);
    expect(db.prepare('SELECT teamId FROM players WHERE id = ?').get('available').teamId).toBe('them');
    expect(db.prepare('SELECT id FROM generated_entities').all()).toHaveLength(0);
    expect(db.prepare('SELECT note FROM player_affiliations WHERE playerId = ?').get('available').note).toContain('career simulation');
  });
  it('blocks match launch with incomplete managed or opponent rosters',()=>{
    fixture(); db.exec("DELETE FROM players WHERE id='us2'");
    expect(()=>management.assertFixture('career','match')).toThrow('three real players');
    db.exec("INSERT INTO players (id,gamertag,teamId) VALUES ('us2','us2','us'); DELETE FROM players WHERE id='them2'");
    expect(()=>management.assertFixture('career','match')).toThrow('opponent');
  });
  it('saves valid tactics and rewards plans that suit player attributes', () => {
    const plan = { ...DEFAULT_TACTICS, overallStyle: 'Aggressive' };
    management.saveTactics('career', plan);
    expect(management.tactics('career').overallStyle).toBe('Aggressive');
    expect(() => management.saveTactics('career', { ...plan, rotation: 'Invalid' })).toThrow('valid tactics');
    const players = [{ overall: 70, attributes: { shooting: 90, defense: 40 } }];
    expect(tacticalAdjustment(players, plan)).toBeGreaterThan(tacticalAdjustment(players, { ...plan, overallStyle: 'Defensive' }));
  });
  it('persists a chosen lineup and removes departed players from its order', () => {
    management.setLineup('career', ['us2', 'us0', 'us1']);
    expect(management.roster('career', 'us').map(p => p.id)).toEqual(['us2', 'us0', 'us1']);
    expect(() => management.setLineup('career', ['us0', 'us0', 'them1'])).toThrow('three different');
    const restored = new CareerManagement(adapter(new SQL.Database(raw.export())) as any);
    expect(restored.roster('career', 'us')[0].id).toBe('us2');
    db.exec("UPDATE players SET teamId = 'them' WHERE id = 'us2'");
    expect(management.roster('career', 'us').map(p => p.id)).toEqual(['us0', 'us1']);
  });
  it('records away-fixture games atomically, rejects invalid stats and prevents extra games', () => {
    fixture('away', true);
    const result = { fixtureId: 'away', gameNumber: 1, blueTeamId: 'us', orangeTeamId: 'them', blueScore: 3, orangeScore: 1, playerStats: [{ playerId: 'us0', goals: 3, assists: 0, saves: 1, shots: 3, demos: 0, score: 400 }] };
    expect(() => management.recordGame('career', { ...result, playerStats: [{ ...result.playerStats[0], score: -1 }] })).toThrow('statistics');
    expect(db.prepare('SELECT * FROM game_results').all()).toHaveLength(0);
    management.recordGame('career', result);
    expect(db.prepare('SELECT * FROM game_player_stats').all()).toHaveLength(1);
    expect(() => management.recordGame('career', result)).toThrow('recorded in order');
    management.recordGame('career', { ...result, gameNumber: 2 });
    expect(() => management.recordGame('career', { ...result, gameNumber: 3 })).toThrow('already has a winner');
    expect(db.prepare('SELECT * FROM game_results').all()).toHaveLength(2);
  });
  it('saves a played game and away series score before any UI acknowledgement, once only',()=>{
    fixture('played-away',true);
    const result={fixtureId:'played-away',gameNumber:1,blueTeamId:'us',orangeTeamId:'them',blueScore:5,orangeScore:2,playerStats:[{playerId:'us0',goals:5,assists:0,saves:1,shots:7,demos:0,score:600}]};
    const saved=management.recordPlayedGame('career',result);
    expect(management.recordPlayedGame('career',result).id).toBe(saved.id);
    expect(db.prepare("SELECT homeScore,awayScore,status FROM fixtures WHERE id='played-away'").get()).toEqual({homeScore:0,awayScore:1,status:'in_progress'});
    expect(db.prepare('SELECT * FROM game_results').all()).toHaveLength(1);
    expect(db.prepare('SELECT * FROM game_player_stats').all()).toHaveLength(1);
    const last={...result,gameNumber:2};
    expect(management.recordPlayedGame('career',last).seriesComplete).toBe(true);
    const messageCount=db.prepare('SELECT COUNT(*) n FROM inbox_items').get().n;
    management.recordPlayedGame('career',last);
    expect(db.prepare('SELECT COUNT(*) n FROM inbox_items').get().n).toBe(messageCount);
    const restored=new CareerManagement(adapter(new SQL.Database(raw.export())) as any);
    expect(restored.recordPlayedGame('career',last).seriesComplete).toBe(true);
    expect(db.prepare("SELECT homeScore,awayScore,status FROM fixtures WHERE id='played-away'").get()).toEqual({homeScore:0,awayScore:2,status:'completed'});
  });
  it('never overwrites a simulated or conflicting game during played-result recovery',()=>{
    fixture();
    const r={fixtureId:'match',gameNumber:1,blueTeamId:'us',orangeTeamId:'them',blueScore:3,orangeScore:1,playerStats:[]};
    management.recordGame('career',r);
    expect(()=>management.recordPlayedGame('career',r)).toThrow('different result');
    expect(db.prepare('SELECT blueScore FROM game_results').get().blueScore).toBe(3);
    db.exec('DELETE FROM game_results');
    management.recordPlayedGame('career',r);
    expect(()=>management.recordPlayedGame('career',{...r,blueScore:4})).toThrow('different result');
    expect(db.prepare('SELECT blueScore FROM game_results').get().blueScore).toBe(3);
  });
  it('enforces both transfer windows at their exact boundaries', () => {
    for (const date of ['2025-09-01', '2025-10-31', '2026-01-01', '2026-01-31']) expect(transferWindow(date).open).toBe(true);
    for (const date of ['2025-08-31', '2025-11-01', '2026-02-01']) expect(transferWindow(date).open).toBe(false);
  });
  it('allows only the managed team, due fixtures, and earned entry; away matches work', () => {
    fixture('away', true); expect(management.assertFixture('career', 'away').awayTeamId).toBe('us');
    db.prepare('UPDATE careers SET teamId = ? WHERE id = ?').run('stranger', 'career');
    expect(() => management.assertFixture('career', 'away')).toThrow('only manage your own team');
    db.prepare('UPDATE careers SET teamId = ? WHERE id = ?').run('us', 'career');
    db.exec("DELETE FROM competition_entries WHERE teamId = 'us'");
    expect(() => management.assertFixture('career', 'away')).toThrow('not qualified');
    db.exec("INSERT INTO competition_entries (competitionId, teamId) VALUES ('event','us'); UPDATE fixtures SET scheduledDate = '2025-09-02'");
    expect(() => management.assertFixture('career', 'away')).toThrow('Advance the calendar');
  });
  it('never skips an unresolved managed series', () => {
    fixture(); const result = management.advance('career', '2025-09-10');
    expect(result.newDate).toBe('2025-09-01'); expect(result.blockedFixtureId).toBe('match');
  });
  it('signs atomically using career dates and deducts fee, bonus and first wage', () => {
    const p = db.prepare("SELECT * FROM players WHERE id = 'them0'").get(); const demands = wageDemands(p);
    db.exec("INSERT INTO contracts (id, playerId, teamId, salary, buyout, isActive) VALUES ('old','them0','them',5000,50000,1)");
    management.sign('career', p.id, { salary: demands.salary, bonus: demands.bonus, duration: 24, buyout: 150000 });
    expect(db.prepare('SELECT teamId FROM players WHERE id = ?').get(p.id).teamId).toBe('us');
    const contracts = db.prepare('SELECT * FROM contracts WHERE playerId = ? AND isActive = 1').all(p.id);
    expect(contracts).toHaveLength(1); expect(contracts[0].startDate).toBe('2025-09-01'); expect(contracts[0].endDate).toBe('2027-09-01');
    expect(db.prepare("SELECT cashBalance FROM teams WHERE id = 'us'").get().cashBalance).toBe(500000 - 50000 - demands.bonus - demands.salary);
    expect(db.prepare("SELECT cashBalance FROM teams WHERE id = 'them'").get().cashBalance).toBe(150000);
    expect(db.prepare("SELECT id FROM players WHERE teamId = 'them'").all()).toHaveLength(2);
    expect(db.prepare("SELECT id FROM generated_entities WHERE kind = 'player'").all()).toHaveLength(0);
  });
  it('rejects closed-window and unaffordable deals without partial writes', () => {
    const p = db.prepare("SELECT * FROM players WHERE id = 'them0'").get(), d = wageDemands(p);
    const offer = { salary: d.salary, bonus: d.bonus, duration: 12, buyout: 50000 };
    db.exec("UPDATE careers SET currentDate = '2025-11-01'"); expect(() => management.sign('career', p.id, offer)).toThrow('closed');
    db.exec("UPDATE careers SET currentDate = '2025-09-01'; UPDATE teams SET cashBalance = 0 WHERE id = 'us'");
    expect(() => management.sign('career', p.id, offer)).toThrow('Insufficient');
    expect(db.prepare('SELECT teamId FROM players WHERE id = ?').get(p.id).teamId).toBe('them'); expect(db.prepare('SELECT * FROM transfers').all()).toHaveLength(0);
  });
  it('quotes the existing buyout and displays the exact cash shortfall on rejection',()=>{
    db.exec("INSERT INTO contracts (id,playerId,teamId,salary,buyout,isActive) VALUES ('atomic-contract','them0','them',14580,87480,1);UPDATE teams SET cashBalance=61904 WHERE id='us'");
    const quote=management.signingQuote('career','them0');
    expect(quote.fee).toBe(87480);expect(quote.clubFunds).toBe(61904);
    const offer={salary:quote.demands.salary,bonus:quote.demands.bonus,duration:24,buyout:150000};
    const shortfall=quote.fee+offer.salary+offer.bonus-quote.clubFunds;
    expect(()=>management.sign('career','them0',offer)).toThrow(`short by $${shortfall.toLocaleString()}`);
    expect(db.prepare("SELECT teamId FROM players WHERE id='them0'").get().teamId).toBe('them');
    expect(db.prepare("SELECT isActive FROM contracts WHERE id='atomic-contract'").get().isActive).toBe(1);
  });
  it('uses the same acceptance rule as the room and rechecks changing funds',()=>{
    const quote=management.signingQuote('career','them0'),d=quote.demands;
    const low={salary:Math.round(d.salary*.4),bonus:d.bonus*2,duration:24,buyout:100000};
    expect(contractOfferScore(low,d)).toBeLessThan(.95);
    expect(()=>management.sign('career','them0',low)).toThrow('not accepted');
    const accepted={...low,salary:d.salary,bonus:d.bonus};
    expect(contractOfferScore(accepted,d)).toBeGreaterThanOrEqual(.95);
    db.exec("UPDATE teams SET cashBalance=0 WHERE id='us'");
    expect(()=>management.sign('career','them0',accepted)).toThrow('Insufficient');
    expect(db.prepare('SELECT * FROM transfers').all()).toHaveLength(0);
  });
  it('scouting charges once, completes after three days, and survives reload', () => {
    management.dispatchScout('career', 'them0'); expect(() => management.dispatchScout('career', 'them0')).toThrow('already');
    expect(management.scouting('career')[0].status).toBe('pending');
    for (let i = 1; i <= 3; i++) (management as any).processDay('career', addDays('2025-09-01', i));
    expect(management.scouting('career')[0].status).toBe('completed');
    const restored = new CareerManagement(adapter(new SQL.Database(raw.export())) as any);
    expect(restored.scouting('career')[0].estOvr).toBe('76–84');
    expect(db.prepare("SELECT cashBalance FROM teams WHERE id = 'us'").get().cashBalance).toBe(495000);
    expect(db.prepare("SELECT * FROM inbox_items WHERE type = 'scout_report'").all()).toHaveLength(1);
  });
  it('saved training develops overall gradually, respects potential and rest', () => {
    management.saveTraining('career', Array.from({ length: 7 }, (_, day) => ({ day, category: day === 6 ? 'Rest' : 'Mechanics', intensity: 'Low' })));
    for (let i = 1; i <= 80; i++) (management as any).processDay('career', addDays('2025-09-01', i));
    const player = db.prepare("SELECT * FROM players WHERE id = 'us0'").get();
    expect(player.overall).toBeGreaterThan(80); expect(player.overall).toBeLessThanOrEqual(85); expect(player.fatigue).toBe(0);
    expect(management.training('career').logs.length).toBeGreaterThan(0);
  });
  it('social reactions respect mental resilience and cannot be reapplied', () => {
    expect(Math.abs(socialImpact('negative', { pressureResistance: 100, tiltTendency: 0 }).confidence)).toBeLessThan(Math.abs(socialImpact('negative', { pressureResistance: 0, tiltTendency: 100 }).confidence));
    const p = db.prepare("SELECT * FROM players WHERE id = 'us0'").get(); management.post('career', p, 'negative', 'Test', 'Tough match.');
    const post = db.prepare('SELECT * FROM social_posts').get(); management.respond('career', post.id);
    expect(() => management.respond('career', post.id)).toThrow('already');
    expect(db.prepare("SELECT morale FROM players WHERE id = 'us0'").get().morale).toBe(70 + post.moraleChange + 2);
  });
});
describe('Large open fields and qualification', () => {
  it('uses only available real squads and bounded elimination brackets without inventing filler', () => {
    // A compact fixture tests advancement independently of the imported field size.
    for (let i=0;i<32;i++) {
      const id='registered_'+i;
      db.prepare('INSERT INTO teams (id,name,region,reputation) VALUES (?,?,?,?)').run(id,'Confirmed test roster '+i,'Europe',70);
      for(let slot=0;slot<3;slot++) db.prepare('INSERT INTO players (id,gamertag,teamId,overall) VALUES (?,?,?,70)').run(id+'_'+slot,id+'_'+slot,id);
    }
    management.ensureCircuit('career');
    const q = db.prepare("SELECT c.* FROM competitions c JOIN career_competitions cc ON cc.competitionId = c.id WHERE cc.careerId = 'career' AND c.type = 'QUALIFIER' AND c.region = 'Europe' AND cc.cycle = 1").get();
    expect(db.prepare('SELECT COUNT(*) AS count FROM competition_entries WHERE competitionId = ?').get(q.id).count).toBe(34);
    expect(db.prepare('SELECT COUNT(*) AS count FROM fixtures WHERE competitionId = ?').get(q.id).count).toBeLessThan(34);
    expect(db.prepare('SELECT id FROM generated_entities').all()).toHaveLength(0);
    let date = db.prepare('SELECT startDate FROM career_competitions WHERE competitionId=?').get(q.id).startDate;
    management.progressCircuit('career',date);
    for (let round = 1; round <= 20; round++) {
      db.prepare("UPDATE fixtures SET status = 'completed', homeScore = 2, awayScore = 0 WHERE competitionId = ?").run(q.id);
      management.progressCircuit('career', date); date = addDays(date, 1);
      if (db.prepare('SELECT status FROM competitions WHERE id = ?').get(q.id).status === 'completed') break;
    }
    const qualifiers = JSON.parse(db.prepare('SELECT teams FROM qualification_results WHERE competitionId = ?').get(q.id).teams);
    expect(qualifiers).toHaveLength(32);
    const regional = db.prepare("SELECT competitionId FROM career_competitions WHERE careerId = 'career' AND stage = 'REGIONAL' AND sources LIKE ?").get('%' + q.id + '%');
    const entered = db.prepare('SELECT teamId FROM competition_entries WHERE competitionId = ?').all(regional.competitionId).map((e: any) => e.teamId);
    expect(entered.sort()).toEqual(qualifiers.sort());
    const oldCount = db.prepare('SELECT COUNT(*) AS count FROM competitions').get().count; management.ensureCircuit('career');
    expect(db.prepare('SELECT COUNT(*) AS count FROM competitions').get().count).toBe(oldCount);
  }, 30000);
});
