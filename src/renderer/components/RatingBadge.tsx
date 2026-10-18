import React from 'react';
import './RatingBadge.css';

interface RatingBadgeProps {
  rating: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showLabel?: boolean;
  label?: string;
}

export const RatingBadge: React.FC<RatingBadgeProps> = ({
  rating,
  size = 'md',
  showLabel = false,
  label = 'OVR',
}) => {
  const getTierClass = (val: number) => {
    if (val >= 90) return 'tier-s'; // Elite World Class (Gold)
    if (val >= 85) return 'tier-a'; // Strong RLCS (Emerald / Bright Green)
    if (val >= 80) return 'tier-b'; // Mid Pro (Cyan / Electric Blue)
    if (val >= 75) return 'tier-c'; // Bubble / Fringe (Purple / Silver)
    return 'tier-d'; // Prospect / Developing (Slate / Gray)
  };

  return (
    <div className={`rating-badge ${getTierClass(rating)} size-${size}`}>
      {showLabel && <span className="rating-badge-label">{label}</span>}
      <span className="rating-badge-value">{rating}</span>
    </div>
  );
};
