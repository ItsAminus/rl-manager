// ============================================================
// RL Manager — Real Pro Player Avatar & Image Registry
// ============================================================

import {playerPortrait} from '../../services/player-portrait';
import {publicAssetUrl} from './public-assets';
export function getPlayerPhotoUrl(gamertag?: string,playerId?:string): string | null {
  const photo=playerPortrait(gamertag,playerId)?.url;
  return photo?publicAssetUrl(photo):null;
}
export function getPlayerPhotoCredit(gamertag: string,playerId?:string) {
  return playerPortrait(gamertag,playerId)?.source||null;
}
export function getPlayerPhotoKind(gamertag: string,playerId?:string) {
  return playerPortrait(gamertag,playerId)?.kind||null;
}

export function generateEsportsSvgAvatar(gamertag: string, overall: number): string {
  const initials = gamertag.slice(0, 2).toUpperCase();
  const hue = Math.abs(
    gamertag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360
  );
  
  // Rating color accent
  const glowColor =
    overall >= 90 ? '#ffd700' :
    overall >= 85 ? '#00e676' :
    overall >= 80 ? '#00e5ff' :
    overall >= 75 ? '#b0bec5' : '#78909c';

  const escaped = initials.replace(/[<>&"']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" rx="16" fill="hsl(${hue},18%,20%)"/><text x="80" y="92" font-family="Segoe UI,sans-serif" font-weight="600" font-size="44" fill="#cfdbd7" text-anchor="middle">${escaped}</text></svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
