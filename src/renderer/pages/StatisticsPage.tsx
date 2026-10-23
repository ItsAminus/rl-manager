import React, { useEffect, useState } from 'react';
import { RatingBadge } from '../components/RatingBadge';
import './StatisticsPage.css';
import {useCareerStore} from '../../stores/careerStore';

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
  const [statsData,setStatsData]=useState<StatRow[]>([]);
  const {career,currentDate}=useCareerStore();
  useEffect(()=>{if(career)window.api.stats.getPlayerLeaderboard(activeTab,100).then((rows:any[])=>setStatsData(rows.map((r,i)=>({...r,rank:i+1,ovr:r.overall}))));},[career?.id,currentDate,activeTab]);

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
