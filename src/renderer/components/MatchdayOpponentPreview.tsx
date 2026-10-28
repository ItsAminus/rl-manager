import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useCareerStore} from '../../stores/careerStore';
import {TeamLink} from './TeamLink';
import './MatchdayOpponentPreview.css';

export function MatchdayOpponentPreview({teamId,playerIds,ownPlayerIds}:{teamId:string;playerIds:string[];ownPlayerIds:string[]}){
  const {career,currentDate}=useCareerStore();
  const [report,setReport]=useState<any>(null),[error,setError]=useState('');
  const selection=playerIds.join('|'),ownSelection=ownPlayerIds.join('|');
  useEffect(()=>{let alive=true;setReport(null);setError('');if(career)window.api.management.opponentPreview(career.id,teamId,playerIds,ownPlayerIds).then(r=>{if(alive){if(r.error)setError(r.error);else setReport(r);}}).catch(e=>{if(alive)setError(String(e));});return()=>{alive=false;};},[career?.id,currentDate,teamId,selection,ownSelection]);
  return <section className="panel matchday-preview" aria-label="Automatic opponent scouting report">
    <header><div><span className="eyebrow">Match preparation · Automatic scouting report</span><h2>{report?.team.name||'Your opposition'}</h2></div><span className="soft-badge">Free · Every matchday</span></header>
    {error?<p role="alert">{error}</p>:!report?<p role="status">Preparing your opponent report…</p>:<>
      <div className="opponent-overview"><article><small>Squad caliber</small><strong>{report.caliber}</strong><span>Estimated OVR {report.ratingBand}</span></article><article><small>Player to watch</small><strong>{report.keyPlayer||'Not confirmed'}</strong><span>{report.strengths.length?`Squad strengths: ${report.strengths.join(' · ')}`:'Insufficient skill data'}</span></article><article><small>Recent form</small><strong>{report.recent.length?report.recent.map((r:any)=>r.won?'W':'L').join(' · '):'No results yet'}</strong><span>{report.form}</span></article></div>
      <p className="opponent-comparison">{report.comparison}</p>
      <h3>Expected lineup</h3><div className="opponent-players">{report.players.map((p:any)=><article key={p.id}><Link className="text-link" to={`/player/${p.id}`}>{p.gamertag}</Link><p>{p.caliber} · OVR {p.ratingBand}</p><small>{p.role}</small><p>{p.strengths.length?`Best areas: ${p.strengths.join(', ')}`:'Detailed skill data unavailable.'}</p>{p.relativeWeakness&&<small>Relative weaker area: {p.relativeWeakness}</small>}</article>)}</div>
      {!report.players.length&&<p>No current squad is confirmed for this club.</p>}
      <h3>Coach’s preparation notes</h3><ul>{report.advice.map((line:string)=><li key={line}>{line}</li>)}</ul>
      {!!report.recent.length&&<details><summary>Recent series and meetings</summary><div className="opponent-recent">{report.recent.map((r:any)=><p key={r.id}><strong>{r.won?'W':'L'} {r.score}</strong> vs <TeamLink id={r.opponentId}>{r.opponent}</TeamLink> · {r.date}{report.headToHead.some((h:any)=>h.id===r.id)?' · Against your club':''}</p>)}</div></details>}
      <footer>Prepared {report.date}. {report.note}</footer>
    </>}
  </section>;
}
