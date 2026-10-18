# Local GPT-SoVITS V2 training

Run `train_v2_local.py` with `rl_bridge/local_runtime/venv/Scripts/python.exe`.
All work and logs are in `rl_bridge/local_runtime/training_v2`, ignored by Git.
The current run is detached and does not need this chat to keep working.

Stages: Demucs vocal extraction, Whisper small.en transcription, ECAPA speaker
matching against the supplied clean samples, V2 feature extraction, then SoVITS
and GPT fine-tuning separately for Caster Two and Caster One. No audio is uploaded.

The classifier rejects low-similarity, ambiguous and inconsistent clips. This is
automatic filtering, not a guarantee of perfect separation or transcription.
Word timestamps limit slices to 2.5–10 seconds. Source 30-second blocks are held
out for subsequent listening evaluation. Originals are never overwritten.

The initial configuration is batch size 2, 12 SoVITS epochs and 15 GPT epochs per
speaker, sequentially on one GPU. Duration depends on the retained dataset and
GPU speed. More time/epochs do not automatically mean better voice quality.
Checkpoints are saved every 2 SoVITS epochs and 3 GPT epochs. Intermediate inference
weights are retained under each speaker's `weights` folder. Latest optimizer
checkpoints support resuming. Dataset preparation is reused on restart.

`status.json` reports the current stage; `child.json` identifies the active child
PID/log, and `pipeline.pid` identifies the supervisor. Actual training progress is
in `caster_two-sovits.log`, `caster_two-gpt.log`, `caster_one-sovits.log`, and `caster_one-gpt.log`.
`complete` in status means all four training stages exited successfully; `failed`
includes the failing log. Do not run two supervisors simultaneously.

Keep the PC awake and plugged in. Do not run Rocket League or another GPU-heavy
program during training. Stop the supervisor and its child process together if
needed; simply closing the chat does not stop the job.

The existing runtime's GPT trainer uses the single-GPU automatic strategy instead
of distributed Gloo on this Windows laptop. V2 weights are downloaded from the
official lj1995/GPT-SoVITS repository. This fine-tunes pretrained V2 models; it does
not train a speech system from scratch.

Google commentary is no longer enabled by default in the match launcher. Trained
voice listening tests and local match integration come after training completes.
