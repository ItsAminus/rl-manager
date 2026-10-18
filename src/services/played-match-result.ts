/** Map the exact launch slots to career identities, including the human's account name. */
export function playedMatchResult(payload: any, result: any) {
  if (!result?.completed || ![result.blueScore, result.orangeScore].every(n => Number.isInteger(n) && n >= 0) || result.blueScore === result.orangeScore)
    throw new Error('The bridge has not supplied a valid completed game.');
  const players = [...payload.blueTeam.players, ...payload.orangeTeam.players];
  if (players.length !== 6 || players.some(p => !p.playerId)) throw new Error('The launch roster is incomplete.');
  const cars: any[] = Array.isArray(result.playerStats) ? result.playerStats : [];
  const used = new Set<any>();
  const stats = players.map((p, slot) => {
    const team = slot < 3 ? 0 : 1;
    const car = cars.find(c => !used.has(c) && c.slot === slot && c.team === team)
      || cars.find(c => !used.has(c) && c.team === team && (p.isHuman ? c.is_bot === false : String(c.name).toLowerCase() === p.gamertag.toLowerCase()));
    if (car) used.add(car);
    const stat = (key: string) => {
      const value = car?.[key] ?? 0;
      if (!Number.isInteger(value) || value < 0) throw new Error('The bridge supplied invalid player statistics.');
      return value;
    };
    return { playerId: p.playerId, isHuman:!!p.isHuman, goals: stat('goals'), assists: stat('assists'), saves: stat('saves'), shots: stat('shots'), demos: stat('demolitions'), score: stat('score') };
  });
  const incidents=(Array.isArray(result.incidents)?result.incidents:[]).slice(0,256).flatMap((e:any)=>{
    if(!['goal','save','critical_demo','open_net_miss'].includes(e.type)||!Number.isInteger(e.slot)||e.slot<0||e.slot>5||e.team!==(e.slot<3?0:1)||!Number.isFinite(e.remaining)||Math.abs(e.remaining)>86400)return [];
    if(e.type==='open_net_miss'&&(!e.evidence?.registeredShot||!e.evidence?.noGoalDefender||!e.evidence?.noInterveningTouch))return [];
    return [{playerId:players[e.slot].playerId,teamId:e.team===0?payload.blueTeam.id:payload.orangeTeam.id,
      type:e.type,remaining:e.remaining,overtime:!!e.overtime,critical:!!e.critical||e.type==='critical_demo',evidence:e.evidence||{}}];
  });
  return { fixtureId: payload.fixtureId, gameNumber: payload.gameNumber,
    blueTeamId: payload.blueTeam.id, orangeTeamId: payload.orangeTeam.id,
    blueScore: result.blueScore, orangeScore: result.orangeScore,
    playerStats: stats, incidents, wasPlayed: true, playedByHuman: true };
}
