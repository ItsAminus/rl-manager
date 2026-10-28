"""Six career identities, prepared speech, and an isolated local car showcase.

The showcase never launches external bots, feeds match statistics or writes a
career result. Rocket Host is reserved only after this local scene is closed.
"""
import copy
import hashlib
import json
import random
import time
import uuid
from pathlib import Path

OPENERS = (
    "Before we get underway, let's meet the players. First into the spotlight, a player looking to put their stamp on this series.",
    "Next in the starting lineup, another player ready to make their presence felt. Here's who to keep an eye on.",
    "And completing the first team's lineup, our third player takes the spotlight. Let's take a look at their story.",
    "Now, across the field, it's time to meet the opposition. Their first player steps into the spotlight.",
    "Next up, another name in this starting three. A fresh series, and another opportunity to make an impact.",
    "And finally, completing our introductions, the sixth player in today's matchup. Let's meet them before we head to kickoff.",
    "The camera turns to another player in today's lineup. Let's put a name to the car before the action begins.",
    "Every series brings a new challenge. Here is another player preparing to take it on.",
    "The opening kickoff is getting closer. For now, the spotlight belongs to this member of the starting lineup.",
    "Before the cars start moving, let's take a moment to introduce another player in this matchup.",
    "Another car, another name to follow. Here is a closer look at the player behind it.",
    "Our introductions continue with another member of the starting six. Let's bring them into focus.",
    "The stage is set for a fresh series. Here is one of the players who will help decide how it unfolds.",
    "There is plenty of Rocket League ahead. First, let's get to know another player taking the field.",
    "As both teams prepare for the opening game, we turn our attention to another name in the lineup.",
)
CLOSERS = (
    "Now comes another opportunity to add to that story.",
    "We'll see what they bring when this series gets underway.",
    "That's our first starting three. Now, let's meet the players across the field.",
    "A fresh challenge awaits, and it starts with this opening game.",
    "Another player to watch as these two teams prepare to face off.",
    "All six players introduced. Two teams, one series. Let's get this underway!",
    "The introduction is complete. Their next chapter begins when the ball is in play.",
    "Now we wait to see how they approach this opening game.",
    "That is the player behind the car. Soon, the Rocket League will do the talking.",
    "The numbers tell part of the story. This series will give us the next part.",
    "Their place in the lineup is set. Now comes the challenge on the field.",
    "A new matchup means new decisions to make. We will see how they handle them.",
    "There will be opportunities to make a difference. The opening game is almost here.",
    "That is another player introduced, and another name to follow throughout this series.",
    "Preparation gives way to competition. We will find out what they bring to this matchup.",
)


def script_choices(context):
    """Keep retries/audio preparation identical; vary wording across fixtures.

    The original six pairs refer to specific lineup positions. New generic
    variants work for any player; sample them without repeats in one lineup.
    """
    broadcast = context.get('broadcast') or {}
    identity = {key:context.get(key) for key in ('fixtureId','matchId','careerId','date')}
    identity['broadcast'] = {key:broadcast.get(key) for key in ('competitionId','round','blue','orange')}
    seed = hashlib.sha256(json.dumps(identity,sort_keys=True,default=str).encode()).digest()
    rng = random.Random(seed)
    intros, outros = rng.sample(range(6,len(OPENERS)),6), rng.sample(range(6,len(CLOSERS)),6)
    return [(i if rng.randrange(2)==0 else intros[i],i if rng.randrange(2)==0 else outros[i]) for i in range(6)]


def introduction_plan(context):
    broadcast = context.get('broadcast') or {}
    series = context.get('series') or broadcast.get('series') or {}
    if context.get('_playerIntroAttempted') or context.get('playerIntroductions') is False or series.get('gameNumber', context.get('gameNumber', 1)) != 1:
        return []
    result = []
    choices = script_choices(context)
    for side, key in enumerate(('blue', 'orange')):
        team = broadcast.get(key) or {}
        roster = team.get('players') or []
        if len(roster) != 3:
            return []
        for player in roster:
            if not player.get('playerId') or not player.get('gamertag'):
                return []
            facts = player.get('introduction') or {}
            age = facts.get('age')
            age = age if type(age) is int and 13 <= age <= 100 else None
            # Text fields must carry their provenance through the launch payload.
            sources = facts.get('sources') or {}
            debut = facts.get('rlcsDebut') if sources.get('rlcsDebut') else None
            worlds = facts.get('bestWorldsResult') if sources.get('bestWorldsResult') else None
            card_rows = []
            for row in facts.get('cardRows', [])[:3]:
                if (isinstance(row, dict) and isinstance(row.get('label'), str)
                        and isinstance(row.get('value'), str) and row['label'].strip() and row['value'].strip()
                        and isinstance(row.get('source'), str)
                        and (row['source'].startswith('https://') or row['source'].startswith('Career '))):
                    card_rows.append({'label': row['label'][:42], 'value': row['value'][:180], 'source': row['source']})
            name, club = player['gamertag'], team.get('name') or key.title()
            index = len(result)
            intro, outro = choices[index]
            text = name.rstrip('.') + '.'
            # Separate factual sentences avoid a fixed grammar that assumes a
            # result is a year or an achievement was won on a particular team.
            if age is not None:
                text += f' {age} years old.'
            if debut:
                text += f' RLCS debut: {debut}.'
            if worlds:
                text += f' Best Worlds result: {worlds}.'
            result.append({'playerId': player['playerId'], 'gamertag': name,
                           'team': side, 'teamName': club, 'logo': team.get('logo') or '',
                           'age': age, 'rlcsDebut': debut, 'bestWorldsResult': worlds,
                           'cardRows': card_rows, 'photo': player.get('photo') or '',
                           'introClip': intro+1, 'outroClip': outro+1,
                           'leadScript': OPENERS[intro], 'closingScript': CLOSERS[outro], 'script': text})
    if len({p['playerId'] for p in result}) != 6 or len({p['gamertag'] for p in result}) != 6:
        return []
    return result


def showcase_config(context):
    from rlbot.matchconfig.match_config import MatchConfig, PlayerConfig
    from garage_loadout import apply_garage_loadout
    config = MatchConfig()
    config.game_mode = 'Soccer'
    config.game_map = context.get('arena') or 'Mannfield_Dusk'
    config.skip_replays = True
    config.instant_start = False
    config.enable_state_setting = True
    config.existing_match_behavior = 'Restart'
    config.player_configs = []
    for side, key in enumerate(('blueTeam', 'orangeTeam')):
        for player in context[key]['players']:
            pc = PlayerConfig()
            pc.team, pc.name = side, player['gamertag']
            # Six idle RLBot-owned display cars preserve configured names.
            # Stock bots and the real human account ignore those names. No
            # agent processes are launched for this paused presentation scene.
            pc.bot, pc.rlbot_controlled, pc.bot_skill = True, True, 0.0
            apply_garage_loadout(pc, player)
            config.player_configs.append(pc)
    if len(config.player_configs) != 6:
        raise ValueError('The player showcase needs exactly six starters')
    return config


def frozen_lineup(packet, plan):
    """Resolve actual packet slots by team/name, never assume RLBot slot order."""
    from rlbot.utils.game_state_util import GameState, GameInfoState, CarState, Physics, Vector3, Rotator, BallState
    cars = {}
    for row, player in enumerate(plan):
        slots = [i for i, car in enumerate(packet.game_cars[:packet.num_cars])
                 if car.name == player['gamertag'] and car.team == player['team']]
        if len(slots) != 1:
            raise ValueError('Showcase car identity is missing or ambiguous: ' + player['gamertag'])
        cars[slots[0]] = CarState(physics=Physics(location=Vector3(-950 if player['team'] == 0 else 950,
                       (row % 3 - 1) * 1000, 25), rotation=Rotator(0, 0 if player['team'] == 0 else 3.14159265, 0),
                       velocity=Vector3(0, 0, 0), angular_velocity=Vector3(0, 0, 0)), boost_amount=0)
    return GameState(cars=cars, ball=BallState(physics=Physics(location=Vector3(0, 0, 1200), velocity=Vector3(0, 0, 0))),
                     game_info=GameInfoState(paused=True))


def native_ack(root, session, player_id=None):
    try:
        value = json.loads((root / 'presentation-status.json').read_text(encoding='utf-8'))
        if value.get('session') != session or abs(time.time() - value.get('updated', 0)) > 2:
            return None
        if player_id is not None and value.get('playerId') != player_id:
            return None
        return value
    except (OSError, ValueError, TypeError):
        return None


def run_showcase(manager, context, dispatcher, log):
    """Return to the menu before either real match route can begin."""
    plan = introduction_plan(context)
    played = False
    loaded = False
    hud = None
    transition_sent = False
    from introduction_music import IntroductionMusic
    music = IntroductionMusic(log)
    def cover_transition():
        nonlocal transition_sent
        if transition_sent:return
        music.stop(wait=False)
        from launcher import log_event
        try:window=hud.window() if hud else {}
        except Exception:window={}
        log_event('PLAYER_INTRO_TRANSITION',bounds=window.get('bounds'))
        transition_sent=True
        # Exclusive-fullscreen Rocket League can remain above an always-on-top
        # window even after it requests focus. Release that swapchain while the
        # opaque app cover is active; the real match route restores it at ready.
        from game_window import minimize_rocket_league
        minimize_rocket_league()
    try:
        if not plan:
            return False
        context['_playerIntroAttempted'] = True
        from bakkesmod_startup import folder, rcon_commands, allow_career_commands
        root = folder() / 'data' / 'rl-manager'
        status = json.loads((root / 'plugin-status.json').read_text(encoding='utf-8'))
        if not status.get('playerShowcase'):
            log('Player introductions need the updated career HUD; continuing to the match')
            return False
        from rlbot.utils.structures.game_data_struct import GameTickPacket
        from rlbot.utils.game_state_util import GameState, GameInfoState
        from broadcast_telemetry import BroadcastTelemetry
        from game_window import focus_rocket_league
        from launcher import return_to_lobby
        allow_career_commands()
        rcon_commands(['rcon_refresh_allowed'])
        # Preparation is bounded and happens before any stadium or host timer.
        if dispatcher and hasattr(dispatcher, 'presentation_prepared'):
            log('Loading the offline player introduction voice library')
            deadline = time.monotonic() + 120
            while not dispatcher.presentation_prepared.wait(.1):
                if dispatcher.stopped.is_set() or time.monotonic() >= deadline:
                    break
            if not any(dispatcher.presentation_audio(i) is not None for i in range(6)) and not context.get('_showcaseWithoutAudio'):
                log('The selected player voice library is not ready; continuing without a silent showcase')
                return False
        manager.load_match_config(showcase_config(context))
        from launcher import log_event
        log_event('PLAYER_INTRO_START')
        loaded = True
        manager.start_match()
        manager.game_interface.set_game_state(GameState(game_info=GameInfoState(paused=True)))
        packet = GameTickPacket()
        deadline = time.monotonic() + 15
        while True:
            manager.game_interface.update_live_data_packet(packet)
            if packet.num_cars == 6:
                manager.game_interface.set_game_state(frozen_lineup(packet, plan))
                break
            if time.monotonic() >= deadline:
                raise RuntimeError('Six showcase cars did not finish spawning')
            time.sleep(.05)
        # Explicit separate session, fresh heartbeat and camera acknowledgement.
        showcase_context=copy.deepcopy(context['broadcast'])
        for side in ('blue','orange'):
            for player in showcase_context[side]['players']:
                player['isHuman']=False
        hud = BroadcastTelemetry(lambda *a, **kw: None, showcase_context)
        session = uuid.uuid4().hex
        focus_rocket_league()
        log('Series player introductions: Space or controller B to skip')
        for index, player in enumerate(plan):
            pcm = dispatcher.presentation_audio(index) if dispatcher and hasattr(dispatcher, 'presentation_audio') else None
            speech_duration = len(pcm) / dispatcher.player.sample_rate if pcm is not None else 8.55
            duration = max(9., speech_duration + .45)
            duration = min(duration, 60.)
            began = None
            deadline = time.monotonic() + 4
            while True:
                now = time.monotonic()
                manager.game_interface.update_live_data_packet(packet)
                hud.presentation = {**player, 'mode': 'local-showcase', 'session': session,
                                    'index': index, 'count': 6, 'elapsed': 0 if began is None else now - began,
                                    'running': began is not None, 'duration': duration, 'active': True}
                hud.update(packet)
                ack = native_ack(root, session, player['playerId'])
                if ack and ack.get('skipped'):
                    log('Player introductions skipped')
                    return played
                if began is None:
                    if ack and ack.get('cameraApplied'):
                        began = now
                        if index == 0:
                            music.start()
                        if pcm is not None:
                            dispatcher.play_presentation_audio(pcm)
                        else:
                            log('Prepared speech unavailable for ' + player['gamertag'] + '; showing the player card')
                    elif now >= deadline:
                        raise RuntimeError('The showcase camera did not acknowledge this career player')
                elif now - began >= duration:
                    played = True
                    break
                music.set_ducked(pcm is not None and began is not None and now-began < speech_duration)
                if index==5 and began is not None and now-began>=speech_duration:
                    cover_transition()
                if dispatcher and getattr(dispatcher,'stopped',None) is not None and dispatcher.stopped.is_set():
                    return played
                time.sleep(.03)
        return played
    except Exception as exc:
        log(f'Player introductions unavailable ({exc}); continuing to the match')
        return played
    finally:
        music.stop()
        if loaded:cover_transition()
        if dispatcher and hasattr(dispatcher, 'finish_player_showcase'):
            dispatcher.finish_player_showcase(played)
        if hud:
            hud.presentation = None
            if hud.latest:
                hud.latest = {**hud.latest, 'presentation': None, 'updated': time.time()}
                hud.wake.set()
                time.sleep(.15)
            hud.close()
        if loaded:
            # Request travel first, then release the disposable world's pause:
            # a paused engine can defer processing its queued disconnect. This
            # scene has no result monitor, agents or career statistics writer.
            from launcher import return_to_lobby
            return_to_lobby()
            try:
                manager.game_interface.set_game_state(GameState(game_info=GameInfoState(paused=False)))
            except Exception:
                pass  # Travel may already have destroyed the showcase world.
