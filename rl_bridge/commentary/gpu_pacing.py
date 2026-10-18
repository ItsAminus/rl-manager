"""Cooperative gaps between inference steps; never changes the generated PCM."""
import functools
import time


class InferencePacer:
    def __init__(self, synchronize, clock=time.monotonic, sleep=time.sleep,
                 duty=.35, burst=.004, max_pause=.05):
        self.synchronize, self.clock, self.sleep = synchronize, clock, sleep
        self.duty, self.burst, self.max_pause = duty, burst, max_pause
        self.active = False
        self.work = 0
        self.pause_debt = 0
        self.yield_seconds = 0

    def begin(self, active):
        self.active = active
        self.work = self.yield_seconds = self.pause_debt = 0

    def wrap(self, forward):
        @functools.wraps(forward)
        def paced(*args, **kwargs):
            if not self.active:
                return forward(*args, **kwargs)
            started = self.clock()
            result = forward(*args, **kwargs)
            # Wait for this step, so sleeping actually leaves a GPU gap instead
            # of merely delaying the CPU while queued kernels keep running.
            self.synchronize()
            self.work += max(0, self.clock() - started)
            if self.work >= self.burst or self.pause_debt:
                self.pause_debt += self.work * (1-self.duty)/self.duty
                pause = min(self.max_pause, self.pause_debt)
                self.sleep(pause)
                self.yield_seconds += pause
                self.pause_debt = max(0, self.pause_debt - pause)
                self.work = 0
            return result
        return paced


def install_model_pacing(model, pacer):
    """Yield between small blocks, rather than after a whole acoustic decoder."""
    stages = []
    transformer = model.t3.tfmr
    layers = getattr(transformer, 'layers', None)
    stages.extend(list(layers) if layers is not None and len(layers) else [transformer])
    estimator = model.s3gen.flow.decoder.estimator
    acoustic = []
    for group in ('down_blocks', 'mid_blocks', 'up_blocks'):
        for block in getattr(estimator, group, ()):
            acoustic.append(block[0])  # residual block
            acoustic.extend(list(block[1]))  # individual transformer blocks
            if len(block) > 2:
                acoustic.append(block[2])  # up/downsample
    if acoustic:
        acoustic.extend(getattr(estimator, name) for name in ('final_block', 'final_proj')
                        if hasattr(estimator, name))
        stages.extend(acoustic)
    else:
        stages.append(estimator)
    seen = set()
    for stage in stages:
        if id(stage) not in seen:
            stage.forward = pacer.wrap(stage.forward)
            seen.add(id(stage))
    return len(seen)
