# Google Puck match commentary

`launcher.py` starts `google_broadcast.py`. The voice is **Puck**, using the Google
Speech Studio export's energetic style approach. This is a Google preset, not a
trained Caster Two/Caster One clone. Old soundbank, RVC and local models are not in this path.

## Setup

Use the same Python interpreter as RLBot, from the project root:

```powershell
python -m pip install --target rl_bridge/local_runtime/google_deps -r rl_bridge/commentary/requirements-google.txt
```

Put configuration in the project's ignored `.env.local`, never in renderer code:

```dotenv
GEMINI_API_KEY=your_key
GEMINI_VOICE=Puck
GEMINI_TTS_MODEL=gemini-3.8-flash-lite-tts
GEMINI_SCRIPT_MODEL=gemini-3.5-flash-lite
```

Environment variables override the file. Requires internet and Google quota;
free usage is not guaranteed. Only match facts, recent commentary and generated
text go to Google. Recordings and voice references are not uploaded. Initialization
failures produce launcher status warnings, without fallback to the old voices.

## Audition and verification

```powershell
python rl_bridge/commentary/google_speech.py
python rl_bridge/commentary/google_speech.py --play
python rl_bridge/commentary/google_broadcast.py
python -m unittest discover -s rl_bridge/commentary -p test_google_broadcast.py -v
```

The first command saves `reports/google-puck-test.wav`. `--play` also plays incoming
audio. The broadcast command runs a 20-second synthetic match with a goal interruption.

## Behavior and limitations

- Flowing 50–70-word turns are freshly generated from recent touches, confirmed
  events, player statistics and line history. The next turn begins generation with
  4.5 seconds of audio remaining. There is only one continuation, not a long queue.
  Goals and overtime use short factual text synthesized
  on demand, avoiding another text-model round trip. They are not recordings.
  Goal wording is currently deliberately simple.
- Saves are incorporated into subsequent turns instead of spending a separate
  speech request each time. Between-play commentary continues during kickoffs.
- Clock phrasing uses minutes and seconds, or elapsed time into overtime. Saved
  career context contains each team's last five completed series before this
  fixture; it is not real-world esports form. No history means no invented form.
- Goals invalidate older work and clear playback. Two tasks maximum are in flight,
  with one replaceable pending event, rather than an unbounded queue.
- A score increase is required for goals. Saves use game statistics. No guessed
  scorer, invented mechanic or fabricated goal speed is supplied by the detector.
- Playback streams 24 kHz mono PCM16 with 180 ms initial buffering, no RVC, pitch
  shifts or clipping boost. WAV headers are removed when needed; invalid formats fail.
- Launcher status reports first-audio, buffered audio, spoken text and underruns.
  These do not measure physical speaker latency.
- Prefetch reduces generation gaps; network failures can still cause silence.
  Late starts are discarded (3 seconds for events, 6 for
  ambient); cancelled network reads can remain in flight until data arrives or
  the 15-second socket timeout. Errors preserve already-buffered speech. Quota
  cooldown applies to goals too; requests do not bypass it. Google retry metadata
  and exponential backoff are honored. A daily quota violation pauses this process
  for 24 hours (in practice, the rest of the match). The match screen shows a warning.
- October 8 live diagnostic: the supplied key returned quota category
  `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, despite the user reporting
  1,000 RPM / 10,000 RPD in AI Studio. Project/tier alignment needs checking. This
  code cannot override the enforced limit or guarantee nonstop speech under it.
- Voice quality, repetition over a long match and in-game latency need listening
  and match testing. API success does not prove naturalness.

Reference: https://ai.google.dev/gemini-api/docs/generate-content/speech-generation
