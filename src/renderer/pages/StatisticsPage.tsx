import React, { useEffect, useState } from 'react';
import { RatingBadge } from '../components/RatingBadge';
import './StatisticsPage.css';

interface StatRow {
  rank: number;
  gamertag: string;
  teamName: string;
  ovr: number;
  games: number;
  goals: number;
  assists: number;
  saves: number;
  shots: number;
  demos: number;
  mvps: number;
}

export const StatisticsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'goals' | 'assists' | 'saves' | 'demos'>('goals');
  const [statsData, setStatsData] = useState<StatRow[]>([
    { rank: 1, gamertag: 'zen', teamName: 'Team Vitality', ovr: 95, games: 12, goals: 21, assists: 14, saves: 28, shots: 44, demos: 11, mvps: 8 },
    { rank: 2, gamertag: 'Vatira', teamName: 'Karmine Corp', ovr: 94, games: 12, goals: 18, assists: 16, saves: 31, shots: 39, demos: 8, mvps: 7 },
    { rank: 3, gamertag: 'dralii', teamName: 'BDS', ovr: 92, games: 11, goals: 17, assists: 11, saves: 22, shots: 35, demos: 14, mvps: 5 },
    { rank: 4, gamertag: 'Atow', teamName: 'Karmine Corp', ovr: 91, games: 12, goals: 15, assists: 18, saves: 19, shots: 31, demos: 12, mvps: 4 },
    { rank: 5, gamertag: 'Firstkiller', teamName: 'Gen.G Mobil1', ovr: 93, games: 10, goals: 15, assists: 9, saves: 20, shots: 33, demos: 9, mvps: 5 },
    { rank: 6, gamertag: 'BeastMode', teamName: 'G2 Stride', ovr: 93, games: 10, goals: 14, assists: 15, saves: 23, shots: 30, demos: 7, mvps: 4 },
    { rank: 7, gamertag: 'Daniel', teamName: 'G2 Stride', ovr: 93, games: 10, goals: 13, assists: 12, saves: 27, shots: 28, demos: 10, mvps: 4 },
    { rank: 8, gamertag: 'Rw9', teamName: 'Team Falcons', ovr: 92, games: 11, goals: 11, assists: 14, saves: 35, shots: 24, demos: 6, mvps: 5 },
  ]);

  const sortedData = [...statsData].sort((a, b) => {
    if (activeTab === 'goals') return b.goals - a.goals;
    if (activeTab === 'assists') return b.assists - a.assists;
    if (activeTab === 'saves') return b.saves - a.saves;
    return b.demos - a.demos;
  });

  return (
    <div className="statistics-page">
      <div className="statistics-header">
        <div>
          <h1 className="page-heading">GLOBAL ESPORTS LEADERBOARDS</h1>
          <p className="page-subheading">
            Official season player statistics across RLCS regional tournaments and international majors.
          </p>
        </div>
      </div>

      <div className="stats-metric-tabs">
        <button
          className={`stat-tab ${activeTab === 'goals' ? 'active' : ''}`}
          onClick={() => setActiveTab('goals')}
        >
          ⚽ Top Goal Scorers
        </button>
        <button
          className={`stat-tab ${activeTab === 'assists' ? 'active' : ''}`}
          onClick={() => setActiveTab('assists')}
        >
          🎯 Top Playmakers (Assists)
        </button>
        <button
          className={`stat-tab ${activeTab === 'saves' ? 'active' : ''}`}
          onClick={() => setActiveTab('saves')}
        >
          🛡️ Top Goalkeepers (Saves)
        </button>
        <button
          className={`stat-tab ${activeTab === 'demos' ? 'active' : ''}`}
          onClick={() => setActiveTab('demos')}
        >
          💥 Demolition Leaders
        </button>
      </div>

      <div className="stats-table-card">
        <table className="stats-leaderboard-table">
          <thead>
            <tr>
              <th>RANK</th>
              <th>PLAYER</th>
              <th>ORGANIZATION</th>
              <th>OVR</th>
              <th>GAMES</th>
              <th>GOALS</th>
              <th>ASSISTS</th>
              <th>SAVES</th>
              <th>SHOTS</th>
              <th>DEMOS</th>
              <th>MVPS</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, idx) => (
              <tr key={row.gamertag} className={idx === 0 ? 'leader-row' : ''}>
                <td className="rank-col">#{idx + 1}</td>
                <td>
                  <strong className="stat-gamertag">{row.gamertag}</strong>
                </td>
                <td className="text-secondary">{row.teamName}</td>
                <td>
                  <RatingBadge rating={row.ovr} size="sm" />
                </td>
                <td>{row.games}</td>
                <td className={activeTab === 'goals' ? 'highlight-stat-col' : ''}>{row.goals}</td>
                <td className={activeTab === 'assists' ? 'highlight-stat-col' : ''}>{row.assists}</td>
                <td className={activeTab === 'saves' ? 'highlight-stat-col' : ''}>{row.saves}</td>
                <td>{row.shots}</td>
                <td className={activeTab === 'demos' ? 'highlight-stat-col' : ''}>{row.demos}</td>
                <td>{row.mvps}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
