import titles from '../../data/player-titles.json';

// Identity-indexed public account rewards. No OVR, engine, or nickname fallback.
const verified = titles as Record<string, {title: string; source: string; titles: string[]}>;
export function playerTitle(playerId: string | undefined) {
  return playerId ? verified[playerId] || null : null;
}
