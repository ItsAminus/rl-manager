import { describe, it, expect } from 'vitest';
import { MatchHandoff } from '../src/services/match-handoff';
describe('match process handoff', () => {
  it('keeps next game locked after final score while audio and cleanup run', () => {
    const h = new MatchHandoff(),
      token = h.start();
    h.stage(token, { completed: true, blueScore: 0, orangeScore: 5 });
    expect(() => h.start()).toThrow('still finishing');
    expect(h.close(token)).toMatchObject({ blueScore: 0, orangeScore: 5 });
    expect(h.start()).toBe(2);
  });
  it('ignores callbacks and results from an older process', () => {
    const h = new MatchHandoff(),
      old = h.start();
    h.close(old);
    const current = h.start();
    h.stage(old, { blueScore: 99 });
    expect(h.close(old, { blueScore: 99 })).toBeUndefined();
    expect(h.owns(current)).toBe(true);
    expect(h.close(current, { blueScore: 1 })).toEqual({ blueScore: 1 });
  });
});
