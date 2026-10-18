import steamAvatars from '../../data/player-steam-avatars.json';
import scoreboardPhotos from '../../data/scoreboard-portraits.json';
import {playerPortrait} from './player-portrait';

// Scoreboard-specific crops preserve the original photos throughout RL Manager.
// Steam links are confirmed against the player's identity before caching them.
export function scoreboardPortrait(gamertag?:string, playerId?:string) {
  const portrait=playerPortrait(gamertag,playerId);
  const steam=playerId?(steamAvatars as Record<string,any>)[playerId]:null;
  const selected=portrait?.kind==='headshot'?portrait:steam?.path?
    {url:steam.path,source:steam.source,kind:'steam-avatar' as const}:portrait;
  if(!selected)return null;
  const prepared=playerId?(scoreboardPhotos as Record<string,any>)[playerId]:null;
  return prepared?.original===selected.url&&prepared?.source===selected.source?
    {...selected,url:prepared.path}:selected;
}
