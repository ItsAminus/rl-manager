# RL Manager 1.1.0

## Download and update

Download **RL.Manager.1.1.0.Setup.exe** from this release. Close RL Manager,
Rocket League and BakkesMod, then run the installer over your existing RLM
installation. Your saves and settings are preserved.

Existing players with the complete runtime installed only need this update.
New players must install the complete four-part **1.0.8** kit first, then run
this **1.1.0** installer. The separate bot/model runtime is unchanged.

## Included changes

- HUD 1.8.4 addresses pro car labels reverting to bot names during native
  label refreshes, demolitions and respawns. Verified labels refresh after
  name and component changes, and recovery no longer treats an earlier
  publication as permanently valid. Reused UI rows must still match their
  current player, car and datastore slot.
- Reduces native HUD work by caching identity and field lookups, avoiding
  repeated roster scans for unrelated text updates, and removing per-frame
  nameplate/getter hooks. Includes timing information for support logs.
- Updates the packaged career HUD and requires the matching loaded version.
  Development launches also install the compiled local HUD before the game
  opens.
- Retains the Steam account launch fix, native event-feed presentation,
  competition introduction videos and matching matchday backgrounds.

## Build and testing status

The Windows installer includes the latest local fixes. Automated tests and
live game sessions were not run for this release at the maintainer's request.
Live confirmation of the latest Rocket Host name-label correction is pending.
Earlier performance measurements in `docs/HUD_PERFORMANCE.md` apply to HUD
1.8.3, not a performance measurement of this release.
