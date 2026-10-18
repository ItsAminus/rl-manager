// Note: Using a generic mock for better-sqlite3 types to ensure this builds
import { runAllMigrations } from './migrations/index';

export class DatabaseService {
  private db: any;

  constructor(sqliteDbInstance: any) {
    this.db = sqliteDbInstance;
    runAllMigrations(this.db);
  }

  close() {
    this.db.close();
  }

  // --- Players ---
  getPlayerById(id: string) {
    const player = this.db.prepare('SELECT * FROM players WHERE id = ?').get(id);
    if (!player) return null;
    player.attributes = this.db.prepare('SELECT * FROM player_attributes WHERE playerId = ?').get(id);
    player.traits = this.db.prepare('SELECT * FROM player_traits WHERE playerId = ?').get(id);
    return player;
  }

  getPlayersByTeam(teamId: string) {
    const players = this.db.prepare('SELECT * FROM players WHERE teamId = ?').all(teamId);
    return players.map((p: any) => this.getPlayerById(p.id));
  }

  getFreeAgents() {
    const players = this.db.prepare('SELECT * FROM players WHERE teamId IS NULL').all();
    return players.map((p: any) => this.getPlayerById(p.id));
  }

  searchPlayers(query: string) {
    const players = this.db.prepare('SELECT * FROM players WHERE gamertag LIKE ?').all(`%${query}%`);
    return players.map((p: any) => this.getPlayerById(p.id));
  }

  // --- Teams ---
  getTeamById(id: string) {
    return this.db.prepare('SELECT * FROM teams WHERE id = ?').get(id);
  }

  getAllTeams() {
    return this.db.prepare('SELECT * FROM teams').all();
  }

  getTeamsByRegion(region: string) {
    return this.db.prepare('SELECT * FROM teams WHERE region = ?').all(region);
  }

  // --- Competitions & Fixtures ---
  getCompetitions(seasonId: string) {
    return this.db.prepare('SELECT * FROM competitions WHERE seasonId = ?').all(seasonId);
  }

  getFixtures(competitionId: string) {
    return this.db.prepare('SELECT * FROM fixtures WHERE competitionId = ?').all(competitionId);
  }

  getResults(fixtureId: string) {
    return this.db.prepare('SELECT * FROM game_results WHERE fixtureId = ?').all(fixtureId);
  }

  // --- Transactions / Core ---
  transaction(fn: () => void) {
    return this.db.transaction(fn)();
  }
}
