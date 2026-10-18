import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCareerStore } from '../../stores/careerStore';
import './CompetitionsPage.css';
import {isPath} from '../../game/career-mode';

export const CompetitionsPage: React.FC = () => {
  const navigate = useNavigate();
  const { career, currentDate,team } = useCareerStore();
  const [competitions, setCompetitions] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [region, setRegion] = useState('Your circuit');
  const [qualifiers,setQualifiers]=useState(false);
  useEffect(() => { window.api.competitions.getAll().then(setCompetitions).catch(err => setError(String(err))); }, [career?.id, currentDate]);
  return <div className="management-page"><div className="page-intro"><div><span className="eyebrow">Competitive season</span><h1>Earn your place.</h1><p>Two RLCS splits, two Majors, Worlds and selected invitationals. Qualifiers lead into each Open.</p></div><select aria-label="Competition region" value={region} onChange={e => setRegion(e.target.value)}><option>Your circuit</option><option>All regions</option>{[...new Set(competitions.map(c => c.region))].map(r => <option key={r}>{r}</option>)}</select></div>
    {error && <div className="notice notice-error" role="alert">{error}</div>}<div className="notice">2026 organiser formats: Opens and LCQs use double elimination, Swiss, GSL and hybrid playoffs. Majors and Worlds use their own group and playoff rules. EWC uses GSL into single elimination. Events already played retain their original results.</div>
    <label className="competition-qualifier-toggle"><input type="checkbox" checked={qualifiers} onChange={e=>setQualifiers(e.target.checked)}/> Show separate qualifier cards</label><div className="competitions-grid">{competitions.filter(c => !(isPath(career)&&c.type==='SCRIM')&&(qualifiers||c.type!=='QUALIFIER')&&(region==='All regions'||region==='Your circuit'?(region==='All regions'||c.region==='GLOBAL'||c.region===team?.region||c.region===career?.region):c.region===region)).map(c => {
      const config = JSON.parse(c.config || '{}');
      const sources:string[]=JSON.parse(c.sources||'[]');const qualifier=competitions.find(q=>q.type==='QUALIFIER'&&sources.includes(q.id));
      return <article className="competition-card panel" key={c.id}><div className="card-topline"><span className="eyebrow">{c.region} · {c.type}</span><span className={`soft-badge ${c.entered ? 'positive' : ''}`}>{c.entered ? c.type === 'QUALIFIER' ? 'Registered' : c.type === 'SCRIM' ? 'Practice' : 'Qualified / entered' : c.status === 'awaiting_qualification' ? 'Qualification pending' : 'Not entered'}</span></div><h2>{c.name}</h2><p>{config.qualificationRule}</p><div className="list-row"><span>{(c.format||'friendlies').replace(/_/g, ' ')} · {config.seriesFormat}</span><strong>{c.startDate}</strong></div><div className="list-row"><span>Teams entered</span><strong>{c.entrantCount || 'Awaiting qualifiers'}</strong></div>{!isPath(career)&&<div className="list-row"><span>Prize pool</span><strong>${c.prizePool.toLocaleString()}</strong></div>}<div className="competition-card-actions"><button className="btn btn-primary" onClick={() => navigate(`/competition/${c.id}`)}>View event →</button>{qualifier&&<button className="btn btn-secondary" onClick={()=>navigate(`/competition/${qualifier.id}`)}>{qualifier.entered?'Your qualifier →':'View qualifier →'}</button>}</div></article>;
    })}</div></div>;
};
