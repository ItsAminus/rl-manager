import React from 'react';
import { useCareerStore } from '../../stores/careerStore';
import './FinancesPage.css';

export const FinancesPage: React.FC = () => {
  const { team, roster } = useCareerStore();

  const totalMonthlyWage = roster.reduce((sum, p) => sum + (p.salary ?? 0), 0);
  const sponsorMonthly = team?.sponsorIncome ?? 0;
  const netMonthly = sponsorMonthly - totalMonthlyWage;

  return (
    <div className="finances-page">
      <div className="finances-header">
        <div>
          <h1 className="page-heading">FINANCES & FISCAL HEALTH</h1>
          <p className="page-subheading">
            Manage organization cash reserves, player wage bills, sponsor agreements, and prize winnings.
          </p>
        </div>

        <div className="cash-balance-box">
          <span className="cash-label">CASH BALANCE</span>
          <span className="cash-num">${(team?.cashBalance ?? 0).toLocaleString()}</span>
        </div>
      </div>

      <div className="finances-metrics-grid">
        <div className="fin-metric-card">
          <span className="fin-metric-label">MONTHLY SPONSOR REVENUE</span>
          <span className="fin-metric-val text-green">+${sponsorMonthly.toLocaleString()}/mo</span>
          <span className="fin-metric-sub">Primary Jersey & Streaming Sponsors</span>
        </div>

        <div className="fin-metric-card">
          <span className="fin-metric-label">MONTHLY SQUAD SALARY</span>
          <span className="fin-metric-val text-red">-${totalMonthlyWage.toLocaleString()}/mo</span>
          <span className="fin-metric-sub">{roster.length} Players Under Contract</span>
        </div>

        <div className="fin-metric-card">
          <span className="fin-metric-label">NET MONTHLY CASHFLOW</span>
          <span className={`fin-metric-val ${netMonthly >= 0 ? 'text-green' : 'text-red'}`}>
            {netMonthly >= 0 ? `+$${netMonthly.toLocaleString()}` : `-$${Math.abs(netMonthly).toLocaleString()}`}/mo
          </span>
          <span className="fin-metric-sub">Operational Surplus / Deficit</span>
        </div>

        <div className="fin-metric-card">
          <span className="fin-metric-label">AVAILABLE CLUB FUNDS</span>
          <span className="fin-metric-val text-cyan">${(team?.cashBalance ?? 0).toLocaleString()}</span>
          <span className="fin-metric-sub">Signings and buyouts use your cash balance</span>
        </div>
      </div>

      {/* Salary Breakdown Table */}
      <div className="salary-breakdown-panel">
        <h3 className="panel-title">PLAYER CONTRACTS & SALARY OBLIGATIONS</h3>
        <table className="fin-table">
          <thead>
            <tr>
              <th>PLAYER</th>
              <th>ROLE</th>
              <th>MONTHLY WAGE</th>
              <th>ANNUAL COST</th>
              <th>MARKET VALUE</th>
              <th>BUYOUT CLAUSE</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((player) => {
              const wage = player.salary ?? 0;
              return (
                <tr key={player.id}>
                  <td>
                    <strong>{player.gamertag}</strong>
                  </td>
                  <td>{player.preferredTendency}</td>
                  <td>${wage.toLocaleString()}</td>
                  <td>${(wage * 12).toLocaleString()}</td>
                  <td>${(player.marketValue ?? 0).toLocaleString()}</td>
                  <td>${(player.buyout ?? 0).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
