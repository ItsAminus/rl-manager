import { MARKET_VALUE_RANGES, SALARY_RANGES } from './balancing';

export function calculateMarketValue(player: any): number {
  let baseValue = 0;
  if (player.overall >= 90) baseValue = MARKET_VALUE_RANGES.TIER_S.min + Math.random() * (MARKET_VALUE_RANGES.TIER_S.max - MARKET_VALUE_RANGES.TIER_S.min);
  else if (player.overall >= 80) baseValue = MARKET_VALUE_RANGES.TIER_A.min + Math.random() * (MARKET_VALUE_RANGES.TIER_A.max - MARKET_VALUE_RANGES.TIER_A.min);
  else if (player.overall >= 70) baseValue = MARKET_VALUE_RANGES.TIER_B.min + Math.random() * (MARKET_VALUE_RANGES.TIER_B.max - MARKET_VALUE_RANGES.TIER_B.min);
  else baseValue = MARKET_VALUE_RANGES.TIER_C.min + Math.random() * (MARKET_VALUE_RANGES.TIER_C.max - MARKET_VALUE_RANGES.TIER_C.min);

  // Age multiplier (young = high potential value)
  let ageMultiplier = 1.0;
  if (player.age < 18) ageMultiplier = 1.5;
  else if (player.age > 26) ageMultiplier = 0.7;

  return Math.round(baseValue * ageMultiplier);
}

export function calculateSalary(player: any): number {
  let baseSalary = 0;
  if (player.overall >= 90) baseSalary = SALARY_RANGES.TIER_S.min;
  else if (player.overall >= 80) baseSalary = SALARY_RANGES.TIER_A.min;
  else if (player.overall >= 70) baseSalary = SALARY_RANGES.TIER_B.min;
  else baseSalary = SALARY_RANGES.TIER_C.min;
  
  return Math.round(baseSalary * (1 + (player.reputation || 0) / 100));
}

export function processWeeklyFinances(team: any, rosterSalaries: number) {
  const sponsorIncome = team.sponsorIncome || 5000;
  const merchIncome = (team.fanbase || 1000) * 0.5;
  const totalIncome = sponsorIncome + merchIncome;
  
  const facilityCost = (team.facilityLevel || 1) * 1000;
  const totalExpenses = rosterSalaries + facilityCost;

  return {
    revenue: totalIncome,
    expenses: totalExpenses,
    net: totalIncome - totalExpenses
  };
}

export function evaluateTransferOffer(offerAmount: number, team: any, player: any) {
  const marketValue = calculateMarketValue(player);
  if (offerAmount >= marketValue * 1.2) return 'ACCEPT';
  if (offerAmount >= marketValue * 0.9) return 'COUNTER';
  return 'REJECT';
}

export function calculatePrizeMoney(competition: any, placement: number) {
  const pool = competition.prizePool || 0;
  if (placement === 1) return pool * 0.5;
  if (placement === 2) return pool * 0.25;
  if (placement <= 4) return pool * 0.1;
  return 0;
}
