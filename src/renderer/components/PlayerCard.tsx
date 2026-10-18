import React from 'react';
import { RatingBadge } from './RatingBadge';
import { Player } from '../../types';
import './PlayerCard.css';

interface PlayerCardProps {
  player: Player;
  onClick?: () => void;
  selected?: boolean;
  roleLabel?: string;
}

export const PlayerCard: React.FC<PlayerCardProps> = ({
  player,
  onClick,
  selected = false,
  roleLabel,
}) => {
  return (
    <div
      className={`player-card ${selected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <div className="player-card-header">
        <RatingBadge rating={player.overall} size="md" />
        {roleLabel && <span className="player-role-tag">{roleLabel}</span>}
      </div>

      <div className="player-card-info">
        <div className="player-gamertag">{player.gamertag}</div>
        <div className="player-realname">{player.realName || player.nationality}</div>
      </div>

      <div className="player-card-meta">
        <span className="player-tendency-badge">{player.preferredTendency}</span>
        <span className="player-age">Age {player.age}</span>
      </div>
    </div>
  );
};
