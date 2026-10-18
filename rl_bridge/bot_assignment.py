"""Stable per-player engines and native policy strength; no fake SSL claims."""
import hashlib
from pathlib import Path
from player_style import style_profile


def player_assignment(player, match_key, lucky_chance=.05):
    rating = max(0, min(100, int(player.get('rating', 85))))
    identity = str(player.get('playerId') or player.get('gamertag', 'player'))
    seed = hashlib.sha256(f'{match_key}:{identity}'.encode()).digest()
    lucky = rating < 85 and int.from_bytes(seed[:8], 'big') / 2**64 < lucky_chance
    effective = max(85, rating) if lucky else rating
    engine = 'Nexto' if effective >= 85 else 'Necto' if effective >= 70 else 'Psyonix'
    beta = ((1. if effective > 85 else .8) if engine == 'Nexto'
            else min(1., .70 + max(0, effective-70)*.025))
    return {'engine': engine, 'rating': rating, 'effectiveRating': effective,
            'beta': beta, 'luckyGame': lucky, 'playerId': identity,
            'tendency': player.get('tendency', 'Balanced / Flex'),
            'groundStyle': style_profile(player),
            'attributes': player.get('attributes', {}), 'traits': player.get('traits', {}),
            'target': 'RLCS SSL' if effective >= 93 else 'GC / low SSL' if effective >= 85 else 'Plat / low Diamond',
            'availableLevel': 'approximately GC' if engine == 'Nexto' else 'approximately Diamond' if engine == 'Necto' else 'built-in bot'}


def engine_config(folder, engine):
    if engine=='Career Rookie':return Path(__file__).resolve().parent/'local_bots/career_rookie.cfg'
    paths = {'Nexto': 'Necto/Nexto/bot.cfg', 'Necto': 'Necto/Necto/bot.cfg',
             'Element':'Element/bot.cfg', 'Kamael':'Kamael_family/Kamael.cfg',
             'ReliefBot':'ReliefBotFamily/README/relief_bot.cfg',
             'Botimus Prime':'Botimus&Bumblebee/botimus.cfg',
             'Bumblebee':'Botimus&Bumblebee/bumblebee.cfg','RedBot':'RedBot/Bot.cfg',
             'Wildfire':'Wildfire_Lightfall_Fix/python/wildfire.cfg',
             'Codename Cryo':'Codename_Cryo/Codename_Cryo.cfg','St. Peter':'Kamael_family/Peter.cfg',
             'Lanfear':'The Forsaken/Lanfear.cfg','PenguinBot':'PenguinBot/penguin_config.cfg',
             'Beast from the East':'beastbot/beastbot.cfg','VirxEB':'VirxEB/VirxEB.cfg',
             'Bribblebot':'Bribblebot/bot.cfg','DisasterBot':'DisasterBot/disaster_bot.cfg',
             'Stick':'MarvinBots/Stick/stick.cfg'}
    path = Path(folder) / paths[engine] if engine in paths else None
    return path if path and path.is_file() else None
