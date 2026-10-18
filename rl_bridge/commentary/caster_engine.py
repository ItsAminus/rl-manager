"""
RLCS Broadcast Dynamic Commentary Dialogue Engine for Caster One & Caster Two.
Generates authentic esports casting scripts for continuous play-by-play,
micro-events (passes, aerials, 50-50s, bumps, boost steals),
and tactical analysis & banter ("yapping") about series history, player ratings,
active player names, and real-time match context.
"""

import random
import time
from typing import Dict, Any, List, Optional

class CasterEngine:
    def __init__(self, home_team: str = "Elevate", away_team: str = "Gladiators", series_fmt: str = "BO5", game_number: int = 1):
        self.home_team = home_team
        self.away_team = away_team
        self.series_fmt = series_fmt
        self.game_number = game_number
        self.last_speaker = "caster_two"
        self.last_yap_time = 0.0
        self.last_topic = ""
        self.blue_players: List[str] = []
        self.orange_players: List[str] = []

    def set_roster(self, blue_players: List[str], orange_players: List[str]):
        """Registers active player names for both teams."""
        self.blue_players = [p for p in blue_players if p]
        self.orange_players = [p for p in orange_players if p]

    def get_all_players(self) -> List[str]:
        return list(set(self.blue_players + self.orange_players))

    def get_next_speaker(self, preferred: Optional[str] = None) -> str:
        if preferred:
            self.last_speaker = preferred
            return preferred
        self.last_speaker = "caster_two" if self.last_speaker == "caster_one" else "caster_one"
        return self.last_speaker

    # =========================================================================
    # 1. INTRODUCTIONS & KICKOFF
    # =========================================================================
    def generate_intro_commentary(self) -> List[Dict[str, Any]]:
        """Generates dynamic opening kickoff dialogue."""
        caster_one_line = f"Welcome everyone to Champions Field! Caster One and Caster Two with you for Game {self.game_number} between {self.home_team} and {self.away_team}!"
        caster_two_line = f"Both teams look dialed in during warmups. Setting the pace early in this {self.series_fmt} is going to be massive."
        return [
            {"speaker": "caster_one", "text": caster_one_line, "exaggeration": 0.65},
            {"speaker": "caster_two", "text": caster_two_line, "exaggeration": 0.60},
        ]

    # =========================================================================
    # 2. GOAL COMMENTARY (Dynamic Breakdown)
    # =========================================================================
    def generate_goal_commentary(
        self,
        scorer_name: str,
        scorer_team: str,
        speed_kph: float,
        blue_score: int,
        orange_score: int,
        time_remaining: int,
        series_home: int = 0,
        series_away: int = 0,
    ) -> Dict[str, Any]:
        is_blue = scorer_team.lower() in ["blue", "home", self.home_team.lower()]
        scoring_team = self.home_team if is_blue else self.away_team
        opp_team = self.away_team if is_blue else self.home_team
        my_score = blue_score if is_blue else orange_score
        opp_score = orange_score if is_blue else blue_score
        speed_int = max(65, min(145, int(speed_kph)))

        speaker = self.get_next_speaker("caster_one")
        mins = time_remaining // 60
        secs = time_remaining % 60

        if my_score == opp_score:
            line = f"{scorer_name} levels it for {scoring_team}! We are all square at {my_score} apiece with {time_remaining} seconds left!"
        elif my_score > opp_score and time_remaining < 60:
            line = f"That could be the dagger from {scorer_name}! {scoring_team} take the lead with only {time_remaining} seconds remaining!"
        elif speed_int > 105:
            line = f"What an absolute missile from {scorer_name}! Clocked at {speed_int} kilometers per hour into the top corner!"
        else:
            options = [
                f"{scorer_name} with the breakthrough! {scoring_team} take a {my_score} to {opp_score} lead!",
                f"Clinical execution from {scorer_name}, punishing the defense to put {scoring_team} ahead!",
                f"Sensational strike from {scorer_name}! Clocked at {speed_int} kph right past the keeper!",
                f"Off the backboard and in! {scorer_name} with tremendous composure to slot it home!",
            ]
            line = random.choice(options)

        return {
            "speaker": speaker,
            "text": line,
            "exaggeration": 0.85,
            "priority": "high",
        }

    # =========================================================================
    # 3. SAVE COMMENTARY (Epic Stops)
    # =========================================================================
    def generate_save_commentary(self, defender_name: str, team_name: str) -> Dict[str, Any]:
        speaker = self.get_next_speaker("caster_one")
        options = [
            f"What a save by {defender_name}! Denied right on the goal line!",
            f"How has {defender_name} kept that out?! A heroic goal-line stand for {team_name}!",
            f"Full stretch from {defender_name} to keep {team_name} in this contest!",
            f"Unbelievable recovery from {defender_name}! That was destined for the top corner!",
        ]
        return {
            "speaker": speaker,
            "text": random.choice(options),
            "exaggeration": 0.80,
            "priority": "high",
        }

    # =========================================================================
    # 4. DEMOLITIONS & BUMPS
    # =========================================================================
    def generate_demo_commentary(self, attacker: str, victim: str) -> Dict[str, Any]:
        speaker = self.get_next_speaker()
        options = [
            f"Boom! {attacker} completely demolishes {victim} on rotation!",
            f"Savage physical play from {attacker}! {victim} is wiped off the pitch!",
            f"{attacker} clears the path with a brutal demo on {victim}!",
        ]
        return {
            "speaker": speaker,
            "text": random.choice(options),
            "exaggeration": 0.70,
            "priority": "medium",
        }

    def generate_bump_commentary(self, bumper: str, victim: str) -> Dict[str, Any]:
        speaker = self.get_next_speaker()
        options = [
            f"Heavy bump from {bumper}! {victim} gets completely displaced!",
            f"{bumper} with the physical disruption, throwing {victim} off their line!",
            f"Aggressive challenge there, {bumper} knocks {victim} clean out of the play!",
        ]
        return {
            "speaker": speaker,
            "text": random.choice(options),
            "exaggeration": 0.60,
            "priority": "low",
        }

    # =========================================================================
    # 5. PASSING PLAYS
    # =========================================================================
    def generate_pass_commentary(self, passer: str, receiver: str, team: str) -> Dict[str, Any]:
        speaker = self.get_next_speaker("caster_one")
        options = [
            f"Lovely vision from {passer}, finding {receiver} across the middle!",
            f"{passer} drops it infield for {receiver}, keeping the offensive pressure alive!",
            f"Great link-up play between {passer} and {receiver} for {team}!",
            f"{passer} dishes it off to {receiver}, looking for the one-two combination!",
        ]
        return {
            "speaker": speaker,
            "text": random.choice(options),
            "exaggeration": 0.60,
            "priority": "low",
        }

    # =========================================================================
    # 6. AERIAL CONTESTS & AIR DRIBBLES
    # =========================================================================
    def generate_aerial_commentary(self, player: str, team: str) -> Dict[str, Any]:
        speaker = self.get_next_speaker()
        options = [
            f"{player} launches up high, winning the aerial challenge with authority!",
            f"Look at the mechanics from {player}, climbing up to the ceiling for that touch!",
            f"Tremendous vertical reach from {player} to intercept that clear!",
            f"{player} goes airborne, reading the awkward bounce off the sidewall!",
        ]
        return {
            "speaker": speaker,
            "text": random.choice(options),
            "exaggeration": 0.65,
            "priority": "low",
        }

    # =========================================================================
    # 7. 50-50 CHALLENGES
    # =========================================================================
    def generate_fifty_fifty_commentary(self, winner: str, loser: str) -> Dict[str, Any]:
        speaker = self.get_next_speaker()
        options = [
            f"Huge 50-50 in the midfield, and {winner} gets the better of {loser}!",
            f"{winner} clamps down on the challenge against {loser}, winning the deflection!",
            f"Solid 50-50 block from {winner}, refusing to give {loser} any room!",
        ]
        return {
            "speaker": speaker,
            "text": random.choice(options),
            "exaggeration": 0.60,
            "priority": "low",
        }

    # =========================================================================
    # 8. CLOCK PRESSURE MILESTONES
    # =========================================================================
    def generate_clock_commentary(self, time_left: int, blue_score: int, orange_score: int) -> Dict[str, Any]:
        speaker = self.get_next_speaker()
        diff = abs(blue_score - orange_score)
        leading_team = self.home_team if blue_score > orange_score else (self.away_team if orange_score > blue_score else "Tied")

        if time_left <= 35:
            if leading_team == "Tied":
                line = "Thirty seconds left on the clock! Next goal wins it or we are heading to overtime!"
            else:
                line = f"Just thirty seconds remaining! {leading_team} defending with everything they have!"
        else: # ~60s
            if leading_team == "Tied":
                line = "One minute remaining! Tension is palpable across the arena, all square right now!"
            else:
                line = f"One minute on the clock! {leading_team} hold a {diff} goal cushion as time ticks away!"

        return {
            "speaker": speaker,
            "text": line,
            "exaggeration": 0.75,
            "priority": "high",
        }

    # =========================================================================
    # 9. CONTINUOUS DYNAMIC YAPPING & MIDFIELD BANTER
    # =========================================================================
    def generate_continuous_yap(
        self,
        blue_score: int,
        orange_score: int,
        time_left: int,
        series_blue: int = 0,
        series_orange: int = 0,
        notable_player: str = "",
    ) -> Dict[str, Any]:
        speaker = self.get_next_speaker()
        partner = "Caster One" if speaker == "caster_two" else "Caster Two"
        diff = blue_score - orange_score
        mins = time_left // 60
        secs = time_left % 60

        # Pick random player if notable_player not specified
        all_p = self.get_all_players()
        focus_player = notable_player if (notable_player and notable_player != "Player") else (random.choice(all_p) if all_p else "they")

        topics = ["boost", "tactics", "momentum", "player", "series"]
        available_topics = [t for t in topics if t != self.last_topic]
        topic = random.choice(available_topics)
        self.last_topic = topic

        if topic == "boost":
            options = [
                f"The boost starvation right now is fascinating. You can see how aggressively the midfield pads are being hoovered up.",
                f"If you're defending on zero boost in this lobby against SSLs, you are playing with absolute fire, {partner}.",
                f"Look at the boost management here. Staying above fifty boost on rotation is keeping this attack relentless.",
                f"{focus_player} collecting that back corner boost, starving the counter-attack before it can develop.",
            ]
            text = random.choice(options)

        elif topic == "player":
            options = [
                f"You have to praise the positioning from {focus_player}. Always reading the play as the third man.",
                f"{focus_player} has been instrumental in keeping the defensive structure locked down today.",
                f"Every time {focus_player} gets a touch, you feel like something dangerous could happen.",
                f"Notice how quickly {focus_player} resets off the backboard. Top tier recovery mechanics.",
            ]
            text = random.choice(options)

        elif topic == "momentum":
            if diff == 0:
                text = f"All square at {blue_score} apiece with {mins} minutes left. One defensive breakdown is going to decide this."
            elif diff > 0:
                text = f"{self.home_team} holding a {diff} goal advantage, but {self.away_team} are pushing their challenges higher up the pitch."
            else:
                text = f"{self.away_team} looking very comfortable with the lead, controlling the clock and forcing safe 50-50s."

        elif topic == "series":
            if self.game_number > 1:
                text = f"We are in Game {self.game_number} of this {self.series_fmt}, {partner}. The mental stamina required at this level is unreal."
            else:
                text = f"Opening game of the series, {partner}. Finding your footing and setting the physical tone early is everything."

        else: # tactics
            options = [
                f"The transition speed in this match is absurd, {partner}. One bad touch and the counter-attack is already in your box.",
                f"I really like the discipline on the back post rotations. Nobody overcommitting, forcing the awkward angles.",
                f"Notice how both teams are prioritizing early challenges. They refuse to give each other room for any air dribbles.",
                f"Look at the spacing across the pitch. Textbook three-man rotation on display.",
            ]
            text = random.choice(options)

        return {
            "speaker": speaker,
            "text": text,
            "exaggeration": 0.58,
            "priority": "ambient",
        }
