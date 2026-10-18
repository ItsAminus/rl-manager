export const SCOUT_LEVELS = {
  UNKNOWN: 0,
  BASIC: 1, // Knows overall tier, region
  GOOD: 2,  // Knows specific attributes ranges, tendencies
  FULL: 3   // Exact OVR, traits, exact attributes
};

export function scoutPlayer(player: any, currentKnowledge: number) {
  let newKnowledge = currentKnowledge + 1;
  if (newKnowledge > SCOUT_LEVELS.FULL) newKnowledge = SCOUT_LEVELS.FULL;
  
  return {
    knowledgeLevel: newKnowledge,
    report: generateScoutReport(player, newKnowledge)
  };
}

export function generateScoutReport(player: any, knowledge: number) {
  const report: any = {
    id: player.id,
    gamertag: player.gamertag
  };

  if (knowledge >= SCOUT_LEVELS.BASIC) {
    report.region = player.region;
    report.estimatedTier = player.overall >= 90 ? 'S' : player.overall >= 80 ? 'A' : 'B';
  }

  if (knowledge >= SCOUT_LEVELS.GOOD) {
    report.preferredTendency = player.preferredTendency;
    report.estimatedOverall = `${Math.floor(player.overall / 5) * 5} - ${Math.floor(player.overall / 5) * 5 + 5}`;
  }

  if (knowledge >= SCOUT_LEVELS.FULL) {
    report.exactOverall = player.overall;
    report.attributes = player.attributes;
    report.traits = player.traits;
  }

  return report;
}
