import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCareerStore } from '../../stores/careerStore';
import './ScoutingPage.css';
import {OpponentReport} from '../components/OpponentReport';
import {TeamLink} from '../components/TeamLink';

export const ScoutingPage: React.FC = () => {
  const { career, currentDate, reloadRoster, team } = useCareerStore();
  const navigate = useNavigate();
  const [reports, setReports] = useState<any[]>([]);
  const [target, setTarget] = useState('');
  const [network,setNetwork]=useState<any>({assignments:[],regions:[]});
  const [region,setRegion]=useState('Europe'),[months,setMonths]=useState(3);
  const [minAge,setMinAge]=useState(15),[maxAge,setMaxAge]=useState(45),[skills,setSkills]=useState<Record<string,number>>({});
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [clubs,setClubs]=useState<any[]>([]),[clubId,setClubId]=useState('');
  useEffect(()=>{let alive=true;window.api.teams.getAll().then(rows=>{if(alive)setClubs(rows);});return()=>{alive=false;};},[career?.id]);
  const cancel=async(kind:'player'|'region'|'team',id:string)=>{
    if(!career||busy)return;setBusy(true);
    try{const r=await window.api.management.scoutingCancel(career.id,kind,id);if(!r.success)throw Error(r.error);setNotice('Assignment cancelled. Scout slot freed; completed observations retained. Upfront fees are not refunded.');await load();}catch(e){setNotice(String(e));}finally{setBusy(false);}
  };
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
    <form className="panel scouting-dispatch" onSubmit={async e=>{e.preventDefault();if(!career||busy)return;setBusy(true);try{const r=await window.api.management.dispatchRegion(career.id,region,months,{minAge,maxAge,skills});if(!r.success)throw Error(r.error);setNotice(`Regional scout deployed. First reports ${r.dueDate}; assignment ends ${r.endDate}.`);await load();await reloadRoster();}catch(e){setNotice(String(e));}finally{setBusy(false);}}}>
      <div><h3>Regional recruitment network</h3><p>Three shared scout slots. Regional assignments cost $8,000 per month, paid upfront, and produce reports every 30 days. Month 1: up to 6 players. Month 2: up to 16 total, with deeper reports on earlier discoveries. Month 3: up to 30 total, including full reports on the earliest discoveries. Smaller regions may yield fewer players.</p></div>
      <div className="form-inline"><select aria-label="Scouting region" value={region} onChange={e=>setRegion(e.target.value)}>{network.regions.map((r:string)=><option key={r}>{r}</option>)}</select><select aria-label="Assignment duration" value={months} onChange={e=>setMonths(Number(e.target.value))}>{[1,2,3].map(n=><option key={n} value={n}>{n} month{n>1?'s':''}</option>)}</select><button className="btn btn-primary" disabled={busy}>Deploy regional scout</button></div>
      <fieldset className="scout-brief"><legend>Recruitment brief</legend><div className="form-inline"><label>Minimum age<input type="number" min="15" max="45" value={minAge} onChange={e=>setMinAge(Number(e.target.value))}/></label><label>Maximum age<input type="number" min="15" max="45" value={maxAge} onChange={e=>setMaxAge(Number(e.target.value))}/></label></div><p>Optional minimum skill targets. Narrow briefs return fewer players. Players with unknown ages only appear in unrestricted briefs.</p><div className="scout-skill-filters">{[['shooting','Shooting'],['passing','Passing'],['aerial','Aerial'],['groundControl','Dribbling'],['goalkeeping','Saving'],['positioning','Positioning'],['boostManagement','Boost management']].map(([key,label])=><label key={key}>{label}<input type="number" min="1" max="99" placeholder="Any" value={skills[key]??''} onChange={e=>setSkills(old=>{const next={...old};if(e.target.value==='')delete next[key];else next[key]=Number(e.target.value);return next;})}/></label>)}</div><p>Unsigned grassroots players can surface through patient regional coverage. Most are ordinary prospects; exceptional ceilings are rare. Deepen reports to assess development rate, mentality and skill balance. No scout can guarantee future success.</p></fieldset>
    </form>
    {network.assignments.map((a:any)=><div className="panel" key={a.id}><strong>{a.region}</strong> · {a.status} · next report {a.nextReport} · ends {a.endDate}<p>{a.playersObserved||0} players covered · {a.goodReports||0} good reports · {a.fullReports||0} full reports</p> {a.status==='active'&&<button className="btn btn-secondary" disabled={busy} onClick={()=>cancel('region',a.id)}>Cancel assignment</button>}</div>)}
    <section className="panel"><h2>Scout a team</h2><p>Observe a specific squad in seven days for $7,500. Shares the same three scout slots.</p><select aria-label="Team to scout" value={clubId} onChange={e=>setClubId(e.target.value)}><option value="">Choose a team…</option>{clubs.filter(c=>c.id!==career?.teamId).sort((a,b)=>a.name.localeCompare(b.name)).map(c=><option key={c.id} value={c.id}>{c.name} · {c.region}</option>)}</select>{clubId&&<p><TeamLink id={clubId}>Open club profile →</TeamLink></p>}</section>
    {clubId&&<OpponentReport key={clubId+JSON.stringify(network.teamAssignments)} teamId={clubId} onChange={load}/>}
    {(network.teamAssignments||[]).map((a:any)=><article className="panel" key={a.id}><TeamLink id={a.teamId}>{a.teamName}</TeamLink> · {a.status} · report {a.dueDate} {a.status==='pending'&&<button className="btn btn-secondary" disabled={busy} onClick={()=>cancel('team',a.id)}>Cancel assignment</button>}</article>)}
    <h2 className="section-heading">Your observations <span>{latest.length}</span></h2>
    <div className="reports-grid">{latest.map(r => <article key={r.id} className="panel scout-card">
      <div className="card-topline"><button className="text-link" onClick={() => navigate(`/scouting/player/${r.playerId}`)}>{r.gamertag}</button><span className="soft-badge">{r.status === 'pending' ? 'Observing' : r.knowledge}</span></div>
      <p>{r.region} · {r.preferredTendency}</p>
      {r.status === 'completed' ? <div className="stat-pair"><div><span>Estimated overall</span><strong>{r.estOvr}</strong></div><div><span>Estimated potential</span><strong>{r.estPot}</strong></div></div> : <p className="empty-state">{r.status==='cancelled'?'Assignment cancelled':`Report due ${r.dueDate}`}</p>}
      {r.status==='pending'&&<button className="btn btn-secondary" disabled={busy} onClick={()=>cancel('player',r.id)}>Cancel assignment</button>}
      <p>{r.note}</p>{r.observedDate&&<small>Last observed {r.observedDate}</small>}{r.form!=null&&<p>Observed form: {r.form>=70?'Strong':r.form>=45?'Steady':'Struggling'}</p>}{r.attributes&&<details><summary>Detailed skill assessment</summary><div className="stat-pair">{[['shooting','Shooting'],['passing','Passing'],['aerial','Aerial'],['groundControl','Ground control'],['goalkeeping','Goalkeeping'],['positioning','Positioning'],['boostManagement','Boost management']].map(([key,label])=>r.attributes[key]!=null&&<div key={key}><span>{label}</span><strong>{Math.round(r.attributes[key])}</strong></div>)}</div></details>}<button className="btn btn-secondary" disabled={busy || r.status === 'pending' || r.knowledge === 'Full'} onClick={() => dispatch(r.playerId)}>Deepen observation</button>
    </article>)}</div>
    {!latest.length && <div className="panel empty-state">No assignments yet. Browse the transfer market and choose a player to observe.<br /><button className="btn btn-secondary" onClick={() => navigate('/transfers')}>Browse players</button></div>}
  </div>;
};
