"""A deliberately basic ground-only Bronze policy for condition-aware careers."""
import math
from rlbot.agents.base_agent import BaseAgent,SimpleControllerState

class CareerRookie(BaseAgent):
    def get_output(self,packet):
        if self.index>=packet.num_cars:return SimpleControllerState()
        car=packet.game_cars[self.index];ball=packet.game_ball.physics.location;pos=car.physics.location
        angle=math.atan2(ball.y-pos.y,ball.x-pos.x)-car.physics.rotation.yaw
        angle=(angle+math.pi)%(2*math.pi)-math.pi
        # No aerials, flips or boost mechanics. It chases the ground ball and
        # turns before accelerating, providing a real low-level policy ceiling.
        return SimpleControllerState(steer=max(-1,min(1,angle*2)),throttle=.8 if abs(angle)<.8 else .35,handbrake=abs(angle)>2.2)
