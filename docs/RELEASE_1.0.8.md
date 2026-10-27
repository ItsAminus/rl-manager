# RL Manager 1.0.8 — First official release

**New player? Follow the complete installation below. Download all FOUR numbered parts.**

## Before you start

- Windows 10/11 **64-bit** and a PC that runs Rocket League.
- **Rocket League installed** through Epic Games or Steam; launch it once and sign in.
- **[7-Zip for Windows x64](https://www.7-zip.org/)**.
- **30 GB free space** for downloading, extracting and installing, in addition to Rocket League. Download size: about **7.3 GB**.
- Internet access and working graphics/audio drivers. NVIDIA is not required; AMD/Intel users can use the original commentary voices on CPU, although generation can be slower.

The complete setup includes **RLM, local bots/Python, BakkesMod, Rocket Host and the AI voice/text models**. No separate Python or developer tools are needed.

## 1. Download these FOUR files

| Part | Download |
| --- | --- |
| 1 | [RL-Manager-Complete-1.0.8.7z.001](https://github.com/ItsAminus/rl-manager/releases/download/v1.0.8/RL-Manager-Complete-1.0.8.7z.001) |
| 2 | [RL-Manager-Complete-1.0.8.7z.002](https://github.com/ItsAminus/rl-manager/releases/download/v1.0.8/RL-Manager-Complete-1.0.8.7z.002) |
| 3 | [RL-Manager-Complete-1.0.8.7z.003](https://github.com/ItsAminus/rl-manager/releases/download/v1.0.8/RL-Manager-Complete-1.0.8.7z.003) |
| 4 | [RL-Manager-Complete-1.0.8.7z.004](https://github.com/ItsAminus/rl-manager/releases/download/v1.0.8/RL-Manager-Complete-1.0.8.7z.004) |

Keep all four in **one folder**, with their original names. The **Source code** downloads are not a game installer.

## 2. Extract and install ONCE

1. Wait for all four downloads to finish.
2. Right-click **`.001` → 7-Zip → Extract Here**. On Windows 11, select **Show more options** first if needed. It reads the other parts automatically.
3. Open the extracted **RL-Manager-Complete-1.0.8** folder.
4. Close Rocket League, BakkesMod and RLM. Run **Install RL Manager.exe → Install everything**.
5. Keep the extracted subfolders together. Allow component installation prompts and wait for setup to finish.
6. Open RLM from its desktop or Start menu shortcut and follow the skippable tutorial.

**You do not install the four parts separately or run another RLM installer afterwards.**

## 3. Rocket League launch option: `-noeac`

For played RLM matches, launch Rocket League without Easy Anti-Cheat:

- **Epic:** Library → Rocket League **⋯ → Manage → Launch Options**. Enter **`-noeac`**, then fully restart Rocket League.
- **Steam:** select the **without Easy Anti-Cheat** option when launching the game.

[Official Epic/Steam instructions](https://www.epicgames.com/help/c-37599050/c-42869540/a16737879). To return to normal online matchmaking, enable EAC again and restart Rocket League; remove the Epic flag first. [Why this is needed](https://www.epicgames.com/help/c-37599050/c-32343914/nzam-easy-anti-cheat-mtwfr-alaan-fy-rocket-league-a10791900).

## 4. First match

- Check **Settings → Rocket League connection** in RLM.
- Run **Settings → Sound & gameplay → Test match audio**.
- Start a played match. When prompted, wait at Rocket League's main menu, then click RLM's **I'm at the menu — Start / restart BakkesMod** button.
- Manager Career's **Easy/Medium** use local bots. **Hard is experimental**, uses Rocket Host for eligible games and may be unstable or laggy.

[Full installation guide and troubleshooting](https://github.com/ItsAminus/rl-manager#start-here-first-time-installation).

<details>
<summary>Already used a complete pre-release test build?</summary>

Only those existing installations can use the separate **RL.Manager.1.0.8.Setup.exe** app updater. Close RLM and Rocket League before updating. Existing careers and installed models are preserved. First-time players should use the four-part complete kit above.

</details>

Includes the audio playback repair for live/post-game commentary, crowd goals and countdown audio. The kit contains all 407 recordings. See **Release-checks.json** and **SHA256SUMS.txt** under Assets for validation details.

## Release cleanup

This release uses neutral caster labels, excludes private generated commentary and obsolete training tools, and rebuilds the portable runtime without developer bytecode caches. The recorded voice bank and original speech profiles remain included.
