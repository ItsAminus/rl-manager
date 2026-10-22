# Local HUD candidate: 1.8.4

## Name-refresh correction (not tested)

The later clip `MedalTVRocketLeague20261022003034154.mp4` shows correct pro
labels around 50 seconds, followed by bot labels around 55 seconds while the
native demolition feed still correctly identifies zen and archie. The prior
publication cache could suppress recovery indefinitely after native refreshes.

1.8.4 repairs verified labels after native name/component/persona/game-state,
shell and datastore binding events, and renews publications during the existing
bounded recovery pass. It also keeps fitting engine-owned nameplate strings
consistent after publication and rejects detached cars or changed table slots.
Discovery publishes each current row rather than only the last row seen for
a player. There are still no per-frame nameplate/getter hooks or roster scans
in the global string hook. Development launches install the compiled HUD too.

Per the user's instruction, no automated tests or live game tests were run
for 1.8.4. The measurements below are exclusively for the earlier 1.8.3
candidate; they are not measurements or validation of 1.8.4. On October 22,
2026, the user authorized a GitHub push and packaged update as RLM 1.1.0
without running tests. Live confirmation remains pending.

## Earlier performance investigation (1.8.3)

The supplied clips `MedalTVRocketLeague20261021231053818.mp4` and
`MedalTVRocketLeague20261021231346470.mp4` show the transition into a six-player
Rocket Host match. The second clip includes freeplay beforehand. Network/server
warning icons appear during match play; footage cannot establish their exact
cause. A two-second frame-difference sample of that clip found 41 near-repeated
transitions out of 120 in training and 67 out of 120 in the match. This is a
relative recording observation, not an exact game FPS measurement.

The last HUD performance sample from the reported match showed 24.257 ms per
draw on average, a 153.204 ms maximum draw, and a 207.219 ms maximum observed
frame interval. Name publication repeatedly walked native class fields, and
the global string hook allocated frames and scanned the player roster even
for unrelated HUD updates. Extra name-source hooks also ran during gameplay.

The candidate indexes verified rows by datastore, table and row, caches native
method resolution, skips unchanged publications, uses cheap null sentinels
for ignored hook calls, and removes the superseded per-frame/getter hooks.
Temporary input strings still restore their original engine-owned descriptors.
Session changes clear the indexes; stale or mismatched car links fail closed.

## Controlled local comparison

One disposable local six-car match used the same team images and unchanged
graphics settings for both versions. The first five seconds of each phase
were excluded. No career database was connected and no result was written.

| Metric | HUD 1.8.2 | HUD 1.8.3 |
| --- | ---: | ---: |
| One-second samples | 19 | 24 |
| Median average HUD draw | 4.924 ms | 0.187 ms |
| Median worst draw per sample | 111.527 ms | 0.524 ms |
| Maximum HUD draw | 125.385 ms | 1.674 ms |
| Median observed drawable rate | 72.86/s | 282.32/s |

These values demonstrate removal of a local HUD bottleneck. A hosted match
also depends on server and network behavior; the user's Hard/Rocket Host
confirmation of the latest correction remains pending; publication as 1.1.0
was authorized separately as noted above.
Raw comparison samples and extracted clip frames remain in ignored scratch
files. The performance report now distinguishes draw work, name synchronization,
name-update hooks and hosted telemetry polling.
