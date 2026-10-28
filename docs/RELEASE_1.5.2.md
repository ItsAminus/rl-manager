# RL Manager 1.5.2

Correct player identity details in your own Manager Career without editing a
database or waiting for a global database update.

- Open a player's profile and choose **Edit player information** to change their
  real name, age or nationality.
- Expand **Import player information from JSON** to select an edited
  `players.json` or a list of corrections. Review current/imported values before
  applying them. Missing and ambiguous players are listed rather than guessed.
- Changes apply immediately to the currently loaded career. Other saves and the
  starting database are unaffected. Ratings, attributes, contracts and transfers
  are not imported.
- A complete backup of that career database is created before each operation
  that changes data. Invalid or duplicate records are rejected before changes
  are applied.

See the [editor guide](https://github.com/ItsAminus/rl-manager/blob/codex/public-release/docs/PLAYER_INFORMATION_EDITOR.md)
for the JSON format, country codes and backup location.

## Updating

Close RL Manager and Rocket League, then install `RL.Manager.1.5.2.Setup.exe`.
Existing runtime components, saves and settings are reused. Only the app update
installer was rebuilt; the large bot and AI runtime packages have not changed.

New users should install the [complete 1.5.0 kit](https://github.com/ItsAminus/rl-manager/releases/tag/v1.5.0)
first, then apply 1.5.2. This update also includes the earlier 1.5.1 kickoff fix.

Validation includes identity-edit and import regression tests, save-isolation
tests, a production build, and an app-level test of editing, previewing/importing
JSON, preservation of gameplay data, backups and rejection of cross-career imports.
