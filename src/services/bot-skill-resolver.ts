import { PlayerAttributes, MatchPlayerConfig } from './match-provider';

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

export interface BotLaunchConfig {
  name: string;
  type: string;
  executablePath?: string;
  parameters: Record<string, any>;
}

export interface BotAdapter {
  name: string;
  getCapabilities(): any;
  supportsSkillScaling(): boolean;
  supportsPlayStyle(): boolean;
  configure(profile: RLManagerBotProfile): BotLaunchConfig;
  getLaunchConfiguration(): any;
}

export class BotSkillResolver {
  public translateAttributes(attributes: PlayerAttributes, tendency: string): RLManagerBotProfile {
    // Translate 0-100 attributes to specific bot behaviors
    const aggMod = tendency === 'Aggressive' ? 1.2 : tendency === 'Defensive' ? 0.8 : 1.0;
    const defMod = tendency === 'Defensive' ? 1.2 : 1.0;
    
    return {
      mechanicalSkill: attributes.mechanics / 100,
      reactionTime: Math.max(0.1, 1 - (attributes.reactionTime / 100)), // lower is faster
      shotAccuracy: attributes.mechanics / 100,
      aerialConfidence: (attributes.mechanics + attributes.gameSense) / 200,
      defensiveBias: (attributes.positioning / 100) * defMod,
      aggression: (attributes.gameSense / 100) * aggMod,
      challengeFrequency: (attributes.reactionTime / 100) * aggMod,
      boostEfficiency: attributes.boostManagement / 100,
      passingBias: attributes.gameSense / 100,
      demoBias: tendency === 'Aggressive' ? 0.8 : 0.2,
      riskTolerance: tendency === 'Aggressive' ? 0.9 : 0.3,
      rotationDiscipline: attributes.positioning / 100
    };
  }

  public resolveBotForPlayer(player: MatchPlayerConfig, availableBots: any[]): BotLaunchConfig {
    const r = player.rating;
    let botType = 'psyonix';
    let skillLevel = 1.0;

    if (r >= 85) { botType = 'nexto'; skillLevel = r > 85 ? 1 : .8; }
    else if (r >= 70) { botType = 'necto'; skillLevel = Math.min(1, .7 + (r - 70) * .025); }
    else { botType = 'psyonix'; skillLevel = Math.max(0, r / 100); }

    const profile = this.translateAttributes(player.attributes, player.tendency);

    return {
      name: player.name,
      type: botType,
      parameters: { ...(botType === 'psyonix' ? { skill: skillLevel } : { beta: skillLevel }), profile }
    };
  }
}
