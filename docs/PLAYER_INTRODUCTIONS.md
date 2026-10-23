# Series player introductions

Local implementation using the user's ElevenLabs voice, **My Esports Commentator**
(`B0i1MptR3y100T78AN8f`). The initial 359 clips were generated and validated on October 22,
2026, using `eleven_multilingual_v2` and the voice's saved settings. The initial
library contains 13.1 minutes of speech in 37.73 MB of 24 kHz PCM WAVs. Work stays
local; nothing has been pushed or published. Live showcase verification and
broader sourced debut/Worlds coverage are recorded below.

## Sequence

Before game one, both local and Rocket Host routes can load a disposable local
six-car scene. No external bot inference runs in that scene. RLBot pauses the
scene, parks the cars and supplies exact career identities to the native HUD.
The native plugin accepts camera requests only in a paused, fresh offline scene
with no elapsed gameplay and a zero score. It slowly arcs around the selected
car and draws a dark facts panel with a gold name/team strip, based on the user's
Worlds broadcast reference. Space or controller B skips the sequence.

The bridge waits for a matching session/player camera acknowledgement before
starting that player's audio. Receipts expire after two seconds. Fresh HUD
requests expire after one second. A missing native capability/identity/camera,
stale heartbeat, scene exit or skip releases camera control. The scene receives a disconnect request, then its pause is released so queued
travel can complete before the real match is loaded or a Rocket Host server is
requested. It never sends a played-match result, incidents or career
statistics. Hosted recovery retries do not repeat the introduction.

The normal native overlay can render cards silently when commentary is disabled.
When commentary is enabled but its voice bank is missing, introductions skip
instead of making the user sit through six silent cards. A diagnostic context
can set `_showcaseWithoutAudio: true` to inspect the visuals independently.

## Offline ElevenLabs vocabulary

`rl_bridge/commentary/player_intros/bank.json` contains the explicit generation
list. The expanded inventory has the top 1,000 database players by overall
rating, 21 ages (15–35), 90 debut labels, 48 Worlds result labels, 15 openings
and 15 closings: 1,189 clips. Ranking ties use stable player ID ascending.
The expansion adds 812 names and 18 script clips (7,435 spoken characters),
retaining every original clip and its recording fingerprint unchanged. The vocabulary lists possible
values; it does not assign a biography to any player. New formats and future
seasons need additional labels rather than guessed history.

All clips are generated using one chosen Voice ID, model and settings. The
runtime selects complete short sentences for the name, age, debut and Worlds
result, between reusable openings/closings. It resamples them to the existing
audio player's rate. Generation uses `previous_text`/`next_text` continuity
context. Composition trims excess leading/trailing silence conservatively,
matches speech levels with headroom and adds only enough silence for a 150 ms
sentence boundary, rather than inserting a fixed pause after every recording.
Quiet consonants are protected with speech margins and short edge fades. It
never substitutes a locally cloned or differently voiced middle section. The
assembled zen preview was automatically transcribed with all expected facts;
per-name pronunciation and subjective continuity still benefit from listening.

The generator reads `ELEVENLABS_API_KEY` locally and never saves it in the bank.
It uses the official text-to-speech endpoint and 24 kHz PCM, avoiding the Pro-tier
requirement for 44.1 kHz PCM. No generation runs during matches. Generated WAVs
are local ignored assets; the player pack includes the WAVs and manifest.

Inspect the saved inventory without network activity:

```powershell
& "$env:LOCALAPPDATA/RLBotGUIX/Python311/python.exe" rl_bridge/introduction_voice_bank.py
```

Use `--top-names 1000` to extend the inventory without dropping or invalidating
existing recordings. The original positional openings/closings remain tied to
their lineup slot; the nine new generic openings and nine generic closings can
serve any player. Selection varies with the saved fixture and roster, stays
identical between preparation and playback, and avoids repeats within a lineup.

After selecting the voice and setting the API key in the local environment,
generate with an explicit `--generate` flag and `--voice-id`. The model and voice
settings are recorded in the manifest. Completed requests save a fingerprint of
voice/model/settings/text and resume without regenerating unchanged clips.
Changing any of those values or generation context invalidates the corresponding clip. A network
failure stops the batch instead of automatically charging for an ambiguous retry.
The CLI supports `--model-id`; inspect/edit the manifest settings before generation
when matching the user's existing ElevenLabs setup. Local manifest-renaming
retries handle Windows file locks without repeating a paid request. Each new
clip also has a local receipt, so a save failure can resume without charging
again. The completed batch passed its fingerprint, file and WAV-header audit.
The task's temporary credential file was removed; no key is stored in the bank.

Official endpoint documentation:
https://elevenlabs.io/docs/api-reference/text-to-speech/convert

## Player facts

`data/player-introductions.json` holds sourced birth dates, RLCS debuts and
best 3v3 Worlds results. Real-player age is calculated from the birth date at
the career date, rather than using the database's potentially stale age. Only
generated career players use their saved age. Records require an exact stable
player ID/gamertag match and each fact carries its source into the launch payload.
Future achievements are excluded. Missing facts are omitted from speech;
missing history must never be interpreted as evidence that a player has not debuted.
Public account titles, 1v1/2v2 titles and other competitions do not establish a
3v3 RLCS World Championship result. A career-earned Worlds title can update it.

All top 1,000 player cards now have three populated, sourced display rows. The
original age/debut/Worlds biography fields take priority when verified; missing
biography fields are replaced by accurately labelled competition-region/event
and tournament evidence. Registration and seeding are not presented as an RLCS
debut, a tournament finish, or a Worlds result. A dated team placement is labelled
RECORDED TEAM FINISH; a team seed is labelled RECORDED TEAM SEED. LAN statistics
are labelled EVENT RATING. Future event evidence is excluded for earlier saves.
These alternate rows are visual information, not fabricated voice sentences.

`scripts/build-introduction-card-evidence.py` reads existing sourced database
records, requires useful event evidence and exact recorded-name coverage for all
1,000 identities, and writes event histories plus
`data/player-introduction-card-coverage.json`. It makes no network requests and
preserves the researched biography registry. The updated native HUD 1.9.3 renders
the three supplied label/value rows and wraps longer event names. Earlier clients
must load the rebuilt app and plugin before testing.

The final audit checked all 1,000 actual launch payloads through the Python
presentation plan: each has three sourced rows, and each player's existing
ElevenLabs audio loads successfully. Both career start (2026-10-11) and review
date (2026-10-22) pass the full-population card test. The compiled Electron bundle
contains all 1,000 event histories. This verifies data/audio coverage offline;
these changes were not tested in a live Rocket League match.

The October 22, 2026 expansion audits the exact top 1,000 identities used by
the recorded name library (overall descending, stable ID ascending for ties).
The registry currently contains 203 sourced birth dates, 62 sourced main-event
debuts, and 37 sourced Worlds results; 37 players have all three fields. This
is incomplete biography coverage, not a claim that the remaining players never
competed. Of the 1,000, 785 are qualifier-registration identities. Public profile
matching requires linked organizer IDs, real-name evidence, sourced birth dates
plus the player tag, or individually reviewed established pro identities.

Gentle Mates' archie, nass and Oski now have complete sourced cards. Debut means
the first played RLCS 3v3 main event, excluding qualifying rounds, RLRS, The Grid
and 1v1/2v2 events. Earlier dated saves use the best verified Worlds result
already achieved at that date, rather than hiding earlier finishes behind a
future personal best. Unknown fields are omitted from speech, never fabricated.

`data/player-introduction-coverage.json` lists every target, verified fields,
identity evidence, incomplete result research and missing spoken vocabulary.
Eight players have one of four historical placement ranges outside the original
recorded voice vocabulary. Their correct placements remain on the card while
that sentence is omitted from speech; the rest retains the selected voice.

Research tooling: `scripts/research-introduction-facts.py` caches public evidence
and `scripts/import-introduction-facts.py` imports identity-confirmed facts.
The results source returned HTTP 429 during this expansion, so remaining requests
were stopped. Large transclusions also produced incomplete Lua renders; these
were invalidated and never treated as evidence of no tournament history. The
resumable importer defaults to four pages per results batch. Neither script
changes a save or launches Rocket League.

A stale Electron bundle previously omitted Stizzy's debut despite the corrected
source record. Regression coverage checks actual `broadcastTeam` launch payloads,
Gentle Mates' three cards, age/date behavior, earlier Worlds history, identity
mismatches and result filtering. Rebuild the Electron main bundle after registry
changes, and restart the app to load it.

Example schema (illustrative, not a real player record):

```json
{
  "version": 1,
  "players": {
    "stable-player-id": {
      "gamertag": "Exact saved gamertag",
      "rlcsDebut": {"text": "2024 Split 1 Regional 1", "source": "https://source.example/player-history"},
      "bestWorldsResult": {"text": "7TH-8TH", "source": "https://source.example/worlds-results"}
    }
  }
}
```

## Validation

Native compilation and camera guard/orbit tests; TypeScript validation and fact
selection tests; Python tests for roster permutation, missing/ambiguous identities,
session freshness, later-game/retry suppression, offline bank composition,
generation resumption, voice invalidation and path containment. Existing startup,
broadcast telemetry, hosted entry and hybrid commentary regression tests are also
run. These are not a substitute for a live native camera/skip/layout check or
listening to the selected ElevenLabs voice.


The current HUD DLL compiles and its offline tests pass. Live checks confirmed
six correctly named display cars and readable fact cards. The last live check
still showed the stadium director view; the subsequent camera-only tick fix
compiled, but has not been tested in game. The user requested no further game
launches and will verify camera motion, skip and the transition into the real
match themselves. Audio fingerprints, WAV headers, composition and preview
transcription pass; subjective joins and name pronunciations need listening.


The top-1,000 expansion completed on October 22, 2026. All 1,189 clips passed
voice/model/settings/text fingerprint, WAV format, non-silent audio and exact
ranked-name coverage checks. All 359 original WAV hashes are unchanged. The
expanded library contains 29.3 minutes in 80.39 MB. All 102 Python regression
tests passed; no game was launched for this expansion. The 30 reusable scripts
are listed in `PLAYER_INTRO_SCRIPTS.md`. The card preview in the conversation is
an offline render using the native overlay font atlas and layout, not a new
in-game screenshot.
