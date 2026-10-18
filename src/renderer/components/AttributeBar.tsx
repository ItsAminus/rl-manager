import React from 'react';
import './AttributeBar.css';

interface AttributeBarProps {
  label: string;
  value: number; // 1-99
  max?: number;
  highlight?: boolean;
}

export const AttributeBar: React.FC<AttributeBarProps> = ({
  label,
  value,
  max = 99,
  highlight = false,
}) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const getColorClass = (val: number) => {
    if (val >= 90) return 'attr-tier-s';
    if (val >= 85) return 'attr-tier-a';
    if (val >= 78) return 'attr-tier-b';
    if (val >= 68) return 'attr-tier-c';
    return 'attr-tier-d';
  };

  return (
    <div className={`attribute-bar-row ${highlight ? 'highlight' : ''}`}>
      <span className="attribute-bar-label">{label}</span>
      <div className="attribute-bar-track">
        <div
          className={`attribute-bar-fill ${getColorClass(value)}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className={`attribute-bar-value ${getColorClass(value)}`}>{value}</span>
    </div>
  );
};
