# Local storage and source sharing

The source checkout and the locally installed AI runtimes are different things.
Only the source and distributable UI assets belong in Git. `.gitignore` excludes
dependencies, models, personal recordings, generated audio, preview databases,
build output and local environment files. It does not remove files already in
Git history. No history is rewritten by the cleanup scripts.

Measured after the second cleanup and rebuilding on 16 October 2026: 41.3 GiB
initially, 12.5 GiB after retiring training, then 7.456 GiB of file contents using
5.916 GiB on disk (6.352 decimal GB). The latter includes 4 KiB allocation-unit
rounding. Windows lossless executable compression accounts for the difference;
files are decompressed transparently when read. About 592 MiB of source/assets
are Git-visible, excluding Git history and all locally installed AI dependencies.

Type checking, the production build and 241 app tests pass. The first cleanup's
150 bridge/commentary tests also passed. All 18,395 protected image/data/voice
paths and sizes were retained; 497 voice/reference/profile hashes matched. After
runtime slimming, both voices synthesized actual WAVs on the RTX 5060. Cold
Transformers import takes longer than the original 45-second smoke-test limit;
the longer synthesis check completed. The hidden production scoreboard loaded
all ten player/team image elements from the shared `public/` directory.

## Kept for the working game

- `src/`, `data/`, `public/`, tests and maintenance scripts: game code, esports
  data, player photos, team logos and HUD images. Image quality is unchanged.
- `rl_bridge/local_runtime/chatterbox_venv/`: the current CUDA speech environment.
- `rl_bridge/local_runtime/text_model/` and `llama/`: commentary selection and
  Chirp now share the existing Qwen 1.5B model. The second 3B model was removed,
  saving about 2 GiB. AI text remains enabled; its phrasing can be less varied.
  In the live three-job Chirp check, two generated reactions passed the existing
  factual validation; the third was rejected and remains eligible for fallback.
- `rl_bridge/local_runtime/google_deps/`: audio dependencies still used by the
  recording player, despite this folder's historical name.
- `rl_bridge/local_runtime/bakkesmod/`, `rocket_host_v5/` and the saved bot-health
  state: integration tooling and runtime state.
- `rl_bridge/commentary/voice_bank/`, reference recordings and
  `cache/*_conds.pt`: your recordings and the two current Chatterbox voice profiles.
- `rl_bridge/commentary/cache/hybrid_generated/`: already prepared speech kept
  to avoid generating the same introductions and result commentary again.
- `bakkesmod/build/RLManagerHUD.dll` and `fonts/`: install-ready native HUD.
- `rl_bridge/local_runtime/tools/ffmpeg.exe`: audio import utility, retained
  independently of the retired GPT-SoVITS training installation.

Normal career saves live under Electron's user-data folder in AppData. The cleanup
does not visit AppData, Rocket League, Downloads, or the installed RLBot pack.
`scratch/` review databases are disposable test worlds, not normal career saves.

## Removed in the October 2026 cleanup

Retired GPT-SoVITS/RVC training weights, datasets, intermediate checkpoints,
speaker-audit models, training virtual environment, auditions, downloaded research
copies, obsolete installers, old package builds, compiler objects and HUD backups.
The archived training/demo source scripts remain available, but their historical
experiments require reinstalling those optional dependencies and supplying data.
The current match launcher does not load those broadcasters.

PyTorch's third-party static compiler archives (`dnnl.lib`, `kineto.lib` and
Protobuf libraries) were removed, saving 2.528 GiB. Every runtime DLL is retained.
The [upstream packaging rules](https://github.com/pytorch/pytorch/blob/main/pyproject.toml)
exclude those same archives. Torch's own import libraries remain.

Read-only runtime binaries use [Windows lossless LZX compression](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/compact).
The CUDA DLLs, Electron binaries and local audio/text utilities still expose
their original bytes to the loader. Decompression can add some cold-load CPU
work; no gameplay performance improvement is claimed.

No Vite build copies `public/` any more. Production pages resolve media in the
single sibling `public/` folder; development continues using Vite's public URLs.
The Windows packager includes that shared folder. This removes two redundant
copies without resizing or recompressing the image files. Keep `public/` beside
`dist/` when launching an unpackaged production build.

## Routine cleanup

From the repository root:

```powershell
# Preview the explicit disposable paths first.
./scripts/clean-generated.ps1 -BuildOutputs -WhatIf
# Remove generated builds and temporary review files; rebuild before npm start.
./scripts/clean-generated.ps1 -BuildOutputs
npx vite build
# Reapply runtime slimming after reinstalling CUDA/Python or Electron packages.
./scripts/compact-speech-runtime.ps1
```

`-RetiredVoiceTraining` additionally removes the retired experiment folders. It
does not remove the current Chatterbox environment, text models or voice bank.
The script verifies every absolute deletion target is inside this checkout and
refuses reparse points. A local `.cleanup-report.json` records deleted paths/sizes.

## Publishing the source yourself

Use Git from this folder; avoid uploading a zip of the entire working directory,
which would include ignored models and dependencies. Review `git status` and the
staged file list before committing. The UI's `public/` image library is retained
as source assets. Large local AI dependencies are installed separately; a Git
clone alone is not a configured voice runtime. Personal recordings and voice
profiles are intentionally excluded and stay on this PC. Existing history may
still contain old assets from earlier commits; `.gitignore` cannot erase them.

On a fresh machine, install Node dependencies with `npm ci`, build the app, and
configure RLBot/BakkesMod plus the optional local speech/text runtime separately.
Do not copy your local `.env` file or career databases into a public repository.
