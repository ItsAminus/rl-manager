// src/game/balancing.ts

export const OVR_WEIGHTS: Record<string, any> = {
  'MECHANICAL_CARRY': { mechanical: 1.5, aerial: 1.3, speed: 1.2, recovery: 1.1, rotations: 0.7, defense: 0.6 },
  'SUPPORT': { passing: 1.5, rotations: 1.4, defense: 1.2, positioning: 1.2, shotPower: 0.7, mechanical: 0.8 },
  'STRIKER': { shooting: 1.5, shotAccuracy: 1.4, shotPower: 1.3, positioning: 1.2, defense: 0.6, passing: 0.8 },
  'BALANCED': { mechanical: 1.0, rotations: 1.0, defense: 1.0, shooting: 1.0, passing: 1.0, speed: 1.0 }
};

export const SALARY_RANGES = {
  TIER_S: { min: 20000, max: 40000 }, // 90+ OVR
  TIER_A: { min: 10000, max: 20000 }, // 80-89 OVR
  TIER_B: { min: 5000, max: 10000 },  // 70-79 OVR
  TIER_C: { min: 2000, max: 5000 }    // <70 OVR
};

export const MARKET_VALUE_RANGES = {
  TIER_S: { min: 500000, max: 2000000 },
  TIER_A: { min: 150000, max: 500000 },
  TIER_B: { min: 50000, max: 150000 },
  TIER_C: { min: 10000, max: 50000 }
};

export const DEVELOPMENT_RATES = {
  YOUTH: 1.5,    // 15-18
  PROSPECT: 1.2, // 19-21
  PRIME: 0.8,    // 22-25
  VETERAN: 0.4,  // 26-28
  DECLINE: -0.5  // 29+
};

export const FORM_WEIGHTS = {
  WIN: 5,
  LOSS: -5,
  MVP: 10,
  POOR_PERFORMANCE: -10
};

export const CHEMISTRY_FACTORS = {
  TIME_TOGETHER: 0.4,
  WIN_STREAK: 0.3,
  COMPATIBLE_TENDENCIES: 0.2,
  COACH_IMPACT: 0.1
};

export const TRAINING_EFFECTS = {
  INTENSE: { fatigue: 15, improvement: 1.2, morale: -2 },
  NORMAL: { fatigue: 8, improvement: 1.0, morale: 0 },
  LIGHT: { fatigue: 3, improvement: 0.6, morale: 2 },
  REST: { fatigue: -20, improvement: 0, morale: 5 }
};

export const FATIGUE_RATES = {
  PER_GAME: 5,
  PER_SERIES_BO5: 15,
  PER_SERIES_BO7: 20,
  RECOVERY_PER_DAY: -10
};

export const MORALE_FACTORS = {
  WIN_SERIES: 10,
  LOSE_SERIES: -10,
  CONTRACT_RENEWED: 20,
  BENCHED: -15
};

export const MATCH_SIMULATION_WEIGHTS = {
  // Strength stays in OVR points. Secondary factors must not erase a skill tier.
  MAX_SUPPORT_ADJUSTMENT: 2,
  SUPPORT_FACTOR_SCALE: 0.3,
  LINEUP_WEAK_LINK_WEIGHT: 0.2,
  GOAL_SHARE_SCALE: 10,
  EVEN_MATCH_GOALS: 4.8,
  MISMATCH_EXTRA_GOALS_PER_POINT: 0.065,
  MAX_EXTRA_GOALS: 3
};
