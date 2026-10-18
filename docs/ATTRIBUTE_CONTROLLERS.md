# Five local skill controllers

Implemented 15 October 2026. Entry point: `rl_bridge/local_ability.py`, called by the real `BotReadiness` agent shim after the original agent, condition, team support and tactical layers. Enabled only for AI-controlled local Easy/Medium and local Path To Glory profiles. Human controls and hosted policies are excluded.

## What changes without a bot promotion

All five core attributes are read independently, with no role filter or integer tier quantisation. They change the controls used by the same bot on the next game load:

| Attribute | Actual controller behaviour |
|---|---|
| Passing | Selects a clear forward outlet when a pass is appropriate; estimates receiver lead and approaches the back of the ball along that pass line. Skill controls lead/contact precision. |
| Dribbling | For a low carried ball, steers towards a bonnet balance point and matches ball speed with throttle/braking. Skill controls balance-point precision. |
| Aerial | Refines pitch/yaw tracking and permits an existing boost request when aligned, during supported native aerials. Skill controls three-dimensional target precision. |
| Shooting | Chooses a goal opening away from defenders and approaches behind the ball on the shot line. Skill controls aim and contact alignment. |
| Saving | Forecasts predictable low balls towards the own goal mouth, positions a nearer available defender on the interception line and adjusts braking. Skill controls interception-point precision. |

Execution precision is continuous: with effective skill `q` between zero and one, positional imprecision is `3 + 900 × (1 − q)^1.6` game units. Smooth, identity-seeded variation avoids per-frame random jitter. Form/confidence/fatigue make a bounded adjustment to effective execution; permanent skills stay unchanged. A higher attribute reduces imprecision inside a tier instead of merely unlocking a different engine. This is a designer-defined balance curve, not ranked MMR or a measured shooting percentage.

The native agent still provides jumps, flips, recoveries and mechanics. No state-setting API is used. Physics, car speed, boost supply and jump authority remain normal. Wall driving, kickoffs, inactive rounds, native jump requests and fast spins retain native controls. Aerial assistance applies only to existing flights from Necto, Element, Nexto and Botimus Prime; it does not teach a ground-only bot how to launch an aerial. Ground saves cover predictable low shots, not high/bouncing shots or every possible goal-line emergency. Defensive cover and negative-throttle native yielding are protected.

Temporary tactical orders still decide whether to press, support, pass or seek demos. The skill layer does not convert a demo or retreat order into an attacking shot. Frozen-policy sampling temperature (`beta`) is retained from the engine configuration; it is no longer treated as a skill/accuracy stat.

## Evidence and limits

`test_local_ability.py` checks all five real controller outputs, independent attributes, unchanged engine/OVR, continuous 80–99 precision, condition effects, ownership/Hard exclusions, physical-state immutability, and guarded native mechanics. `test_bot_startup.py` runs the actual generated agent shim with the same original agent at 80 and 83: every skill context changes its final controller output. Existing series-lock tests retain healthy engine identities as skills improve.

Run `scripts/check-attribute-controls.py` with the RLBot Python runtime. The saved report is `scratch/attribute-controls/paired-report.json`. It uses 500 paired scenarios per skill with identical controller requests, bot engine metadata, identities, OVR and condition. The 83 profiles reduced target and controller error against the same controller at 100 in all five contexts. This is a controller benchmark, **not** 2,500 played matches or proof that a particular bot wins more often.

The optional bundled RLUtilities test runs 80 paired airborne target-tracking trajectories with its car physics. It confirmed the pitch/yaw direction and a small aggregate tracking-error reduction at 83. Missing navigation assets in that bundle are not used by the airborne car integrator. The runtime controller averaged about 0.033 ms per call in the local microbenchmark and adds no GPU workload or per-tick file writes. This is not a measurement of overall game FPS.

Full-match balance and each policy's interaction with these controllers still need live play testing. Higher attributes improve the controller's precision, not every individual outcome; tactics, position, opponent behaviour and the engine's existing limitations remain relevant.

Primary references: [RLBot inputs/outputs](https://wiki.rlbot.org/v4/botmaking/input-and-output-data/), [RLBot packet structures](https://github.com/RLBot/RLBot/blob/master/src/main/python/rlbot/utils/structures/game_data_struct.py), and [RLUtilities car simulation/air-control coefficients](https://github.com/samuelpmish/RLUtilities/blob/develop/src/simulation/car.cc).
