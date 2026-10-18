// Career balance presets, not a claim that OVR equals ranked MMR.
export const PATH_RANKS = [
  { rank: 'Bronze', start: 52, opposition: 54 },
  { rank: 'Silver', start: 61, opposition: 62 },
  { rank: 'Gold', start: 71, opposition: 72 },
  { rank: 'Platinum', start: 76, opposition: 77 },
  { rank: 'Diamond', start: 80, opposition: 82 },
  { rank: 'Champion', start: 80, opposition: 86 },
  { rank: 'Grand Champion', start: 80, opposition: 90 },
  { rank: 'Supersonic Legend', start: 80, opposition: 96 },
] as const;
export function pathRank(rank: string) {
  const value = PATH_RANKS.find((r) => r.rank === rank);
  if (!value) throw Error('Choose your real Rocket League rank.');
  return value;
}
const BASE_CHALLENGES = [
  {
    key: 'first_win',
    title: 'First taste of victory',
    description: 'Win your first game.',
    target: 1,
    xp: 80,
  },
  {
    key: 'first_sweep',
    title: 'First clean sweep',
    description: 'Win a series without losing a game.',
    target: 1,
    xp: 120,
  },
  {
    key: 'games_10',
    title: 'Learning together',
    description: 'Play ten games. Losses count too.',
    target: 10,
    xp: 120,
  },
  {
    key: 'streak_5',
    title: 'Five games unbeaten',
    description: 'Win five games in a row.',
    target: 5,
    xp: 150,
  },
  {
    key: 'wins_25',
    title: 'Twenty-five wins earned',
    description: 'Earn 25 game wins.',
    target: 25,
    xp: 250,
  },
  {
    key: 'assists_20',
    title: 'Connected attack',
    description: 'Record 20 assists across your fixed squad.',
    target: 20,
    xp: 120,
  },
  {
    key: 'saves_30',
    title: 'Hold the line',
    description: 'Record 30 saves across your fixed squad.',
    target: 30,
    xp: 120,
  },
  {
    key: 'underdog_series',
    title: 'Against the odds',
    description: 'Beat a squad averaging at least five more OVR in a series.',
    target: 1,
    xp: 180,
  },
  {
    key: 'reverse_sweep',
    title: 'Never count us out',
    description: 'Come back from 0–2 to win a BO5 or BO7.',
    target: 1,
    xp: 240,
  },
] as const;

export const PATH_CHALLENGES: ReadonlyArray<{
  key: string;
  title: string;
  description: string;
  target: number;
  xp: number;
  boost?: boolean;
}> = [
  ...BASE_CHALLENGES,
  ...[
    ['games', 1, 75, 'First kickoff'],
    ['games', 3, 120, 'Finding our feet'],
    ['games', 5, 160, 'Built through adversity'],
    ['games', 25, 250, 'Putting in the hours'],
    ['games', 50, 350, 'Seasoned squad'],
    ['games', 100, 500, 'Hundred-game journey'],
    ['wins', 5, 140, 'Five wins earned'],
    ['wins', 10, 180, 'Building belief'],
    ['wins', 50, 400, 'Winning culture'],
    ['wins', 100, 600, 'A century of wins'],
    ['losses', 3, 150, 'Back to work'],
    ['losses', 10, 250, 'Never give up'],
    ['goals', 5, 100, 'Finding the net'],
    ['goals', 25, 180, 'Finishing school'],
    ['goals', 100, 350, 'Triple threat'],
    ['assists', 5, 100, 'An extra pass'],
    ['assists', 50, 250, 'Playing as one'],
    ['assists', 100, 350, 'Connected squad'],
    ['saves', 5, 100, 'Last line'],
    ['saves', 10, 130, 'Under pressure'],
    ['saves', 100, 300, 'The wall'],
    ['saves', 250, 450, 'Nothing gets through'],
    ['shots', 25, 120, 'Keep shooting'],
    ['shots', 100, 250, 'Making chances'],
    ['demos', 10, 140, 'Creating space'],
    ['demos', 50, 300, 'Physical presence'],
    ['close', 3, 160, 'Fine margins'],
    ['clean', 3, 200, 'Shut them out'],
    ['series', 5, 200, 'Series experience'],
    ['series', 20, 350, 'Battle tested'],
    ['streak', 3, 120, 'Three on the bounce'],
    ['streak', 10, 400, 'Unstoppable run'],
  ].map(([stat, target, xp, title]) => ({
    key: `${stat}_${target}`,
    title: String(title),
    target: Number(target),
    xp: Number(xp),
    description:
      stat === 'games'
        ? `Complete ${target} games. Wins and losses both count.`
        : stat === 'losses'
          ? `Learn from ${target} defeats. Keep playing; every result matters.`
          : stat === 'close'
            ? `Complete ${target} games decided by one goal, win or lose.`
            : stat === 'clean'
              ? `Win ${target} games without conceding.`
              : stat === 'series'
                ? `Complete ${target} series, win or lose.`
                : stat === 'streak'
                  ? `Win ${target} games in a row.`
                  : stat === 'wins'
                    ? `Win ${target} games.`
                    : `Record ${target} ${stat} across your squad.`,
    boost:
      (stat === 'games' && target === 5) ||
      (stat === 'saves' && target === 100) ||
      (stat === 'wins' && target === 50),
  })),
];
