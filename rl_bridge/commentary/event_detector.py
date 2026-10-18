"""
Live 120Hz Telemetry Event Detector for Rocket League.
Processes RLBot GameTickPacket streams in real-time, extracting goals,
epic saves, clears, shots, dribbles, aerial contests, and demolitions
for energetic, instant broadcast commentary.
"""

import math
import time
from typing import Optional, Dict, Any

class EventDetector:
    def __init__(self, dispatcher):
        self.dispatcher = dispatcher

        # State tracking
        self.last_blue_score = 0
        self.last_orange_score = 0
        self.last_ball_touch_player = "Player"
        self.last_ball_touch_team = -1
        self.last_ball_touch_time = 0.0

        # Dribble detection tracking
        self.dribble_touch_count = 0
        self.last_dribble_player = ""
        self.last_dribble_time = 0.0

        # Car states for demolition detection
        self.demolished_cars = {}  # car_index -> bool

        # Overtime & 0-seconds flags
        self.zero_seconds_announced = False
        self.overtime_announced = False

        # Event cooldowns (anti-spam)
        self.last_goal_time = 0.0
        self.last_save_time = 0.0
        self.last_clear_time = 0.0
        self.last_shot_time = 0.0
        self.last_dribble_event_time = 0.0
        self.last_aerial_time = 0.0
        self.last_demo_time = 0.0
        self.last_bump_time = 0.0
        self.last_micro_event_time = 0.0

        # Save detection tracking
        self.danger_zone_active = False
        self.danger_target_team = -1

    def process_packet(self, packet):
        if not packet or packet.num_cars == 0:
            return

        game_info = packet.game_info
        ball = packet.game_ball
        ball_pos = ball.physics.location
        ball_vel = ball.physics.velocity
        now = time.time()

        blue_score = packet.teams[0].score if packet.num_teams > 0 else 0
        orange_score = packet.teams[1].score if packet.num_teams > 1 else 0
        time_left = int(game_info.game_time_remaining)

        touch = ball.latest_touch if hasattr(ball, 'latest_touch') else None

        # -------------------------------------------------------------
        # 1. GOAL DETECTION (Triggered the exact tick score increments)
        # -------------------------------------------------------------
        if blue_score > self.last_blue_score or orange_score > self.last_orange_score or (abs(ball_pos.y) > 5120 and now - self.last_goal_time > 6.0):
            self.last_goal_time = now
            scoring_team = "Blue" if (blue_score > self.last_blue_score or ball_pos.y > 5120) else "Orange"
            
            speed_units = math.sqrt(ball_vel.x**2 + ball_vel.y**2 + ball_vel.z**2)
            speed_kph = speed_units * 0.036

            scorer_name = self.last_ball_touch_player or ("Elevate" if scoring_team == "Blue" else "Gladiators")

            self.last_blue_score = blue_score
            self.last_orange_score = orange_score

            self.dispatcher.on_goal_event(
                scorer=scorer_name,
                team=scoring_team,
                speed_kph=speed_kph,
                blue_score=blue_score,
                orange_score=orange_score,
                time_left=time_left
            )
            return

        # -------------------------------------------------------------
        # 2. SAVE DETECTION (True Goal-Line Stops Only)
        # -------------------------------------------------------------
        if now - self.last_save_time > 10.0 and now - self.last_goal_time > 5.0:
            is_blue_danger = ball_vel.y < -1200 and ball_pos.y < -4500 and abs(ball_pos.x) < 1000 and ball_pos.z < 650
            is_orange_danger = ball_vel.y > 1200 and ball_pos.y > 4500 and abs(ball_pos.x) < 1000 and ball_pos.z < 650

            if is_blue_danger:
                self.danger_zone_active = True
                self.danger_target_team = 0
            elif is_orange_danger:
                self.danger_zone_active = True
                self.danger_target_team = 1

            if self.danger_zone_active and touch:
                if touch.team == self.danger_target_team:
                    if (self.danger_target_team == 0 and ball_vel.y > 200) or (self.danger_target_team == 1 and ball_vel.y < -200):
                        self.danger_zone_active = False
                        self.last_save_time = now
                        defender_team = "Blue" if touch.team == 0 else "Orange"
                        self.dispatcher.on_save_event(touch.player_name, defender_team)
                        return

        # -------------------------------------------------------------
        # 3. TOUCH EVENTS: CLEARS, SHOTS, DRIBBLES, AERIALS, PASSES
        # -------------------------------------------------------------
        if touch and touch.time_seconds > self.last_ball_touch_time:
            prev_player = self.last_ball_touch_player
            prev_team = self.last_ball_touch_team
            time_delta = touch.time_seconds - self.last_ball_touch_time

            self.last_ball_touch_player = touch.player_name
            self.last_ball_touch_team = touch.team
            self.last_ball_touch_time = touch.time_seconds
            team_str = "Blue" if touch.team == 0 else "Orange"

            # Check dribble progression (consecutive touches by same player along ground)
            if prev_player == touch.player_name and time_delta < 1.3 and ball_pos.z < 250:
                self.dribble_touch_count += 1
                if self.dribble_touch_count >= 2 and now - self.last_dribble_event_time > 8.0 and now - self.last_goal_time > 4.0:
                    self.last_dribble_event_time = now
                    self.last_micro_event_time = now
                    self.dispatcher.on_dribble_event(touch.player_name, team_str)
            else:
                self.dribble_touch_count = 1

            # Check defensive clear
            is_blue_clear = touch.team == 0 and ball_pos.y < -3400 and ball_vel.y > 1000
            is_orange_clear = touch.team == 1 and ball_pos.y > 3400 and ball_vel.y < -1000
            if (is_blue_clear or is_orange_clear) and now - self.last_clear_time > 7.0 and now - self.last_goal_time > 4.0:
                self.last_clear_time = now
                self.last_micro_event_time = now
                self.dispatcher.on_clear_event(touch.player_name, team_str)

            # Check dangerous shot on net (speed > 80 km/h heading toward opposing goal)
            speed_units = math.sqrt(ball_vel.x**2 + ball_vel.y**2 + ball_vel.z**2)
            is_blue_shot = touch.team == 0 and ball_vel.y > 1800 and ball_pos.y > -2000
            is_orange_shot = touch.team == 1 and ball_vel.y < -1800 and ball_pos.y < 2000
            if (is_blue_shot or is_orange_shot) and speed_units > 2200 and now - self.last_shot_time > 6.0 and now - self.last_goal_time > 4.0:
                self.last_shot_time = now
                self.last_micro_event_time = now
                self.dispatcher.on_shot_event(touch.player_name, team_str)

            # Check aerial challenge (height > 500)
            elif ball_pos.z > 500 and now - self.last_aerial_time > 6.0 and now - self.last_micro_event_time > 3.5:
                self.last_aerial_time = now
                self.last_micro_event_time = now
                self.dispatcher.on_aerial_event(touch.player_name, team_str)

            # Check pass (consecutive touches by different teammates)
            elif prev_team == touch.team and prev_player != touch.player_name and time_delta < 2.5 and now - self.last_micro_event_time > 4.5:
                self.last_micro_event_time = now
                self.dispatcher.on_pass_event(prev_player, touch.player_name, team_str)

        # -------------------------------------------------------------
        # 4. DEMOLITIONS & BUMPS
        # -------------------------------------------------------------
        for i in range(packet.num_cars):
            car = packet.game_cars[i]
            prev_demolished = self.demolished_cars.get(i, False)
            if car.is_demolished and not prev_demolished and now - self.last_demo_time > 4.0:
                self.last_demo_time = now
                attacker_name = "Opponent"
                min_dist = 99999
                for j in range(packet.num_cars):
                    if j != i and packet.game_cars[j].team != car.team:
                        other = packet.game_cars[j]
                        dist = math.sqrt(
                            (other.physics.location.x - car.physics.location.x)**2 +
                            (other.physics.location.y - car.physics.location.y)**2
                        )
                        if dist < min_dist:
                            min_dist = dist
                            attacker_name = other.name

                self.dispatcher.on_demo_event(attacker_name, car.name)
            self.demolished_cars[i] = car.is_demolished

        # -------------------------------------------------------------
        # 5. ZERO SECONDS & OVERTIME
        # -------------------------------------------------------------
        if time_left == 0 and not self.zero_seconds_announced:
            if not game_info.is_overtime and ball_pos.z > 140:
                self.zero_seconds_announced = True
                self.dispatcher.on_zero_seconds()

        if game_info.is_overtime and not self.overtime_announced:
            self.overtime_announced = True
            self.dispatcher.on_overtime()

        # -------------------------------------------------------------
        # 6. CONTINUOUS ANALYSIS & BANTER ("YAPPING")
        # -------------------------------------------------------------
        if now - self.last_goal_time > 4.0:
            self.dispatcher.on_ambient_yap(
                blue_score=blue_score,
                orange_score=orange_score,
                time_left=time_left,
                notable_player=self.last_ball_touch_player
            )
