import { MatchProvider, MatchConfig, MatchHandle, MatchStatus, MatchResult, PlayerMatchStats } from './match-provider';
import { simulateGame } from '../game/match-simulation';

export class MockMatchProvider implements MatchProvider {
  name = 'Mock Simulation Provider';
  private matches: Map<string, { status: MatchStatus; config: MatchConfig; startTime: number; result: MatchResult | null }> = new Map();

  async isAvailable(): Promise<boolean> {
    return true; // Always available
  }

  async launchMatch(config: MatchConfig): Promise<MatchHandle> {
    const id = `mock-match-${Date.now()}`;
    const handle: MatchHandle = { id, config, startTime: Date.now() };
    
    this.matches.set(id, {
      status: 'in_progress',
      config,
      startTime: handle.startTime,
      result: null
    });

    // Simulate match completion after 10 seconds
    setTimeout(() => {
      this.completeMatch(id, config);
    }, 10000);

    return handle;
  }

  async getMatchStatus(handle: MatchHandle): Promise<MatchStatus> {
    const match = this.matches.get(handle.id);
    return match ? match.status : 'failed';
  }

  async getMatchResult(handle: MatchHandle): Promise<MatchResult | null> {
    const match = this.matches.get(handle.id);
    return match ? match.result : null;
  }

  async cancelMatch(handle: MatchHandle): Promise<void> {
    const match = this.matches.get(handle.id);
    if (match && match.status === 'in_progress') {
      match.status = 'cancelled';
    }
  }

  private completeMatch(id: string, config: MatchConfig) {
    const match = this.matches.get(id);
    if (!match || match.status !== 'in_progress') return;

    const side = (team: MatchConfig['blueTeam'], id: string) => ({ id,
      players: team.players.map(p => ({ ...p, id: p.playerId, overall: p.rating })) });
    const result = simulateGame(side(config.blueTeam, 'blue'), side(config.orangeTeam, 'orange'));
    const playerStats = (team: MatchConfig['blueTeam']): PlayerMatchStats[] => team.players.map(p => ({
      playerId: p.playerId, ...result.stats[p.playerId]
    }));

    match.status = 'completed';
    match.result = {
      fixtureId: config.fixtureId,
      gameNumber: config.gameNumber,
      blueScore: result.blueScore,
      orangeScore: result.orangeScore,
      blueStats: playerStats(config.blueTeam),
      orangeStats: playerStats(config.orangeTeam),
      durationSeconds: 300,
      completedAt: Date.now()
    };
  }
}
