// ============================================================
// RL Manager — Core Type Definitions
// ============================================================

// --- Enums ---

export enum Region {
  NORTH_AMERICA = 'North America',
  EUROPE = 'Europe',
  MENA = 'MENA',
  OCEANIA = 'Oceania',
  SOUTH_AMERICA = 'South America',
  ASIA_PACIFIC = 'Asia-Pacific',
  SUB_SAHARAN_AFRICA = 'Sub-Saharan Africa',
}

export const REGION_CODE_MAP: Record<string, string> = {
  EU: 'Europe',
  NA: 'North America',
  MENA: 'MENA',
  OCE: 'Oceania',
  SAM: 'South America',
  APAC: 'Asia-Pacific',
  SSA: 'Sub-Saharan Africa',
  Europe: 'Europe',
  'North America': 'North America',
  Oceania: 'Oceania',
  'South America': 'South America',
  'Asia-Pacific': 'Asia-Pacific',
  'Sub-Saharan Africa': 'Sub-Saharan Africa',
  GLOBAL: 'GLOBAL',
};

export function matchesRegion(r1?: string, r2?: string): boolean {
  if (!r1 || !r2) return false;
  if (r1.toLowerCase() === r2.toLowerCase()) return true;
  const mapped1 = (REGION_CODE_MAP[r1] || r1).toLowerCase();
  const mapped2 = (REGION_CODE_MAP[r2] || r2).toLowerCase();
  return mapped1 === mapped2;
}

export enum Difficulty {
  EASY = 'Easy',
  MEDIUM = 'Medium',
  HARD = 'Hard',
  CASUAL = 'Casual',
  STANDARD = 'Standard',
  REALISTIC = 'Realistic',
}

export enum PlayerTendency {
  AGGRESSIVE_FIRST_MAN = 'Aggressive First Man',
  PLAYMAKER = 'Playmaker',
  SUPPORT = 'Support',
  DEFENSIVE_ANCHOR = 'Defensive Anchor',
  MECHANICAL_CARRY = 'Mechanical Carry',
  DEMO_DISRUPTION = 'Demo / Disruption',
  BALANCED_FLEX = 'Balanced / Flex',
}

export enum ScoutKnowledge {
  UNKNOWN = 'Unknown',
  BASIC = 'Basic',
  GOOD = 'Good',
  FULL = 'Full',
}

export enum SeriesFormat {
  BO1 = 1,
  BO3 = 3,
  BO5 = 5,
  BO7 = 7,
}

export enum CompetitionFormatType {
  ROUND_ROBIN = 'round_robin',
  SWISS = 'swiss',
  SINGLE_ELIMINATION = 'single_elimination',
  DOUBLE_ELIMINATION = 'double_elimination',
  GROUP_STAGE = 'group_stage',
  PLAYOFFS = 'playoffs',
}

export enum CompetitionStatus {
  UPCOMING = 'upcoming',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

export enum FixtureStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  INCOMPLETE = 'incomplete',
}

export enum TacticStyle {
  DEFENSIVE = 'Defensive',
  BALANCED = 'Balanced',
  AGGRESSIVE = 'Aggressive',
}

export enum TacticLevel {
  LOW = 'Low',
  NORMAL = 'Normal',
  HIGH = 'High',
}

export enum TacticTriple {
  CONSERVATIVE = 'Conservative',
  BALANCED = 'Balanced',
  AGGRESSIVE = 'Aggressive',
}

export enum RotationStyle {
  STRUCTURED = 'Structured',
  BALANCED = 'Balanced',
  FLUID = 'Fluid',
}

export enum BoostPriority {
  CONSERVATIVE = 'Conservative',
  BALANCED = 'Balanced',
  HEAVY = 'Heavy',
}

export enum PassingStyle {
  SOLO_FOCUS = 'Solo Focus',
  BALANCED = 'Balanced',
  PASSING_FOCUS = 'Passing Focus',
}

export enum PressureLevel {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
}

export enum TrainingCategory {
  MECHANICS = 'Mechanics',
  SHOOTING = 'Shooting',
  AERIAL = 'Aerial',
  DEFENSE = 'Defense',
  POSITIONING = 'Positioning',
  TEAM_PLAY = 'Team Play',
  BOOST_MANAGEMENT = 'Boost Management',
  RECOVERY = 'Recovery',
  MENTAL_PRESSURE = 'Mental / Pressure',
  REST = 'Rest',
}

export enum TrainingIntensity {
  LOW = 'Low',
  NORMAL = 'Normal',
  HIGH = 'High',
}

export enum MatchRole {
  FIRST_MAN = 'First Man',
  SECOND_MAN = 'Second Man',
  THIRD_MAN = 'Third Man / Anchor',
}

export enum TransferStatus {
  PENDING = 'Pending',
  ACCEPTED = 'Accepted',
  REJECTED = 'Rejected',
  COUNTER_OFFERED = 'Counter Offered',
  EXPIRED = 'Expired',
}

export enum InboxItemType {
  MATCH_RESULT = 'match_result',
  MATCH_UPCOMING = 'match_upcoming',
  CONTRACT_EXPIRING = 'contract_expiring',
  TRANSFER_OFFER = 'transfer_offer',
  SCOUT_REPORT = 'scout_report',
  PLAYER_UNHAPPY = 'player_unhappy',
  PLAYER_CONVERSATION = 'player_conversation',
  PLAYER_DEVELOPMENT = 'player_development',
  TOURNAMENT_INVITATION = 'tournament_invitation',
  PRIZE_MONEY = 'prize_money',
  ROSTER_DEADLINE = 'roster_deadline',
  GENERAL = 'general',
}

// --- Interfaces ---

/** All 19 player attributes rated 1-99 */
export interface PlayerAttributes {
  mechanics: number;
  aerial: number;
  groundControl: number;
  shooting: number;
  shotPower: number;
  shotAccuracy: number;
  passing: number;
  defense: number;
  goalkeeping: number;
  positioning: number;
  rotations: number;
  boostManagement: number;
  speed: number;
  recovery: number;
  fiftyFifty: number;
  demolitions: number;
  gameSense: number;
  consistency: number;
  clutch: number;
}

/** Hidden/semi-hidden player traits (1-99 scale) */
export interface PlayerTraits {
  aggression: number;
  riskTolerance: number;
  teamOrientation: number;
  adaptability: number;
  pressureResistance: number;
  developmentRate: number;
  professionalism: number;
  confidence: number;
  tiltTendency: number;
}

export interface Contract {
  id: string;
  playerId: string;
  teamId: string;
  salary: number;
  duration: number; // months
  startDate: string;
  endDate: string;
  signingBonus: number;
  buyout: number;
  isActive: boolean;
}

export interface Player {
  id: string;
  gamertag: string;
  realName: string;
  nationality: string;
  region: Region;
  age: number | null;
  teamId: string | null;
  preferredTendency: PlayerTendency;
  overall: number;
  potential: number;
  form: number;
  morale: number;
  fatigue: number;
  consistency: number;
  chemistry: number;
  reputation: number;
  careerEarnings: number;
  marketValue: number;
  salary: number;
  buyout: number;
  teamName?: string | null;
  careerTitle?: string | null;
  careerHonours?: {competitionId:string;competitionName:string;title:string|null;earnedDate:string;year:number}[];
  affiliationStatus?: string | null;
  affiliationNote?: string | null;
  ratingConfidence?: string | null;
  ratingMethod?: string | null;
  ratingReviewedAt?: string | null;
  ratingSources?: string | null;
  scoutKnowledge: ScoutKnowledge;
  attributes: PlayerAttributes;
  traits: PlayerTraits;
}

export interface PlayerSeasonStats {
  playerId: string;
  seasonId: string;
  competitionId?: string;
  games: number;
  goals: number;
  assists: number;
  saves: number;
  shots: number;
  demos: number;
  mvps: number;
  wins: number;
  losses: number;
  score: number;
}

export interface Team {
  branding?: import('../game/club-design').ClubBranding;
  broadcastColor?: string;
  id: string;
  name: string;
  shortName: string;
  region: Region;
  reputation: number;
  budget: number;
  cashBalance: number;
  coachRating: number;
  facilityLevel: number;
  fanbase: number;
  sponsorIncome: number;
  teamChemistry: number;
  teamForm: number;
  roster: string[]; // Player IDs
  starters: string[]; // 3 starter player IDs
  isPlayerManaged: boolean;
  rosterStatus?: string;
  rosterVerifiedAt?: string;
  rosterSource?: string;
  rosterNote?: string;
}

export interface TacticSettings {
  overallStyle: TacticStyle;
  challengeFrequency: TacticTriple;
  rotation: RotationStyle;
  boostPriority: BoostPriority;
  demoFrequency: TacticLevel;
  passing: PassingStyle;
  pressure: PressureLevel;
  playerRoles: Record<string, MatchRole>; // playerId -> role
}

export interface TrainingPlan {
  id: string;
  teamId: string;
  week: number;
  category: TrainingCategory;
  intensity: TrainingIntensity;
}

export interface TrainingHistory {
  id: string;
  teamId: string;
  playerId: string;
  date: string;
  category: TrainingCategory;
  intensity: TrainingIntensity;
  attributeChanges: Partial<PlayerAttributes>;
}

// --- Match & Competition ---

export interface GamePlayerStats {
  playerId: string;
  goals: number;
  assists: number;
  saves: number;
  shots: number;
  demos: number;
  score: number;
}

export interface GameResult {
  id: string;
  fixtureId: string;
  gameNumber: number;
  blueTeamId: string;
  orangeTeamId: string;
  blueScore: number;
  orangeScore: number;
  playerStats: GamePlayerStats[];
  wasPlayed: boolean;
  playedByHuman: boolean;
}

export interface Fixture {
  id: string;
  competitionId: string;
  competitionName?: string;
  round: number;
  homeTeamId: string;
  homeTeamName?: string;
  awayTeamId: string;
  awayTeamName?: string;
  scheduledDate: string;
  status: FixtureStatus;
  seriesFormat: SeriesFormat;
  homeSeriesScore: number;
  awaySeriesScore: number;
  homeScore?: number;
  awayScore?: number;
  games: GameResult[];
}

export interface StandingsEntry {
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  gameDiff: number;
  points: number;
}

export interface CompetitionStage {
  id: string;
  name: string;
  format: CompetitionFormatType;
  seriesFormat: SeriesFormat;
  fixtures: Fixture[];
  standings: StandingsEntry[];
  isComplete: boolean;
}

export interface Competition {
  id: string;
  name: string;
  region: Region | 'International';
  type: string;
  format: CompetitionFormatType;
  prizePool: number;
  seasonId: string;
  status: CompetitionStatus;
  config: CompetitionConfig;
  stages: CompetitionStage[];
  entrants: string[]; // team IDs
}

export interface CompetitionConfig {
  groupCount?: number;
  teamsPerGroup?: number;
  qualifyingPerGroup?: number;
  seriesFormat: SeriesFormat;
  playoffSeriesFormat?: SeriesFormat;
}

export interface Season {
  id: string;
  careerId: string;
  number: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

// --- Career ---

export interface Career {
  mode?:'Manager Career'|'Path To Glory';
  transferWindows?:{start:string;end:string}[];
  id: string;
  managerName: string;
  teamId: string;
  region: Region;
  difficulty: Difficulty;
  currentDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEvent {
  id: string;
  careerId: string;
  date: string;
  type: 'match' | 'training' | 'transfer_window' | 'contract_expiration' | 'inbox' | 'tournament_start' | 'other';
  title: string;
  description: string;
  relatedId?: string;
  isRead: boolean;
}

export interface InboxItem {
  id: string;
  careerId: string;
  date: string;
  type: InboxItemType;
  title: string;
  body: string;
  isRead: boolean;
  actions?: InboxAction[];
}

export interface InboxAction {
  label: string;
  action: string;
  data?: Record<string, unknown>;
}

// --- Transfers ---

export interface TransferOffer {
  id: string;
  playerId: string;
  fromTeamId: string | null;
  toTeamId: string;
  fee: number;
  salary: number;
  contractDuration: number;
  signingBonus: number;
  buyout: number;
  date: string;
  status: TransferStatus;
}

export interface ScoutReport {
  id: string;
  playerId: string;
  date: string;
  knowledge: ScoutKnowledge;
  estimatedOverall: [number, number]; // range
  estimatedPotential: [number, number]; // range
  revealedAttributes: Partial<PlayerAttributes>;
  revealedTraits: Partial<PlayerTraits>;
  notes: string;
}

// --- Finances ---

export interface FinancialTransaction {
  id: string;
  careerId: string;
  teamId: string;
  date: string;
  amount: number;
  type: 'income' | 'expense';
  category: 'prize_money' | 'transfer_income' | 'transfer_expense' | 'salary' | 'sponsor' | 'signing_bonus' | 'other';
  description: string;
}

// --- RLBot Integration ---

export interface RLBotConfig {
  rocketLeaguePath: string;
  rlbotPath: string;
  botPackPath: string;
  defaultArena: string;
  preferredTeamColor: 'blue' | 'orange';
  isConfigured: boolean;
}

export interface BotInfo {
  id: string;
  name: string;
  path: string;
  type: string;
  capabilities: BotCapabilities;
}

export interface BotCapabilities {
  supportsSkillScaling: boolean;
  supportsPlayStyle: boolean;
  maxSkillLevel?: number;
  configFields?: string[];
}

export interface BotLaunchConfig {
  botId: string;
  botPath: string;
  botType: string;
  skillLevel?: number;
  playStyleConfig?: Record<string, number>;
}

export interface RLManagerBotProfile {
  mechanicalSkill: number;
  reactionTime: number;
  shotAccuracy: number;
  aerialConfidence: number;
  defensiveBias: number;
  aggression: number;
  challengeFrequency: number;
  boostEfficiency: number;
  passingBias: number;
  demoBias: number;
  riskTolerance: number;
  rotationDiscipline: number;
}

export interface MatchConfig {
  fixtureId: string;
  gameNumber: number;
  blueTeam: MatchTeamConfig;
  orangeTeam: MatchTeamConfig;
  humanPlayerIndex: number;
  arena: string;
}

export interface MatchTeamConfig {
  teamId: string;
  name: string;
  players: MatchPlayerConfig[];
}

export interface MatchPlayerConfig {
  playerId: string;
  name: string;
  rating: number;
  attributes: PlayerAttributes;
  tendency: PlayerTendency;
  isHuman: boolean;
}

export interface MatchHandle {
  id: string;
  processId?: number;
  configPath?: string;
  provider: string;
}

export type MatchStatus = 'launching' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export interface MatchProviderResult {
  fixtureId: string;
  gameNumber: number;
  blueScore: number;
  orangeScore: number;
  players: GamePlayerStats[];
  wasPlayed: boolean;
}

// --- Settings ---

export interface AppSettings {
  general: {
    autosave: boolean;
    simulationSpeed: 'slow' | 'normal' | 'fast';
    developerMode: boolean;
  };
  display: {
    sidebarCollapsed: boolean;
  };
  rlbot: RLBotConfig;
}

// --- Save Game ---

export interface SaveGameMeta {
  id: string;
  managerName: string;
  teamName: string;
  currentDate: string;
  lastPlayedAt: string;
  difficulty: Difficulty;
  season: number;
}

export interface PrerequisiteStatus {
  rocketLeague: { found: boolean; path: string; platform?: string };
  rlbot: { found: boolean; path: string; version?: string };
  botPack: { found: boolean; botCount: number; bots: BotInfo[] };
  humanControl: { ready: boolean };
  overall: boolean;
}

// --- UI State ---

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: number;
}
