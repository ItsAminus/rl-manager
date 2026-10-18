import React from 'react';
import './RadarChart.css';

export interface RadarDataPoint {
  label: string;
  value: number; // 0 - 100
}

interface RadarChartProps {
  data: RadarDataPoint[];
  size?: number;
}

export const RadarChart: React.FC<RadarChartProps> = ({ data, size = 260 }) => {
  const center = size / 2;
  const radius = (size / 2) - 36;
  const total = data.length;

  if (total < 3) return null;

  // Compute coordinate for point at index
  const getCoordinates = (index: number, val: number) => {
    const angle = (Math.PI * 2 / total) * index - (Math.PI / 2);
    const r = (val / 100) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  // Polygon path for values
  const polygonPoints = data
    .map((d, i) => {
      const { x, y } = getCoordinates(i, d.value);
      return `${x},${y}`;
    })
    .join(' ');

  // Grid levels (20, 40, 60, 80, 100)
  const levels = [25, 50, 75, 100];

  return (
    <div className="radar-chart-wrapper" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="radar-svg">
        {/* Background Grid webs */}
        {levels.map((lvl) => {
          const webPoints = Array.from({ length: total })
            .map((_, i) => {
              const { x, y } = getCoordinates(i, lvl);
              return `${x},${y}`;
            })
            .join(' ');
          return (
            <polygon
              key={lvl}
              points={webPoints}
              className="radar-grid-web"
              fill={lvl === 100 ? 'rgba(36, 41, 56, 0.4)' : 'none'}
              stroke="#2d3343"
              strokeDasharray={lvl < 100 ? '3,3' : undefined}
            />
          );
        })}

        {/* Axis Spokes */}
        {data.map((_, i) => {
          const { x, y } = getCoordinates(i, 100);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke="#2d3343"
              strokeWidth="1"
            />
          );
        })}

        {/* Data Polygon */}
        <polygon
          points={polygonPoints}
          className="radar-data-polygon"
          fill="rgba(79, 195, 247, 0.25)"
          stroke="#4fc3f7"
          strokeWidth="2"
        />

        {/* Data Points */}
        {data.map((d, i) => {
          const { x, y } = getCoordinates(i, d.value);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="3.5"
              className="radar-data-dot"
              fill="#4fc3f7"
            />
          );
        })}

        {/* Axis Labels */}
        {data.map((d, i) => {
          const angle = (Math.PI * 2 / total) * i - (Math.PI / 2);
          const labelDist = radius + 20;
          const lx = center + labelDist * Math.cos(angle);
          const ly = center + labelDist * Math.sin(angle);

          return (
            <text
              key={i}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="central"
              className="radar-label"
            >
              {d.label} ({d.value})
            </text>
          );
        })}
      </svg>
    </div>
  );
};
