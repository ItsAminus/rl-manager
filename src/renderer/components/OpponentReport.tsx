import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useCareerStore} from '../../stores/careerStore';

export function OpponentReport({teamId,onChange}:{teamId:string;onChange?:()=>Promise<void>}){
  const {career,currentDate,reloadRoster}=useCareerStore();
  const [report,setReport]=useState<any>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  useEffect(()=>{let alive=true;setReport(null);if(career&&career.mode!=='Path To Glory')window.api.management.scoutingTeamReport(career.id,teamId).then(r=>{if(alive){if(r.error)setNotice(r.error);else setReport(r);}}).catch(e=>{if(alive)setNotice(String(e));});return()=>{alive=false;};},[career?.id,teamId,currentDate,revision]);
  if(!career||career.mode==='Path To Glory'||teamId===career.teamId)return null;
  const pending=report?.assignments.find((a:any)=>a.status==='pending');
  return <section className="panel"><div className="card-topline"><div><span className="eyebrow">Opponent intelligence</span><h2>{report?.team.name||'Scout this squad'}</h2></div><button className="btn btn-secondary" disabled={busy||!!pending||!report} onClick={async()=>{setBusy(true);try{const r=await window.api.management.scoutingDispatchTeam(career.id,teamId);if(!r.success)throw Error(r.error);setNotice(`Team scout dispatched. Report due ${r.dueDate}.`);setRevision(n=>n+1);await reloadRoster();await onChange?.();}catch(e){setNotice(String(e));}finally{setBusy(false);}}}>{pending?`Observing · due ${pending.dueDate}`:'Scout team · $7,500'}</button></div>
    <p>Seven-day assignments build knowledge of the current roster. Regional scouting discovers individual players; it does not automatically cover every opponent.</p>
    {notice&&<p role="status">{notice}</p>}
    {pending&&<button className="btn btn-secondary" disabled={busy} onClick={async()=>{setBusy(true);try{const r=await window.api.management.scoutingCancel(career.id,'team',pending.id);if(!r.success)throw Error(r.error);setNotice('Assignment cancelled. Scout slot freed; completed observations retained. No refund of upfront fees.');setRevision(n=>n+1);await onChange?.();}catch(e){setNotice(String(e));}finally{setBusy(false);}}}>Cancel team assignment</button>}
    {report&&<><p>{report.known} of {report.players.length} current players observed. Estimates can be outdated after 120 days.</p><div className="reports-grid">{report.players.map((p:any)=><article key={p.id}><Link className="text-link" to={`/scouting/player/${p.id}`}>{p.gamertag}</Link><p>{p.estimatedOverall||'Unscouted'} · {p.preferredTendency}</p><small>{p.lastScouted?`Observed ${p.lastScouted} · ${p.scoutKnowledge}`:'No observation on file'}</small></article>)}</div></>}
  </section>;
}
