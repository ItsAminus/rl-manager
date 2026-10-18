import React from 'react';
import './FormIndicator.css';

interface FormIndicatorProps {
  form: number; // 0-100
  history?: ('W' | 'L' | 'D')[];
  showNumber?: boolean;
}

export const FormIndicator: React.FC<FormIndicatorProps> = ({
  form,
  history = [],
  showNumber = true,
}) => {
  const getDelta = (val: number) => {
    const diff = Math.round((val - 50) / 5);
    if (diff > 0) return `+${diff}`;
    if (diff < 0) return `${diff}`;
    return '=';
  };

  const getFormClass = (val: number) => {
    if (val >= 70) return 'form-hot';
    if (val >= 55) return 'form-good';
    if (val <= 30) return 'form-cold';
    if (val <= 45) return 'form-poor';
    return 'form-neutral';
  };

  return (
    <div className="form-indicator-container">
      {history && history.length > 0 && (
        <div className="form-pills">
          {history.slice(-5).map((res, i) => (
            <span
              key={i}
              className={`form-dot result-${res.toLowerCase()}`}
              title={res === 'W' ? 'Win' : res === 'L' ? 'Loss' : 'Draw'}
            >
              {res}
            </span>
          ))}
        </div>
      )}
      {showNumber && (
        <span className={`form-score ${getFormClass(form)}`}>
          {form} <small>({getDelta(form)})</small>
        </span>
      )}
    </div>
  );
};
