# Career bot assignments

## Live difficulty

Settings → Live match difficulty changes bot strength for the next game, even between games of a series. The setting belongs to the current career. Existing careers keep Hard until changed.

- Hard retains the full rating tiers and hosted routing below.
- Medium always uses local RLBot: 94+ uses Necto/Element (Diamond); 84–93 uses Botimus Prime (Platinum); 74–83 uses Stick/Codename Cryo (Gold); 64–73 uses PenguinBot/VirxEB (Silver); lower ratings use Career Rookie.
- Easy always uses local RLBot: 94+ uses Stick/Codename Cryo (Gold); 69–93 uses compatible Silver policies, and lower ratings use the ground-only Career Rookie (Bronze).

Easy/Medium receive current form, morale, fatigue, confidence, individual/team chemistry, manager trust, match role and trained attributes at every game launch. The engine identity stays fixed for the series; its execution settings refresh. Ground decision latency is bounded to 20–150 ms, with steering responsiveness adjusted within the native policy's ability. Necto's decision-selection parameter also follows condition. Positive score contributions give bounded live momentum; confirmed open-net misses introduce bounded pressure, moderated by pressure resistance. Ordinary unconverted shots are never automatically labelled open-net misses. Kickoffs, aerials, jumps, goal-line defence and replays bypass ground latency. No car physics or game speed changes.

Roles bias support distances. Chemistry and trust affect yielding/support, rather than inventing passing mechanics the native policy does not know. Some prior pools used independent/hive or Java processes which bypass `get_output`; Easy/Medium now use controllable Python policies. Existing incompatible local assignments are migrated once to a compatible policy of the same strength, then remain locked. Hard's pool/routing is unchanged. This is a performance layer, not neural-network retraining or proof that a bot has learned a pro's real tactics.

Each series/difficulty has its own saved player-to-bot assignments. Changing difficulty does not affect a running game or change real player ratings. Returning to a previous difficulty restores that series' previous assignments. Both routes receive the same career HUD context, including team/competition timer branding, portraits and player titles. BakkesMod must be loaded for the native custom HUD.

Career matches use ratings-v2. Preview and launch share rating_bots.py. Each series gets a random bot-family draw from its rating tier. The launched assignments are saved by career, fixture and player identity in the ignored `rl_bridge/runtime/series-bots` directory. New games, app restarts, lineup reordering and changing the controlled player retain healthy assignments. A different series draws again. A failed/unavailable policy may be replaced within its tier without redrawing healthy teammates. The replacement stays for the remaining series games. There is no special fixed bot for Zen.

| Rating | Policy pool |
| --- | --- |
| 98–100 | Kiyo3 |
| 96–97 | Chronos |
| 94–95 | BonkDaddy |
| 90–93 | Ordis, Byte, Opti (random healthy SSL family) |
| 89 | Nexto, Nexto+, Daizen, Fury |
| 84–88 | Astra, Zeus |
| 79–83 | Necto, Element |
| 74–78 | ReliefBot, Botimus Prime, Bumblebee, RedBot |
| 69–73 | Wildfire, Codename Cryo |
| Below 69 | Lanfear, PenguinBot, Beast from the East, VirxEB, Bribblebot |

Hard mode uses the requested Kiyo3 → Chronos → BonkDaddy hierarchy, including Kiyo3 at the supported 100 OVR ceiling. Rocket Host's public catalog confirmed the exact Kiyo3 and Chronos request IDs on 2026-10-16. The 90–93 pool retains Ripple and London as candidates, but both are currently excluded following reported idle bots (London across two games; RippleV1.1 in game two), leaving Ordis, Byte and Opti. Healthy random families are shuffled before reuse. Available versions are resolved through the current hosted catalog; unavailable or failed families fall back only within the same tier, and a missing entire tier fails explicitly. A missing/failed Kiyo3, Chronos or BonkDaddy therefore produces a clear error rather than silently downgrading that pro. Existing healthy series assignments stay fixed until the next series. Easy, Medium and Path To Glory promotion pools are unchanged. These pools follow the user's game-rating scale, not an independently measured ranking. Bots retain their trained policies; none was trained on the individual pro's replays.

## Stalled bot recovery

The bridge monitors every hosted bot continuously, including bots that moved earlier and subsequently froze. After 20 accumulated live-play seconds without movement or a new touch, it excludes the failed policy family and restarts the **same series game**, up to two retries. Replays, pauses, demolition respawns and long telemetry gaps are excluded from the inactivity timer. This is telemetry-based detection, not access to a remote bot's internal controller/model readiness.

The public Rocket Host client interface provides a roster at server creation; no supported live policy-swap endpoint was found. Recovery therefore restarts the affected game rather than substituting a car mid-match. Partial scores are discarded; completed earlier series games, the current game number, lineup and player identities are retained. Failed families are remembered in the ignored `rl_bridge/local_runtime/host-bot-health.json` and filtered from previews and subsequent launches. If all bots are idle, the bridge reports a possible server stall rather than blacklisting the entire pool. Network failures do not trigger blind retries. RL Manager retains the actual bridge error when a process exits.

## Routing

Rocket Host is used if the highest-rated starter on either team is 84 or higher, including the human-controlled role. If every starter is rated 83 or lower, the launcher uses the installed local RLBot pack without contacting Rocket Host. Lower local policies were checked for imports; unavailable engines are not silently substituted.

Rocket Host controls the entire match, so it cannot include locally controlled Element or Plat/Gold/Silver bots. In mixed hosted games, Element and players below 79 use hosted Necto. The preview shows this limitation. Lower-only games retain the local pools.

Family names resolve to advertised IDs such as RippleV1.1, NextoPlus and AstraV5. Available server options are US-CENTRAL and EU-HEL. Requests use the official RLBot GUI protocol; the installed BakkesMod plugin supports the LAN connection. No manual dragging is required.

Server presentation aliases such as Nexto+ and Opti-V2.2 are matched to their catalog policies. Nexto and Nexto+ remain distinct; other policy names are not accepted merely for sharing a prefix.

## Identities and results

HUD 1.4 exports explicitly armed private LAN telemetry locally. Sessions are tied to the current game process, expire automatically, and exclude public matchmaking. All six participants, teams and requested engines must match. Missing/inactive bots, disconnections and invalid results fail rather than simulate a score.

The client joins in the waiting/spectator state, verifies every requested bot by team and engine, and allows five seconds of stable roster presence before automatic team entry. The SDK team-selection hooks reject early team entry and force the career's blue side once released. The full player-controller team-change path restores normal driving/camera control; a human PRI without a locally owned car cannot count as ready. Live testing confirmed the clock stays at 5:00 until entry. No server pause command is claimed. The remote API exposes roster presence rather than model-ready signals; the activity guard still rejects a bot that joins but never plays. Initial roster binding rejects games already more than five seconds underway or with a nonzero score.

Native instance IDs distinguish copies of the same bot. Commentary and saved stats use career names. HUD 1.6.1 uses the SDK name update locally. Hosted servers ignore the rename, so the client hides the original nameplate mesh, refreshes its render state, and draws a projected career label attached to the verified car. Original server identities stay intact for engine verification. Nameplate visibility is restored on match cleanup/plugin unload. The fullscreen scoreboard uses career headshots, titles and names. Team logos, game number, clock and series score use the career HUD.

Local Chatterbox commentary and recorded reactions remain enabled in production. Voice generation does not control the network join. The actual result is published before postgame speech.

During gateway connection and HUD initialization, a temporary startup monitor restores each new Rocket League process once, including replacement processes launched by Epic. It stops when startup finishes and does not repeatedly refocus a window that was successfully restored. HUD-load requests are retried every three seconds until the current game's plugin status and authenticated BakkesMod control connection are confirmed. An open injector or WebSocket alone is not readiness. Startup failures distinguish stale versions, rejected authentication, missing HUD loading and an unavailable control connection, and leave the career result unchanged. The bridge does not force-inject a DLL or disable BakkesMod's compatibility checks.

The launcher installs any HUD file update first without starting BakkesMod. It then connects the Rocket League gateway and waits for a visible responsive game viewport in the current process to remain stable for three seconds (resetting on Epic process replacement). If the current HUD and authenticated control connection are already working, they are reused. Otherwise career matches emit a launch-scoped confirmation prompt: **I'm at the menu — Start / restart BakkesMod**. After the user clicks, RLM closes only inspected BakkesMod injector processes, reopens the supported injector, restores Rocket League and verifies injection/HUD before joining. The acknowledgement travels over the active bridge's stdin and cannot be reused for another fixture or launch. A failed or expired confirmation never joins a match or records a result. This order applies to both local and hosted matches; it uses BakkesMod's normal supported injection process rather than force-injecting a DLL.

Rocket Host's observed `Kiyo 3.0`, `Kiyo 3.0 (2)` and `Kiyo 3.0 (3)` server labels identify the advertised `Kiyo3` request policy. They are accepted for readiness and identity binding; the separate `Kiyo` policy and unobserved `Kiyo 3.1` are not accepted as Kiyo3. The reported Gentle Mates vs Vitality five-bot roster is covered by a regression through blue-team human entry and all six unique player bindings.

RL Manager prefers the official updated injector in `local_runtime/bakkesmod/BakkesMod.exe`. If the original shortcut starts the outdated injector, the bridge switches it only when its executable exactly matches the backed-up old binary by SHA-256. Other injectors are preserved. The managed injector uses the existing BakkesMod plugins and settings; no administrator installation is required. Injector 32 and HUD 1.7.2 were verified together in a live main-menu connection on 2026-10-13.

Sources: https://wiki.rlbot.org/v5/miscellaneous/rocket-host/ ; https://github.com/RLBot/gui/blob/master/rockethost.go ; https://bakkesplugins.com/plugin/216
