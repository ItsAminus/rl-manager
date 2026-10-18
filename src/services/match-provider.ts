export interface MatchProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  launchMatch(config: MatchConfig): Promise<MatchHandle>;
  getMatchStatus(handle: MatchHandle): Promise<MatchStatus>;
  getMatchResult(handle: MatchHandle): Promise<MatchResult | null>;
  cancelMatch(handle: MatchHandle): Promise<void>;
}

export interface PlayerAttributes {
  mechanics: number;
  gameSense: number;
  reactionTime: number;
  boostManagement: number;
  positioning: number;
}

export interface MatchPlayerConfig {
  playerId: string;
  name: string;
  rating: number;
  attributes: PlayerAttributes;
  tendency: string;
  isHuman: boolean;
}

export interface MatchTeamConfig {
  name: string;
  players: MatchPlayerConfig[];
}

export interface MatchConfig {
  fixtureId: string;
  gameNumber: number;
  blueTeam: MatchTeamConfig;
  orangeTeam: MatchTeamConfig;
  humanPlayerIndex: number;
  arena?: string;
}

export interface MatchHandle {
  id: string;
  config: MatchConfig;
  startTime: number;
}

export type MatchStatus = 'waiting' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export interface PlayerMatchStats {
  playerId: string;
  goals: number;
  assists: number;
  saves: number;
  shots: number;
  demos: number;
  score: number;
}

export interface MatchResult {
  fixtureId: string;
  gameNumber: number;
  blueScore: number;
  orangeScore: number;
  blueStats: PlayerMatchStats[];
  orangeStats: PlayerMatchStats[];
  durationSeconds: number;
  completedAt: number;
}
