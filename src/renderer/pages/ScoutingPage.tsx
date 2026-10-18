import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCareerStore } from '../../stores/careerStore';
import './ScoutingPage.css';

export const ScoutingPage: React.FC = () => {
  const { career, currentDate, reloadRoster, team } = useCareerStore();
  const navigate = useNavigate();
  const [reports, setReports] = useState<any[]>([]);
  const [target, setTarget] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    if (!career) return;
    const result = await window.api.management.scouting(career.id);
    if (Array.isArray(result)) setReports(result); else setNotice(result.error);
  };
  useEffect(() => { load().catch(err => setNotice(String(err))); }, [career?.id, currentDate]);
  const dispatch = async (name: string) => {
    if (!career || busy) return;
    setBusy(true);
    try {
      const result = await window.api.management.dispatchScout(career.id, name);
      if (!result.success) throw new Error(result.error);
      setNotice(`Scout dispatched. Report arrives ${result.dueDate}.`); setTarget('');
      await load(); await reloadRoster();
    } catch (err) { setNotice(String(err)); } finally { setBusy(false); }
  };
  const latest = reports.filter((r, i) => reports.findIndex(p => p.playerId === r.playerId) === i);
  return <div className="management-page">
    <div className="page-intro"><div><span className="eyebrow">Recruitment</span><h1>Find your next star.</h1><p>Observe a player over three career days. Repeat assignments to uncover their full potential.</p></div><span className="soft-badge">Club funds · ${(team?.cashBalance || 0).toLocaleString()}</span></div>
    {notice && <div className="notice" role="status">{notice}</div>}
    <form className="panel scouting-dispatch" onSubmit={e => { e.preventDefault(); dispatch(target); }}><div><h3>Send a scout</h3><p>Each assignment costs $5,000. Your report arrives in the inbox.</p></div><div className="form-inline"><input aria-label="Player gamertag" placeholder="Exact player gamertag" value={target} onChange={e => setTarget(e.target.value)} required /><button className="btn btn-primary" disabled={busy || !target.trim()}>Dispatch scout</button></div></form>
    <h2 className="section-heading">Your observations <span>{latest.length}</span></h2>
    <div className="reports-grid">{latest.map(r => <article key={r.id} className="panel scout-card">
      <div className="card-topline"><button className="text-link" onClick={() => navigate(`/player/${r.playerId}`)}>{r.gamertag}</button><span className="soft-badge">{r.status === 'pending' ? 'Observing' : r.knowledge}</span></div>
      <p>{r.region} · {r.preferredTendency}</p>
      {r.status === 'completed' ? <div className="stat-pair"><div><span>Estimated overall</span><strong>{r.estOvr}</strong></div><div><span>Estimated potential</span><strong>{r.estPot}</strong></div></div> : <p className="empty-state">Report due {r.dueDate}</p>}
      <p>{r.note}</p><button className="btn btn-secondary" disabled={busy || r.status === 'pending' || r.depth >= 3} onClick={() => dispatch(r.playerId)}>Deepen observation</button>
    </article>)}</div>
    {!latest.length && <div className="panel empty-state">No assignments yet. Browse the transfer market and choose a player to observe.<br /><button className="btn btn-secondary" onClick={() => navigate('/transfers')}>Browse players</button></div>}
  </div>;
};
