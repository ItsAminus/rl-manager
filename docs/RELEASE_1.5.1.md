# RL Manager 1.5.1

Fixes a local-match kickoff timeout caused by a mismatch between configured
lineup slots and the live car indices assigned by Rocket League. Each bot now
reports readiness for its configured identity even if its live car slot differs.
The human-controlled player is excluded from bot readiness checks, and every
external bot must still successfully produce controls before kickoff releases.

This fixes one reproducible cause of `Bots failed to initialize before kickoff`.
It does not guarantee that every error with that message is resolved: a bot
crashing during initialization still requires its support log for diagnosis.

## Installation

Existing users: close RL Manager and Rocket League, then run
`RL.Manager.1.5.1.Setup.exe`. Keep your existing runtime, bots, voices, saves and
settings. No full-runtime reinstall is needed.

New users: install the [complete 1.5.0 kit](https://github.com/ItsAminus/rl-manager/releases/tag/v1.5.0)
first, then apply the 1.5.1 app update. The four large complete-kit parts have not
been rebuilt because the shared bot and AI runtimes have not changed.

Regression coverage includes successful and failed bot output, reordered car
slots with the human selected third, and exclusion of the human from the barrier.
The reported user's PC has not yet confirmed the fix.
