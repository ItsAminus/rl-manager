# Manager Career realism

These rules apply to Manager Career. Path To Glory retains its fixed squad and nonfinancial progression. Existing careers keep their rosters, money and completed reports; financial mandates are established when the updated career first loads, without retrospective charges.

## Club finances and the job

The Finance screen shows cash, corporate/commercial revenue, sponsorship, player wages, operating costs, debt interest, wage contributions and a dated ledger. All clubs settle once per calendar month. New club tournament payouts atomically update cash and a named Prize money receipt. The receipt identity and existing event settlement markers prevent duplicate payouts after retries or reloads. Past events marked paid are not paid again merely because older versions lacked a ledger receipt. A fixed club wage mandate reflects the starting wage bill, revenue and reserves. Signings above 125% of that limit are blocked.

An automatic credit line covers operating deficits up to its limit. Debt costs 1% interest monthly; available cash repays 10% of reserves, limited to outstanding principal. Low runway, excessive wages or debt near the limit trigger board warnings. Wage-limit, debt and low-runway warnings alone cannot cause dismissal. Dismissal requires a continuously negative cash balance for at least 180 days, at least six insolvent monthly settlements, and a final 30-day warning. Restoring non-negative cash clears the recovery plan. A completed club trophy protects the job for 180 days, extending the deadline; national trophies do not protect a separate club job. Old warning counts do not accelerate this new policy.

Dismissal is final: the active career is unloaded, a recovery archive is safely committed before its playable SQLite save is removed, and an index tombstone prevents resuming it through an older shared-world record. The archive lives in database/careers/recovery/<career-id>.dismissed.sqlite for explicit recovery or fault investigation. Failed archive writes prevent removal of the playable file. Other saves are unaffected. The career-end screen explains the reason. This is gameplay permadeath, not an employment-market mode.

## Recruitment

Contact the agent before personal terms. The agent evaluates reputation, international standing, squad quality, credible playing time, current-club commitment, availability and transfer funds. Permission lasts 30 days; a refusal is retained for 14 days for that role. Reopening a screen does not reroll the response. Sporting circumstances and money are checked again on completion. Changing the proposed role requires another agent approach.

The buying club needs the full transfer valuation or contractual fee in cash before an approach; money cannot override a sporting refusal. Contract completion additionally requires the fee, signing bonus and first salary instalment. Renewals do not require transfer permission.

Contracts support 12–60 months, future-profit sell-on percentages, a two-year buy-back option, selling-club wage contributions for up to 12 months and playing-time guarantees. Concessions change the agreed fee. The seller must be able to fund its contribution commitment. The room shows upfront cost and guaranteed cost within five years; future resale payments remain conditional. Monthly wage payments are capped at the agreed number of instalments, including the first payment.

Sell-on profits are paid once on the next sale, through either the manager or autonomous market. Buy-back fees affect eligible quotations. Playing-time guarantees are checked after at least six completed series and against new matches since the previous review. Broken promises reduce morale; repeated failures trigger a transfer request. Star Carry requires at least 80% involvement; Core Starter requires 60%.

## Scouting

Players outside the managed club have no visible exact OVR, potential, attributes or personality until observed. Filtering and browsing cannot reveal the hidden values. The transfer screen, dossiers, match previews, leaderboards and Chirp respect that knowledge. Own players remain fully known. Simulations and live bot selection continue using the real private ratings.

Three scout slots are shared by individual and regional assignments. Individual observation costs $5,000 and takes 28, 42 and 56 days across the three depths. Regional assignments last one to three months at $8,000 per month paid upfront, filing up to three reports every 30 days. A completed report records a historical snapshot. Full observation reveals the observed OVR and attributes; potential remains an estimate. Reports lose precision after 120 days and can be refreshed.

## Other clubs

AI clubs make up to three new market approaches daily during transfer windows. Saved rumours progress to completed or collapsed deals, changing actual rosters, contracts and balances. Clubs protect their starting three by finding a viable free-agent replacement, respect wage structures, can rebuild short squads and renew affordable core players near expiry. The manager retains approval of transfers involving their own club.

## Verification

Automated SQL-backed tests cover refusal persistence, required agent consent, affordability, scouting privacy and snapshots, regional report timing, debt settlement, dismissal persistence and save removal, resale clauses, buy-back fees and playing-time consequences. Tests use isolated fixture databases, not personal career saves. The new screens compile, but a live visual walkthrough was unavailable in this session.
