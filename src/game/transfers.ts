import { calculateMarketValue, calculateSalary } from './finances';

export function generateTransferValue(player: any) {
  return calculateMarketValue(player);
}

export function evaluateContractOffer(player: any, offer: any) {
  const expectedSalary = calculateSalary(player);
  
  if (offer.salary >= expectedSalary * 1.1) return 'ACCEPTED';
  if (offer.salary < expectedSalary * 0.8) return 'REJECTED';
  
  // Factor in team reputation and region preference
  if (offer.duration < 12) return 'NEGOTIATE_DURATION';
  
  return 'ACCEPTED';
}

export function processAITransfers(teams: any[], freeAgents: any[]) {
  const activities: any[] = [];
  
  teams.forEach(team => {
    // Basic AI logic: If roster is < 3, sign a free agent
    if (!team.players || team.players.length < 3) {
      // Find best affordable FA
      const affordable = freeAgents.filter(fa => calculateSalary(fa) <= (team.budget || 10000));
      if (affordable.length > 0) {
        // Sort by OVR desc
        affordable.sort((a,b) => b.overall - a.overall);
        const target = affordable[0];
        
        activities.push({
          type: 'FREE_AGENT_SIGNING',
          teamId: team.id,
          playerId: target.id,
          salary: calculateSalary(target)
        });
        
        // Remove from FA pool for this iteration
        freeAgents = freeAgents.filter(fa => fa.id !== target.id);
      }
    }
  });
  
  return activities;
}
