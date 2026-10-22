# RL Manager 1.0.10

## Download and update

Download **RL.Manager.1.0.10.Setup.exe** from this release. Close RL Manager,
Rocket League and BakkesMod, then run the installer over your existing RLM
installation. Your saves and settings are preserved.

Existing players with the complete runtime installed only need this update.
New players must install the complete four-part **1.0.8** kit first, then run
this **1.0.10** installer. The runtime kit remains available on the 1.0.8
release page; this app installer does not replace the separate bot/model runtime.

## Included changes

- HUD 1.8.2 displays career pro names in the original car labels and native
  top-right event feed. Names stay correct through goal replays and resets.
- Competition-specific matchday introductions for RLCS, Worlds, Esports World
  Cup and FIFAe, using the four supplied videos and matching backgrounds.
  Introductions support skipping, pause and sound controls, and fall through
  to matchday if media cannot play. FIFAe presentation support does not add a
  new tournament to the career calendar.
- The Steam account launch fix from 1.0.9 remains included, including support
  for custom Steam libraries.

HUD names and the demolition feed were visually verified in local exhibition
matches. Remote Rocket Host appearance has not been visually verified.

## Validation

277 app tests, four Steam launcher tests, 25 HUD startup tests and native HUD
regression tests passed. The packaged app opened with an isolated profile,
decoded all four included videos, and matched the source hashes for all nine
competition media files, the four launch/bridge files and the HUD DLL.
