import React,{useEffect,useState} from 'react';
import { useCareerStore } from '../../stores/careerStore';
import './FinancesPage.css';
import {BoardVision} from '../components/BoardVision';

export const FinancesPage: React.FC = () => {
  const { team, roster,career,currentDate } = useCareerStore();
  const [accounts,setAccounts]=useState<any>(null);
  const [staffNotice,setStaffNotice]=useState(''),[staffBusy,setStaffBusy]=useState(false);
  useEffect(()=>{if(career)window.api.management.finances(career.id).then(setAccounts);},[career?.id,currentDate,team?.cashBalance]);

  const totalMonthlyWage = accounts?.wages??roster.reduce((sum, p) => sum + (p.salary ?? 0), 0);
  const sponsorMonthly = team?.sponsorIncome ?? 0;
  const netMonthly = accounts?.structure?.netAfterStaff??accounts?.net ?? sponsorMonthly - totalMonthlyWage;

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
          <span className="cash-num">${(accounts?.cash??team?.cashBalance ?? 0).toLocaleString()}</span>
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
          <span className="fin-metric-val text-cyan">${(accounts?.cash??team?.cashBalance ?? 0).toLocaleString()}</span>
          <span className="fin-metric-sub">Signings and buyouts use your cash balance</span>
        </div>
      </div>

      {accounts?.error&&<p role="alert">{accounts.error}</p>}
      {accounts?.vision&&career&&<BoardVision careerId={career.id} vision={accounts.vision} onRefresh={async()=>{setAccounts(await window.api.management.finances(career.id));}}/>}
      {accounts?.obligations&&<section className="salary-breakdown-panel"><h2>Transfer instalments</h2><p>Still payable: <strong>${accounts.obligations.payable.toLocaleString()}</strong> · Still receivable: <strong>${accounts.obligations.receivable.toLocaleString()}</strong></p><p>These guaranteed payments survive a player’s resale, release or contract expiry. Due payments settle automatically; unfunded payments reduce cash and can trigger the existing financial recovery process.</p>{accounts.obligations.rows.length?<div style={{overflowX:'auto'}}><table className="fin-table"><thead><tr><th>Due</th><th>Player</th><th>Buying club</th><th>Selling club</th><th>Amount</th><th>Status</th></tr></thead><tbody>{accounts.obligations.rows.map((r:any)=><tr key={r.id}><td>{r.dueDate}</td><td>{r.gamertag}</td><td>{r.buyer}</td><td>{r.seller}</td><td>{r.buyerId===career?.teamId?'-':'+'}${r.amount.toLocaleString()}</td><td>{r.paidDate?`Paid ${r.paidDate}`:'Committed'}</td></tr>)}</tbody></table></div>:<p>No outstanding instalment deals.</p>}</section>}
      {accounts?.structure&&<section className="salary-breakdown-panel"><h3>Club structure & planning</h3>{staffNotice&&<p role="status" className="notice">{staffNotice}</p>}<p>Player contracts remain your responsibility. The recruitment department improves prospect discovery and potential assessments; coaching improves training quality; player care improves recovery on rest days. Recruitment searches take seven days and add recurring wages.</p><div className="finances-metrics-grid">{accounts.structure.staff.map((s:any)=><article className="fin-metric-card" key={s.role}><h3>{s.role}</h3><strong>Level {s.level} · Quality {s.quality}/100</strong><p>${s.monthly.toLocaleString()}/month{s.pending?` · Next level starts ${s.effectiveDate}`:''}</p><button className="btn btn-secondary" disabled={staffBusy||s.pending||s.level>=5} onClick={async()=>{if(!career)return;setStaffBusy(true);try{const r=await window.api.management.hireDepartment(career.id,s.role);if(!r.success)throw Error(r.error);setStaffNotice(`Recruitment search approved. Staff arrive ${r.effectiveDate}.`);setAccounts(await window.api.management.finances(career.id));await useCareerStore.getState().reloadRoster();}catch(e){setStaffNotice(String(e));}finally{setStaffBusy(false);}}}>Recruit next level · ${s.nextCost.toLocaleString()} upfront</button><small>New department wage: ${s.nextMonthly.toLocaleString()}/month</small></article>)}</div><h3>Recurring-cash forecast</h3><p>{accounts.structure.policy}</p><div className="finances-metrics-grid">{accounts.structure.projections.map((p:any)=><article className="fin-metric-card" key={p.months}><span>In {p.months} month{p.months>1?'s':''}</span><strong className={p.cash<0?'text-red':'text-green'}>${p.cash.toLocaleString()}</strong></article>)}</div><p>Recommended reserve: ${accounts.structure.reserveTarget.toLocaleString()} · Cash above reserve: ${accounts.structure.discretionaryCash.toLocaleString()} · Staff wages: ${accounts.structure.staffWages.toLocaleString()}/month</p></section>}
      {accounts&&!accounts.error&&<section className="salary-breakdown-panel"><h3 className="panel-title">BOARD MANDATE & CLUB DEBT</h3><div className="finances-metrics-grid">
        <div className="fin-metric-card"><span>Outstanding debt</span><strong>${accounts.debt.toLocaleString()}</strong><small>Credit limit ${accounts.creditLimit.toLocaleString()} · 1% monthly interest</small></div>
        <div className="fin-metric-card"><span>Corporate and commercial revenue</span><strong>+${accounts.corporateIncome.toLocaleString()}/month</strong><small>Commercial partnerships, merchandising and audience revenue</small></div>
        <div className="fin-metric-card"><span>Wage structure</span><strong>${accounts.wages.toLocaleString()} / ${accounts.wageLimit.toLocaleString()}</strong><small>Deals above {accounts.vision?.status==='agreed'?accounts.vision.terms.wagePercent:125}% of the limit are blocked</small></div>
        <div className="fin-metric-card"><span>Operating costs and debt interest</span><strong>-${(accounts.overhead+accounts.interest).toLocaleString()}/month</strong><small>Contribution income ${accounts.contributions.received.toLocaleString()} · contribution expenses ${accounts.contributions.paid.toLocaleString()}</small></div>
        </div><p className={accounts.insolventSince?'notice notice-error':'notice'}>{accounts.insolventSince?`Recovery plan started ${accounts.insolventSince}. Earliest review: ${accounts.recoveryDeadline}. Insolvent monthly settlements: ${accounts.insolventMonths}/6.`:'Your club is meeting its obligations. Wage-limit warnings alone cannot get you fired.'}</p>{accounts.protectedUntil&&accounts.protectedUntil>=currentDate&&<p className="notice">Trophy success protects your job until {accounts.protectedUntil}.</p>}{accounts.finalWarningDate&&<p role="alert">Final financial warning issued {accounts.finalWarningDate}. Restore a non-negative cash balance to keep your job.</p>}<p>{accounts.financialPolicy}</p>
        <h3>Recent account movements</h3><div style={{overflowX:'auto'}}><table className="fin-table"><thead><tr><th>Date</th><th>Movement</th><th>Event / detail</th><th>Amount</th></tr></thead><tbody>{accounts.ledger.map((r:any)=><tr key={r.id}><td>{r.date}</td><td>{r.category}</td><td>{r.description}</td><td>{r.amount<0?'-':'+'}${Math.abs(r.amount).toLocaleString()}</td></tr>)}</tbody></table></div>
      </section>}
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
