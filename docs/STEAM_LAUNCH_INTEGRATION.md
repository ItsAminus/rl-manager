# Automatic Steam launch repair

Integrated into the v1.7.0 application update on 28 October 2026.

## What the v1.7.0 application update does

- Local and Rocket Host matches both configure RLBot through `game_launcher.configure_launcher`.
- A Steam installation is identified by its library path or app manifest. On Windows, RLM launches the selected `RocketLeague.exe` directly, with `SteamAppId=252950`, `SteamGameId=252950`, the RLBot controller address, packet rate, and `-noeac`. It does not use the Steam `-applaunch` route that produced the reported failure. Epic retains its existing authentication route.
- Before HUD connection/injection, both match routes merge the required RCON permissions automatically. The original file is backed up once as `rcon_commands.cfg.before-rlm`; unrelated rules remain intact. Writes are atomic and retry-safe. The separate RCON password configuration is untouched.
- The complete setup and HUD installer use the same command list. No support ZIP, PowerShell command, or manual replacement of the config is required after receiving an application build containing this work.
- The packaged application refreshes its writable bridge using both release version and shipped content, and checks installed Python files against the shipped files. A same-version rebuild, missing script or stale installed launcher cannot silently keep the old Steam launch code. Saved careers, preferences and generated runtime state remain in place.

Required permissions: `ws_inventory`, `sendback`, `rcon_password`, `plugin`, `cl_settings_refreshplugins`, `rcon_refresh_allowed`, `disconnect`, `unreal_command`, `open`, `rlm_host_arm`, `rlm_host_stop`, `rlm_hud_enabled`, `rlm_scoreboard_enabled`, `rlm_host_ready`. No wildcard is added.

## Verification and limits

- Python launcher/startup tests check the direct Steam executable, environment isolation, preserved bot arguments, Steam-client requirement, Epic isolation, readiness sequencing, permission merging, backups and repeated calls.
- Bridge installation tests check upgrades from the legacy version marker, same-version changes, missing/stale files and retention of user state.
- The complete setup's actual PowerShell merge functions were exercised against a disposable config, checking all permissions, preservation of a custom rule and idempotency.
- The player build passes. These checks do not constitute an injection test on the affected remote Steam PC. The Steam client still needs to be running and signed in; RLM cannot sign in on a user's behalf. A game already launched in an incompatible mode may need closing once before the corrected launch route can run. RLM must still verify the live HUD/control connection before reporting success.
