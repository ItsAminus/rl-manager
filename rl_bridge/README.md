# RL Manager - RLBot Bridge

This module serves as the bridge between the **RL Manager** frontend/simulation engine and **RLBot**.

## Architecture Overview

1. **Manager to Bridge:** The game resolves player statistics (Rating 1-100) and converts them into an RLBot compatible profile using `bot-skill-resolver.ts`.
2. **Configuration:** `match-config-generator.ts` writes a TOML configuration specifying match settings, arena, team colors, and bot mappings.
3. **Execution:** `rlbot-match-provider.ts` spawns the RLBot process, launching Rocket League and dropping the bots (and the human player) into the game.
4. **Monitoring:** `match-monitor.ts` watches for output.
5. **Ingestion:** Upon completion, `match-result-handler.ts` takes the parsed stats (goals, assists, score) and updates the internal database, adjusting standings, player form, fatigue, and triggering inbox events.

## Bot Mappings

`data/bot_mappings.json` maps player ratings to specific bot profiles (e.g., Psyonix Allstar, Nectar, Nexto) using varying skill parameters.
For example, a player with a 95+ rating will trigger Nexto, while a 70 rating triggers Kamael or Psyonix Pro.

## Troubleshooting

- **Rocket League Not Found:** Manually override your path in the game settings or verify Steam/Epic is installed in standard directories.
- **RLBot Issues:** Ensure you have RLBot v5 installed. Try running `rl_bridge/test_match.py` directly to isolate if the issue is Node.js integration or your local Python/RLBot environment.
