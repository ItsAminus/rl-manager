import { RLBotDetector, PrerequisiteStatus } from './rlbot-detector';

export interface IntegrationStatus {
  isReady: boolean;
  rocketLeagueFound: boolean;
  rlbotFound: boolean;
  messages: string[];
}

export class IntegrationStatusService {
  private detector: RLBotDetector;
  private cachedStatus: IntegrationStatus | null = null;
  private lastCheck = 0;
  private readonly CACHE_TTL = 60000; // 1 minute

  constructor() {
    this.detector = new RLBotDetector();
  }

  async checkAllPrerequisites(forceRefresh = false): Promise<IntegrationStatus> {
    if (!forceRefresh && this.cachedStatus && (Date.now() - this.lastCheck < this.CACHE_TTL)) {
      return this.cachedStatus;
    }

    const prereqs: PrerequisiteStatus = await this.detector.validatePrerequisites();
    const messages: string[] = [];

    if (!prereqs.rocketLeague.found) {
      messages.push('Rocket League installation not found. Please verify your game path.');
    } else {
      messages.push(`Rocket League detected (${prereqs.rocketLeague.platform}).`);
    }

    if (!prereqs.rlbot.found) {
      messages.push('RLBot installation not found. Please install RLBot v5.');
    } else {
      messages.push(`RLBot detected (Version: ${prereqs.rlbot.version}).`);
    }

    this.cachedStatus = {
      isReady: prereqs.rocketLeague.found && prereqs.rlbot.found,
      rocketLeagueFound: prereqs.rocketLeague.found,
      rlbotFound: prereqs.rlbot.found,
      messages
    };

    this.lastCheck = Date.now();
    return this.cachedStatus;
  }
}
