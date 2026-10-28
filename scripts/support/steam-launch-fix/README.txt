RLM 1.5.2 Steam launch fix - diagnostic build

This changes RLM's Steam launch route to start the selected RocketLeague.exe
directly, with SteamAppId and SteamGameId set to 252950 for that process.
It follows the Windows approach in https://github.com/RLBot/core/pull/172.
It does not change Steam's configuration or the installed RLBot package.

1. Close RL Manager and Rocket League.
2. Extract this entire ZIP into a folder.
3. Open PowerShell in that folder and run:
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install-SteamLaunchFix.ps1
4. Open Steam and sign in. Open RLM and start the match.

The script patches the current user's %APPDATA%\rl-manager\bridge folder.
It backs up the three affected files there in a steam-launch-backup-* folder.
It changes only the launch integration in launcher.py and rocket_host.py,
and replaces game_launcher.py. It does not change careers or save data.

Verification:
- RLM's log should contain "Steam mod launch" and "direct executable".
- Rocket League's Launch.log should report bAntiCheatEnabled=(False).
- Check that BakkesMod injects and RLM gets past the HUD connection step.
The change has automated launch tests, but still needs this user's in-game test.

Restore:
Close RLM and Rocket League, then copy game_launcher.py, launcher.py and
rocket_host.py from the backup folder into the enclosing bridge folder,
replacing the patched files. A future RLM update may also replace this fix.
