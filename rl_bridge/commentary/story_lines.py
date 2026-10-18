"""Connected casting paragraphs grounded in the current match, not stat dumps."""
from dataclasses import dataclass
from match_story import clock_phase

WORDS = ('zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
         'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
         'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty')


def count(value):
    return WORDS[value] if 0 <= value < len(WORDS) else str(value)


def amount(value, noun):
    return f"{count(value)} {noun}{'' if value == 1 else 's'}"


@dataclass(frozen=True)
class StoryLine:
    key: str
    text: str
    priority: int
    subject: str = ''
    energy: str = 'lively'
    epoch: int = 0
    expires: float = float('inf')
    score: tuple | None = None
    phase: object = None
    minimums: tuple = ()
    zero_shots: str | None = None
    zero_goals: str | None = None

    def valid(self, snapshot, now, epoch):
        if epoch != self.epoch or now > self.expires or snapshot['ended']:
            return False
        if self.score is not None and tuple(snapshot['score']) != self.score:
            return False
        if self.phase is not None and clock_phase(snapshot) != self.phase:
            return False
        players = {p['name']: p for p in snapshot['players']}
        for name, field, value in self.minimums:
            if name not in players or players[name].get(field, 0) < value:
                return False
        if self.zero_shots and players.get(self.zero_shots, {}).get('shots') != 0:
            return False
        if self.zero_goals and players.get(self.zero_goals, {}).get('goals') != 0:
            return False
        return True


def discussion_lines(story, snapshot, now, variation=0):
    """Tactics are suggestions. Unobserved misses, mistakes and rotations aren't facts."""
    lines = []
    score = tuple(snapshot['score'])
    phase = clock_phase(snapshot)
    epoch = story.epoch
    def add(key, text, priority=35, subject='', energy='lively', **guards):
        lines.append(StoryLine(key, text, priority, subject, energy, epoch,
                               now + 45, **guards))
    if story.series.enabled:
        add('series-stakes', story.series.stakes(), 82, energy='hype')

    for p in snapshot['players']:
        name, team = p['name'], story.teams[p['team']]
        goals, saves, shots, assists = (p.get(k, 0) for k in ('goals', 'saves', 'shots', 'assists'))
        if goals >= 2:
            opening = (f"{name} is making a real impact!", f"You have to keep an eye on {name}!",
                       f"{name} is giving {team} a genuine attacking threat!")[variation % 3]
            add(f'finisher:{name}', f"{opening} Already {amount(goals, 'goal')} on the board. "
                "If you are defending, make the next touch awkward. Do not give a player with that kind of return a free run at the net.",
                95, name, 'hype', minimums=((name, 'goals', goals),))
        if saves >= 2:
            opening = (f"{name} is putting in a shift at the back!", f"That defensive workload for {name} is building!",
                       f"Give {name} some credit here!")[variation % 3]
            add(f'defender:{name}', f"{opening} Already {amount(saves, 'save')}. "
                f"For {team}, the next step is turning a stop into an outlet. Find a teammate with that first clear and let the defence breathe.",
                85, name, minimums=((name, 'saves', saves),))
        if assists >= 1:
            add(f'creator:{name}', f"There is more to this game than the finishing touch. {name} has already contributed "
                f"{amount(assists, 'assist')}! Keep looking for that extra pass. Moving the defence sideways can create the space that a straight shot cannot.",
                72, name, minimums=((name, 'assists', assists),))
        if shots >= 3 and goals == 0:
            add(f'finishing:{name}', f"{name} has reached {amount(shots, 'registered shot')}, but there is no goal to show for it yet. "
                "The involvement is there! Could the next attack use a different angle? A pass across the defence might open a cleaner opportunity.",
                78, name, minimums=((name, 'shots', shots),), zero_goals=name)
        elif shots >= 2:
            add(f'involvement:{name}', f"{name} has already put up {amount(shots, 'registered shot')}! "
                f"That is a player {team} can look to involve again. But mix up the delivery. A shot, a delayed touch, an extra pass. Give the defence something new to solve.",
                70, name, minimums=((name, 'shots', shots),))
        if shots == 0 and snapshot['elapsed'] >= 90:
            if saves or assists:
                ending = "That does not tell the whole story, because there has been a contribution elsewhere. Can the next rotation create a chance to join the attack?"
            else:
                ending = "Could a wider position or a quicker pass bring them into the next attack? Give them an option. Do not ask one player to do everything."
            add(f'quiet:{name}', f"{name} is still waiting for a first registered shot. {ending}",
                65, name, zero_shots=name)

    rated = [(p.get('rating'), p.get('gamertag')) for side in ('blueTeam', 'orangeTeam')
             for p in story.context.get(side, {}).get('players', [])
             if isinstance(p.get('rating'), (int, float)) and p.get('gamertag')]
    if rated:
        _, star = max(rated)
        if star in {p['name'] for p in snapshot['players']}:
            add(f'expectation:{star}', f"{star} carries the highest player rating in this matchup. "
                "But how do you turn that into an advantage on the field? Give that player more than one option. "
                "A teammate showing for a pass can make the next challenge much harder to read!",
                60, star)

    # Remember the recent scorer without attributing goals to an assumed touch.
    for event in reversed(story.events):
        if event['type'] == 'goal' and event.get('scorer') and now - event['at'] < 35:
            name = event['scorer']
            # Its historical goal remains true through later score changes.
            lines.append(StoryLine(f"recent-goal:{event['at']}:{name}",
                f"{name} found a way through earlier! Now the question is how the next attack develops. "
                "Do you threaten another shot, or use that threat to find the pass? Make the defender commit before you show the next option.",
                90, name, 'hype', epoch, event['at'] + 45))
            break

    blue, orange = score
    if blue != orange:
        leading = 0 if blue > orange else 1
        leader, chaser = story.teams[leading], story.teams[1-leading]
        add(f'chasing:{score}', f"{chaser} need a response, but the next attack has to be connected. "
            "Get one player threatening the ball and another offering the follow-up. Chasing the score does not mean every car has to chase the same touch!",
            58, score=score)
        add(f'leading:{score}', f"{leader} have the advantage. How do you make that lead work for you? "
            "Make the other side travel for the ball, keep an outlet available, and force them to spend boost before they get their next clean challenge.",
            55, score=score)
        if snapshot['remaining'] <= 60 and not snapshot['overtime']:
            add(f'late-chase:{score}:{phase}', f"Time is becoming a problem for {chaser}! "
                "The next attack needs a follow-up, but you cannot lose cover behind it. Get the first challenge, "
                "keep someone available for the second touch, and give yourselves a chance to keep this game alive!",
                87, energy='hype', score=score, phase=phase)
    elif snapshot['overtime'] or snapshot['remaining'] <= 60:
        add(f'pressure:{phase}', "It is all square, and the next opening could decide this! "
            "The temptation is to throw another car forward. But who covers the counter? One patient player behind the attack can be the difference between pressure and disaster.",
            88, energy='hype', score=score, phase=phase)

    # Rolling telemetry, not one changing boost value or an assumed bad rotation.
    recent = [s for s in story.passage if snapshot['elapsed'] - s['elapsed'] <= 20]
    if len(recent) >= 12:
        for team, label in enumerate(story.teams):
            if sum(s['low_boost'][team] for s in recent) / len(recent) >= .6:
                add(f'boost:{team}', f"{label} have spent much of the recent passage short on boost. "
                    "That makes the little pads valuable! Keep a route back through them, and try to buy time with the ball. A huge challenge is expensive when the tank is low.",
                    74)
            if sum(s['defending'] == team for s in recent) / len(recent) >= .7:
                add(f'territory:{team}', f"The ball has spent much of the recent passage in {label}'s half. "
                    "How do you get out? A clear is useful, but a clear towards a teammate gives you an attack. Look for the outlet before simply handing the ball back.",
                    73)

    tactics = (
        ("second", "The follow-up matters every bit as much as the first challenge. If your teammate forces a loose touch, be ready for it! Leave someone covering behind you, and turn that little win into a connected attack."),
        ("space", "You do not always have to hit the ball immediately. If there is room, take the touch that brings a teammate into the play. Make the defender choose between challenging you and covering the pass. That is a useful question to ask!"),
        ("pads", "Boost management is about the route as well as the big pickup. Those small pads can keep a rotation moving! Stay available for the next challenge instead of taking a long detour and leaving your teammate with no outlet."),
        ("cover", "Watch the player behind the attack as well as the one on the ball. That cover gives the first player freedom to commit! If the challenge is lost, someone still has to be ready to defend the next touch."),
        ("angles", "How do you make a defender uncomfortable? Change the angle they have to face! A touch across the field, or a pass behind the first challenge, can be more useful than driving straight at a defender who is already set."),
        ("patience", "There is a balance between pressure and patience here. You want to threaten the next touch, but you do not want two teammates taking the same challenge! Keep the spacing, give each other options, and make the opponent reveal their hand."),
        ("possession", "A booming clear buys space, but keeping the ball buys options. If you have a teammate available, look for that connection! The important question is what happens after the first touch, not simply how hard you can hit it."),
        ("recovery", "A quick recovery can be a quiet difference maker. Land with a route back into the play, pick up the small pads on the way, and give your teammate cover! The next useful touch often starts with the position you recover into."),
    )
    for key, text in tactics:
        add(f'tactic:{key}', text, 30)
    for form in story.context.get('commentaryContext', {}).get('teams', []):
        series = form.get('recentSeries', [])
        if series:
            wins = sum(s.get('result') == 'win' for s in series)
            add(f"form:{form['team']}", f"Coming into this game, {form['team']} won {count(wins)} of their last "
                f"{count(len(series))} completed series in this career. That is the background. This game still needs its own decisions! "
                "Keep the options open and make the next possession count.", 45)
    return lines
