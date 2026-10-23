import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCareerStore } from '../../stores/careerStore';
import './ScoutingPage.css';

export const ScoutingPage: React.FC = () => {
  const { career, currentDate, reloadRoster, team } = useCareerStore();
  const navigate = useNavigate();
  const [reports, setReports] = useState<any[]>([]);
  const [target, setTarget] = useState('');
  const [network,setNetwork]=useState<any>({assignments:[],regions:[]});
  const [region,setRegion]=useState('Europe'),[months,setMonths]=useState(3);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    if (!career) return;
    const result = await window.api.management.scouting(career.id);
    setNetwork(await window.api.management.scoutingRegions(career.id));
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
    <div className="page-intro"><div><span className="eyebrow">Recruitment</span><h1>Find your next star.</h1><p>Build knowledge over weeks and months. Unknown players have no visible rating; reports narrow the estimates through sustained observation.</p></div><span className="soft-badge">Club funds · ${(team?.cashBalance || 0).toLocaleString()}</span></div>
    {notice && <div className="notice" role="status">{notice}</div>}
    <form className="panel scouting-dispatch" onSubmit={e => { e.preventDefault(); dispatch(target); }}><div><h3>Send a scout</h3><p>Each individual assignment costs $5,000 and takes 28–56 days, depending on depth. Your report arrives in the inbox.</p></div><div className="form-inline"><input aria-label="Player gamertag" placeholder="Exact player gamertag" value={target} onChange={e => setTarget(e.target.value)} required /><button className="btn btn-primary" disabled={busy || !target.trim()}>Dispatch scout</button></div></form>
    <form className="panel scouting-dispatch" onSubmit={async e=>{e.preventDefault();if(!career||busy)return;setBusy(true);try{const r=await window.api.management.dispatchRegion(career.id,region,months);if(!r.success)throw Error(r.error);setNotice(`Regional scout deployed. First reports ${r.dueDate}; assignment ends ${r.endDate}.`);await load();await reloadRoster();}catch(e){setNotice(String(e));}finally{setBusy(false);}}}>
      <div><h3>Regional recruitment network</h3><p>Three shared scout slots. Regional assignments cost $8,000 per month, paid upfront, and produce reports every 30 days.</p></div>
      <div className="form-inline"><select aria-label="Scouting region" value={region} onChange={e=>setRegion(e.target.value)}>{network.regions.map((r:string)=><option key={r}>{r}</option>)}</select><select aria-label="Assignment duration" value={months} onChange={e=>setMonths(Number(e.target.value))}>{[1,2,3].map(n=><option key={n} value={n}>{n} month{n>1?'s':''}</option>)}</select><button className="btn btn-primary" disabled={busy}>Deploy regional scout</button></div>
    </form>
    {network.assignments.map((a:any)=><div className="panel" key={a.id}><strong>{a.region}</strong> · {a.status} · next report {a.nextReport} · ends {a.endDate}</div>)}
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
