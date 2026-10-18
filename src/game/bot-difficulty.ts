export const BOT_DIFFICULTIES=['Easy','Medium','Hard'] as const;
export type BotDifficulty=typeof BOT_DIFFICULTIES[number];
// Legacy saves all used the full strength routing, regardless of the old
// economics label. Keep that behaviour until their manager explicitly changes it.
export function botDifficulty(value:unknown):BotDifficulty{
  const found=BOT_DIFFICULTIES.find(d=>d.toLowerCase()===String(value).toLowerCase());
  return found||'Hard';
}
