# RL Manager player release

Build the Windows installer with `npm run package:win`. Output is
`release/1.1.0/RL.Manager.1.1.0.Setup.exe`. The installer creates desktop and Start
menu shortcuts, supports a per-user installation and preserves AppData careers
when uninstalling. Open the installed RL Manager executable; no development
server or terminal is needed.

The normal player build has no menu bar, automatic developer tools or developer
cheat section. Developer tools are disabled in packaged windows. A source-only
debug opt-in is available with `RLM_ENABLE_DEVTOOLS=1`; it cannot enable tools in
the packaged release. Direct database IPC is disabled in packaged builds.
Match Python processes and component checks hide their console windows. Startup
errors have a player-facing message and local, size-limited support log. One app
instance owns the career library at a time.

## First launch

The complete download folder is built with `scripts/build-complete-folder.py`
after the player installer. It combines the installer, an isolated tested Python
runtime with RLBot and CUDA speech dependencies, bot pack, text/speech models,
official BakkesMod installer/core, and Rocket Host plugin. `Install RL Manager.exe` opens
the Windows setup wizard; no console or development tools are required.
The speech runtime uses bundled model paths rather than developer-profile
caches. Setup registers the unpacked runtime and bot pack per user, generates
an individual RCON password, and preserves careers and existing preferences.
Rocket League, sign-in and graphics drivers remain external prerequisites.
The folder includes upload-sized split archive parts which must stay together.

The current complete folder is `distribution/RL-Manager-Complete-1.0.7`, approximately
7.31 GB. Its runtime expands to 11.00 GB, plus the installed game. The runtime
archive, installer archive, all download checksums and setup configuration checks
passed. Relocated Python imports, Nexto/Necto model loading, private Java and the
packaged app smoke check passed, alongside 266 app tests and 140 targeted bridge
tests. `release/1.0.7/release-check.json` records the checks. A fresh-PC installation
and a live Rocket League match have not been tested for this complete kit.
Temporary staging and the duplicate unpacked player build are removed after
verification; the complete upload folder and normal player installer remain.

Version 1.0.6 adds original Caster One/Caster Two CPU generation for AMD and Intel systems,
a tested GPU-kernel probe, CUDA/ROCm detection, an optional separate ROCm speech
interpreter and bounded, cancellable background requests. Both original caster
profiles generated actual WAVs with GPU visibility disabled; NVIDIA generation
also passed. CPU short-line synthesis took about 27â€“33 seconds in this test, so
live speech can be slower. Unsupported/broken GPU kernels fall back to the same
voices on CPU. Optional ROCm acceleration has not been verified on physical AMD
hardware. See AMD_SPEECH.md. The complete 1.0.7 folder reuses the checksum-verified
1.0.5 runtime payload and installed model folder, avoiding a redundant 11 GB
runtime installation during an upgrade.
The splash uses the supplied RLM arena/office artwork. Its percentage represents
startup milestones (career database, world data, workspace and renderer ready),
not a guessed time-to-finish. The renderer ready acknowledgement dismisses it.
The original orange-car artwork is used for the application/window/installer
icon and sidebar identity.

The first-launch guide has 32 steps across the actual pages of both modes, with
spotlights, animated rings, arrows and practice tasks. Players swap starters,
change and save a role, publish a simulated Chirp and spend a development point.
Both practice careers live only in memory and never enter the save list. Live
match launching is blocked during practice. Completing or skipping the guide
is remembered in `player-preferences.json` independently of career saves. The
guide is replayable from the menu and Settings and returns to the main menu.
Reduced-motion system preferences disable the guide's pulsing animations.

## Played matches and optional AI

Version 1.0.4 adds a matchday button after Rocket League's window is ready:
**I'm at the menu â€” Start / restart BakkesMod**. The match waits for this
launch-specific confirmation, restarts a non-injected injector app, restores
Rocket League and verifies the HUD before joining. A verified existing HUD is
reused between games. Launching the supported injector uses its normal injection
process; RLM does not force-inject a DLL. Rocket Host's observed `Kiyo 3.0` labels,
including duplicate instances, now resolve to Kiyo3 so the complete five-bot
roster releases the human's assigned blue-team entry.

Version 1.0.3 updates Hard Manager Career assignments: 98â€“100 OVR uses Kiyo3,
96â€“97 Chronos, 94â€“95 BonkDaddy, and 90â€“93 draws from healthy Ordis/Byte/Opti.
89 retains Nexto/Nexto+/Daizen/Fury; lower tiers are unchanged. Rocket Host's
advertised catalog confirms Kiyo3 and Chronos. Healthy saved series assignments
remain fixed until the next series; Easy, Medium and Path To Glory promotion
pools are unchanged. Kiyo and Kiyo3 are matched as distinct hosted policies.
The injector now starts after Rocket League's gateway connects and its current
game window is responsive and stable, then RLM verifies injection and the HUD.
HUD files are still installed before the game opens so updates are not locked.

The package includes the Python match bridge, recorded voice bank, prepared
commentary, native career HUD/fonts, audio helper wheels and public images.
The writable bridge is installed under the player's AppData folder, outside
`app.asar`; versioned code updates do not delete its generated cache. The HUD
installer refuses to overwrite a loaded plugin and gives a clear retry message.

Rocket League, a compatible RLBot Python/bot pack and BakkesMod are separate
prerequisites. Settings â†’ Rocket League connection provides detection and saved
path selection. No component check launches Rocket League.

Large Chatterbox/CUDA and local-text runtimes are optional separate installs,
not copied into every installer. This computer's existing runtime is registered
in AppData `runtime-location.json`. On another computer, choose an installed
runtime in Settings. Its speech weights, conditioning files and Python runtime
must be correctly installed; selecting a random folder does not install AI.
The release continues to include recorded commentary when live speech is
unavailable. Do not distribute `.env`, user databases or personal runtime caches.

## Version 1.0.2 tournament correction

Majors no longer fall back to an all-team league when fewer than sixteen teams qualify. Incomplete official fields wait for qualification. The saved group draw assigns four groups of four, records group membership on entrants and schedules twenty-four BO5 series: three distinct opponents per team. Completed groups seed the eight-team Major 1 or twelve-team Major 2/Worlds hybrid bracket, including upper/lower paths, single-elimination semifinals and one final. Worlds retains its play-in stage before its sixteen-team group draw.

The group draw has a replayable pot reveal with team logos and the player's group highlighted. Replaying the reveal never rerolls groups. Full brackets are visible by default. Major draws and the Worlds post-play-in draw are recorded on the calendar.

Existing started legacy leagues show a review before any repair. The original event data is snapshotted in the save. Completed series retain fixture IDs, scores, player statistics, XP and incident evidence in linked archived history. A partly played series must finish before repair. When the same season already has a correctly qualified official Major, the duplicate old event is retired and the player is directed to the official event; its entrants, results and draw date are unchanged. Otherwise a legacy field may be rebuilt, using only its existing confirmed real entrants and completed qualifying results to fill missing places. This compatibility rule is stated in the review and does not replace qualification in newly created official events.

Verified on an in-memory copy of the affected fourteen-team International Major 3: fourteen prior series preserved; duplicate retired; official sixteen-team field retained; four groups, three series per team, then the complete nine-series Major 1 playoff route to its Grand Final. The real save is only read by this diagnostic. Regression tests also cover a standalone repair that produces the twelve-team, thirteen-series playoff route, incomplete fields, foreign saves, partial series and repeat repair rejection.

The real production UI walkthrough checks both repair paths, group reveal, save isolation and all thirty-two tutorial steps. No Rocket League match is needed for these tournament checks.

## Earlier player-release changes

- Chirp uses the supplied blue falcon emblem in its page, profile banner and navigation.
- Club Studio permits local blob image decoding under the production content policy. Both SVG builder images and uploaded PNG/JPEG/WebP images can be rasterized and saved; valid designs survive reopening the page.
- Two new arena backgrounds are selectable on the menu and in Settings, alongside the original supplied artwork. Asset paths and generation prompts are in BACKGROUND_ASSETS.md.
- Opposing coaches save their timeout after a routine opening BO5 loss. Blowouts, sustained losses and elimination danger increase urgency. Moderate situations vary by series with a stable decision that cannot reroll on polling. The timeout gives its reason.
- Local tactics run after skill corrections, choose only eligible ordered demo hunters, retain cover, and act off the ball even when the ball is high or in the defensive half. Actual action/target telemetry feeds the comms confirmation. Demo pressure lasts 12 seconds. Kickoffs, aerial mechanics, imminent ball touches, urgent goal defence and teammate avoidance retain priority. An order changes control inputs but does not guarantee a successful demolition or pass. Rocket Host bots retain private tactics.
- The 32-step guide explains all three difficulty levels and marks Hard experimental, with possible instability/lag. Its cards are constrained to the available viewport height.

## Verification

`scripts/check-player-release.cjs` launches the real production entry point with
a disposable AppData directory inside `scratch/`, walks every tutorial step,
checks real-save isolation and completion persistence, and checks tools/cheat
removal. Images are saved under `scratch/release-review/` for inspection. It
does not launch Rocket League. Existing match tests remain separate from a real
played-match check.

The October 16 player build passed 259 app tests, 155 relevant bridge/commentary
tests, the complete interactive walkthrough and a smoke test of the packaged
Windows executable. The final installer archive passed its integrity check.
Installer size is approximately 853 MiB; installed game files total approximately
1.14 GiB before separate match/AI prerequisites and career data. Disposable review
profiles and the duplicate unpacked build are removed after verification; the
installer, checksum record and screenshots remain.

Successful packaging now retains only the newest version's installer. Older
version folders are removed only after the new installer and blockmap exist;
unknown release-folder contents, saves and optional AI runtimes are preserved.
Preview this cleanup with `node scripts/prune-releases.cjs`, or apply it with
`node scripts/prune-releases.cjs --apply`.

The installer is unsigned unless a publisher certificate is supplied at build
time. No signing certificate is invented or bundled. Third-party names, assets,
voice recordings and music retain their existing ownership; packaging does not
grant redistribution permission.

## Match audio portability (1.0.7)

Recorded commentary, crowd reactions and countdown playback do not require a
speech model or compatible GPU. All 407 active recordings are packaged. Match
audio adapts to the output device's native sample rate (including 44.1 kHz
headsets), and falls back to Windows waveOut if PortAudio cannot import or open
the device. Each audio lane owns its output handle, so countdown cancellation
and goal interruptions remain independent. Helper errors and startup/playback
timeouts are surfaced in support logs.

Settings > Sound & gameplay > Test match audio plays a real caster recording,
a crowd reaction and the full countdown using the same helpers as a match.
It reports missing/invalid recordings and playback failures. Successful software
playback cannot detect a muted Windows volume mixer or disconnected speakers.

The portable runtime and the actual installer must both be checked with
`commentary/audio_check.py --silent`, including `RLM_AUDIO_BACKEND=windows`.
A fresh-PC or live-match result must not be claimed without testing it.
