# Team pool and Manager Career selection

The Manager Career organization selector searches names and abbreviations within the chosen region. Sort by reputation, popularity (the career database's fanbase estimate), name, budget or facilities, in either direction. Sorting and searching retain the explicitly selected club; a selection summary makes a choice outside the search results visible. Zero budgets remain zero.

`teams:getSelectable` uses the new-career template rather than the world of an already loaded career. Disbanded, inactive and incomplete squads are rejected, including when submitting a new save directly. Historical team records remain available for past fixtures and statistics.

The user chose to keep unverified teams available. A dated start.gg event registration is therefore labelled **Last registered lineup**, with its event date, rather than **Confirmed roster**. It is not proof that the team is still active, and lack of current information alone is not treated as proof of disbandment.

The versioned evidence file `data/team-status-audit.json` records the status decisions checked on 23 October 2026, with source URLs and explanatory notes. This audit adds ten confirmed disbanded teams, excludes Team BSK's no-longer-complete registered trio, and explicitly retains Triple pop's active trio. Existing baseline inactive organizations remain excluded. The audit does not claim every historical community team's current status has been verified.

Older disband dates that precede a newer registered lineup are not automatically applied to a reused name. Team BSK's July revival, the two different Magnolia teams and coach-only departures illustrate why matching names or old disband headings alone is insufficient.

The migration changes team-status metadata only. It does not reset player ownership, money, contracts, training, transfers or completed results. It runs for new templates and when loading existing saves. Future competition pools and autonomous buyer pools exclude known inactive/incomplete organizations. The existing future-fixture withdrawal repair preserves played series; it never erases the historical team definition.
