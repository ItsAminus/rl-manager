# RL Manager fullscreen HUD

Version 1.8.2 publishes career names through the native GFx datastore and
intercepts subsequent PlayerName updates for both PRI and car-label rows. The
previous correction reached the native spectator panel but left car labels
showing bot names: fixed SDK offsets missed the running game's nameplate
components, and later native updates could overwrite published career names.
Car/component ownership now uses reflected runtime fields and validates both
directions against each PRI's actual car. Class field lookups are cached.
The native datastore call validates its owning class and parameter layout.
Server identities and bot policy verification remain unchanged.

The launcher requires 1.8.2. The old rectangular labels remain disabled by
default (`rlm_legacy_nameplates 0`). Local exhibition visual checks show pro
names in all six original floating car labels, the spectator panel and goal
replay card, including after a goal/reset. A player-view check also visually
confirmed the native top-right demolition feed displaying NASS and STIZZY.
These disposable matches use no career database or saved result. Native
regression tests and 25 startup tests pass. A remote Rocket Host match has
not been visually exercised in this check; publication/identity logs alone
do not establish visual correctness.

Version 1.8.0 reads career commands directly from D-pad input, including offline exhibition games with chat disabled. Up presses, Down defends, Right seeks passes and Left applies brief demo pressure. F1–F4 are equivalent; F5 resumes the saved plan. Inputs require a fresh local career session, game foreground and active human control. The 1.5-second cooldown prevents double captures through the optional native chat hooks. A small control hint and real teammate receipts appear in the HUD. The command relay and tactical scenarios pass automated checks; hardware controller input still requires a live player test.

Version 1.7.9 adds native human quick-chat capture for local Easy/Medium and
Path To Glory games. Commands are relayed with match-session, sender/team and
freshness checks. The HUD shows the command, remaining duration and teammates
that acknowledged it; sending or missing acknowledgments never claim success.
Hard/Rocket Host games do not enable this relay. Native parser tests and the
complete relay-to-bot acknowledgment flow pass; real controller input still
needs a live match check.

Version 1.7.8 forces a native name refresh for the receiver and victim immediately
before each ticker dispatch. A previous name publication no longer skips later
events. The verified GFx PRI row's engine-owned name is temporarily invalidated
across its own updater, so an unchanged cached value cannot bypass the native
changed-property publication. If the updater does nothing, the original buffer
is restored; if it reallocates, the plugin leaves the new allocation alone.
Names still use the native feed styling, with no painted name covers. Tests
exercise unchanged caches, no-op updates, nested calls, longer names and write
failures. This is compiled and installed; live event appearance still requires
a fresh game with this version loaded.

Version 1.7.7 adds career club branding to the crest towers. Saved custom crests
are converted to cached PNGs and display-sized variants before match launch.
The club's secondary colour becomes the tower background and its primary colour
forms a narrow accent. Match-side blue/orange scores and series progress retain
their colours and existing dimensions. Native feed naming is unchanged.

Version 1.7.6 removes painted replacement names from the top-right event feed.
All names there now use the native publishing path, retaining the game's own
backgrounds, icons and spacing. Verified reused Flash rows can refresh a stale
name even when the PRI already contains the career name; an unconfirmed native
row is republished at most once per second. Row/table/PRI identity guards still
exclude unrelated fields and player IDs. Compilation and identity checks pass;
the updated feed needs a live visual check after restarting Rocket League.

Version 1.7.5 fixes the name publishing path used by the native top-right ticker.
The previous direct edit to `GFxData_PRI_TA.PlayerName` could make the engine see
an unchanged property while Flash retained its old bot name. The engine now
receives the verified career name before PRI updates; a separate datastore hook
rewrites only the `PlayerName` column for that exact shell/table/row/PRI identity.
Player IDs and other columns are excluded. Temporary source/argument descriptors
are restored after their synchronous calls. The log's `Flash name published`
message reports that publishing path; a changed native field alone no longer
claims the displayed feed was updated. This version requires a new live check.

Version 1.7.3 reduces repeated nameplate identity scans to 20 Hz; actual name changes and newly created plates refresh immediately. It parses only changed HUD state and writes hosted telemetry only when a new packet exists. The visual layout, native names, teammate boost and portraits are preserved. `data/rl-manager/performance.json` records the current game's drawable rate, worst observed frame interval and HUD render CPU time once per second, outside the render thread. These are diagnostic samples, not a guarantee of game FPS or a measurement of GPU execution time.

Live Chatterbox stays on the GPU, with a 35% work/pause target and 4 ms work batches between smaller transformer/acoustic stages. Loading intros and prepared outcome calls use this budget too because they can overlap kickoff; actual postgame speech runs without that budget. This makes speech preparation slower while leaving more GPU scheduling gaps for the game. The pacing does not modify audio samples or stop speech playback.

Each fixture builds its timer context from the actual career team IDs and competition record. `data/team-broadcast-logos.json` maps all database teams to local PNG crests: published images retain their source, and teams with no published image receive an explicitly classified initials badge. Original profile avatars are unchanged. Run `scripts/sync-team-broadcast-logos.py` to regenerate the assets, then `scripts/prepare-native-broadcast-images.py` before the app build. `--fetch` adds official BLAST logos only for confirmed organisations or exact source IDs; a same-name qualifier cannot borrow an organisation's logo. No network image downloads happen during play. Long competition headings fit to the available header width, and long team names use compact abbreviations.

Version 1.7.2 supplies career names to the native car nameplates, native top-right ticker and native goal message. Events bind their receiver and victim by native PRI identity, so multiple copies of the same hosted bot remain distinct. The selected human role is included too. Native nameplates show teammate boost using the game's own indicator. Custom car labels and boost bars are skipped after the native nameplate is verified; a failed identity or layout check retains the existing fallback. Native scoreboard name/portrait covers stay visible for 320 ms after releasing Tab to cover the stock closing fade. The same closing interval suppresses fallback floating car labels. Portraits remain eight layout pixels farther right and use prepared native-resolution textures. Goal replay scorer cards use the replay director's scorer PRI and verified career player ID. The Worlds-style timer is 540×132 at 1080p, approximately 28.1% of screen width and 12.2% of height. Black crest towers flank blue/gold scores and a white clock. Series wins fill toward the centre: blue from the left, orange from the right. BO3/BO5/BO7 use 3/5/7 cells, with the shared winning cell outlined in gold. See [the reference measurements](BROADCAST_LAYOUT.md). The regular Tab player scoreboard retains its existing footprint.

Draws the career broadcast timer, team names/logos and series score inside Rocket League through the BakkesMod SDK. Version 1.5 uses the RLCS layout: side crests, blue/orange score blocks, a large white central clock, current game/event header and series markers. Regular and italic font atlases are antialiased at their final display sizes, with pixel-aligned placement. Match portraits and logos have smoothly resized variants prepared before launch; the canvas chooses the nearest pixel size without shrinking an oversized texture. Enlarged career portraits and verified achievement labels decorate the normal scoreboard's avatar and name areas. The normal scores, stat columns and controls stay visible. These are local career decorations; they do not change Rocket League account avatars or titles.

The display is active in offline career matches and explicitly armed Rocket Host LAN matches with fresh RL Manager telemetry. Version 1.4 adds a private LAN telemetry bridge for hosted commentary, identities and results. Result-screen portraits remain available for up to two minutes after the final packet, until the match instance is destroyed. Menus, public matchmaking, freeplay and expired match data do not display it. Live voice generation stays enabled.

Prepare local PNG assets with `scripts/prepare-native-broadcast-images.py` before the app build. Prepare the cached fonts with `bakkesmod/prepare_fonts.py` using the local Python/Pillow installation. Run the identity/layout checks with `test.ps1`, build the plugin with `build.ps1`, then install with `install.ps1` while Rocket League is closed. The launcher starts the installed BakkesMod injector before Rocket League and validates the loaded HUD's version and current game process ID; a stale status file cannot confirm success. Fullscreen is supported. Open the game's normal scoreboard with Tab or your controller binding. `rlm_scoreboard` toggles the old separate player panel as an optional fallback; it is no longer triggered by Tab. `rlm_scoreboard_enabled 0` disables native row decorations; `rlm_hud_enabled 0` disables the whole display.

The live packet supplies each car's actual name, team and slot. Exact bot gamertags or the explicitly selected human role resolve the career's stable player ID and assets, even when RLBot allocates packet slots in a different order. Hosted native instance IDs distinguish multiple copies of one bot. Rocket Host keeps its server identities: the plugin changes local presentation strings, preserving original identities in exported telemetry for roster validation. Native nameplate objects must match both the current car and its component before they can replace custom car labels. No portrait is keyed to the bot engine: Nexto as zen gets zen's assets; Nexto as nass gets nass's assets. The UI's sorted player IDs determine row positions, including score ties and either cached original or updated presentation tokens. Unmatched, ambiguous or partial rosters draw nothing instead of borrowing another player's face. The installer preserves existing RCON authentication.

Native scoreboard references: [PlatformDisplay](https://github.com/SoulDaMeep/PlatformDisplay) exposes the scoreboard open/close/sorted-ID hooks and public layout dimensions; [RLProfilePictures](https://bakkesplugins.com/plugin/475) demonstrates drawing avatar textures on these rows. Our implementation does not depend on either plugin or their online avatar services. The UI sorted-ID FString has no SDK getter; a bounded, checked copy at its documented offset is read only during its update event. Local GFx player/nameplate strings use the public layout with checked reads and engine-owned allocations. A longer name is supplied temporarily during a native UI copy, then the original source descriptor is restored before returning. Server/player account names, player IDs and bot policies remain unchanged outside those local UI calls. A changed game layout fails closed.

Placement uses screen size plus Rocket League's Display Scale and Interface Scale. If a future game update changes the stock layout, `rlm_scoreboard_x` and `rlm_scoreboard_y` adjust the overlay in screen pixels; `rlm_scoreboard_scale` adjusts the portrait/text size. The BakkesMod log reports when native player identity mapping succeeds, and how many portraits/titles loaded. The fullscreen timer and all six native-row portraits were visually checked in an offline 3v3 match on this PC. Resolution/layout tests cover scaling, but future game UI changes may require another live alignment check.

CustomUI (https://bakkesplugins.com/plugin/503) confirms this native rendering approach. Its standard presets have fixed team labels, player-relative score ordering and no career roster panel, so this companion implements the career-aware display directly using the official SDK. No CustomUI dependency is needed.

Scoreboard portraits use verified real-life headshots first, identity-confirmed Steam avatars next, then the existing public account images. `scripts/sync-scoreboard-steam-avatars.py` caches Steam links confirmed by the player's Liquipedia identity; it never searches by nickname alone. `scripts/prepare-scoreboard-portraits.py` frames square native portraits without modifying original RL Manager photos. Run both preparation scripts and then `scripts/prepare-native-broadcast-images.py` before building the app. No images are downloaded during gameplay. A player without a usable picture gets their initial instead of a generic bot icon. Achievement labels include source URLs in the registry. Unknown awards remain blank.
