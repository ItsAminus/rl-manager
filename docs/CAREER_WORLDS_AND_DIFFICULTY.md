# Career worlds and live difficulty

Every career now owns a separate database under the app's `database/careers` folder. The previous shared database is retained as a recovery source, with a backup before isolation. New careers start from the confirmed roster baseline. Existing careers retain their own results, inbox, Chirp history, tactics and identifiable transfers; another career's transfers do not enter their world. Untagged historical transfers that cannot be attributed confidently are not copied into every save.

Tactical roles are saved by player identity. Changing lineup order no longer assigns another player's role or creates a false last-defender complaint. An existing complaint resolves when the current plan already satisfies it.

During transfer windows, NPC clubs can begin negotiations. Each rumour has a saved outcome: a completed transfer updates that career's roster, contract and finances; collapsed talks do not. News appears in the inbox and Chirp. The manager's own club is never moved automatically, and a selling club cannot be reduced below three players.

The main calendar includes six regional RLCS Opens across two splits, Major 1, Major 2, regional Worlds LCQs, the World Championship, Kick-Off and an EWC invitational. The default competition list shows the manager's region plus global events; qualifier cards are optional. Dates are relative to the career season, not a claim about real event dates or venues.

Major 1 uses four round-robin groups of four, advancing the top two to an eight-team hybrid playoff. Major 2 advances the top three to twelve-team playoffs. Worlds has twenty entrants, eight-team GSL play-ins selecting four alongside twelve direct entrants, followed by four groups and twelve-team playoffs. Group winners enter the upper bracket; an upper loss drops to lower. Lower entrants have one life. The Final Four is single elimination. Draws, fixtures, group standings, seeds and bracket dependencies are persisted. Formats and seeding are based on the [2026 official rules](https://www.rocketleague.com/competitive/rules).

Open qualifiers, regional main stages, EWC and circuit qualification points are streamlined career adaptations. Existing tournaments with played or already-due fixtures keep their previous format so recorded results and pending games remain playable. New and future unplayed events receive the updated groups/brackets.

Settings → Live match difficulty can change at any time; it affects the next live game, not an already-running game. Easy and Medium always use local RLBot, including elite lineups. Hard retains the established Rocket Host strength tiers. Difficulty is stored per career and does not alter player OVR or simulated-match probabilities. Assignments persist for each series/difficulty. Both routes use the same career broadcast context: competition and team branding, timer, player portraits, titles and names. BakkesMod must be loaded for the native custom HUD.

Validation covered all 155 app tests, 17 bot routing tests, complete eight-/twelve-team playoff runs, Worlds play-ins, visual groups/brackets/settings checks, and actual IPC save switching against a disposable copy of the legacy database. No live match was launched during this validation.
