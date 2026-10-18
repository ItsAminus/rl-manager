export function generateFixtures(competition: any, teams: any[]) {
  const fixtures: any[] = [];
  
  if (competition.format === 'ROUND_ROBIN') {
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        fixtures.push({
          id: `fix_${competition.id}_${i}_${j}`,
          competitionId: competition.id,
          round: 1,
          homeTeamId: teams[i].id,
          awayTeamId: teams[j].id,
          scheduledDate: new Date().toISOString(),
          status: 'SCHEDULED',
          seriesFormat: competition.config?.seriesFormat || 'BO5'
        });
      }
    }
  } else if (competition.format === 'SINGLE_ELIMINATION') {
    // Generate bracket round 1
    for (let i = 0; i < teams.length; i += 2) {
      if (teams[i] && teams[i+1]) {
        fixtures.push({
          id: `fix_${competition.id}_r1_${i}`,
          competitionId: competition.id,
          round: 1,
          homeTeamId: teams[i].id,
          awayTeamId: teams[i+1].id,
          scheduledDate: new Date().toISOString(),
          status: 'SCHEDULED',
          seriesFormat: competition.config?.seriesFormat || 'BO7'
        });
      }
    }
  }
  
  return fixtures;
}

export function processResult(competition: any, fixture: any, result: any) {
  // Update standings or brackets based on competition format
  return { updated: true, winner: result.winnerId };
}

export function getStandings(competition: any, fixtures: any[], results: any[]) {
  const standings: Record<string, any> = {};
  
  results.forEach(res => {
    const fix = fixtures.find(f => f.id === res.fixtureId);
    if (!fix) return;
    
    if (!standings[fix.homeTeamId]) standings[fix.homeTeamId] = { points: 0, wins: 0, losses: 0, gd: 0 };
    if (!standings[fix.awayTeamId]) standings[fix.awayTeamId] = { points: 0, wins: 0, losses: 0, gd: 0 };
    
    const hWins = res.homeWins;
    const aWins = res.awayWins;
    
    if (hWins > aWins) {
      standings[fix.homeTeamId].wins++;
      standings[fix.homeTeamId].points += 3;
      standings[fix.awayTeamId].losses++;
    } else {
      standings[fix.awayTeamId].wins++;
      standings[fix.awayTeamId].points += 3;
      standings[fix.homeTeamId].losses++;
    }
    standings[fix.homeTeamId].gd += (hWins - aWins);
    standings[fix.awayTeamId].gd += (aWins - hWins);
  });
  
  return Object.entries(standings)
    .map(([teamId, stats]) => ({ teamId, ...stats }))
    .sort((a, b) => b.points - a.points || b.gd - a.gd);
}

export function advanceStage(competition: any, currentFixtures: any[], results: any[]) {
  // Logic to generate next round in tournament
  if (competition.format !== 'SINGLE_ELIMINATION') return [];
  
  const winners = results.map(r => r.winnerId);
  const newFixtures = [];
  
  for (let i = 0; i < winners.length; i += 2) {
    if (winners[i] && winners[i+1]) {
      newFixtures.push({
        id: `fix_${competition.id}_next_${i}`,
        competitionId: competition.id,
        round: (currentFixtures[0]?.round || 1) + 1,
        homeTeamId: winners[i],
        awayTeamId: winners[i+1],
        scheduledDate: new Date().toISOString(),
        status: 'SCHEDULED',
        seriesFormat: competition.config?.seriesFormat || 'BO7'
      });
    }
  }
  return newFixtures;
}
