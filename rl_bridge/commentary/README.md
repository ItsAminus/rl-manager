# Commentary runtime

**Current launcher: local hybrid commentary**, through `hybrid_broadcast.py`.
See [HYBRID.md](HYBRID.md) for Chatterbox introductions, grounded background
analysis and the unfinished prerecorded bank. `clip_broadcast.py` provides the
recording director and audio player. The game never imports the old Google,
RVC or GPT-SoVITS broadcasters, including with legacy provider settings.

The 55 supplied clips live in `voice_bank/`: kickoff, dribble, flick, wall,
aerial and air dribble. Files are preloaded before kickoff. A separate Windows
audio process plays each complete WAV through the native sound API, using the
default Windows output. Playback does not need Python audio callbacks in the
match process. The director waits for native completion before a follow-up call.
Game observations target 50 Hz. Detecting a sustained dribble needs 300 ms of
control evidence. Kickoff holds everyone until all external bots have initialized
and produced controls; see [HYBRID.md](HYBRID.md) for startup and verification.

The hybrid desk uses a 0.28-second breath after analysis and 0.55 seconds after
recordings; routine recorded categories have a ten-second cooldown. **Every
recording and introduction finishes.** Generated analysis alone can yield, with a
short fade, to an available goal/save/big-mistake/critical-demo recording. Routine
plays and missing reaction clips never interrupt it. A confirmed important event
or progression of the same play can occupy
one follow-up slot. A more important event replaces that waiting call; audio is
never overlapped. Follow-ups start after the native completion acknowledgement.
For recordings, waiting time can be the remaining duration of that sentence.
Routine follow-ups expire after four
seconds and terminal events after six. Possession changes discard queued mechanics;
unrelated routine events are discarded. This prevents an accumulating backlog.

Each category uses every available variation before repeating, including across
matches. Rotation is saved in `cache/clip_rotation.json` when the match stops.
Only started clips count as used; queued/discarded calls do not consume a variation.
New clips are picked up at the next launch.

There are currently **no goal, save, block or shot recordings**. A goal/save/block
still clears inappropriate waiting calls but lets the current sentence finish.
Add matching PCM16 WAVs named
`goal_01.wav`, `save_01.wav`, `block_01.wav`, or `shot_01.wav` to enable those
calls. The other filenames follow the same `category_01.wav` pattern. Categories
without a detector are not played automatically; dropping in arbitrary filenames
does not create a new play detector.

Telemetry uses actual RLBot packets: scoreboard changes for goals, save counters
for confirmed saves, opposing touches for possession loss, and geometry/control
for mechanics. It does not infer goals just because the ball crosses a coordinate.
The `--no-commentary` switch disables playback. Audio failure leaves the game
running and reports a warning in the match status.

Run the integration checks with the RLBot Python installation:

```powershell
& "$env:LOCALAPPDATA\RLBotGUIX\Python311\python.exe" -m unittest discover -s rl_bridge -p test_clip_broadcast.py
```

The notes below and [GOOGLE.md](GOOGLE.md) describe retired runtimes, not the
current match path.

## Historical local runtime

The match bridge starts `live_dispatcher.py` only when the local runtime and the two consented reference files are present. It loads the local voice model once, keeps the Rocket League telemetry loop nonblocking, and cancels queued speech when a confirmed score or save arrives.

The old `audio_dispatcher.py` soundbank remains for comparison but is not used by `launcher.py`.

To rebuild the local runtime on another Windows install, run PowerShell from the repository root:

```powershell
& .\rl_bridge\commentary\setup_local.ps1 `
  -BasePython 'C:\path\to\python.exe' `
  -Samples 'C:\path\to\authorized\samples'
```

The setup downloads the open-source GPT-SoVITS code, its weights, a small local text model and the two samples into `rl_bridge/local_runtime`. It does not upload recordings.

Use `benchmark_local.py --warmup` to measure first PCM chunk, synthesis time and real-time factor. Use `demo_local.py` without `--play` to save a synthetic match test to `commentary/reports`; add `--play` only when you explicitly want to hear it.

The match recording is never used automatically for cloning or training. `prepare_match_candidates.py --cleaned` separates candidate excerpts, assigns an uncertain speaker suggestion, and marks every result `review_required: true`; listen and approve only clean, single-speaker clips before adding them to a reference set.
