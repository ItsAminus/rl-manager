import { describe, expect, it, vi } from 'vitest';
import { calculateEffectiveStrength, calculateStrengthProfile, forecastGame, forecastSeries, simulateGame, simulateSeries } from '../src/game/match-simulation';
import { MockMatchProvider } from '../src/services/mock-match-provider';

function team(overall: number, id: string) {
  return { id, teamChemistry: 50, teamForm: 50, players: [0, 1, 2].map(i => ({
    id: `${id}_${i}`, overall, morale: 50, confidence: 50, fatigue: 0
  })) };
}
function seeded(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

describe('Rating-based simulation', () => {
  it('gives severe mismatches overwhelming odds without making upsets impossible', () => {
    const forecast = forecastGame(team(95, 'a'), team(54, 'b'));
    expect(forecast.homeWinProbability).toBeGreaterThan(.999);
    expect(forecast.homeWinProbability).toBeLessThan(1);
    expect(forecast.homeExpectedGoals).toBeGreaterThan(6);
    expect(forecast.awayExpectedGoals).toBeLessThan(.3);
    // A rare scoreline remains reachable; no forced winner or rating-gap cutoff.
    const draws = [0, .99];
    const result = simulateGame(team(95, 'a'), team(54, 'b'), {}, {}, () => draws.shift() ?? .5);
    expect(result.orangeScore).toBeGreaterThan(result.blueScore);
  });

  it('keeps comparable teams competitive and forecasts deterministic and symmetric', () => {
    const a = team(95, 'a');
    expect(forecastGame(a, team(95, 'b')).homeWinProbability).toBeCloseTo(.5, 12);
    const close = forecastGame(a, team(92, 'b'));
    expect(close.homeWinProbability).toBeGreaterThan(.5);
    expect(close.homeWinProbability).toBeLessThan(.75);
    expect(forecastGame(a, team(92, 'b'))).toEqual(close);
    expect(forecastGame(team(92, 'b'), a).homeWinProbability).toBeCloseTo(close.awayWinProbability, 12);
  });

  it('makes form, fatigue, morale and tactics meaningful without erasing a massive rating gap', () => {
    const strong = team(95, 'a'), weak = team(54, 'b');
    const exhausted = { ...strong, teamChemistry: 0, teamForm: 0,
      players: strong.players.map(p => ({ ...p, morale: 0, confidence: 0, fatigue: 100 })) };
    const motivated = { ...weak, teamChemistry: 100, teamForm: 100,
      players: weak.players.map(p => ({ ...p, morale: 100, confidence: 100 })) };
    expect(calculateEffectiveStrength(exhausted)).toBe(93);
    expect(forecastGame(exhausted, motivated).homeWinProbability).toBeGreaterThan(.99);
    expect(forecastGame(exhausted, weak).homeWinProbability).toBeLessThan(forecastGame(strong, weak).homeWinProbability);
    const passingTeam = { ...strong, players: strong.players.map(p => ({ ...p, attributes: { passing: 100, gameSense: 100, positioning: 100, rotations: 100, boostManagement: 100 } })) };
    expect(calculateEffectiveStrength(passingTeam, { overallStyle: 'Balanced' })).toBeGreaterThan(95);
    expect(calculateEffectiveStrength({ ...weak, teamChemistry: 0 })).toBeLessThan(54);
  });

  it('favours the stronger pictured lineup despite a perfect condition boost for EmporX', () => {
    const empor = { ...team(94, 'empor'), teamChemistry: 65, teamForm: 100,
      players: [98, 95, 88].map((overall, i) => ({ id: `empor_${i}`, overall, morale: 100, confidence: 100, fatigue: 0 })) };
    const mates = { ...team(95, 'mates'), teamChemistry: 98, teamForm: 66,
      players: [92, 98, 96].map((overall, i) => ({ id: `mates_${i}`, overall,
        morale: [88,96,100][i], confidence: [46,48,49][i], fatigue: 15 })) };
    const forecast = forecastGame(empor, mates);
    expect(forecast.homeWinProbability).toBeLessThan(.45);
    expect(forecast.homeWinProbability).toBeGreaterThan(.3);
    expect(forecast.awayStrength).toBeGreaterThan(forecast.homeStrength);
    const remaining = forecastSeries(forecast.homeWinProbability, 5, 0, 1);
    expect(remaining.homeWinProbability).toBeLessThan(.25);
    expect(remaining.homeWinProbability).toBeLessThan(forecast.homeWinProbability);
    expect(forecastGame(mates, empor).homeWinProbability).toBeCloseTo(forecast.awayWinProbability, 12);
  });

  it('accounts for the third player and keeps secondary bonuses small and inspectable', () => {
    const balanced = team(94, 'balanced');
    const uneven = { ...balanced, players: [98,96,88].map((overall,i) => ({ ...balanced.players[i], overall })) };
    expect(calculateEffectiveStrength(uneven)).toBeLessThan(calculateEffectiveStrength(balanced));
    const profile = calculateStrengthProfile(uneven);
    expect(profile.averageOverall).toBe(94);
    expect(profile.lowestOverall).toBe(88);
    expect(profile.lineupPenalty).toBeCloseTo(1.2);
    expect(profile.conditionAdjustment).toBe(0);
  });

  it('distinguishes one-game odds from the live series score, with correct clinched results', () => {
    expect(forecastSeries(.5,5,0,0).homeWinProbability).toBeCloseTo(.5,12);
    expect(forecastSeries(.5,5,0,1).homeWinProbability).toBeCloseTo(.3125,12);
    expect(forecastSeries(.5,5,1,0).homeWinProbability).toBeCloseTo(.6875,12);
    expect(forecastSeries(.6,1).homeWinProbability).toBeCloseTo(.6,12);
    expect(forecastSeries(.6,7,3,3).homeWinProbability).toBeCloseTo(.6,12);
    expect(forecastSeries(.2,3,2,0)).toEqual({homeWinProbability:1,awayWinProbability:0});
    expect(forecastSeries(.8,3,0,2)).toEqual({homeWinProbability:0,awayWinProbability:1});
    expect(forecastSeries(0,5).homeWinProbability).toBe(0);
    expect(forecastSeries(1,5).homeWinProbability).toBe(1);
    expect(()=>forecastSeries(.5,2)).toThrow('Invalid series');
  });

  it('uses the same advantage in overtime instead of a coin flip', () => {
    const run = (ot: number) => {
      const draws = [0, 0, ot];
      return simulateGame(team(95, 'a'), team(54, 'b'), {}, {}, () => draws.shift() ?? .5);
    };
    expect(run(.9)).toMatchObject({ overtime: true, blueScore: 1, orangeScore: 0 });
    expect(run(.9999)).toMatchObject({ overtime: true, blueScore: 0, orangeScore: 1 });
  });

  it('reconciles goals, assists, shots and opposition saves', () => {
    const a = team(90, 'a'), b = team(85, 'b'), random = seeded(8421);
    for (let i = 0; i < 300; i++) {
      const game = simulateGame(a, b, {}, {}, random);
      const sum = (side: typeof a, field: keyof typeof game.stats[string]) => side.players.reduce((total, p) => total + game.stats[p.id][field], 0);
      expect(game.blueScore).not.toBe(game.orangeScore);
      expect(sum(a, 'goals')).toBe(game.blueScore);
      expect(sum(b, 'goals')).toBe(game.orangeScore);
      expect(sum(a, 'assists')).toBeLessThanOrEqual(game.blueScore);
      expect(sum(b, 'assists')).toBeLessThanOrEqual(game.orangeScore);
      expect(sum(a, 'saves')).toBeLessThanOrEqual(sum(b, 'shots') - game.orangeScore);
      expect(sum(b, 'saves')).toBeLessThanOrEqual(sum(a, 'shots') - game.blueScore);
      for (const stat of Object.values(game.stats)) expect(stat.shots).toBeGreaterThanOrEqual(stat.goals);
    }
  });

  it('matches forecast probabilities and score rates over 50,000 seeded games', () => {
    const random = seeded(20261013);
    const report = [95, 90, 85, 75, 54].map(opponent => {
      const a = team(95, 'a'), b = team(opponent, 'b'), forecast = forecastGame(a, b);
      let wins = 0, goalsFor = 0, goalsAgainst = 0, overtime = 0;
      const count = 10000;
      for (let i = 0; i < count; i++) {
        const result = simulateGame(a, b, {}, {}, random);
        if (result.blueScore > result.orangeScore) wins++;
        goalsFor += result.blueScore;
        goalsAgainst += result.orangeScore;
        if (result.overtime) overtime++;
      }
      expect(Math.abs(wins / count - forecast.homeWinProbability)).toBeLessThan(.015);
      expect(Math.abs(goalsFor / count - (forecast.homeExpectedGoals + forecast.overtimeProbability * forecast.homeGoalShare))).toBeLessThan(.12);
      expect(Math.abs(goalsAgainst / count - (forecast.awayExpectedGoals + forecast.overtimeProbability * (1 - forecast.homeGoalShare)))).toBeLessThan(.12);
      expect(Math.abs(overtime / count - forecast.overtimeProbability)).toBeLessThan(.015);
      return { matchup: `95 vs ${opponent}`, wins, games: count, forecastPercent: +(100 * forecast.homeWinProbability).toFixed(3),
        actualPercent: wins / 100, avgGoalsFor: +(goalsFor / count).toFixed(2), avgGoalsAgainst: +(goalsAgainst / count).toFixed(2) };
    });
    console.log('Simulation calibration:', JSON.stringify(report));
    expect(report[4].actualPercent).toBeGreaterThan(99.9);
    expect(report[0].actualPercent).toBeGreaterThan(48);
    expect(report[0].actualPercent).toBeLessThan(52);
  }, 30000);

  it.each(['BO1', 'BO3', 'BO5', 'BO7'])('ends %s at the required wins without extra games', format => {
    const result = simulateSeries(team(95, 'a'), team(54, 'b'), format, {}, seeded(711));
    const required = (Number(format.slice(2)) + 1) / 2;
    expect(Math.max(result.homeWins, result.awayWins)).toBe(required);
    expect(result.games).toHaveLength(result.homeWins + result.awayWins);
    expect(result.games.length).toBeLessThanOrEqual(Number(format.slice(2)));
  });

  it('uses the same model for the mock provider and keeps its stats consistent', async () => {
    vi.useFakeTimers();
    try {
      const provider = new MockMatchProvider();
      const configSide = (id: string, overall: number) => ({ name: id, players: team(overall, id).players.map(p => ({
        playerId: p.id, name: p.id, rating: p.overall, attributes: { mechanics: overall, gameSense: overall, reactionTime: overall, boostManagement: overall, positioning: overall },
        tendency: 'BALANCED', isHuman: false
      })) });
      const handle = await provider.launchMatch({ fixtureId: 'fixture', gameNumber: 2, humanPlayerIndex: 0,
        blueTeam: configSide('a', 95), orangeTeam: configSide('b', 54) });
      await vi.advanceTimersByTimeAsync(10000);
      const result = (await provider.getMatchResult(handle))!;
      expect(result.blueStats.reduce((sum, p) => sum + p.goals, 0)).toBe(result.blueScore);
      expect(result.orangeStats.reduce((sum, p) => sum + p.goals, 0)).toBe(result.orangeScore);
      expect(result.blueScore).not.toBe(result.orangeScore);
      expect(await provider.getMatchStatus(handle)).toBe('completed');
    } finally { vi.useRealTimers(); }
  });
});
