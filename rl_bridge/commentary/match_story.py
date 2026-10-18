"""Grounded broadcast facts; unobserved mechanics/form are never invented."""
from collections import deque
from series_story import SeriesStory


def spoken_clock(seconds, overtime=False):
    if overtime:
        return "overtime"
    minutes, seconds = divmod(max(0, int(seconds)), 60)
    if minutes and seconds:
        return f"{minutes} minute{'s' if minutes != 1 else ''} and {seconds} seconds remaining"
    if minutes:
        return f"{minutes} minute{'s' if minutes != 1 else ''} remaining"
    return f"{seconds} seconds remaining"


def clock_phase(snapshot):
    if snapshot["overtime"]:
        return "overtime"
    seconds = snapshot["remaining"]
    return next((bound for bound in (0, 10, 30, 60, 120) if seconds <= bound), "early")


class MatchStory:
    def __init__(self, context=None):
        self.context = context or {}
        self.teams = tuple(self.context.get(side, {}).get("name", fallback)
                           for side, fallback in (("blueTeam", "Blue"), ("orangeTeam", "Orange")))
        self.events = deque(maxlen=40)
        self.series = SeriesStory(self.context, self.teams)
        self.passage = deque(maxlen=120)
        self.epoch = 0
        self.score_version = 0
        self.previous = None

    def intro(self):
        lines = []
        for side, name in zip(("blueTeam", "orangeTeam"), self.teams):
            players = self.context.get(side, {}).get("players", [])
            roster = ", ".join(p.get("gamertag", "") for p in players if p.get("gamertag"))
            if roster:
                lines.append(f"{name} line up with {roster}.")
        rated = [(p.get("rating"), p.get("gamertag")) for side in ("blueTeam", "orangeTeam")
                 for p in self.context.get(side, {}).get("players", [])
                 if isinstance(p.get("rating"), (int, float)) and p.get("gamertag")]
        if rated:
            rating, player = max(rated)
            lines.append(f"{player} has the highest rating in this match at {int(rating)}.")
        return "Welcome to the match! " + self.series.stakes() + ' ' + " ".join(lines)

    def postgame(self, snapshot):
        score = snapshot['score']
        if score[0] == score[1]:
            return ''
        return (self.series.postgame(score, self.events) +
                f' The final score is {max(score)} to {min(score)}. ')

    def analysis_review(self, snapshot):
        """Result desk observations from counters, never invented missed chances."""
        score = snapshot['score']
        if score[0] == score[1]:
            return ''
        winner = 0 if score[0] > score[1] else 1
        players = snapshot['players']
        winners = [p for p in players if p['team'] == winner]
        losers = [p for p in players if p['team'] != winner]
        lines = []
        if snapshot['overtime']:
            lines.append('It took overtime to separate them. There was no margin for a second mistake at the end; the next goal decided the game.')
        goals = [e for e in self.events if e['type'] == 'goal']
        if goals and sum(goals[0]['score']) == 1:
            deficit = max([e['score'][1-winner]-e['score'][winner] for e in goals]+[0])
            if deficit:
                lines.append(f'{self.teams[winner]} recovered from a {deficit}-goal deficit. That is the story of this game: they had to find a response rather than protect an early lead.')
            elif goals[0]['team'] == winner:
                lines.append(f'{self.teams[winner]} scored first and never fell behind. They set the scoreline early and kept that advantage from turning into a deficit.')
        if winners:
            scorer = max(winners, key=lambda p: (p['goals'], p['assists'], p['shots']))
            if scorer['goals']:
                lines.append(f"{scorer['name']} supplied {scorer['goals']} of those goals, with {scorer['shots']} registered shots. That was a major contribution to the attack.")
            creator = max(winners, key=lambda p:p['assists'])
            if creator['assists']:
                lines.append(f"{creator['name']} added {creator['assists']} assists. That contribution matters alongside the finishing; the attack was getting more than just the last touch.")
        shots = [sum(p['shots'] for p in side) for side in (winners, losers)]
        lines.append(f"The shot count was {shots[0]} for {self.teams[winner]} and {shots[1]} for {self.teams[1-winner]}.")
        if losers:
            defender = max(losers,key=lambda p:p['saves'])
            if defender['saves']:
                lines.append(f"{defender['name']} made {defender['saves']} saves for the losing side. Those stops helped, but the defence still conceded {score[winner]}; they need a way to turn the next clear into possession.")
        if not shots[1]:
            lines.append('The losing side did not register a shot. The review has to begin with finding an outlet and connecting the first clear to a teammate, rather than expecting the last defender to solve everything.')
        elif shots[1] >= shots[0] and score[1-winner] < score[winner]:
            lines.append('They had the shot volume, but not the return. Shot totals alone cannot tell us the quality of those chances; better placement and a follow-up are worth reviewing.')
        else:
            lines.append('For the next response, look at the spacing between the challenge and the support. Having an outlet can turn a defensive stop into the next attack; that is a tactical adjustment to consider.')
        return ' '.join(lines)

    def review_milestones(self, snapshot):
        """Observed lower bounds survive late goals and overtime. Each card
        retains its evidence so a reset/roster change cannot reuse old audio."""
        cards = []
        for p in snapshot['players']:
            name = p['name']
            for stat, minimum, priority, text in (
                ('goals', 1, 30 + p['goals'],
                 f"{name} had already put away {p['goals']} {'goal' if p['goals']==1 else 'goals'} before the finish. That finishing contribution gave their team something to build on."),
                ('assists', 1, 20 + p.get('assists', 0),
                 f"{name} had already created {p.get('assists',0)} {'assist' if p.get('assists',0)==1 else 'assists'}. That extra pass matters; the attack needs more than just the player taking the final shot."),
                ('saves', 2, 25 + p['saves'],
                 f"{name} had already made {p['saves']} saves. Those stops are a contribution in their own right, but the next step is finding a teammate with the clear.")):
                count = p.get(stat, 0)
                if count >= minimum:
                    cards.append({'text': text, 'name': name, 'team': p['team'],
                                  'stat': stat, 'count': count, 'epoch': self.epoch,
                                  'priority': priority})
        return sorted(cards, key=lambda c: c['priority'], reverse=True)

    def valid_milestone(self, card, snapshot):
        return card['epoch'] == self.epoch and any(
            p['name'] == card['name'] and p['team'] == card['team'] and
            p.get(card['stat'], 0) >= card['count'] for p in snapshot['players'])

    def update(self, packet, now):
        if packet.num_teams < 2 or packet.num_cars == 0:
            return None
        info = packet.game_info
        score = tuple(int(packet.teams[i].score) for i in range(2))
        players = [{"name": str(c.name), "team": int(c.team), "boost": int(c.boost),
                    "goals": int(c.score_info.goals), "shots": int(c.score_info.shots),
                    "saves": int(c.score_info.saves), "demos": int(c.score_info.demolitions),
                    "assists": int(getattr(c.score_info, 'assists', 0)),
                    "position": tuple(getattr(c.physics.location, axis) for axis in ('x', 'y', 'z')),
                    "demolished": bool(c.is_demolished), "index": index}
                   for index, c in enumerate(packet.game_cars[:packet.num_cars])]
        snap = {"score": score, "players": players, "remaining": float(info.game_time_remaining),
                "clock": spoken_clock(info.game_time_remaining, info.is_overtime),
                "active": bool(info.is_round_active and not info.is_match_ended),
                "kickoff": bool(info.is_kickoff_pause), "overtime": bool(info.is_overtime),
                "ended": bool(info.is_match_ended), "elapsed": float(info.seconds_elapsed), "at": now,
                "critical_demos": []}
        previous = self.previous
        if previous and (snap["elapsed"] < previous["elapsed"] - 0.5 or
                         any(a < b for a, b in zip(score, previous["score"]))):
            self.events.clear()
            self.passage.clear()
            self.epoch += 1
            self.score_version += 1
            previous = None
        if previous:
            for team in range(2):
                if score[team] > previous["score"][team]:
                    self.score_version += 1
                    # Goal counters confirm attribution, not just last touch.
                    old_by_name = {p["name"]: p for p in previous["players"]}
                    scorer = next((p["name"] for p in players if p["team"] == team and
                                   p["goals"] > old_by_name.get(p["name"], p)["goals"]), None)
                    self.events.append({"type": "goal", "team": team, "scorer": scorer,
                                        "at": now, "score": score, "remaining": snap['remaining']})
            old_by_name = {p["name"]: p for p in previous["players"]}
            for player in players:
                old = old_by_name.get(player["name"])
                if old and player["saves"] > old["saves"]:
                    self.events.append({"type": "save", "player": player["name"],
                                        "count": player["saves"], "at": now})
                if (old and not old['demolished'] and player['demolished'] and
                        snap['active'] and not snap['kickoff']):
                    # Only a newly demolished last defender with a shot heading
                    # towards their net qualifies. Routine midfield demos do not.
                    from clip_broadcast import threatens_goal, xyz, distance
                    net = (0, -5120 if player['team'] == 0 else 5120, 0)
                    others = [p for p in players if p['team'] == player['team'] and
                              p['index'] != player['index'] and not p['demolished']]
                    if (distance(old['position'], net) < 1900 and
                            all(distance(p['position'], net) > 2200 for p in others) and
                            threatens_goal(xyz(packet.game_ball.physics.location),
                                           xyz(packet.game_ball.physics.velocity), 1-player['team'])):
                        event = {'type': 'critical_demo', 'player': player['index'],
                                 'team': player['team'], 'at': now}
                        self.events.append(event)
                        snap['critical_demos'].append(event)
        if (snap['active'] and not snap['kickoff'] and
                (not self.passage or snap['elapsed'] - self.passage[-1]['elapsed'] >= .5)):
            low = []
            for team in range(2):
                values = [p['boost'] for p in players if p['team'] == team and not p['demolished']]
                low.append(bool(values) and sum(values) / len(values) < 25)
            y = packet.game_ball.physics.location.y
            self.passage.append({'elapsed': snap['elapsed'], 'low_boost': tuple(low),
                                 'defending': 0 if y < -800 else 1 if y > 800 else None})
        self.previous = snap
        return snap

    def facts(self, snapshot):
        phase = clock_phase(snapshot)
        clock_fact = {"overtime": "We are in overtime; the next goal wins.",
                      0: "Regulation time has expired, but the ball is still live.",
                      10: "We are inside the final ten seconds of regulation.",
                      30: "We are inside the final thirty seconds of regulation.",
                      60: "We are inside the final minute of regulation.",
                      120: "We are inside the final two minutes of regulation.",
                      "early": "There is still time to build the next attack."}[phase]
        blue, orange = snapshot["score"]
        if blue == orange:
            score_fact = f"It is level at {blue} apiece between {self.teams[0]} and {self.teams[1]}."
        else:
            leader = self.teams[0 if blue > orange else 1]
            score_fact = f"{leader} lead {max(blue, orange)} to {min(blue, orange)}."
        facts = [score_fact, clock_fact]
        averages = []
        for side in ("blueTeam", "orangeTeam"):
            ratings = [p["rating"] for p in self.context.get(side, {}).get("players", [])
                       if isinstance(p.get("rating"), (int, float))]
            averages.append(sum(ratings) / len(ratings) if ratings else None)
        if all(v is not None for v in averages) and averages[0] != averages[1]:
            favorite = self.teams[0 if averages[0] > averages[1] else 1]
            facts.append(f"{favorite} have the higher average player rating in this matchup.")
        for player in snapshot["players"]:
            if player["saves"] >= 2:
                facts.append(f"{player['name']} already has {player['saves']} saves to their name in this match.")
            if player["shots"] >= 2:
                ending = 'goal' if player['goals'] == 1 else 'goals'
                facts.append(f"{player['name']} has recorded {player['shots']} shots and {player['goals']} {ending} so far.")
            if player["shots"] == 0 and snapshot["elapsed"] >= 90:
                facts.append(f"{player['name']} is still waiting for their first registered shot. Watch for when they get involved.")
        for event in list(self.events)[-3:]:
            if event["type"] == "goal" and event["scorer"]:
                facts.append(f"{event['scorer']} scored for {self.teams[event['team']]} earlier in this match.")
        # Saved career form is optional and explicitly grounded in completed series.
        for form in self.context.get("commentaryContext", {}).get("teams", []):
            series = form.get("recentSeries", [])
            if series:
                wins = sum(s.get("result") == "win" for s in series)
                facts.append(f"{form['team']} won {wins} of their last {len(series)} completed series in this career.")
        return facts
