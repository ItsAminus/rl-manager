# Official competition rules in careers

Rule source: [RLCS 2026 v8, updated 12 June 2026](https://us-west-2-epicgames.graphassets.com/cmkr1i7c9047e07n0es5291ez/cmqfaa43w0c8v08n38hc7f316).
EWC source: [the organiser-linked Rocket League rulebook](https://docs.google.com/document/d/1RxxUwiVAfNazG7VmKE3EOs7t0kCpwQCtzg2i72fJAHY/edit) and [the organiser's LCQ bracket](https://blast.tv/rl/tournaments/esports-world-cup-2026-last-chance-qualifier/series?view=results).

Implemented competition mechanics:

- Opens 1/4: double elimination to 32; two 16-team Swiss groups to 16; two eight-team GSL groups to eight; BO7 hybrid playoffs.
- Opens 2/3/5/6: top eight seeds enter Swiss directly, plus 24 double-elimination qualifiers. The remaining stages follow the Open format. Seeds lock at registration, using results already completed in that career.
- Qualifiers: two losses eliminate; BO3 before the top 192, BO5 thereafter. Actual byes progress without invented results.
- Kick-Off: EU4–NA3, NA4–EU3; EU2/NA2 receive quarterfinal byes, NA1/EU1 semifinal byes. Early matches BO5, semifinals/final BO7. Champion qualifies for Major 1 and its region earns the extra international slot.
- Major 1: four BO5 groups of four, top two advance to an eight-team BO7 hybrid bracket.
- Major 2: four BO5 groups of four, top three advance to a twelve-team BO7 hybrid bracket.
- Worlds: 16 direct point qualifiers plus four regional LCQ winners. Seeds 13–20 contest BO5 play-ins; four qualify. Four BO5 groups of four, top three advance to twelve-team BO7 hybrid playoffs.
- RLCS LCQs: allocated to the four strongest regions using both Majors' mean points, best finishes and specified ties. Direct Worlds qualifiers cannot enter. Double elimination, Swiss, GSL and hybrid playoffs produce one regional champion each.
- EWC: 14 regional RLCS places, the title defender (with the EU replacement rule), and the global LCQ champion. Saved four-pool draw into two eight-team GSL groups; regional limit four per group. BO5 non-elimination/BO7 elimination matches. Eight-team BO7 single elimination, with cross-group quarterfinals and a BO5 third-place match.
- EWC LCQ: four double-elimination pools, followed by double-elimination playoffs and a conditional BO7 final reset, as in the published 2026 bracket. The career draws its field from available real teams.
- Official split-specific Open/Major points; no RLCS points from practice, Kick-Off or EWC. Played BO7 qualification spot brackets use every published 2–6-team/1–5-place layout rather than deciding a cut on team ID.
- Group head-to-head match record, tied-team game difference, whole-group game difference, tied-team goal difference, whole-group goal difference, then initial seed. NPC game scores are saved so goal-difference ties can use their results too.
- Regional slot seeds, seeded group bands with regional separation, and official playoff seed orders. Group winners have a second chance in the upper round; the Final Four is single elimination.
- Regional, Major, Worlds and EWC main-event prize distributions pay the corresponding placing teams once, rather than paying the entire pool to the champion.

Existing results are preserved. Started or overdue legacy events keep their schedule and are labelled accordingly; unplayed future events migrate once per save. Dates use the 2026 calendar, shifted for later career seasons. The source version is displayed on event pages.

Data limits are explicit: historical starter placements and ranked MMR are not complete for every database player. Remaining initial-seed ties use career squad OVR, with a visible note. A compact custom/test database cannot reproduce a full-field event without fictional entrants; reduced fields are labelled, rather than silently padded with fake teams. EWC LCQ payout amounts are not invented from its published total pool. Legal, account-security and on-site administration clauses are outside this career simulation.

## Career championship titles

Registered winning players, including the reserve, earn save-specific honours. Regional winners receive `RLCS <year> Regional Champion`, Boston/Paris Major winners the corresponding Major Champion title, and Worlds winners `RLCS <year> World Champion`. These names follow the existing verified public account-title registry. The latest earned career title is automatically equipped for later HUD scoreboards, and the profile retains the full award history. EWC and Kick-Off wins record honours without inventing an official account title. The shared IRL title registry is never modified.
