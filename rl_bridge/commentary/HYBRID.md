# Local hybrid commentary

The match launcher now runs `HybridBroadcast`: your recordings handle live
mechanics, while the original English Chatterbox model generates complete
introductions and ongoing discussion in a separate GPU process. No Google API,
voice retraining, or GPT-SoVITS inference runs in this path.

## What is ready

- 55 supplied action clips remain in `voice_bank/`.
- Pregame introductions use the match's actual team names, roster and ratings.
  Career matches also include best-of length, saved game wins, game number and
  actual series-point/deciding-game stakes. Game results update the postgame
  series score by one win, never by the number of goals. Verified survival,
  deciding games, game comebacks and completed reverse sweeps are called out.
  Result headlines for both possible winners are prepared during play. In the
  last two minutes, observed player milestones are cached too; those lower-bound
  facts remain true when a player adds another goal/save/assist. The final 90
  seconds reserve generation for the result desk rather than starting another
  long analysis paragraph. At the final packet, the actual result selects only
  already prepared, valid audio, independently of an in-flight TTS request.
  Missing final-score or detailed-stat audio is omitted instead of delaying the
  next game. The full factual review remains in the bridge log. The playback
  budget is 35 seconds, with a sentence already on air allowed to finish.
  Loading introductions are asynchronous and expire after 20 seconds; they do
  not delay bots, stadium loading or kickoff. Identical text reuses cached audio.
- Caster One and Caster Two use the existing `caster_one_conds.pt` and `caster_two_conds.pt` profiles.
  Chatterbox runs on CUDA and produces 24 kHz PCM. Engaged analysis uses
  exaggeration 0.72–0.78 and CFG 0.35; high-impact player discussions use
  exaggeration 0.85 and CFG 0.30. These are the original model's supported
  controls, not Turbo emotion tags. Voice identity comes from the same profiles.
- The local Qwen 1.5B model runs on two CPU threads. It chooses interesting
  grounded discussion topics; final spoken wording comes from connected
  paragraphs. This is
  deliberately narrower than unrestricted LLM commentary. Match facts include
  score, shots, goals, saves, assists, clock phase, confirmed scorer history,
  sustained boost/field territory and completed career series. Player remarks
  connect measured involvement to tactical suggestions. Zero shots does not
  establish missed chances or a bad game; defensive contributions are acknowledged.
- The producer prepares one next paragraph while the current sentence plays.
  There is no 14-second generation cooldown or dangerous-shot silence gate.
  A 0.28-second breath separates prepared analyses; recordings leave 0.55 seconds.
  There is at most one prepared paragraph, never an accumulating speech backlog.
  Historical achievements remain usable when counters increase; score-dependent
  or outdated claims are discarded. New matches invalidate all old paragraphs.
- The last 40 spoken texts, six topics and recent subjects are remembered. Recorded categories retain
  their full-rotation rule across matches.
  Each new game starts a full category bag, so a partially used previous game's
  bag cannot cause an early repeat in the current game.
- Recordings and introductions always finish. Generated analysis alone can fade
  out for an available goal, save, big-mistake or critical-demo recording (including
  goal aliases). Routine mechanics, blocks and missing reaction categories never
  interrupt. A reaction starts only after the native fade completion acknowledgement.
  End-of-match shutdown drains the sentence on air.

The prerecorded bank is intentionally unfinished. There are no goal, save,
block or shot recordings yet, so those events currently have no immediate
spoken reaction. They still invalidate obsolete waiting analysis/mechanics.
Add PCM16 files such as `goal_01.wav`, `save_01.wav`, `block_01.wav`, `shot_01.wav`,
`equalizer_01.wav`, `late_goal_01.wav`, or `winner_01.wav` to `voice_bank/` when
ready. `winner` is selected only for a confirmed overtime goal; a late goal is
not announced as a guaranteed winner. New recordings load on the next launch.
`hybrid_voice_bank/` is an optional overlay for locally prepared clips.

Context-specific own goals, long-distance goals, missed chances and separately
stitched player-name reactions are not inferred by this prototype. They need
reliable event attribution and matching recordings before being enabled.
`critical_demo_01.wav` is supported: only a newly demolished last defender near
their net during a goal-threatening trajectory qualifies. Ordinary demos do not.
`mistake_01.wav` is reserved for a reliable confirmed mistake event; this prototype
does not infer one from an unsuccessful shot or an unconfirmed own goal.

## Runtime isolation

`rl_bridge/local_runtime/chatterbox_venv/` inherits existing speech dependencies
but installs its own CUDA torch 2.8.0 and torchvision 0.23.0. The RLBot interpreter
and bot dependencies are not upgraded. Torchaudio 2.8.0 is already on the host.
This differs from Chatterbox's torch 2.6 package pin; actual synthesis on this
RTX 5060 was checked for both voices.

Speech uses the already cached ResembleAI Chatterbox weights with offline loading.
No speech is uploaded. The text model listens only on a private loopback port and
is stopped with the match. Logs live in `cache/hybrid_speech.log` and
`cache/hybrid_llm.log`; prepared WAVs live in `cache/hybrid_generated/`.

The separate Windows audio helper retains synchronous `winsound.SND_MEMORY` for
complete recordings and intros. Generated analysis uses blocking PortAudio writes
in that isolated process, with 40 ms blocks and a short fade for critical events.
There are no audio callbacks in the match process. Cancellation is tagged with
the current job ID and cannot interrupt a recording or a later job. The helper
warms its audio imports before READY to avoid first-use cancellation delays.
A desktop loopback check measured 125 ms from a critical fade request to completion,
followed by the full 10.2-second recording (10.58 seconds including dispatch/drain).
This is not a guarantee of audible in-game latency under game load.

The revised paragraph samples generated on the real RTX 5060: Caster Two 7.9 seconds
of audio in 8.8 seconds; Caster One 9.5 seconds in 6.6 seconds. Local paragraph selection
took 2.3 seconds with short previews. Preparing ahead removes avoidable idle gaps;
continuous speech still depends on inference speed while Rocket League uses the GPU.

The October 9 repeated menu introduction and missing endings were traced to
resampling, rather than event interruptions. Windows NumPy 1.x uses int32 default
indices. Multiplying those indices by the 24,000 Hz source rate overflowed after
1.864 seconds of 48,000 Hz output, clamped negative positions to the opening, and
repeated the opening every 3.728 seconds. Source coordinates now use float64
before rate multiplication. This applies to both recordings and generated WAVs.
Regression checks emulate Windows int32 indices for long 24 kHz and 44.1 kHz
recordings. A real speaker-output capture of the same 10.2-second introduction
reproduced three identical openings before the fix; afterward it contained one
opening and sequential audio through the ending. Silent playback timing alone
did not reveal this corruption.

Kickoff uses the normal countdown and pauses the entire game while external bots
load. Per-match wrappers mark each bot ready only after its first successful
`get_output`, including initialization and inference. Metadata alone is too early.
The countdown resumes when every external bot is ready; initialization failures
abort startup rather than give the human a head start. Original bot-pack files are
preserved. Runtime wrappers are kept under `cache/bot_startup/`.

Metadata servicing drains available messages without the installed RLBot method's
100 ms empty-queue wait, which previously stalled observation on every poll.

## Checks

```powershell
& "$env:LOCALAPPDATA\RLBotGUIX\Python311\python.exe" -m unittest discover -s rl_bridge -p 'test_*broadcast.py'
& "$env:LOCALAPPDATA\RLBotGUIX\Python311\python.exe" -m unittest discover -s rl_bridge -p 'test_bot_startup.py'
```

Both voices were synthesized using the real GPU engine. The local LLM was also
checked with a real paragraph-selection request. The complete match path still needs
an in-game listening check under Rocket League's load.
