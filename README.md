<img width="1672" height="941" alt="RL Manager_ Stadium Strategy Room" src="https://github.com/user-attachments/assets/2334b544-f6fe-4be6-bad9-2ab27fb9e357" />




# RL Manager

Build your Rocket League career in **Manager Career** or take a fixed squad from the bottom to the top in **Path To Glory**.

**Latest version: 1.7.1 · Quick bug fix · Windows PC only**

**[Download the 1.7.1 update installer](https://github.com/ItsAminus/rl-manager/releases/download/v1.7.1/RL.Manager.1.7.1.Setup.exe)** · [Release notes](https://github.com/ItsAminus/rl-manager/releases/tag/v1.7.1)

**v1.7.1 fixes local matches getting stuck at 4/5 bots ready and the muted-commentary `ClipBroadcast.prepare_intro` startup crash.** Existing users only need the [1.7.1 app installer](https://github.com/ItsAminus/rl-manager/releases/download/v1.7.1/RL.Manager.1.7.1.Setup.exe). [Quick bug fix notes](docs/releases/1.7.1.md).

**v1.7.0 was a major management update:** expanded scouting and hidden young prospects, negotiated board visions, club-to-club bargaining and instalment transfers, backroom departments, custom clubs and starting players, automatic matchday reports and recorded analyst desks, additional SSA/APAC teams, a rebalanced Hard bot ladder, Steam/BakkesMod startup repairs, and separate commentator volume. [Full announcement and update notes](docs/releases/1.7.0.md).

The save-specific player-information editor and JSON importer remain available. [Editor guide](docs/PLAYER_INFORMATION_EDITOR.md).

[RLM v1.7.0 Full Patch Notes](docs/releases/1.7.0-full-patch-notes.md) — the complete player guide to what changed.

The 1.7.0 app updater also supplies a verified local-bot runtime. The first connection check may take longer while RLM installs and checks all local policies; no separate bot installation is needed. Existing speech models and saves are kept separate.

1.5.1 fixes a local-match kickoff timeout when Rocket League assigns bots different car slots from the configured lineup. Bots are now tracked by their configured identity and still must produce working controls before kickoff. This addresses one cause of “Bots failed to initialize before kickoff”; unrelated bot crashes may still need a support log. Existing users only need the app update installer. Close RLM and Rocket League before installing; no saves or settings need to be deleted.

Major career expansion: national management and playable FIFAe finals, the RLCS 2027 Club Championship, deeper finances and agent negotiations, hidden scouting information, livelier transfer activity, animated player introductions, native scoreboard portraits, and searchable/sortable club selection. Financial dismissals now require prolonged unpaid obligations and explicit warnings, with trophy protection and recovery archives for future dismissals. Existing playable saves and settings are preserved; this update cannot restore saves already deleted by earlier dismissal logic. Close RL Manager and Rocket League before updating.

## Start here: first-time installation

**New players need the COMPLETE 1.5.0 download: all four numbered parts below, followed by the 1.7.1 update installer linked above.**

The separate `RL.Manager.1.7.1.Setup.exe` file updates the app. It is **not the complete first-time setup**. GitHub's **Source code** downloads are for developers.

### 1. What you need before downloading

- **Windows 10 or Windows 11, 64-bit.**
- **Rocket League already installed** through Epic Games or Steam. Launch it once and sign in to your account.
- **[7-Zip for Windows x64](https://www.7-zip.org/)** installed, to extract the download.
- **At least 30 GB of free space** for the download, extraction and installation, in addition to Rocket League. The four-part download is about **7 GB**.
- An internet connection for downloading, game sign-in, BakkesMod checks and Rocket Host matches, plus working graphics/audio drivers.
- A PC capable of running Rocket League. **An NVIDIA GPU is not required:** AMD/Intel users can use CPU-generated commentary with the same Caster One and Caster Two voices. CPU voice generation can be slower.

**The bot, mod and AI components are included. No separate Python, Node.js installation or terminal commands are needed.**

### 2. Download ALL FOUR parts

Open the **[complete 1.5.0 download page](https://github.com/ItsAminus/rl-manager/releases/tag/v1.5.0)** and expand **Assets**, or use these links. This supplies the bots, models and mod components used by 1.7.0:

| Download | File | Approximate size |
| --- | --- | --- |
| [Part 1](https://github.com/ItsAminus/rl-manager/releases/download/v1.5.0/RL-Manager-Complete-1.5.0.7z.001) | `RL-Manager-Complete-1.5.0.7z.001` | 1.99 GB |
| [Part 2](https://github.com/ItsAminus/rl-manager/releases/download/v1.5.0/RL-Manager-Complete-1.5.0.7z.002) | `RL-Manager-Complete-1.5.0.7z.002` | 1.99 GB |
| [Part 3](https://github.com/ItsAminus/rl-manager/releases/download/v1.5.0/RL-Manager-Complete-1.5.0.7z.003) | `RL-Manager-Complete-1.5.0.7z.003` | 1.99 GB |
| [Part 4](https://github.com/ItsAminus/rl-manager/releases/download/v1.5.0/RL-Manager-Complete-1.5.0.7z.004) | `RL-Manager-Complete-1.5.0.7z.004` | Remaining part; see GitHub size |

**Put all four files in the same folder. Keep their original names.** They are four pieces of one download, not four installers.

### 3. Extract, then install

1. Wait until **all four downloads have finished**.
2. Right-click **`RL-Manager-Complete-1.5.0.7z.001`** and select **7-Zip → Extract Here**. On Windows 11, you may need **Show more options** first.
3. 7-Zip automatically reads parts `.002`, `.003` and `.004`. **Extract only `.001`; do not extract each part separately.**
4. Open the extracted **`RL-Manager-Complete-1.5.0`** folder.
5. Close Rocket League, BakkesMod and any running RL Manager window.
6. Double-click **`Install RL Manager.exe`**, then click **Install everything**. Allow the included component installers to finish and approve their installation prompts when asked.
7. When setup finishes, close RLM if it opened and run the **1.7.1 update installer** linked above. Then open **RL Manager** from its desktop or Start menu shortcut.

**Keep the extracted folder and its `Packages`, `Setup` and `Tools` subfolders together until setup finishes.** The wizard handles the internal `Runtime.7z` files itself. You do not need to open them. Apply the 1.7.1 app update after the complete kit finishes.

### 4. Prepare Rocket League: launch WITHOUT Easy Anti-Cheat

RLM's played matches use mods. Use Rocket League's supported non-EAC launch mode for them; mods do not run with EAC enabled. [Epic's explanation](https://www.epicgames.com/help/c-37599050/c-32343914/nzam-easy-anti-cheat-mtwfr-alaan-fy-rocket-league-a10791900).

**Epic Games Launcher**

1. Find Rocket League in **Library**, open its **⋯** menu, then **Manage**.
2. Enable **Launch Options** and enter this exactly, without quotation marks:

   ```text
   -noeac
   ```

3. Fully close Rocket League if it is already running, then launch it again.

**Steam**

Launch Rocket League from your Library and choose the option **without Easy Anti-Cheat** when Steam asks. Steam can remember your choice. [Official launch instructions for both launchers](https://www.epicgames.com/help/c-37599050/c-42869540/a16737879).

To return to normal online matchmaking, remove `-noeac` on Epic or choose the EAC-enabled option on Steam, then restart Rocket League. [Epic's EAC mode guide](https://www.epicgames.com/help/c-37599050/c-32343914/nzam-easy-anti-cheat-mtwfr-alaan-fy-rocket-league-a10791900).

### 5. Your first RLM match

1. Open RL Manager and follow the **skippable first-launch tutorial**.
2. Choose **Manager Career** or **Path To Glory**, then create your save.
3. In **Settings → Rocket League connection**, check that your game and installed components are detected. Set the Rocket League location there if needed.
4. Before playing, use **Settings → Sound & gameplay → Test match audio** to check the caster voices, goal crowd and countdown.
5. Start a played match from RLM. When RLM asks, wait until Rocket League is at its main menu, then return to RLM and click **I'm at the menu — Start / restart BakkesMod**. Follow RLM's remaining match prompts.

In Manager Career, **Easy and Medium use local bots**. **Hard is experimental** and uses Rocket Host for eligible matchups; it can be less stable or feel laggy. Path To Glory advances bot strength as your squad progresses.

## Quick answers

**Do I install parts 1, 2, 3 and 4 separately?**  
No. Download all four, extract `.001`, then run **Install RL Manager.exe** inside the extracted folder.

**Do I also download `RL.Manager.1.7.1.Setup.exe`?**

Existing users only need this update. New users install the complete 1.5.0 kit first, then apply 1.7.0. If you already have the complete 1.0.8 runtime, the update installer reuses it.

**Steam launch repeats the Rocket League tutorial or does not keep me signed in.**  
Install 1.7.0, fully close Rocket League, keep Steam open and signed in, and retry.
RLM launches the selected Steam game executable directly with Steam authentication identifiers and the mod connection arguments, avoiding the previous `-applaunch` route. Required BakkesMod command permissions are repaired automatically; no separate patch or config replacement is needed.
If it persists, share **Settings → Help → Open support logs → rl-manager.log**.
Do not delete your saves, unlink accounts or reset your game settings.

**Do I install BakkesMod, Rocket Host, RLBot or the voices myself?**  
No. The complete wizard includes RLM, local bots/Python, BakkesMod, Rocket Host, the speech/text models and required runtime components.

**7-Zip reports a missing part or an extraction error.**  
Make sure all four downloads finished, are in the same folder and have the exact names shown above. Replace an incomplete download and extract `.001` again.

**There is no commentary or crowd audio.**  
Run **Settings → Sound & gameplay → Test match audio**. Check your Windows output device and volume mixer. Use **Settings → Help & about → Open support logs** if the test reports an error.

**Can anyone download this while the repository is private?**  
Only people with repository access. A public release requires a public repository, or you can share the complete download files directly.

## About the game

- **Manager Career:** manage your organisation, squad, contracts, transfers, scouting, tactics and player relationships, with Chirp reflecting your career world.
- **Path To Glory:** develop a fixed squad through matches, challenges, rivalries and promotion trials, with a saved journey timeline.
- Play as a selected starter with AI teammates, or simulate matches and series.
- Careers have separate world state and are saved under `%APPDATA%\rl-manager`.

For source builds, see [Developer instructions](docs/DEVELOPMENT.md). For packaging details, see [Player release notes](docs/PLAYER_RELEASE.md).



"Portions of the materials used are trademarks and/or copyrighted works of Epic Games, Inc. All rights reserved by Epic. This material is not official and is not endorsed by Epic."




Unofficial fan project, not affiliated with Psyonix or Epic Games. Third-party software, brands, player imagery and recordings retain their respective ownership and notices.
