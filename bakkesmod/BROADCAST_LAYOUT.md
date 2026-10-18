# Compact broadcast measurements

Reference: [ROC Esports vs FURIA, RLCS Worlds 2025, game 3](https://blast.tv/rl/tournaments/world-championship-2025/series/434aa18c/roc-furia).

The full 1280×720 broadcast frame was inspected in the browser using its [official Rocket League Twitch VOD thumbnail](https://static-cdn.jtvnw.net/cf_vods/dgeft87wbj63p/ac9a378cffd67cc48b12_rocketleague_314696846691_1757674188/thumb/thumb0-1280x720.jpg). Approximate visual bounds of the central score/timer strip: x=295–985, y=0–93, including header and series footer (±2 px). Side boost panels and sponsor graphics are excluded. This is one reference layout; RLCS broadcasts vary.

| | Width / full screen | Height / full screen |
| --- | --- | --- |
| Reference strip | 690 / 1280 ≈ 54% | 93 / 720 ≈ 13% |
| Previous career timer at 1080p | 820 / 1920 ≈ 43% | 208 / 1080 ≈ 19% |
| Compact career timer at 1080p | 820 / 1920 ≈ 43% | 140 / 1080 ≈ 13% |
| Previous Worlds-style timer at 1080p | 720 / 1920 = 37.5% | 176 / 1080 ≈ 16.3% |
| Current compact timer at 1080p | 540 / 1920 ≈ 28.1% | 132 / 1080 ≈ 12.2% |

Version 1.7.2 follows the user's Worlds Grand Final reference: black logo towers, blue/gold score panels, a white clock and a shared series bar. The user's gameplay screenshot showed the previous timer taking too much space, so the timer alone is now 25% smaller. Scaling uses 0.75 × min(screenHeight / 1080, screenWidth / 1920), so taller or wider screens cannot exceed either percentage. At 720p it is 360×88, at 1440p 720×176, and at 2160p 1080×264. The player scoreboard and other HUD elements retain their existing dimensions.

The series bar contains 3, 5 or 7 cells for BO3, BO5 or BO7 (BO1 and BO9 are also supported). Blue wins fill from the left, orange wins from the right; the gold-bordered centre cell is the winning target. These cells show total series wins, not a chronological mixture of game winners. The header retains the actual event, game number and series format. `scripts/preview-native-timer.py` renders design proofs using the actual cached glyphs and official crest assets; these are previews, not live game captures.

Numbers and labels use antialiased glyphs at native pixel sizes rather than enlarging or shrinking a single raster. Logos and portraits use cached, smoothly resized variants. The player scoreboard remains the game's existing Tab scoreboard; career decorations stay inside its rows and add no persistent gameplay panel.
