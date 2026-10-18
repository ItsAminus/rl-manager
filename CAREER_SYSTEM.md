# Career management update

Load a career after restarting RL Manager. The database migration adds tables and generates a qualification circuit without resetting saved matches.

## Open fields

| Region | Initial teams |
| --- | ---: |
| Europe | 681 |
| North America | 406 |
| MENA | 199 |
| South America | 88 |
| Oceania | 182 |
| Asia-Pacific | 66 |
| Sub-Saharan Africa | 65 |

The 2026-10-11 database contains 1,704 real team records and 5,709 real players, including 1,687 complete playable squads. These counts come from confirmed 2026 public registrations and dated LAN lineups, combined with the reviewed October club rosters. They are not target counts filled with fictional teams. Incomplete registrations, conflicting rosters, duplicate assignments and coaches are excluded from playable lineups. Dates and source links are visible in club selection and player dossiers. Lower-tier rosters are last confirmed tournament registrations, not a claim that every squad remains active today.

The fictional-team and academy-player generator has been removed. Existing saves automatically receive a backup before the roster update. Invented identities are archived outside active recruitment and future participation, while historical scores remain intact. Pending opponents are replaced with unused real regional squads; insufficient confirmed entrants produce withdrawals/walkovers. Career transfers of real players are preserved. AI clubs can recruit actual confirmed free agents during transfer windows; no invented filler is added. Custom franchises require three available real players.

All gameplay ratings are estimates. Recent LAN ratings use Worlds 50%, EWC 25%, Paris Major 15%, Boston Major 10%, normalized to available samples and downweighted below 15 games. Official title/award calibration gives nass 98 (1v1 World Champion and Boston Major performance), zen 99, Kiileerrz 99, Rw9 at least 98, and dralii at least 97. Qualifier-only players receive explicitly low-confidence estimates based on their latest team placement or seeding, not fabricated individual statistics or claimed human ranks. Players without a current sample are marked unknown. Dossiers show the method and supporting records. Existing earned training improvements are retained above the revised baseline, capped at 99; the update runs once per version. Unknown ages remain unknown and receive neutral training growth rather than being treated as teenagers.

New careers start on 2026-10-11; existing career clocks are preserved. `data/database-audit.json` records coverage and source events. `scripts/build-confirmed-database.py` reproduces the import from cached source records in `scratch/real-database-sources`; it does not fabricate replacements to reach a specified field size.

The simplified circuit uses open elimination rounds with byes until sixteen teams remain. Those survivors enter a Regional round robin; its top two enter an international Major. Combined Major series wins and game difference determine eight Worlds places. Three qualifying cycles are scheduled, with separate club practice series. This is a playable career format, not an exact recreation of the official RLCS or EWC rulebooks.

Only the managed club can play its own due fixtures. Later-stage entry requires qualification, and the calendar stops at an unresolved club series. Opponent series resolve as career days advance.

## Management

- Negotiations enforce January 1–31 and September 1–October 31 transfer windows. Signing costs include the transfer fee/buyout, bonus, and first monthly wage. Contract dates follow the career clock.
- Scouting costs $5,000 per three-day assignment. Repeat observation narrows rating/potential estimates; reports and the shortlist persist.
- Weekly training develops attributes and overall gradually, capped by potential, while intensity and rest affect fatigue. Actual growth creates inbox notifications.
- Starting lineups and match plans persist. Plans influence simulation according to the squad's relevant attributes; live bots retain their own trained policies.
- Simulated social posts follow series results and roster moves. Praise and criticism affect morale and confidence, moderated by pressure resistance and tilt. Private support can address a post once.
- The redesigned dashboard, navigation, calendar, and competition screens use saved career data. Cached portraits cover 78 of the 80 original player entries, with initials for unresolved names; photo sources are recorded in `data/player-portraits.json`.

The inherited database still shares player/team records across careers. This update does not create separate world snapshots for independent save slots.

## Dressing room and player relationships

The Dressing Room is available in the sidebar, on the Squad page and from your own players' profiles. It provides local, scripted two-way conversations; it does not require a language model or a paid service.

- Players initiate inbox conversations after three consecutive series on the bench, low morale/confidence, excessive high-intensity training, a conflicting tactical role or an unhappy relationship that leads to a transfer request. One pending concern per player and a fourteen-day conversation cooldown prevent repetitive requests. Ignoring a concern for seven career days lowers morale, confidence and trust once.
- Private meetings offer support, praise, performance feedback and tactical explanations. Praise and criticism depend on recent form; a seven-day private-meeting cooldown prevents repeated stat farming.
- Manager trust starts at 50 and persists separately for each career/player. Replies, meetings, team talks and kept/broken promises change it. Morale and confidence continue to influence simulated matches; these conversations do not change a live bot's trained policy.
- Playing-time promises require three starts in the next five completed series, within twenty-eight career days. First-game appearances take precedence over the starting selection captured when the first result is recorded. Training promises require a lighter weekly workload within seven days; tactical promises require a plan change that resolves the player's role disagreement. Players can complete promises on the due date. Broken commitments reduce trust; departing players' unresolved concerns and promises close without further penalties.
- An accepted transfer request remains visible as a player concern. It does not manufacture outside offers, move the player automatically or bypass transfer windows.
- Match Day offers one pregame talk before the first game and one postgame debrief after the series is complete. Individual reactions depend on pressure resistance and manager trust. Completed talks and their reactions persist. Postgame talks expire seven days after series completion. There are no halftime talks.

## Verification

`npm test` covers career rules, transactions, qualification, training, scouting, mental effects, lineups, and match results. `scripts/preview-ui.mjs` provides a separate test database for renderer review; it blocks live Rocket League launch. `scripts/check-career-flow.mjs` exercises the real handlers against that preview, including qualifying into a 16-team Regional and correctly storing an away-series result.
# Outgoing transfers and starting lineup

Transfers → Sell players & offers contains your squad, asking prices and incoming club approaches. Listings can be prepared throughout the year; offers and player moves happen only in the career transfer windows. Advance the calendar to receive interest. A buyer assesses region, rating relative to its squad, squad size, current form and available funds. Interest and player consent are stable simulated decisions, not screen-refresh rerolls.

Fees can be accepted, rejected or countered, with up to two counteroffer rounds and an expiry date. A counter takes a day to review. An agreed club fee starts two days of player/agent talks; it does not instantly transfer the player. Club ambition, morale, transfer requests and wages affect consent. The final move rechecks funding and roster size, updates contracts, club cash, transfer history and the saved lineup. At least three real players must remain at the selling club. Current series and live matches lock squad changes.

On Players, drag a squad card or roster row onto one of the three starter slots. Dragging one starter onto another swaps their order; a reserve replaces the chosen starter. Alternatively select a reserve with Choose slot and click a starter card. The lineup saves automatically and is used for live matches and simulations.

## Per-game broadcast and goal replays

Local RLBot matches now use native goal replays (`skip_replays = false`). Recorded audio keeps its sentence-completion behavior; routine replay movement is not a new live aerial or save.

The bridge freezes each game's final telemetry, plays its result desk and shuts down before Electron exposes that result as completed. A launch token rejects old process callbacks and prevents the next game from starting during cleanup. This avoids duplicate old results, incorrect series stakes and speech carrying over into another game.

Both winner opening calls are prepared during play, and likely statistical review sentences are cached during the final minute. The result desk uses the actual final score, series position, observed comeback/overtime, goals, assists, shots and saves, then offers clearly framed tactical adjustments. It never presents an unconfirmed shot-quality or missed-chance claim as telemetry. Chatterbox is still slower than real time for uncached paragraphs; deeper review speech can take time to prepare. Recorded sentences finish, and each game waits for its desk segment rather than collecting a queue after the series.

