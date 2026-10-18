# Recorded commentary

The final bank was merged from `<user-home>/Downloads/FINAL VOICE BANK/rl-manager-voice-bank`.
All 400 source WAVs are installed or reused: 346 additions, 54 identical recordings already present.
There are 407 playable files in the combined bank. Existing filenames and audio were preserved;
filename collisions have new numeric suffixes. `voice_bank/final-bank-import.json` maps every source
file to its installed ID. `voice_bank/archive/before-final-bank` retains the previous bank.

Recorded speech shares one commentary channel with live Chatterbox. The original screams and
the countdown keep their independent channels. Higher-priority critical reactions fade lower-priority
speech through the existing native audio worker. A goal cuts a save or routine call; ordinary aerials,
touches, passes and wall plays never cut a goal. Intro and postgame sentences remain protected.
Goals cancel the countdown. Each category uses every recording before repeating during a game.

Automatic calls include confirmed goals, equalizers, go-ahead goals, meaningful final-second goals,
overtime winners, saves and defensive double/triple-save sequences, registered shots/power shots,
demolitions, verified open-net misses, kickoff, ground/air dribbles, flicks, wall/ceiling play,
teammate connections, close contests, clearances, low boost, sustained pressure and closing/overtime
clock discussion. Recorded tactical/booth filler is sparse and yields to prepared AI discussion.
Dynamic pregame, postgame and career analysis remain enabled.

Flip resets, double touches, post/crossbar hits, own goals, bumps, interceptions, counterattacks and
recoveries are loaded with their own rotation pools, but do not yet have automatic reliable triggers.
`process_confirmed_event` accepts explicit native confirmations for these categories. Unconfirmed
mechanics are deliberately not inferred from a high ball or a simple change of possession.

To merge again, run `scripts/import-final-voice-bank.py` with the source folder. Matching source
hashes are reused. Audio is decoded to mono PCM16 at 48 kHz before gameplay; no cloud generation
or runtime audio decoding is needed. The next match loads the merged bank automatically.
