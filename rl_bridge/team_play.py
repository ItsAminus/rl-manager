"""Conservative ground support and teammate collision avoidance around bot policy."""
from local_performance import copy_controls
import math
from player_style import style_profile


def xy(location):
    return location.x, location.y


def gap(a, b):
    return math.hypot(a[0]-b[0], a[1]-b[1])


class TeamPlay:
    def __init__(self, index, profile):
        self.index, self.profile = index, profile
        self.style = profile.get('groundStyle') or style_profile(profile)
        if profile.get('performance'):
            self.style=style_profile({**profile,'tendency':profile['performance']['role']})
            cohesion=profile['performance']['cohesion']
            self.style['yieldMargin']=max(90,self.style['yieldMargin']+(0.65-cohesion)*200)
            self.style['supportWidth']=min(.9,self.style['supportWidth']+(cohesion-.5)*.15)

    def apply(self, packet, controls):
        if not hasattr(packet, 'num_cars') or self.index >= packet.num_cars:
            return controls
        car, info = packet.game_cars[self.index], packet.game_info
        if (not info.is_round_active or info.is_kickoff_pause or car.is_demolished or
                not car.has_wheel_contact or controls.jump or car.physics.location.z > 80):
            return controls  # never corrupt kickoff scripts, aerials or flips
        pos, vel, ball = xy(car.physics.location), xy(car.physics.velocity), xy(packet.game_ball.physics.location)
        teammates = [(i, c) for i, c in enumerate(packet.game_cars[:packet.num_cars])
                     if i != self.index and c.team == car.team and not c.is_demolished]
        predicted = (pos[0]+vel[0]*.25, pos[1]+vel[1]*.25)
        for index, mate in teammates:
            mp, mv = xy(mate.physics.location), xy(mate.physics.velocity)
            future = (mp[0]+mv[0]*.25, mp[1]+mv[1]*.25)
            # Only the yielding car changes controls; never both cars brake.
            if (gap(pos, mp) < 650 and gap(predicted, future) < 155 and
                    gap(predicted, future) < gap(pos, mp)-30 and
                    (not mate.is_bot or index < self.index)):
                result = copy_controls(controls)
                result.boost, result.throttle = False, -.35
                side = (mp[0]-pos[0]) * math.sin(car.physics.rotation.yaw) - (mp[1]-pos[1]) * math.cos(car.physics.rotation.yaw)
                result.steer = .6 if side > 0 else -.6
                return result
        own_net = (0, -5120 if car.team == 0 else 5120)
        if packet.game_ball.physics.location.z > 400 or gap(ball, own_net) < 1700:
            return controls  # don't second-guess an immediate goal-line defence
        own_gap = gap(pos, ball)
        if not 400 < own_gap < 1600:
            return controls
        approaching = lambda p, v: (v[0]*(ball[0]-p[0])+v[1]*(ball[1]-p[1])) / max(1, gap(p, ball))
        closer = [(i, c) for i, c in teammates if gap(xy(c.physics.location), ball) < own_gap-self.style['yieldMargin'] and
                  approaching(xy(c.physics.location), xy(c.physics.velocity)) > 250]
        if closer and approaching(pos, vel) > 250:
            result = copy_controls(controls)
            distance = self.style['supportDistance']
            target = (max(-3000, min(3000, ball[0]*self.style['supportWidth'])),
                      max(-4200, min(4200, ball[1] + (-distance if car.team == 0 else distance))))
            heading = math.atan2(target[1]-pos[1], target[0]-pos[0]) - car.physics.rotation.yaw
            heading = (heading+math.pi) % (2*math.pi)-math.pi
            result.steer = max(-1, min(1, heading*2))
            result.boost, result.throttle, result.handbrake = False, .65, abs(heading) > 2
            return result
        return controls
