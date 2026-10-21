# RL Manager 1.0.9

Steam launch fix: local and Rocket Host matches now select Steam for Steam
Rocket League installations instead of trying Epic's direct-executable login
workaround first. Custom Steam libraries are supported. The selected launcher
and installation path are recorded in the support log.

Local Easy/Medium tactical diagnostics now report actual steering, throttle,
boost and other control changes, driving targets, and reasons for delaying an
instruction. Search the support log for `Bot behavior:`.

Existing users with the complete runtime installed can run the update installer.
No save deletion, account unlinking, or settings reset is needed.

Validation: 266 app tests and 57 targeted Python tests passed, including Steam routing through
RLBot's real launcher dispatch and Steam command construction without calling Epic authentication. Live Steam
sign-in and match startup still require confirmation on an affected user's PC.
