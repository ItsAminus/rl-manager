import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCareerStore } from '../../stores/careerStore';
import './CompetitionDetailPage.css';
import {TournamentBracket} from '../components/TournamentBracket';
import {TournamentStages} from '../components/TournamentStages';
import {FifaWorldCupEvent} from '../components/FifaWorldCupEvent';
import {ClubChampionshipEvent} from '../components/ClubChampionshipEvent';

export const CompetitionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { team, currentDate } = useCareerStore();
  const [competition, setCompetition] = useState<any>(null);
  const [standings, setStandings] = useState<any[]>([]);
  const [tab, setTab] = useState(new URLSearchParams(location.hash.split('?')[1]||'').get('tab')==='bracket'?'bracket':'fixtures');
  const [limit, setLimit] = useState(40);
  const [error, setError] = useState('');
  const [reviewRepair,setReviewRepair]=useState(false),[repairBusy,setRepairBusy]=useState(false),[repairError,setRepairError]=useState('');
  const repairFormat=async()=>{
    if(!id||repairBusy)return;setRepairBusy(true);setRepairError('');
    try{
      const result=await window.api.competitions.repairFormat(id),target=result.replacementId||id;
      setCompetition(await window.api.competitions.getById(target));setStandings(await window.api.stats.getTeamStandings(target));
      if(target!==id)navigate('/competition/'+target+'?tab=bracket');
      if(team)useCareerStore.setState({upcomingFixtures:await window.api.fixtures.getUpcoming(team.id,currentDate)});
      setReviewRepair(false);setTab('bracket');
    }catch(e){setRepairError(String(e));}finally{setRepairBusy(false);}
  };
  useEffect(()=>{setReviewRepair(false);setRepairError('');setTab(new URLSearchParams(location.hash.split('?')[1]||'').get('tab')==='bracket'?'bracket':'fixtures');},[id]);
  useEffect(() => {
    if(!id)return;let live=true,busy=false,last='';
    const refresh=async()=>{
      if(busy)return;busy=true;
      try{const [c,s]=await Promise.all([window.api.competitions.getById(id),window.api.stats.getTeamStandings(id)]);if(!live)return;
        const key=JSON.stringify(c);if(key!==last){last=key;setCompetition(c);setStandings(s);}setError('');
      }catch(err){if(live)setError(String(err));}finally{busy=false;}
    };
    void refresh();const timer=setInterval(()=>{if(!document.hidden)void refresh();},5000);
    const focus=()=>void refresh();window.addEventListener('focus',focus);
    return ()=>{live=false;clearInterval(timer);window.removeEventListener('focus',focus);};
  }, [id, currentDate]);
  if (error) return <div className="management-page notice notice-error">{error}</div>;
  if (!competition) return <div className="empty-state">Loading event…</div>;
  if(competition.type==='FIFAE')return <FifaWorldCupEvent competition={competition}/>;
  if(competition.type==='CLUB_CHAMPIONSHIP')return <ClubChampionshipEvent competition={competition} onRefresh={async()=>setCompetition(await window.api.competitions.getById(id!))}/>;
  const fixtures = competition.fixtures || [];
  const own = fixtures.filter((f: any) => [f.homeTeamId, f.awayTeamId].includes(team?.id));
  const rounds = [...new Set(fixtures.map((f: any) => f.round))].sort((a: any, b: any) => a - b);
  return <div className="management-page"><button className="text-link" onClick={() => navigate(competition.config?.clubParentId?'/competition/'+competition.config.clubParentId:'/competitions')}>← {competition.config?.clubParentId?'Club Championship':'Competitions'}</button><div className="page-intro"><div><span className="eyebrow">{competition.region} · {competition.type}</span><h1>{competition.name}</h1><p>{competition.config?.qualificationRule}</p></div><span className="soft-badge">{competition.entries.length} entrants · {competition.config?.seriesFormat}</span></div>
    {competition.config?.careerAdministration&&<p className="notice">Official competition mechanics · Career invitation and seeding inputs. Dates not published in the rulebook use this edition’s saved organiser schedule. {competition.config?.formatNote}</p>}
    {competition.clubLeague&&<section className="panel table-panel"><h2>Club League standings · Top {competition.config.finalePlaces} qualify</h2><p>Match wins → game difference → goal difference → initial seed. Each team plays every other team once, in BO5.</p><table><thead><tr><th>#</th><th>Club</th><th>Played</th><th>W–L</th><th>Game difference</th><th>Goal difference</th></tr></thead><tbody>{competition.clubLeague.map((r:any,i:number)=><tr key={r.teamId} className={r.teamId===team?.id?'row-my-team':''}><td>{i+1}{i<competition.config.finalePlaces?' · Q':''}</td><td>{r.teamName}</td><td>{r.played}</td><td>{r.wins}–{r.losses}</td><td>{r.gameDiff}</td><td>{r.goalDiff}</td></tr>)}</tbody></table></section>}
    {competition.config?.source&&<p className="event-group-rule"><a href={competition.config.source} target="_blank" rel="noreferrer">{competition.config.sourceVersion} · Official rules ↗</a>{competition.config.legacyRules&&' · Existing results retain their original format.'}</p>}
    {competition.formatRepair?.required?<section className="panel event-format-repair"><span className="eyebrow">Tournament format needs repair</span><h2>This is an old league schedule, not a four-group tournament.</h2><p>Replace the all-team round robin with four groups of four, three BO5 series per team and a BO7 hybrid playoff bracket.</p>{!reviewRepair?<button className="btn btn-primary" onClick={()=>setReviewRepair(true)}>Review tournament repair →</button>:<><h3>{competition.formatRepair.successorName||'Review the new field'}</h3>{competition.formatRepair.drawDate&&<p>Group draw: {competition.formatRepair.drawDate} · Event starts: {competition.formatRepair.startDate}</p>}<p>{competition.formatRepair.fieldNote}</p><div className="repair-entrant-list">{competition.formatRepair.entrants.map((entry:any)=><span key={entry.teamId} title={entry.qualification}>{entry.teamName}{entry.teamId===team?.id?' · Your team':''}</span>)}</div><p><strong>{competition.formatRepair.completedSeries} completed series will remain in linked career history.</strong> {competition.formatRepair.successorId?'The duplicate event is retired. The official event keeps its existing standings and schedule.':'The repaired tournament starts fresh group standings.'} Player statistics and earned XP are retained. Unplayed league fixtures are replaced; the original event snapshot is backed up inside this save.</p>{competition.formatRepair.reason&&<p role="status">{competition.formatRepair.reason}</p>}{repairError&&<p role="alert">{repairError}</p>}<div className="repair-actions"><button className="btn btn-secondary" disabled={repairBusy} onClick={()=>setReviewRepair(false)}>Keep for now</button><button className="btn btn-primary" disabled={repairBusy||!competition.formatRepair.canRepair} onClick={repairFormat}>{repairBusy?'Rebuilding…':competition.formatRepair.successorId?'Retire league & open official event':competition.formatRepair.completedSeries?'Archive prior series & draw groups':'Create groups & bracket'}</button></div></>}</section>:competition.config?.legacyRules&&<p className="notice">This historical event retains its recorded results.</p>}
    {competition.config?.fieldPendingReason&&<p className="notice">{competition.config.fieldPendingReason}</p>}
    {competition.config?.repairArchiveId&&<p className="notice">Earlier league results were preserved separately. <button className="text-link" onClick={()=>navigate('/competition/'+competition.config.repairArchiveId)}>View prior-format results →</button></p>}
    <div className="segmented-tabs">{['fixtures', 'standings', 'bracket'].map(t => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t === 'bracket' ? 'Tournament bracket' : t}</button>)}</div>
    {competition.formatRepair?.required&&tab!=='fixtures'?<div className="event-draw-pending">Review the repair above to create the four groups and playoff route. The old all-team league is not a valid group draw.</div>:tab === 'standings'&&competition.tournament?<TournamentStages competition={competition} teamId={team?.id} groupsOnly onOpen={()=>{}}/>:tab === 'standings' ? <div className="panel table-panel"><table><thead><tr><th>Position</th><th>Organization</th><th>Played</th><th>Wins</th><th>Losses</th><th>Game diff.</th><th>Points</th></tr></thead><tbody>{standings.slice(0, limit).map((s, i) => <tr key={s.teamId} className={s.teamId === team?.id ? 'row-my-team' : ''}><td>{i + 1}</td><td>{s.teamName}{s.teamId === team?.id && <span className="soft-badge">Your team</span>}</td><td>{s.played}</td><td>{s.wins}</td><td>{s.losses}</td><td>{s.gameDiff}</td><td>{s.points}</td></tr>)}</tbody></table>{!standings.length && <p className="empty-state">Entrants will appear when qualification is complete.</p>}{standings.length > limit && <button className="btn btn-secondary" onClick={() => setLimit(l => l + 50)}>Show more · {limit} of {standings.length}</button>}</div> : tab === 'fixtures' ? <section className="panel"><h2>Your series</h2>{own.length ? own.map((f: any) => <div className="list-row fixture-line" key={f.id}><span><strong>{f.homeTeamName} vs {f.awayTeamName}</strong><small>{f.scheduledDate} · {f.groupName?'Group '+f.groupName+' · ':''}Round {f.round} · {f.seriesFormat}</small></span><span>{f.status === 'completed' ? `${f.homeScore}–${f.awayScore}` : <button className="btn btn-primary" disabled={f.scheduledDate > currentDate} onClick={() => navigate(`/match-day/${f.id}`)}>{f.scheduledDate > currentDate ? 'Scheduled' : 'Match day →'}</button>}</span></div>) : <p className="empty-state">No pairing yet. Your team may have a seeded bye, be awaiting qualification, or have been eliminated. Advance the calendar to resolve other teams’ games.</p>}</section> : <TournamentBracket competition={competition} teamId={team?.id} onOpen={(fixtureId)=>{const f=fixtures.find((x:any)=>x.id===fixtureId);if([f.homeTeamId,f.awayTeamId].includes(team?.id))navigate(`/match-day/${fixtureId}`);}}/>}
  </div>;
};
