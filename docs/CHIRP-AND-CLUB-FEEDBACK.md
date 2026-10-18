# Chirp and club feedback

Chirp contains fictional posts inside a career, using public player and community identities where verified. Posting or replying creates mixed fan reactions and quote posts. Refresh adds bounded conversations, rivalries and explicitly speculative roster chatter. Likes, reposts, bookmarks and follows are saved per career and update immediately.

Local AI writes new replies in the background. Private drafts become visible only after generation and quality checks. Published text stays unchanged, including comments from older saves. Rejected or near-duplicate replies stay private rather than falling back to canned comments. The worker checks recent phrasing and exact duplicates, and reads the latest published parent plus earlier conversation when writing a rebuttal. Match statistics stay fixed. The CPU text worker pauses during gameplay to avoid competing with Rocket League.

Clicking a post or its reply button opens its conversation. Clicking a reply makes that reply the main post, with earlier messages above it and only direct replies below. The composer names the exact recipient. Opposing opinions and chained counterarguments are generated for discussions; likes and reposts are separate from the actual visible reply count.

The local text runtime includes official Qwen 2.5 3B Q4 weights for stronger replies. It uses two CPU threads at below-normal priority. Under memory pressure (less than 3 GB free when starting the worker), it keeps the existing 1.5B fallback. Neither model needs an API or uses the match GPU. Replies are asynchronous and can take tens of seconds to appear; navigating and reacting never wait for generation.

Public channel banners are cached where verified; other profiles have a labelled Chirp cover. Archive photos do not claim to depict the fictional career match.

## Player requests

Players can formally ask to leave after a relationship breakdown, sustained low morale, or prolonged exhaustion with unresolved concerns. The request is official before the manager responds. Accepting lists the player, refusing retains the request and contract, and sustained recovery can lead to withdrawal. Transfers still follow the existing offer and transfer-window rules.

Mood, confidence, fatigue and form affect simulations. Remote Rocket Host bots retain their fixed policies; these factors cannot improve a bot beyond its available model.

## Interface sounds and inbox

Settings → General provides interface sound effects, volume and **Test chirp**. Bird-like chirps accompany opening Chirp and publishing; navigation, likes, reposts, follows, messages, matchday and action feedback have short distinct sounds. These sounds are synthesized locally, with no audio downloads or AI inference. They are separate from match commentary and crowd audio and stay silent while the app is hidden.

The inbox **Read all** button marks all emails in the current career as read. It does not accept offers or resolve decisions.

## Match-aware conversations and receipts

AI jobs receive a compact career-scoped match context at generation time: competition, series score, game scores, verified series comebacks/reverse sweeps, recorded critical incidents and player statistics. Replies and quotes inherit the fixture through their actual parent chain. A pregame post can therefore be answered using the subsequent result. Shot totals never become inferred open-net misses. Incomplete game histories do not establish a comeback.

Matchday manager posts attach to that day's scheduled club fixture. Completed losses can bring a confident pre-series boast back as a quote and as direct replies, including a data-driven series receipt card. Older saves receive this catch-up even if their standard result posts already exist. Published comments remain immutable. The user directly addressed by a manager reply gets priority to answer in their own voice; other fans and analysts can disagree in separate branches.

Discussions gradually fill older roots as well as recently published posts. Reaction images use additional cached creator portraits, player posts can include their own portrait, and receipt memes display the actual career result rather than pretending an archive photo came from the fictional match. CPU generation remains paused during gameplay.
