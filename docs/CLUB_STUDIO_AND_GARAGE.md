# Club studio and squad garage

Open **Club studio** or **Squad garage** under **Identity** in the sidebar.

Club studio saves the managed club's name, broadcast abbreviation, palette,
crest, banner and home/away jersey design in the current career database.
The crest builder offers shields, circles, diamonds, initials and emblems.
PNG/JPG/WebP uploads are resized into PNGs. Jerseys can be exported as PNGs,
including the back with squad player lettering. Restore original identity
returns the club's original name and abbreviation without changing its roster.

The dashboard, team crest components, club Chirp profile and match broadcast
use the saved identity. HUD textures are prepared before launch, with cached
display-sized variants; no image processing takes place in the game's render
loop. HUD 1.7.7 uses the custom palette on crest towers. Blue/orange match scores
and series progression remain separate from club colours.

The garage stores a blue/orange cosmetic preset by career and player ID.
Players using the same engine can use different bodies and cosmetics.
Available item IDs come from the installed official RLBot catalog, with
body-compatible decals. The preview is an illustration rather than a live
Rocket League renderer. Coordinate club colours preserves each saved body and
items; copy design to squad copies the complete selected preset. Restore
original appearance removes that player's preset.

Preset application currently supports **local AI cars** through RLBot's
`PlayerConfig.loadout_config`. The selected human car uses its Rocket League
garage. Hosted bots retain Rocket Host's server loadouts. Saved club branding
still appears in the hosted career HUD. RGB selection maps to the game's
available team-colour swatches. Cosmetics do not change ratings, difficulty,
bot selection or series engine locks; different body handling can still affect
a policy trained for another hitbox.

Sources: [RLBot item catalog](https://github.com/RLBot/RLBotGUI/blob/master/rlbot_gui/gui/csv/items.csv),
[RLBot match configuration](https://github.com/RLBot/RLBot/blob/master/src/main/python/rlbot/matchconfig/match_config.py),
[RLBot loadout configuration](https://github.com/RLBot/RLBot/blob/master/src/main/python/rlbot/matchconfig/loadout_config.py).

Validation covers database export/reload, save switching, own-squad ownership,
item/body validation, image bounds, default appearance preservation, HUD PNG
preparation, real IPC editor saves and the actual RLBot match-settings packet.
No live game was launched during these checks.
