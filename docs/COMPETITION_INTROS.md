# Competition introductions

Integrated October 21, 2026 using the four videos and five images supplied by the user. All media lives in `public/competitions` and is included by the existing public-media packaging rules. The source shortlist below is retained as earlier research, not as the installed assets.

## Installed assets

| Competition | Supplied video → installed file | Matchday background |
| --- | --- | --- |
| RLCS circuit, including Majors | `RLCS.mp4` → `rlcs.mp4` (7.616 s, 3840 × 2160) | Supplied Spring Major arena photo → `rlcs-major.jpg` for Majors. Regular regional/qualifier matches retain RLM's arena art so they do not show a Major stage. |
| RLCS Worlds | `World Championship.mp4` → `worlds.mp4` (9.621 s, 3840 × 2160) | Supplied Worlds arena photo → `worlds.jpg`. |
| Esports World Cup | `Esports WC Intro.mp4` → `ewc.mp4` (18.965 s, 3840 × 2160) | Supplied EWC trophy/stage photo → `ewc.png`. |
| FIFAe World Cup | `FIFA EWC.mp4` → `fifae.mp4` (15.157 s, 1920 × 1080) | Supplied FIFAe title artwork → `fifae.png`; the additional trophy photo appears in the matchday heading as `fifae-trophy.jpg`. |

Videos are copied intact, without trimming or transcoding. Their supplied lengths take precedence over the original 10–15 second target. The originals in Downloads remain untouched.

Videos are tracked with Git LFS because the EWC introduction exceeds GitHub's
regular-file size limit. Run `git lfs install` and `git lfs pull` after cloning
before testing or packaging; the app uses the downloaded local video files.

## Playback behavior

- Each new, unplayed fixture gets the introduction for its competition, in both career modes wherever that competition exists.
- Skip and Escape fade the video and its audio into the prepared matchday background. End-of-video performs the same transition.
- Pause/play and mute/unmute are available. Initial volume and sound state follow RLM's sound settings. If audible autoplay is blocked, a Play introduction button appears.
- Native modal focus prevents interaction with the matchday behind the video. Keyboard focus starts on Skip. Videos preserve their aspect ratio; reduced-motion preferences remove the fade.
- A dismissed intro is remembered per career and fixture for the current app session. Reopening the screen or rerendering it does not replay it. A different fixture gets a fresh intro. An existing game result, completed fixture or active match suppresses the introduction.
- An invalid video or a ten-second media stall falls through to matchday. Watching/skipping never changes career data, game results or tournament state.

The fixture detail API includes `competitionType` so stage identity is available alongside the name. FIFAe is matched before EWC; Worlds LCQs remain in the RLCS circuit. An unrelated invitational is never assumed to be EWC. FIFAe media support does not add a FIFAe tournament to the career calendar.

## Original experience brief

On entering a major competition matchday, greet the participating manager with a short, full-screen introduction specific to that competition, then transition into the existing matchday screen. Target 10–15 seconds, with sound and a visible Skip control.

The supplied reference, `C:/Users/amine/Downloads/Video Project 16.mp4`, is 33.8 seconds at 1280 × 720. Sampled frames show a Barcelona pre-match press conference with subtitles and a Skip control. It does not show the UCL opener described in the request; the written description defines the desired competition-introduction behavior.

## Earlier source shortlist

| Competition | Candidate and source | Evidence and suitability | Remaining work |
| --- | --- | --- | --- |
| RLCS Major | [The Birmingham Major Hype Trailer — RLCS 2025](https://www.youtube.com/watch?v=OeyGuSb8D7A), Rocket League Esports, March 26, 2025 | Official channel trailer explicitly tied to a Major. Good source candidate for event-specific presentation. | Review footage and choose a coherent 10–15 second edit. Birmingham 2025 branding must not introduce Boston or Paris 2026. |
| RLCS Major, alternate | [RLCS Spring Hype Trailer](https://www.behance.net/gallery/192292313/RLCS-Spring-Hype-Trailer), Akimbo Studio creators' portfolio | Search-indexed creator description credits Psyonix and a Boston Spring Major destination graphics package with graffiti-inspired animation. | Portfolio page returned 403 when opened. Treat as a secondary design reference; exact playback and duration unverified. This is an older Boston event, not the 2026 edition. |
| RLCS Worlds | [C'est la Rocket League! — Welcome to the Rocket League World Championship 2025!](https://www.youtube.com/watch?v=LKR3iKqRVB0), Rocket League Esports, September 8, 2025 | Official channel's Worlds welcome video; stronger pre-event candidate than a results aftermovie. | Review footage and select 10–15 seconds. The 2025 Lyon identity is edition-specific. |
| Esports World Cup | [Esports World Cup 2025: Opening Trailer](https://www.youtube.com/watch?v=F7HFWuo_utY), Esports World Cup, July 7, 2025 | Official EWC opening trailer. Competition-wide source, rather than a confirmed Rocket League-only ident. | Review for a suitable EWC branding segment; avoid unrelated-game footage in the RLM cut. No Rocket League-only 10–15 second opener verified. |
| FIFAe World Cup | [FIFAe Opener — The Path to the Crown](https://dyrdee.com/projects/jung-von-matt-fifa-e-finals-25/), DYRDEE Media | Creator's page confirms a commissioned broadcast opener combining Rocket League and eFootball, with a glowing streak, stadium approach and trophy finish. Closest documented match to a competition-ident format. | Review the embedded production and request a Rocket League-only cut or create one. Exact duration and standalone file availability unverified. |
| FIFAe, alternate lead | [FIFAe hype post](https://x.com/FIFAe/status/1999919712109466001) | A community discussion links this FIFAe account post as a hype trailer. | Direct post could not be fetched. Playback, duration and content remain unverified; secondary lead only. |

These sources establish candidates and provenance. They have not been watched end-to-end, downloaded, trimmed, or cleared for redistribution. None is claimed to be a verified standalone 10–15 second asset. Public viewing availability does not establish permission to package footage or music with RLM.

## Recommended asset set

Use separate Boston and Paris Major introductions, one Worlds introduction, one EWC introduction and one FIFAe introduction. Prefer a generic competition identity without a baked-in year for repeat career seasons. Keep current-edition city branding only where the career event matches it.

Existing trailers can provide references or source footage where authorized. Custom introductions would provide consistent duration, correct identities and a clean ending. If making custom videos, use this brief:

- 1920 × 1080, 16:9, approximately 12 seconds; MP4 with H.264 video and AAC audio, subject to packaged Electron playback verification.
- 0–3 seconds: establish the competition through its visual identity.
- 3–9 seconds: Rocket League arena, cars, competition motifs or trophy imagery.
- 9–12 seconds: resolve to a readable competition title and hold before fading into matchday.
- Deliver one mixed-audio version and, if practical, a silent version. Avoid baked-in current teams, winners, fixture results, season years or unrelated games.
- Provide the final media plus source and usage information. No additional custom video is required from the user merely to evaluate this shortlist.

## RLM integration findings and proposed behavior

RLM uses Electron 31 and React 18. `src/renderer/pages/MatchDayPage.tsx` is the shared matchday entry screen, reached by `/match-day/:fixtureId` in `src/renderer/App.tsx`.

`src/main/career-management.ts` already schedules `MAJOR` events (Boston and Paris), `WORLDS`, and `INVITATIONAL` events named Esports World Cup. Resolve the EWC identity explicitly rather than assigning an EWC video to every invitational. No implemented FIFAe competition was found in the competition scheduling code; adding that tournament is separate work from supplying an intro.

Earlier proposal (superseded by the user's supplied media and per-fixture request above):

1. Resolve competition identity after loading and validating the user's fixture, before showing matchday controls.
2. Play the full introduction once per competition instance in each career, when the user's team first reaches its matchday. Offer an optional every-matchday mode if desired.
3. Keep Skip available immediately, allow Escape, and save the seen state when the introduction ends or is skipped. Reopening a save should not replay the same introduction accidentally.
4. If an asset is unavailable or cannot play, proceed to matchday; media failure must never block a fixture.
5. Offer sound control and a replay/disable preference. Local media files allow offline play; YouTube page URLs are review references, not local video assets.

The earlier once-per-competition proposal is not the implemented frequency; the integration plays before each new fixture as described above.
