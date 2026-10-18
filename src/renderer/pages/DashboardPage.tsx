import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCareerStore } from '../../stores/careerStore';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { TeamCrest } from '../components/TeamCrest';
import { transferWindow } from '../../game/career-rules';
import './DashboardPage.css';
import './ClubStudio.css';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { career, team, roster, currentDate, upcomingFixtures, unreadInboxCount, error } = useCareerStore();
  const [overview, setOverview] = useState<any>({ recent: [], social: [] });
  useEffect(() => {
    if (!career) { navigate('/'); return; }
    window.api.management.overview(career.id).then(data => { if (!data.error) setOverview(data); });
  }, [career?.id, currentDate, upcomingFixtures]);
  if (!career || !team) return <div className="empty-state">Load a career to open your club workspace.</div>;
  const next = upcomingFixtures[0], starters = roster.slice(0, 3);
  const avg = starters.length ? Math.round(starters.reduce((s, p) => s + p.overall, 0) / starters.length) : 0;
  const opponent = next ? (next.homeTeamId === team.id ? next.awayTeamName : next.homeTeamName) : '';
  const opponentId = next ? (next.homeTeamId === team.id ? next.awayTeamId : next.homeTeamId) : '';
  const due = next && next.scheduledDate <= currentDate;
  const market = transferWindow(currentDate,career?.transferWindows);
  const series = (value: any) => String(value || 'BO5').replace(/\D/g, '');
  return <div className="management-page club-dashboard">
    <div className="page-intro"><div><span className="eyebrow">Your club workspace</span><h1>{team.name}</h1><p>{career.managerName} · {team.region} · Build a squad. Earn your place.</p></div><span className="soft-badge">Season 01</span></div>
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {team.branding&&<section className="club-brand-strip" style={{background:team.branding.secondary}}>{team.branding.banner&&<img src={team.branding.banner} alt={`${team.name} club banner`}/>}<div className="club-brand-strip-content"><TeamCrest id={team.id} name={team.name}/><div><h2>{team.name}</h2><p>{team.branding.slogan}</p><div className="club-brand-shortcuts"><button className="text-link" onClick={()=>navigate('/club-studio')}>Edit identity →</button><button className="text-link" onClick={()=>navigate('/garage')}>Squad garage →</button></div></div></div></section>}
    {overview.openEvent && <div className="notice"><strong>{overview.openEvent.name}</strong> · {overview.openEvent.entrantCount} teams entered · Starts {overview.openEvent.startDate}. {overview.openEvent.hasBye ? 'Your squad has an opening-round bye; its opponent appears when that round finishes.' : 'Win through the open bracket to reach the final sixteen.'} <button className="text-link" onClick={() => navigate(`/competition/${overview.openEvent.id}`)}>View draw →</button></div>}
    <div className="overview-metrics">
      <div><span>Squad overall</span><strong>{avg}<small> / 100</small></strong></div>
      <div><span>Team chemistry</span><strong>{team.teamChemistry ?? 0}<small> / 100</small></strong></div>
      <div><span>Club balance</span><strong>${(team.cashBalance || 0).toLocaleString()}</strong></div>
      <button onClick={() => navigate('/inbox')}><span>Unread messages</span><strong>{unreadInboxCount}<small> in your inbox →</small></strong></button>
    </div>
    <div className="club-grid">
      <section className="panel featured-series">
        <div className="card-topline"><span className="eyebrow">Next series</span><span className={`soft-badge ${due ? 'positive' : ''}`}>{due ? 'Match day' : next ? 'Scheduled' : 'Awaiting fixtures'}</span></div>
        {next ? <><p className="series-event">{next.competitionName}</p><div className="series-versus"><div><TeamCrest id={team.id} name={team.name} /><h2>{team.name}</h2><small>Your organization</small></div><span className="versus">vs</span><div><TeamCrest id={opponentId} name={opponent || 'Opponent'} /><h2>{opponent}</h2><small>Opponent</small></div></div>
          <div className="series-footer"><span>{next.scheduledDate} · Best of {series(next.seriesFormat)} · {next.status === 'in_progress' ? 'Series in progress' : 'Round ' + next.round}</span><button className="btn btn-primary" disabled={!due} onClick={() => navigate(`/match-day/${next.id}`)}>{due ? 'Enter match day →' : 'Advance to match day'}</button></div>
          {!due && <p className="muted-note">Use Continue to advance the career calendar. Your fixture will wait for you.</p>}
        </> : <div className="empty-state"><h2>Prepare for your next opportunity.</h2><p>Later-stage opponents appear only after qualification is decided. Check your calendar for the next Open Qualifier.</p><button className="btn btn-secondary" onClick={() => navigate('/calendar')}>Open calendar →</button></div>}
      </section>
      <section className="panel dashboard-roster"><div className="card-topline"><h2>Your starting three</h2><button className="text-link" onClick={() => navigate('/squad')}>Manage squad →</button></div>{starters.map(p => <button key={p.id} className="roster-line" onClick={() => navigate(`/player/${p.id}`)}><PlayerAvatar playerId={p.id} gamertag={p.gamertag} overall={p.overall} size="md" /><span><strong>{p.gamertag}</strong><small>{p.preferredTendency}</small></span><span className="plain-rating">{p.overall}</span></button>)}<div className="roster-summary">{roster.length} players · Average morale {roster.length ? Math.round(roster.reduce((s, p) => s + p.morale, 0) / roster.length) : 0}%</div></section>
      <section className="panel schedule-panel"><div className="card-topline"><h2>Coming up</h2><button className="text-link" onClick={() => navigate('/calendar')}>Full calendar →</button></div>{upcomingFixtures.slice(0, 5).map((f, i) => <div className="schedule-line" key={f.id}><span className="schedule-index">{String(i + 1).padStart(2, '0')}</span><div><strong>{f.homeTeamId === team.id ? f.awayTeamName : f.homeTeamName}</strong><small>{f.competitionName}</small></div><span>{f.scheduledDate}<small>BO{series(f.seriesFormat)}</small></span></div>)}{!upcomingFixtures.length && <p className="empty-state">No unresolved series. Future rounds depend on qualifying results.</p>}</section>
      <section className="panel club-attention"><span className="eyebrow">In the office</span><h2>Ahead of the next game</h2><button className="attention-link" onClick={() => navigate('/transfers')}><span className="attention-dot" /><span><strong>{market.open ? 'Transfer window open' : 'Transfer window closed'}</strong><small>{market.open ? 'Closes ' + market.closes : 'Opens ' + market.nextOpens}</small></span><span>→</span></button><button className="attention-link" onClick={() => navigate('/training')}><span className="attention-dot muted" /><span><strong>Train with purpose</strong><small>Weekly focus, fatigue and long-term growth</small></span><span>→</span></button><button className="attention-link" onClick={() => navigate('/social')}><span className="attention-dot muted" /><span><strong>Check the dressing room</strong><small>Fan reaction and player confidence</small></span><span>→</span></button></section>
      <section className="panel route-panel"><div className="card-topline"><h2>Your road to Worlds</h2><button className="text-link" onClick={() => navigate('/competitions')}>Explore circuit →</button></div><div className="qualification-route">{[['01', 'Open Qualifier', 'Reach the final 16'], ['02', 'Regional', 'Finish in the top two'], ['03', 'Major', 'Build your Worlds record'], ['04', 'Worlds', 'Top eight from the Majors']].map(([n, title, subtitle]) => <div key={n}><span>{n}</span><strong>{title}</strong><small>{subtitle}</small></div>)}</div></section>
    </div>
  </div>;
};
