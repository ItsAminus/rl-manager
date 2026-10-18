import React, { useEffect, useState } from 'react';
import { getPlayerPhotoUrl, getPlayerPhotoCredit, getPlayerPhotoKind, generateEsportsSvgAvatar } from '../utils/player-avatars';
import './PlayerAvatar.css';
import {scoreboardPortrait} from '../../services/scoreboard-portrait';
import {publicAssetUrl} from '../utils/public-assets';

interface PlayerAvatarProps {
  playerId?: string;
  gamertag: string;
  overall: number;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  className?: string;
  showBadge?: boolean;
  context?: 'profile' | 'scoreboard';
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  playerId,
  gamertag,
  overall,
  size = 'md',
  className = '',
  showBadge = false,
  context = 'profile',
}) => {
  const [imgError, setImgError] = useState<boolean>(false);
  // A qualifier player sharing a pro's tag is not proof of the same identity.
  const scoreboardPhoto=context==='scoreboard'?scoreboardPortrait(gamertag,playerId):null;
  const photoUrl = context==='scoreboard'?
    (scoreboardPhoto?.url?publicAssetUrl(scoreboardPhoto.url):null):getPlayerPhotoUrl(gamertag,playerId);
  useEffect(() => setImgError(false), [photoUrl]);
  const fallbackSvg = generateEsportsSvgAvatar(gamertag, overall);

  const tierClass =
    overall >= 90 ? 'tier-gold' :
    overall >= 85 ? 'tier-green' :
    overall >= 80 ? 'tier-blue' :
    overall >= 75 ? 'tier-silver' : 'tier-bronze';

  const useFallback = !photoUrl || imgError;

  return (
    <div className={`player-avatar-wrapper size-${size} ${tierClass} ${className}`}>
      <div className="player-avatar-frame">
        <img
          src={useFallback ? fallbackSvg : photoUrl}
          alt={useFallback ? `${gamertag} · portrait unavailable` : gamertag}
          title={useFallback ? 'No player photo available' : scoreboardPhoto?
            (scoreboardPhoto.kind==='headshot'?'Player headshot · ':scoreboardPhoto.kind==='steam-avatar'?'Steam avatar fallback · ':'Account avatar fallback · ')+scoreboardPhoto.source:
            (getPlayerPhotoKind(gamertag,playerId)==='headshot'?'Player headshot · ':'Account avatar fallback · ')+getPlayerPhotoCredit(gamertag,playerId)}
          className={`player-avatar-img ${useFallback ? 'is-svg' : 'is-photo'}`}
          style={!useFallback&&photoUrl?.includes('/player-headshots/')?{objectPosition:'center'}:undefined}
          onError={() => setImgError(true)}
          loading="lazy"
        />
      </div>
      {showBadge && (
        <div className={`player-avatar-ovr-tag ${tierClass}`}>
          {overall}
        </div>
      )}
    </div>
  );
};
