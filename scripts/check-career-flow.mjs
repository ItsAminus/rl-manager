// Integration check using the isolated preview's real IPC handlers.
import assert from 'node:assert/strict';
const api = async (channel, ...args) => {
  const response = await fetch('http://127.0.0.1:5179/__review/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, args }) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error);
  return value;
};
const created = await api('career:create', { managerName: 'Integration check', teamId: 'team_1', region: 'Europe', difficulty: 'Normal' });
assert.equal(created.success, true);
let saved = await api('career:load', created.id);
assert.equal(saved.success, true);
const career = saved.career, teamId = career.teamId;
const competitions = await api('competitions:getAll');
const open = competitions.find(c => c.type === 'QUALIFIER' && c.region === saved.team.region);
assert.equal(open.entrantCount, 681);
assert.equal(competitions.find(c => c.type === 'QUALIFIER' && c.region === 'North America').entrantCount, 407);
const original = saved.players.slice(0, 3).map(p => p.id);
assert.equal((await api('management:setLineup', career.id, [...original].reverse())).success, true);
saved = await api('career:load', career.id);
assert.deepEqual(saved.players.slice(0, 3).map(p => p.id), [...original].reverse());
await api('management:setLineup', career.id, original);
const plan = await api('management:tactics', career.id);
assert.equal((await api('management:saveTactics', career.id, { ...plan, overallStyle: 'Defensive' })).success, true);
assert.equal((await api('management:tactics', career.id)).overallStyle, 'Defensive');
let played = 0, qualified = false;
for (let turn = 0; turn < 45; turn++) {
  saved = await api('career:load', career.id);
  const events = await api('competitions:getAll');
  const regional = events.find(c => c.type === 'REGIONAL' && c.region === saved.team.region);
  if (regional.entered) {
    const detail = await api('competitions:getById', regional.id);
    assert.equal(detail.entries.length, 16);
    assert(detail.entries.some(e => e.teamId === teamId));
    const social = await api('management:social', career.id);
    assert(social.length > 0);
    qualified = true;
    break;
  }
  const next = (await api('fixtures:getUpcoming', teamId, saved.career.currentDate))[0];
  if (!next || next.scheduledDate > saved.career.currentDate) {
    const advanced = await api('calendar:advanceToEvent', career.id); assert.equal(advanced.success, true); continue;
  }
  const fixture = await api('fixtures:getById', next.id);
  assert.equal(fixture.playError, '');
  const opponent = fixture.homeTeamId === teamId ? fixture.awayTeamId : fixture.homeTeamId;
  let blue = fixture.games.filter(g => g.blueScore > g.orangeScore).length, orange = fixture.games.length - blue;
  const required = Math.ceil(Number(fixture.seriesFormat.replace(/\D/g, '')) / 2);
  while (blue < required && orange < required) {
    const result = { fixtureId: next.id, gameNumber: blue + orange + 1, blueTeamId: teamId, orangeTeamId: opponent, blueScore: 3, orangeScore: 1, playerStats: original.map((id, i) => ({ playerId: id, goals: i === 0 ? 3 : 0, assists: i === 1 ? 2 : 0, saves: 1, shots: i === 0 ? 5 : 1, demos: 0, score: 400 - i * 100 })) };
    assert.equal((await api('gameResults:create', result)).success, true); blue++;
    assert.equal((await api('gameResults:create', result)).success, false);
  }
  assert.equal((await api('fixtures:updateResult', next.id, blue, orange, 'completed')).success, true);
  const completed = await api('fixtures:getById', next.id);
  if (completed.awayTeamId === teamId) assert.equal(completed.awayScore, required);
  assert.equal(completed.games[0].playerStats.length, 3);
  played++;
  if (turn === 44) throw new Error('Regional qualification did not resolve.');
}
assert.equal(qualified, true);
saved = await api('career:load', career.id);
const away = (await api('fixtures:getUpcoming', teamId, saved.career.currentDate)).find(f => f.awayTeamId === teamId);
assert(away, 'The schedule must include an away series.');
for (let i = 0; saved.career.currentDate < away.scheduledDate && i < 30; i++) {
  const advanced = await api('calendar:advanceToEvent', career.id); assert.equal(advanced.success, true);
  saved = await api('career:load', career.id);
}
assert.equal(saved.career.currentDate, away.scheduledDate);
for (let number = 1; number <= 2; number++) assert.equal((await api('gameResults:create', { fixtureId: away.id, gameNumber: number, blueTeamId: teamId, orangeTeamId: away.homeTeamId, blueScore: 2, orangeScore: 0, playerStats: [] })).success, true);
assert.equal((await api('fixtures:updateResult', away.id, 2, 0, 'completed')).success, true);
const finalAway = await api('fixtures:getById', away.id);
assert.equal(finalAway.homeScore, 0); assert.equal(finalAway.awayScore, 2);
console.log(JSON.stringify({ passed: true, seriesPlayed: played + 1, checkedAway: true, regionalEntrants: 16 }));
