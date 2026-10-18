# Developing RL Manager

Players should follow the [first-time installation guide](../README.md). These instructions are for source development.

## Requirements

Use Windows x64 and Node.js 20 or later. Played matches use the compatible RLBot 1.68 runtime (v4 protocol). The unrelated v5 protocol is not a replacement for the supplied runtime.

## Commands

```powershell
npm ci
npm run dev
npm test
npm run build:player
npm run package:win
```

The Windows installer is written to `release/<version>/`. The source repository excludes careers, credentials, generated installers, third-party runtimes, speech weights and voice recordings. Supply the runtime/audio inputs described in the packaging scripts to reproduce a complete kit; cloning alone does not download them.

See [release packaging](PLAYER_RELEASE.md), [storage](PROJECT_STORAGE.md), [AMD speech](AMD_SPEECH.md), and `scripts/complete-setup`.

## Source layout

- `src/main`: Electron services, career state and match integration.
- `src/renderer`: React interface, tutorial, sound and animation.
- `src/game`: rules, simulation, development and tactics.
- `rl_bridge`: local/hosted match bridge, controls and commentary.
- `bakkesmod`: career HUD source and build scripts.
- `data` and `public`: seed data and presentation assets.
- `tests`: application tests; bridge tests are in `rl_bridge`.

Do not commit `%APPDATA%\rl-manager`, credentials or machine-specific runtime settings.
