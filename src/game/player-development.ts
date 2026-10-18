import { DEVELOPMENT_RATES } from './balancing';

export function developPlayer(player: any, training: any, context: any) {
  let rate = DEVELOPMENT_RATES.PRIME;
  if (player.age <= 18) rate = DEVELOPMENT_RATES.YOUTH;
  else if (player.age <= 21) rate = DEVELOPMENT_RATES.PROSPECT;
  else if (player.age >= 29) rate = DEVELOPMENT_RATES.DECLINE;
  else if (player.age >= 26) rate = DEVELOPMENT_RATES.VETERAN;

  // Margin to potential
  const gap = player.potential - player.overall;
  if (gap <= 0 && rate > 0) rate *= 0.1; // Diminishing returns

  // Morale & Professionalism impact
  const traitMultiplier = 1 + ((player.traits?.professionalism || 50) - 50) / 100;
  const formMultiplier = 1 + ((player.form || 50) - 50) / 100;
  
  const totalGrowth = rate * traitMultiplier * formMultiplier * (Math.random() * 1.5);
  
  return {
    overallChange: totalGrowth > 1 ? Math.floor(totalGrowth) : (Math.random() < totalGrowth ? 1 : 0),
    attributeChanges: applyTraining(player.attributes, training, totalGrowth)
  };
}

function applyTraining(attributes: any, training: any, totalGrowth: number) {
  const changes: any = {};
  if (!attributes) return changes;
  
  // Focus attributes based on training category
  const targetAttrs = training?.category === 'MECHANICS' ? ['mechanical', 'aerial', 'recovery'] :
                      training?.category === 'DEFENSE' ? ['defense', 'saves', 'positioning'] :
                      ['gameSense', 'rotations', 'passing'];
                      
  targetAttrs.forEach(attr => {
    if (Math.random() < totalGrowth * 0.5) {
      changes[attr] = 1;
    }
  });
  
  return changes;
}

export function processWeeklyDevelopment(allPlayers: any[], trainings: Record<string, any>) {
  return allPlayers.map(p => ({
    playerId: p.id,
    ...developPlayer(p, trainings[p.teamId], {})
  }));
}
