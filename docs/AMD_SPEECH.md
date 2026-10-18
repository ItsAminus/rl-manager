# AMD, Intel and NVIDIA commentary

RL Manager 1.0.6 keeps the original Caster One and Caster Two Chatterbox weights and
speaker conditionals on every compute backend. It does not substitute Windows
system voices. The complete download already includes the required models.

## Automatic mode

Settings > Rocket League connection > Caster One & Caster Two voice processing defaults to
Automatic. The speech process tests whether its PyTorch runtime can execute a
GPU operation. It uses NVIDIA CUDA or AMD ROCm when that test works; otherwise
it loads the same two caster profiles on the CPU. There is no adapter-name
whitelist for the CPU fallback. This includes RX 7700 XT and older AMD cards,
subject to the PC meeting Rocket League and normal system-memory requirements.

Selecting CPU keeps speech off the game GPU even when acceleration is available.
CPU inference uses at most four CPU threads (and at most half the logical cores),
runs in a background process, and yields during gameplay. CPU speech can take
considerably longer to generate than to play. The live reaction bank continues;
outdated analysis is dropped. Match launch and the final result desk do not wait
for unfinished synthesis. Ending a match terminates only its own speech process.

## Optional AMD GPU acceleration

The included Python runtime contains NVIDIA CUDA PyTorch, which also supports
CPU execution. It does not contain AMD ROCm libraries. Installing an AMD driver
alone cannot turn that CUDA build into an AMD GPU build.

For an existing, working Windows ROCm/PyTorch/Chatterbox environment, choose its
python.exe under Settings > Rocket League connection > Optional AMD GPU acceleration.
That interpreter is used only for speech; the local bot interpreter is unchanged.
The original models remain in the shared RLM runtime folder. Select Automatic
to enable the GPU probe. Invalid kernels or GPU-memory errors retry the original
voices on the CPU. An optional interpreter that cannot launch or load the worker
falls back to the bundled CPU interpreter.

The environment must provide the original English ChatterboxTTS/Conditionals API,
PyTorch, torchaudio, soundfile and Chatterbox dependencies. ROCm's PyTorch backend
uses the torch.cuda API; it is identified through torch.version.hip. Use AMD's
hardware/OS/version-specific installation instructions rather than replacing
PyTorch inside the RLM bot runtime:

- https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/install/installrad/windows/install-pytorch.html
- https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/compatibility/compatibilityrad/windows/windows_compatibility.html
- https://docs.pytorch.org/docs/stable/notes/hip.html

HIP SDK support is not by itself proof that every Chatterbox operation works on
a particular card. GPU acceleration on AMD remains experimental until tested on
that hardware. Universal CPU fallback is the default AMD path in this download;
no separate ROCm install is required to play or generate the two caster voices.

## Validation

Both caster profiles were loaded and used to synthesize WAVs with GPU visibility
disabled. Routing, failed-GPU fallback, optional-interpreter recovery, cancellation
and request timeouts have regression tests. An AMD physical GPU was not available
for end-to-end ROCm validation. See release-check.json in the corresponding
developer release folder for measured checks.
