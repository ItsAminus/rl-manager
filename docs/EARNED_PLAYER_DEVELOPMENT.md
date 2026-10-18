# Easy/Medium player development and live condition

Permanent OVR and temporary match condition are separate. This system applies to Easy and Medium. Existing OVR is preserved; legacy training-only progress is not converted into free points. Hard retains its previous development path and bot behaviour.

An OVR point requires both full training credit and full match evidence, at least 30 productive sessions, at least 35 career days since the current development cycle began, and at least six credible individual series performances. Six series alone are not sufficient: evidence credit also depends on individual contribution and opposition strength, commonly requiring more series. Dates/results are deterministic and duplicate training days or series cannot be credited twice. Each gain consumes the cycle's preparation/evidence. Ability never exceeds potential.

Training credit uses age, development rate, professionalism, morale, coaching, facilities and intensity. Exhausted players do not develop. Rest supports recovery; elite 94+ players accumulate credit at 60% of the baseline rate. Training credit is capped while match evidence is missing. Trained attributes still improve fractionally within limits.

Individual performance is evaluated from goals, assists, saves, demos, score and confirmed open-net misses, with different contribution weights for attacking, supporting and defensive roles. Winning is not itself development evidence. Strong defensive performances can earn credit during losses, while passengers do not automatically develop during wins. Opposition far below the player's rating receives substantially reduced weight; practice matches cannot substitute for credible competitive series. Match evidence expires after 120 career days.

Form, confidence and fatigue update after each recorded game, so they reach game two's bot settings. Positive contributions give bounded momentum in a live game; confirmed misses apply bounded pressure moderated by resilience. Team Play sessions improve individual chemistry, and Mental/Pressure sessions can rebuild confidence toward 75. Conversations/team talks continue to influence confidence, morale and trust; these now enter live local performance settings.

Training shows preparation, productive session count, credible series, evidence percentage, potential and the next requirement. Match previews show form, confidence, fatigue and cohesion. Human input is never modified. Bot changes stay within the chosen local policy's capability and do not alter car physics.

Verification includes controller response/protected-phase tests, actual generated startup-shim tests, native-control compatibility, condition refresh with a locked engine, development anti-farming/idempotency/potential tests, visual Training review and database-to-Python preview checks using a disposable legacy-save copy. Live match feel still needs playtesting.
