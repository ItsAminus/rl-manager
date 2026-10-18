export function buildSeriesContext(format: unknown, games: any[], gameNumber: number) {
  const parsed = Number(String(format ?? 5).match(/\d+/)?.[0]);
  if (![1, 3, 5, 7, 9].includes(parsed)) throw new Error('Unsupported series format');
  const seen = new Set<number>();
  const history = games.filter(g => g.gameNumber < gameNumber)
    .sort((a, b) => a.gameNumber - b.gameNumber).map(g => {
      if (seen.has(g.gameNumber) || g.blueScore === g.orangeScore) {
        throw new Error('Series contains duplicate or tied game results');
      }
      seen.add(g.gameNumber);
      return { gameNumber: g.gameNumber, winner: g.blueScore > g.orangeScore ? 0 : 1 };
    });
  const blueWins = history.filter(g => g.winner === 0).length;
  const orangeWins = history.length - blueWins;
  if (Math.max(blueWins, orangeWins) >= Math.ceil(parsed / 2)) throw new Error('This series is already complete');
  if (gameNumber !== history.length + 1 || history.some((g, i) => g.gameNumber !== i + 1)) {
    throw new Error('Previous series game results must be saved before launching the next game');
  }
  return { bestOf: parsed, blueWins, orangeWins, gameNumber, history };
}
