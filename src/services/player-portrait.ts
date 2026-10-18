import portraits from '../../data/player-portraits.json';
import registry from '../../data/broadcast-profiles.json';
import headshots from '../../data/player-headshots.json';

// Face photos are keyed by verified identity. Account icons are the last fallback.
export function playerPortrait(gamertag?:string,playerId?:string) {
  const profile=playerId?(registry.players as Record<string,any>)[playerId]:null;
  const headshot=playerId?(headshots as Record<string,any>)[playerId]:null;
  if(headshot?.path)return {url:headshot.path,source:headshot.source,kind:'headshot' as const};
  const key=(gamertag||'').toLowerCase().replace(/\.+$/,'');
  const normalized=({jstn:'justin',apparentlyjack:'appjack'} as Record<string,string>)[key]||key;
  const photo=(portraits as Record<string,any>)[normalized];
  if(!playerId&&photo?.path)return {url:photo.path,source:photo.source,kind:'headshot' as const};
  return profile?.avatarUrl?{url:profile.avatarUrl,source:profile.avatarSource,kind:'account-avatar' as const}:null;
}
