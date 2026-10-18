import { describe, expect, it } from 'vitest';
import { buildSeriesContext } from './series-context';
describe('saved series context', () => {
  it('counts game wins rather than total goals', () => {
    expect(buildSeriesContext('BO5', [{ gameNumber: 1, blueScore: 8, orangeScore: 2 }], 2))
      .toMatchObject({ bestOf: 5, blueWins: 1, orangeWins: 0, gameNumber: 2 });
  });
  it('does not start game three of a completed best of three', () => {
    expect(() => buildSeriesContext('BO3', [1,2].map(gameNumber => ({ gameNumber, blueScore: 1, orangeScore: 0 })), 3)).toThrow('complete');
  });
  it('requires consecutive results and rejects ties or duplicate games', () => {
    expect(() => buildSeriesContext(7, [], 2)).toThrow('saved');
    expect(() => buildSeriesContext(7, [{gameNumber: 1, blueScore: 1, orangeScore: 1}], 2)).toThrow('tied');
    expect(() => buildSeriesContext(7, [1,1].map(gameNumber => ({gameNumber,blueScore:2,orangeScore:0})),3)).toThrow('duplicate');
  });
});
