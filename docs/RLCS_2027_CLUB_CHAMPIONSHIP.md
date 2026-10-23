# RLCS 2027 Club Championship

Source: [Psyonix Club Championship Official Rules, updated 16 October 2026](https://us-west-2-epicgames.graphassets.com/cmkr1i7c9047e07n0es5291ez/cmvi6nrbcrrrp07oe1yeaz00t), linked by [Rocket League Competitive Rules](https://www.rocketleague.com/competitive/rules). The rulebook is the source for the competition mechanics; news rumours are not treated as confirmed invitations.

## Where to find it

Reload a career, open **Competitions → RLCS 2027 Club Championship**, and review its setup. The entry is added to existing saves without replacing played competitions. Its child events appear within this competition rather than filling the main list with twenty additional cards.

## Implemented sporting format

- Four Kick-Off Opens: EU, NA, MENA and SAM. Each runs double elimination to 32, two 16-team BO5 Swiss groups, two eight-team BO5 GSL groups, and BO7 hybrid playoffs. The winner qualifies for the Kick-Off.
- Kick-Off: 20 configured invited clubs and four Open winners. Exact 24-team seeded double elimination with byes for the first eight seeds. A team must lose twice to be eliminated, including a reset if the lower finalist wins the first final. The winner gives its region an extra Finale place.
- Seven League Opens fill the remaining 40 League places after the 24 Kick-Off clubs. Their hybrid stages stop when qualification is decided, including the BO7 match for an odd last-place cutoff. No unnecessary final is invented after all places have been earned.
- Seven BO5 single round-robin Club Leagues: 12 clubs and 66 matches each in EU/NA; eight clubs and 28 matches each elsewhere. Rank by match wins, game difference, goal difference, then initial seed.
- Finale berths: EU 4, NA 4, MENA 2, SAM 2, OCE 1, APAC 1, SSA 1, plus the Kick-Off winner's regional bonus. The Finale has one 16-team BO5 Swiss group, advancing teams with three wins and eliminating teams with three losses, then eight-team BO7 hybrid playoffs. The top four Swiss teams begin in the upper group; semifinals and final are single elimination.
- Swiss final rankings use match record, game difference, Buchholz, then initial seed. Club Open Swiss seeding preserves double-elimination placement before initial seed. GSL and hybrid seeding preserve the published stage ordering.

Fixtures use the existing played/simulated match workflow. A manager's valid series is never silently simulated by the Club Championship service. Stage rosters are saved, and a match launch cannot replace a registered player with an unregistered signing. If one club cannot field three registered players, the career organiser awards its scheduled series as forfeits, records the reason and notifies the manager; no played-game statistics or XP are fabricated. If neither club can field a team, an eligible winner is not invented. The general career transfer system remains separate: the real event's unpublished transfer window and complete event-wide transfer/exempt-reserve approvals are not recreated or claimed as verified.

Fields too short to produce the official 32-team Open Swiss stage remain pending with an explanation. Teams or replacement knockout formats are not fabricated.

## Explicit organiser choices

The linked rulebook leaves final invitation identities, international region-slot seed order, League Open dates, League dates, Finale dates and transfer window dates unconfirmed. Kick-Off upper rounds 1–2 are explicitly BO5, but the text does not specify every later series length.

The setup therefore requires a review of **career** invitations, seed order, missing dates and later Kick-Off match length. Suggestions use real eligible clubs and reputation; they are not described as an official partner list or official seeding. The published initial-seeding procedure needs complete 2026 starting-player points, placements and ranked 3v3 MMR, which this database cannot verify in full. Competition pages retain this distinction after setup. No rumoured invitation list is silently imported.

Known Open dates are 5–14 November 2026 in MENA, 6–15 November in NA/SAM, and 13–22 November in EU. The Kick-Off starts 9 December and ends 13 December. Moving the career Kick-Off date moves its Open dates by the same number of days and labels the adjustment. Unpublished League and Finale dates use the reviewed career schedule, with weekly league rounds and a six-day Finale.

## Prizes and honours

Attachment C Club Points and Attachment D prize bands are stored independently. Only configured invited teams accrue invited-only points; a qualifying result does not silently confer that status. Equal Club Points use the initial career invitation order as an explicitly accepted organiser tiebreaker, since no separate Club Points tie rule was found in the publication.

Stage prize awards are recorded against the three registered starters. Cents are distributed so their awards sum to the published total. They do not automatically become club bank revenue. The owner Club Points payout is credited separately, once, with a club financial ledger entry in Manager Career. Path To Glory does not receive financial balances from these payouts.

The advertised overall pool is displayed as announced. Individual payments follow the actual published table, without inventing a top-up to match a rounded headline. The Finale placement table sums to $500,500. The owner table extends to 24 places, while the text restricts points to Invited Teams and describes 20 direct invitations; RLM applies that eligibility literally and does not create four extra invited identities to fill a payout table.

Kick-Off, League and Finale wins enter career honours and the trophy celebration flow. No unverified in-game account title is generated. Club Finale is distinct from RLCS Worlds and does not overwrite a player's best RLCS Worlds result. An actual first Club Championship appearance can fill an unknown RLCS debut; an established real debut stays the debut.

## Verification

SQL-backed tests cover the full circuit, opening seed pairs, byes, two-loss elimination, reset winner placements, Swiss-to-hybrid progression, all 1–8-place League Open cutoffs, seeding priorities, regional capacities and quota bonus, published prize tables, invitation-only points and idempotent payouts. These tests do not launch Rocket League or alter a real save.
