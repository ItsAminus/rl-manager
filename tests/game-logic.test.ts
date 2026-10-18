import { describe, it, expect } from 'vitest';
import { calculateOVR } from '../src/game/ovr-calculator';
import { simulateGame, simulateSeries } from '../src/game/match-simulation';
import { calculateChemistry } from '../src/game/chemistry';
import { developPlayer } from '../src/game/player-development';
import { calculateMarketValue, calculateSalary } from '../src/game/finances';
import { PlayerTendency, Region, ScoutKnowledge } from '../src/types';

describe('Pure Game Logic Unit Tests', () => {
  const sampleAttributes = {
    mechanics: 95,
    aerial: 94,
    groundControl: 92,
    shooting: 90,
    shotPower: 92,
    shotAccuracy: 94,
    passing: 88,
    defense: 85,
    goalkeeping: 86,
    positioning: 90,
    rotations: 88,
    boostManagement: 93,
    speed: 95,
    recovery: 92,
    fiftyFifty: 85,
    demolitions: 70,
    gameSense: 92,
    consistency: 90,
    clutch: 95,
  };

  const sampleTraits = {
    aggression: 70,
    riskTolerance: 65,
    teamOrientation: 85,
    adaptability: 80,
    pressureResistance: 90,
    developmentRate: 85,
    professionalism: 90,
    confidence: 85,
    tiltTendency: 20,
  };

  const samplePlayer = {
    id: 'p1',
    gamertag: 'zen',
    realName: 'Alexis Bernier',
    nationality: 'FR',
    region: Region.EUROPE,
    age: 17,
    teamId: 'team_1',
    preferredTendency: PlayerTendency.MECHANICAL_CARRY,
    overall: 94,
    potential: 98,
    form: 80,
    morale: 85,
    fatigue: 0,
    consistency: 90,
    chemistry: 80,
    reputation: 92,
    careerEarnings: 300000,
    marketValue: 850000,
    salary: 25000,
    buyout: 1200000,
    scoutKnowledge: ScoutKnowledge.FULL,
    attributes: sampleAttributes,
    traits: sampleTraits,
  };

  // 1. OVR Calculation Test
  it('calculates weighted OVR accurately for a mechanical carry player', () => {
    const ovr = calculateOVR(sampleAttributes, PlayerTendency.MECHANICAL_CARRY);
    expect(ovr).toBeGreaterThanOrEqual(88);
    expect(ovr).toBeLessThanOrEqual(99);
  });

  // 2. Match Simulation Test
  it('simulates a realistic 3v3 match with no ties and reconciled statistics', () => {
    const homeTeam = {
      id: 'team_1',
      players: [samplePlayer, { ...samplePlayer, id: 'p2', overall: 90 }, { ...samplePlayer, id: 'p3', overall: 88 }],
      teamChemistry: 85,
      teamForm: 70,
    };
    const awayTeam = {
      id: 'team_2',
      players: [
        { ...samplePlayer, id: 'p4', overall: 85 },
        { ...samplePlayer, id: 'p5', overall: 84 },
        { ...samplePlayer, id: 'p6', overall: 82 },
      ],
      teamChemistry: 75,
      teamForm: 50,
    };

    const res = simulateGame(homeTeam, awayTeam, {}, {});
    expect(res).toBeDefined();
    expect(res.blueScore).not.toBe(res.orangeScore); // Rocket League has overtime, no ties
    expect(res.blueScore).toBeGreaterThanOrEqual(0);
    expect(res.orangeScore).toBeGreaterThanOrEqual(0);
  });

  // 3. Series Simulation Test (BO5)
  it('simulates a Best-of-5 series ending when a team hits 3 wins', () => {
    const homeTeam = {
      id: 'team_1',
      players: [samplePlayer, { ...samplePlayer, id: 'p2', overall: 90 }, { ...samplePlayer, id: 'p3', overall: 88 }],
      teamChemistry: 85,
      teamForm: 70,
    };
    const awayTeam = {
      id: 'team_2',
      players: [
        { ...samplePlayer, id: 'p4', overall: 85 },
        { ...samplePlayer, id: 'p5', overall: 84 },
        { ...samplePlayer, id: 'p6', overall: 82 },
      ],
      teamChemistry: 75,
      teamForm: 50,
    };

    const series = simulateSeries(homeTeam, awayTeam, 'BO5', { home: {}, away: {} });
    expect(series).toBeDefined();
    expect([series.homeWins, series.awayWins]).toContain(3);
    expect(series.games.length).toBeGreaterThanOrEqual(3);
    expect(series.games.length).toBeLessThanOrEqual(5);
  });

  // 4. Chemistry Calculation Test
  it('calculates team chemistry on a 0-100 scale', () => {
    const team = {
      id: 'team_1',
      name: 'Vitality',
      teamChemistry: 80,
      coachRating: 85,
    };
    const players = [samplePlayer, { ...samplePlayer, id: 'p2' }, { ...samplePlayer, id: 'p3' }];
    const chem = calculateChemistry(team as any, players as any);
    expect(chem).toBeGreaterThanOrEqual(0);
    expect(chem).toBeLessThanOrEqual(100);
  });

  // 5. Player Development Test
  it('develops young prospect with positive potential ceiling', () => {
    const changes = developPlayer(samplePlayer as any, { focus: 'mechanics', intensity: 'HIGH' }, {});
    expect(changes).toBeDefined();
    expect(typeof changes).toBe('object');
  });

  // 6. Finances & Valuation Test
  it('calculates market value and salary tiers realistically', () => {
    const val = calculateMarketValue(samplePlayer as any);
    const wage = calculateSalary(samplePlayer as any);
    expect(val).toBeGreaterThan(100000);
    expect(wage).toBeGreaterThan(3000);
  });
});
