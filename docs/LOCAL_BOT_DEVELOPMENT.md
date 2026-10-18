# Career modes and local bot development

Updated 15 October 2026.

## Manager Career

Existing saves default to Manager Career. Its original development system remains: Easy/Medium permanent OVR reviews require at least 30 productive sessions over 35 days plus six credible individual series performances and sufficient opposition/performance evidence. Training alone or a winning passenger does not earn permanent OVR. Hard retains its previous training model. There is no allocatable XP/skill wallet in this mode.

Human-played games count as evidence for AI teammates; the personally controlled pro is excluded from that game's Manager Career development evidence. Easy and Medium use their original rating-based local bot tiers, capped at Gold and Diamond respectively. Hard/Rocket Host routing is unchanged.

## Path To Glory

Choose Path To Glory from the main menu, select your real rank and name your generated academy club. Bronze through SSL presets generate three players around 52–80 OVR, with an absolute starting cap of 80. Higher ranks begin with 79/80/80 and stronger ladder opposition. These are balancing presets, not an MMR conversion. Those three stay together; each has potential 99. Existing saves can calibrate their ladder rank on the dashboard between series without changing earned skills or XP. Official tournament rosters are unaffected. Legacy real-squad saves remain supported. The save has no transfers anywhere in its world, contract expiry, scouting, Chirp, wages, sponsors or money rewards. Each career has a private world database.

Every played game gives all three players XP, including the human-controlled pro. Upgrades affect that pro only when controlled by AI, never human controls or Rocket League physics. Simulating your own games is unavailable. Distinct saved game IDs prevent duplicate XP.

Wins start at 125 XP, losses at 95, adjusted for opposition and individual contributions. Squads below 80 receive an early-development multiplier (1 + (80 − average OVR) / 60). A weak squad losing to much stronger opposition can therefore earn around 170–180 base XP per player. The point cost is 45 + max(0, OVR − 60) × 3 + max(0, OVR − 85)². Early progression is quicker without making the final climb to 99 trivial. Consecutive game wins add 7.5% to match XP per win, capped at 2×. Losses reset the streak and still award XP. Weak opposition reduces rewards. XP converts to development points; conversion costs increase with OVR, especially after 85. Skills cost one point below 80, two from 80, three from 90. Passing, dribbling, aerial, shooting and saving are independently upgradeable. Five total improvements earn one OVR, anchored to the original skills and rating, capped at 99. Weekly regimens affect condition/teamwork/confidence; permanent skill growth requires spending earned points.

The whole squad must meet the next tier's OVR and every core-skill minimum, then win a BO5 promotion trial. Requirements: Silver 59 OVR / 55 skills; Gold 69 / 65; Platinum 74 / 70; Diamond 79 / 75; Champ 84 / 80; GC/SSL 89 / 85; Elite 94 / 90. A failed trial remains locked and can be retried. Healthy bot assignments remain fixed for each series. Early play is local RLBot; the Champ trial unlocks Rocket Host for the whole squad, avoiding an unsupported local/remote mixture. Hosted bots cannot receive the local tactical wrapper.

One exception is the lucky breakout: every local Path To Glory game has one 5% roll to give exactly one eligible AI teammate Nexto for that game only. It excludes the human, opponents and teammates already using Nexto. The roll is tied to the career, fixture and game number, so previewing or retrying cannot reroll it. The normal series assignment is saved before the temporary override; the next game uses its normal bot unless that game independently earns another breakout. Permanent skills, OVR and promotion progress stay unchanged. Manager Career and Rocket Host games do not use this local-only bonus.

Recurring rivals return each chapter. Challenges & rewards has its own sidebar page with 41 challenges, filters, progress and automatic one-time XP awards. It includes games played, losses, goals, assists, saves, shots, demos, close games, clean sheets, completed series and win streaks. Existing-save evidence is recognised on opening the page. Five games, 100 saves and 50 wins each unlock a bankable Breakthrough form reward. Before an unstarted BO3/BO5, assign one reward to one fixed squad member: the series uses a 92+ AI snapshot (Nexto locally) for two to five games. Permanent OVR, skill gates, promotion eligibility and human controls are unchanged. The reward cannot stack, repeat or carry into another fixture; it does not add a fourth player or invent a transfer. Promotions, qualification and championships retain their additional XP. All three at 99 completes the challenge; keep playing remains available.

The squad also participates in the existing official-format competition circuit: Open qualifiers, RLCS Opens, LCQs, Majors, Worlds and the supported invitationals. Qualification is earned through results and circuit points. Other fixtures progress through the existing tournament engine; the squad's competition games must be played and earn XP. Draws, groups, brackets and career champion titles use the same systems as Manager Career. Championships grant XP and honours instead of cash. Ladder matches and trials fill gaps between competitions. A later season offers a fresh qualification circuit while retaining the squad and progression. Later seasons reuse the implemented 2026 formats; this does not predict future organisers' rules.

## Attribute-specific local execution

All five core attributes now feed `local_ability.py` through the actual bot agent shim. Passing changes lead/contact alignment, dribbling changes bonnet balance and speed matching, aerial changes tracking during supported existing flights, shooting changes goal-opening aim and the approach behind the ball, and saving changes predictable low-shot interception and braking. These controllers run independently of promotion eligibility and apply fresh attribute snapshots on the next game load while retaining the same healthy engine for a series. See [the controller details, measured checks and limits](ATTRIBUTE_CONTROLLERS.md). The Training page describes each effect.

## Local tactical commands

HUD 1.8.0 reads the D-pad directly using BakkesMod's key-state API, independently of exhibition chat transport: Up presses (18s), Down defends (20s), Right seeks infield outlets (18s), Left applies brief demo pressure with cover (8s). Tap once. F1–F4 are equivalent keyboard controls; F5 resumes the saved match plan. Native tactical chat messages remain an optional input path. A 1.5-second capture cooldown prevents native chat and direct input duplicating one another. The on-screen confirmation names bots that actually acknowledged the command. Session, sender, team and freshness checks exclude other matches and enemy/bot messages. Inputs are career-only, foreground-only and disabled in pauses/menus. Ground positioning and safe challenges are altered; protected kickoffs, aerials, flips and urgent goal-line defence retain the original policy.

Every played series stops at a between-game choice: continue, or spend the manager's one tactical timeout. Each team has one timeout per series. Calling it persists a 60-second real-time deadline in that save; navigation or reload does not reset it. Only an active manager timeout permits changing saved tactical plans or delivering its bounded morale/confidence talk. Orders can be revised within the minute; talk benefits apply once. Last saved orders carry forward. The manager's timeout expiry starts the next game automatically when commentary/cleanup are ready. A reload after expiry also resumes the handoff. A failed launch can be retried without granting another timeout. The backend blocks live/simulated next-game starts until an active timeout ends. Legacy used timeout records count against the allowance.

The opposing coach also has one timeout. It considers one only when trailing, after losing the last game, and either two series games behind, after consecutive losses, or after a defeat by four or more goals. It never calls while leading or level, after the series has finished, or concurrently with another timeout. Opposing local bots then use one pressing player, one infield outlet and defensive cover in subsequent games, with a small bounded morale/confidence reset. An opposing timeout lasts 60 seconds, then the manager receives the continue-or-own-timeout choice. Private hosted policies cannot receive these orders. This is a bounded coach rule, not a learned coaching model or mid-game stoppage system.

## Research and limits

Timeouts play the user-supplied RLCS timeout loop from `public/audio/timeout.ogg`
(160 kbps stereo Opus, about 1.34 MiB). Playback starts for either coach's timeout,
keeps going while navigating to tactics, and stops at the saved deadline without
waiting for another state poll. Reload/focus can restore an active timeout at its
elapsed position. Returning to the main menu or changing career stops playback.
Interface mute and volume apply, including live setting changes. The original
WAV in Downloads is unchanged; `timeout-source.json` records the source and hashes.
The built Electron window decoded and played the track in a muted test; controller
tests cover expiry, repeated polls, mute, resume and rejected/delayed playback.

- [BakkesMod input API](https://github.com/bakkesmodorg/BakkesModSDK/blob/master/include/bakkesmod/wrappers/GameWrapper.h) exposes key-state reads; [FreeplayCheckpoint](https://github.com/NitrOP7674/FreeplayCheckpoint/blob/main/bindings.cpp) demonstrates key-name lookup with this API. The new direct controls do not depend on a successful chat send.
- [RLBot v4 architecture](https://wiki.rlbot.org/v4/framework/architecture/) exposes packets and controller output; [quick chat](https://wiki.rlbot.org/v4/botmaking/quickchat/) needs explicit bot-side handling.
- [Necto/Nexto developer source](https://github.com/Rolv-Arild/Necto) provides frozen policies, approximately Diamond and GC respectively, without a five-skill training API. Beta sampling is not an accuracy stat. Element likewise uses a frozen policy.
- [Botimus Prime](https://github.com/Darxeal/BotimusPrime) uses executable scripted manoeuvres. Bumblebee requires coordinated copies and is not independently substituted into mixed squads.

An attribute is not a success percentage. Skill allocation does not retrain policies, create advanced mechanics, change car/ball physics or create boost. Separate attribute-specific controllers refine ordinary steering, throttle and supported flight controls. Local condition adjustments remain bounded execution controls. Tests verify state, routing, command delivery and tactical scenarios; they do not prove universal live performance calibration. Pass/demo quality and live D-pad input still require observation in a human match. Rocket Host's availability and each hosted bot's health remain external dependencies.

## Verification

Tests cover fixed rosters, all-three XP, duplicate credit, streaks, one-time achievements, failed/successful trials, reverse sweeps, disabled transfers/finances, continued play after 99, qualification entry, a complete played Major with career titles/XP and season renewal. Existing Manager development tests cover restoration of automatic OVR reviews and point-allocation rejection. Python tests cover unchanged Manager routing, skill/trial caps, local-to-hosted transition and human-control exclusion from bot wrappers.

The isolated career script exercises real IPC with disposable seeded worlds, save switching, actual Python bot previews and a database restart. The hidden UI review covers mode selection, creation, tutorial skipping, guarded pages, XP allocation and gold feedback, narrow layouts, separate Manager development and the keep-playing completion option. Neither launches Rocket League nor modifies user saves.
