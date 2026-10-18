import { MatchConfig } from './match-provider';
import * as fs from 'fs';
import * as path from 'path';
import { BotSkillResolver } from './bot-skill-resolver';

export class MatchConfigGenerator {
  private resolver = new BotSkillResolver();

  async generateMatchConfig(config: MatchConfig, botMappings: any): Promise<string> {
    const configDir = path.join(process.env.APPDATA || '', 'rl-manager', 'match-configs');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const configPath = path.join(configDir, `match-${config.fixtureId}.toml`);
    
    // Build TOML content for RLBot v5
    let toml = `[match]\n`;
    toml += `game_mode = "Soccer"\n`;
    toml += `game_map = "${config.arena || 'Mannfield'}"\n`;
    toml += `match_length = "5 Minutes"\n`;
    toml += `existing_match_behavior = "Restart"\n`;
    toml += `enable_rendering = true\n`;
    toml += `enable_state_setting = true\n\n`;

    toml += `[mutators]\n`;
    toml += `match_length = "5 Minutes"\n`;
    toml += `boost_amount = "Normal"\n\n`;

    let playerIndex = 0;

    // Blue Team
    config.blueTeam.players.forEach((player, idx) => {
      toml += `[[cars]]\n`;
      toml += `team = 0\n`;
      toml += `name = "${player.name}"\n`;
      if (player.isHuman && idx === config.humanPlayerIndex) {
        toml += `type = "human"\n`;
      } else {
        const botConfig = this.resolver.resolveBotForPlayer(player, botMappings);
        toml += `type = "rlbot"\n`;
        toml += `agent_id = "${botConfig.type}"\n`;
        // In real RLBot v5, config parameters would point to a specific bot TOML
      }
      toml += `\n`;
      playerIndex++;
    });

    // Orange Team
    config.orangeTeam.players.forEach((player) => {
      toml += `[[cars]]\n`;
      toml += `team = 1\n`;
      toml += `name = "${player.name}"\n`;
      if (player.isHuman) {
        toml += `type = "human"\n`;
      } else {
        const botConfig = this.resolver.resolveBotForPlayer(player, botMappings);
        toml += `type = "rlbot"\n`;
        toml += `agent_id = "${botConfig.type}"\n`;
      }
      toml += `\n`;
      playerIndex++;
    });

    fs.writeFileSync(configPath, toml, 'utf8');
    return configPath;
  }
}
