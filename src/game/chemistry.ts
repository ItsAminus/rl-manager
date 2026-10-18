import { CHEMISTRY_FACTORS } from './balancing';

export function calculateChemistry(team: any, players: any[]) {
  if (players.length < 2) return 50;

  // 1. Time playing together (simulated by a base value that grows)
  let baseChem = team.teamChemistry || 50;

  // 2. Compatible tendencies
  const tendencies = players.map(p => p.preferredTendency);
  const hasSupport = tendencies.includes('SUPPORT');
  const hasStriker = tendencies.includes('STRIKER');
  const hasCarry = tendencies.includes('MECHANICAL_CARRY');
  
  let tendencyBonus = 0;
  if (hasSupport && hasStriker) tendencyBonus += 5;
  if (hasCarry && hasSupport) tendencyBonus += 5;
  if (tendencies.filter(t => t === 'MECHANICAL_CARRY').length > 1) tendencyBonus -= 10; // Clash of egos

  // 3. Morale Impact
  const avgMorale = players.reduce((sum, p) => sum + (p.morale || 50), 0) / players.length;
  const moraleBonus = (avgMorale - 50) * 0.2;

  let newChem = baseChem + tendencyBonus + moraleBonus;
  return Math.max(0, Math.min(100, Math.round(newChem)));
}

export function updateChemistryAfterChange(team: any, changeType: 'TRANSFER_IN' | 'TRANSFER_OUT' | 'COACH_CHANGE') {
  let chem = team.teamChemistry || 50;
  switch(changeType) {
    case 'TRANSFER_IN': chem -= 15; break; // Takes time to adapt
    case 'TRANSFER_OUT': chem -= 5; break;
    case 'COACH_CHANGE': chem -= 10; break;
  }
  return Math.max(0, chem);
}
