# FIFAe and career presentations

## FIFAe career edition

FIFAe is a national-team competition, distinct from the club-based Esports World Cup. National squads are separate snapshots; selection never changes `players.teamId`, contracts, club finances, club fixtures or RLCS points.

The finals engine uses the [published 2025 FIFAe finals rules](https://www.fifa.gg/rocket-league/c/fifae-world-cup-25-ft-rocket-league/about): sixteen nations, two groups of eight, double round robin, exactly two games per group matchup, 3/1/0 points, top four per group, then BO7 single-elimination quarterfinals, semifinals and final. Group ties compare head-to-head goal difference/goals scored, then overall goal difference/goals scored. Exact residual ties use initial seed as a documented career administrative rule.

This is explicitly labelled **2025 finals format · career edition**, not an implementation of the entire 2026 pathway. The [2026 pathway](https://www.fifa.gg/rocket-league/c/fifae-world-cup-2026-ft-rocket-league/competition-format) has Nations League and Continental Championships, and the [2026 finals page](https://www.fifa.gg/rocket-league/c/fifae-world-cup-2026-ft-rocket-league/fifae-world-cup/groups/group-a) currently reports postponement.

Career invitations select Saudi Arabia as host, if its real roster is available, and the fifteen highest-rated other eligible national squads. Selection locks the three strongest available players of each nationality at the start. Ambiguous GB/UK nationality does not establish eligibility for England, Scotland, Wales or Northern Ireland and is excluded rather than guessed. No nationality or national player is generated. Fewer than sixteen complete squads keeps the field pending. These invitations are simulated, not official real-world qualification results.

One event is added per active season, including existing careers. National matches simulate as the calendar advances; the user remains their club's manager. The national event page shows squads, standings, draws, fixtures, the knockout route and the supplied FIFAe introduction video. It does not launch a club game with fake national rosters. The 2025 national prize pool is displayed but never paid into a club account. National champions receive career honours, without inventing an official in-game account title or an RLCS Worlds result.

## Career introduction facts

Verified real-world history remains the baseline. An unknown RLCS debut can be filled from an actual game appearance in the save. A registration or unused reserve does not count as an appearance. An established real debut is not replaced by a later event. Completed career Worlds placements can improve the player's best result but never downgrade it. All earned career Worlds titles are considered even if a newer Major title is equipped. Future results and other saves are excluded; archived season history survives transfers and new seasons. Verified birth dates continue to calculate age at the save date.

The in-game introduction plan now carries each player's own already-cached portrait into an animated portrait panel beside their card. It uses the existing native texture cache; no image downloads happen during the camera orbit. Unknown portraits stay unavailable rather than substituting another player's face.

## Trophy ceremonies

Completed eligible tournaments queue a save-specific winner celebration. Acknowledgement survives reloads, and repeated completion checks do not duplicate celebrations or awards. There is a built-in trophy screen while awaiting the user's later video. See [the video slots](../public/competitions/ceremonies/README.md). The user-supplied competition intro remains separate from the trophy media.
