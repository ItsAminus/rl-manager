import { MATCH_SIMULATION_WEIGHTS as BALANCE } from './balancing';
import { tacticalAdjustment } from './tactics';

type RandomSource = () => number;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const rating = (value: unknown, fallback = 50) => typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 100) : fallback;

function playersFor(team: any): any[] {
  if (!Array.isArray(team?.players) || !team.players.length) throw new Error('A simulation needs a starting lineup for both teams.');
  return team.players;
}

/** Deterministic strength in OVR points, shared by the forecast and simulation. */
export function calculateStrengthProfile(team: any, tactics: any = {}) {
  const players = playersFor(team);
  const average = (get: (p: any) => number) => players.reduce((sum, p) => sum + get(p), 0) / players.length;
  const overall = average(p => rating(p.overall));
  // All three players must hold a rotation; two stars cannot completely hide
  // a weaker third player. The mean still supplies 80% of lineup strength.
  const lowestOverall = Math.min(...players.map(p => rating(p.overall)));
  const lineupPenalty = (overall - lowestOverall) * BALANCE.LINEUP_WEAK_LINK_WEIGHT;
  const morale = (average(p => rating(p.morale)) - 50) * 0.025;
  const confidence = (average(p => rating(p.traits?.confidence ?? p.confidence)) - 50) * 0.02;
  const fatigue = average(p => rating(p.fatigue, 0)) * 0.05;
  const chemistry = (rating(team.teamChemistry) - 50) * 0.04;
  const form = (rating(team.teamForm) - 50) * 0.04;
  const adjustment = clamp((morale + confidence - fatigue + chemistry + form + tacticalAdjustment(players, tactics)) * BALANCE.SUPPORT_FACTOR_SCALE,
    -BALANCE.MAX_SUPPORT_ADJUSTMENT, BALANCE.MAX_SUPPORT_ADJUSTMENT);
  return { averageOverall: overall, lowestOverall, lineupPenalty, conditionAdjustment: adjustment,
    strength: clamp(overall - lineupPenalty + adjustment, 1, 100) };
}

export function calculateEffectiveStrength(team: any, tactics: any = {}): number {
  return calculateStrengthProfile(team, tactics).strength;
}

function poissonMass(mean: number): number[] {
  const mass = [Math.exp(-mean)];
  // All goal rates are below eight; the omitted tail is smaller than floating-point precision.
  for (let goals = 1; goals <= 60; goals++) mass.push(mass[goals - 1] * mean / goals);
  return mass;
}

/** Each team's goals are Poisson-distributed; tied regulation goes to strength-weighted overtime. */
export function forecastGame(homeTeam: any, awayTeam: any, homeTactics: any = {}, awayTactics: any = {}) {
  const homeProfile = calculateStrengthProfile(homeTeam, homeTactics);
  const awayProfile = calculateStrengthProfile(awayTeam, awayTactics);
  const homeStrength = homeProfile.strength;
  const awayStrength = awayProfile.strength;
  const difference = homeStrength - awayStrength;
  const homeGoalShare = 1 / (1 + Math.exp(-difference / BALANCE.GOAL_SHARE_SCALE));
  const totalGoals = BALANCE.EVEN_MATCH_GOALS + Math.min(BALANCE.MAX_EXTRA_GOALS, Math.abs(difference) * BALANCE.MISMATCH_EXTRA_GOALS_PER_POINT);
  const homeExpectedGoals = totalGoals * homeGoalShare;
  const awayExpectedGoals = totalGoals * (1 - homeGoalShare);
  const homeMass = poissonMass(homeExpectedGoals), awayMass = poissonMass(awayExpectedGoals);
  let homeWinProbability = 0, overtimeProbability = 0, awayBelow = 0;
  for (let goals = 0; goals < homeMass.length; goals++) {
    const tie = homeMass[goals] * awayMass[goals];
    homeWinProbability += homeMass[goals] * awayBelow + tie * homeGoalShare;
    overtimeProbability += tie;
    awayBelow += awayMass[goals];
  }
  return { homeStrength, awayStrength, homeProfile, awayProfile, homeExpectedGoals, awayExpectedGoals, homeGoalShare,
    homeWinProbability, awayWinProbability: 1 - homeWinProbability, overtimeProbability };
}

/** Remaining-series estimate for the current lineup, including games already won. */
export function forecastSeries(gameWinProbability: number, bestOf: number, homeWins = 0, awayWins = 0) {
  if (!Number.isFinite(gameWinProbability) || gameWinProbability < 0 || gameWinProbability > 1 ||
      !Number.isInteger(bestOf) || bestOf < 1 || bestOf % 2 !== 1 ||
      !Number.isInteger(homeWins) || !Number.isInteger(awayWins) || homeWins < 0 || awayWins < 0) {
    throw new Error('Invalid series forecast.');
  }
  const needed = (bestOf + 1) / 2;
  if (homeWins >= needed && awayWins >= needed) throw new Error('Both teams cannot win the same series.');
  const memo = new Map<string, number>();
  const chance = (home: number, away: number): number => {
    if (home >= needed) return 1;
    if (away >= needed) return 0;
    const key = `${home}:${away}`;
    if (!memo.has(key)) memo.set(key, gameWinProbability * chance(home + 1, away) +
      (1 - gameWinProbability) * chance(home, away + 1));
    return memo.get(key)!;
  };
  const homeWinProbability = chance(homeWins, awayWins);
  return { homeWinProbability, awayWinProbability: 1 - homeWinProbability };
}

function samplePoisson(mean: number, random: RandomSource): number {
  const draw = clamp(random(), 0, 1 - Number.EPSILON);
  let mass = Math.exp(-mean), cumulative = mass;
  for (let goals = 0; goals < 60; goals++) {
    if (draw <= cumulative) return goals;
    mass *= mean / (goals + 1);
    cumulative += mass;
  }
  return 60;
}

function pickPlayer(players: any[], attributes: string[], random: RandomSource): any {
  const weights = players.map(p => Math.max(1, attributes.reduce((sum, key) => sum + rating(p.attributes?.[key], rating(p.overall)), 0)));
  let draw = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < players.length; i++) {
    draw -= weights[i];
    if (draw <= 0) return players[i];
  }
  return players[players.length - 1];
}

export function simulateGame(homeTeam: any, awayTeam: any, homeTactics: any = {}, awayTactics: any = {}, random: RandomSource = Math.random) {
  const homePlayers = playersFor(homeTeam), awayPlayers = playersFor(awayTeam);
  const forecast = forecastGame(homeTeam, awayTeam, homeTactics, awayTactics);
  let homeScore = samplePoisson(forecast.homeExpectedGoals, random);
  let awayScore = samplePoisson(forecast.awayExpectedGoals, random);
  const overtime = homeScore === awayScore;
  if (overtime) {
    if (random() < forecast.homeGoalShare) homeScore++;
    else awayScore++;
  }

  const stats: Record<string, { goals: number; assists: number; saves: number; shots: number; demos: number; score: number }> = {};
  for (const p of [...homePlayers, ...awayPlayers]) {
    stats[p.id] = { goals: 0, assists: 0, saves: 0, shots: 0, demos: Math.floor(random() * 3), score: 0 };
  }
  const creditGoals = (players: any[], goals: number) => {
    for (let goal = 0; goal < goals; goal++) {
      const scorer = pickPlayer(players, ['shooting', 'positioning'], random);
      stats[scorer.id].goals++;
      stats[scorer.id].shots++;
      stats[scorer.id].score += 100;
      const peers = players.filter(p => p.id !== scorer.id);
      if (peers.length && random() < 0.7) {
        const assister = pickPlayer(peers, ['passing'], random);
        stats[assister.id].assists++;
        stats[assister.id].score += 50;
      }
    }
  };
  creditGoals(homePlayers, homeScore);
  creditGoals(awayPlayers, awayScore);
  // Credit non-scoring shots and a subset as opposition saves, so totals reconcile.
  const creditMisses = (attackers: any[], defenders: any[], expectedGoals: number) => {
    const misses = samplePoisson(expectedGoals * (1 / 0.32 - 1), random);
    for (let shot = 0; shot < misses; shot++) {
      const shooter = pickPlayer(attackers, ['shooting'], random);
      stats[shooter.id].shots++;
      stats[shooter.id].score += 10;
      if (random() < 0.65) {
        const saver = pickPlayer(defenders, ['goalkeeping', 'defense'], random);
        stats[saver.id].saves++;
        stats[saver.id].score += 50;
      }
    }
  };
  creditMisses(homePlayers, awayPlayers, forecast.homeExpectedGoals);
  creditMisses(awayPlayers, homePlayers, forecast.awayExpectedGoals);

  return { blueTeamId: homeTeam.id, orangeTeamId: awayTeam.id, blueScore: homeScore, orangeScore: awayScore, overtime, stats };
}

export function simulateSeries(homeTeam: any, awayTeam: any, format: string, tactics: any, random: RandomSource = Math.random) {
  const winsRequired = format === 'BO7' ? 4 : format === 'BO5' ? 3 : format === 'BO3' ? 2 : 1;
  let homeWins = 0, awayWins = 0;
  const games = [];
  while (homeWins < winsRequired && awayWins < winsRequired) {
    const gameResult = simulateGame(homeTeam, awayTeam, tactics?.home, tactics?.away, random);
    games.push(gameResult);
    if (gameResult.blueScore > gameResult.orangeScore) homeWins++;
    else awayWins++;
  }
  return { homeWins, awayWins, winnerId: homeWins > awayWins ? homeTeam.id : awayTeam.id, games };
}
