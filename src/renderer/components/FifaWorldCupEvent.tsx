import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {CompetitionIntro} from './CompetitionIntro';
import {competitionPresentation} from '../utils/competition-presentation';
import {PlayerAvatar} from './PlayerAvatar';
import {useCareerStore} from '../../stores/careerStore';

export function FifaWorldCupEvent({competition:c}:{competition:any}){
  const navigate=useNavigate(),careerId=useCareerStore(s=>s.career?.id),date=useCareerStore(s=>s.currentDate),[replay,setReplay]=useState(0),[stage,setStage]=useState('knockouts');
  const national=c.national,entrants=national.entrants||[],fixtures=c.fixtures||[],champion=entrants.find((n:any)=>n.id===national.championId);
  const presentation=competitionPresentation({competitionType:'FIFAE'})!;
  const matches=fixtures.filter((f:any)=>stage==='all'||(stage==='knockouts'?f.stage!=='groups':f.groupName===stage));
  return <div className="management-page">
    <CompetitionIntro key={replay} presentation={presentation} fixtureKey={`${careerId}:${c.id}:national-intro:${replay}`} eventName={c.name}/>
    <button className="text-link" onClick={()=>navigate('/competitions')}>← Competitions</button>
    <header className="page-intro"><div><span className="eyebrow">Nations · {national.phase}</span><h1>FIFAe World Cup</h1><p>{c.config.qualificationRule}</p></div><button className="btn btn-secondary" onClick={()=>setReplay(v=>v+1)}>Watch introduction</button></header>
    <p className="notice">{c.config.formatNote} <a href={c.config.source} target="_blank" rel="noreferrer">Published finals rules ↗</a></p>
    <section className="panel"><h2>{champion?`${champion.name} are champions`:'National selections'}</h2><p>{c.config.careerSelectionRule}</p><p>Manage your country alongside your club from the National team screen. Your country’s matches wait for you to play; other national teams play as the calendar advances. National appearances and honours stay separate from RLCS Worlds records; the $250,000 national prize pool does not become club revenue.</p>{c.config.fieldPendingReason&&<p role="status">{c.config.fieldPendingReason}</p>}
      {!entrants.length&&<p>The three-player national squads lock on the event’s start date. Nationality must be recorded and unambiguous; a club’s region does not determine player eligibility.</p>}
      <button className="btn btn-secondary" onClick={()=>navigate('/national-team')}>Manage national team</button><div className="event-groups">{entrants.map((n:any)=><article className="event-group" key={n.id}><h3>{n.name} · Group {n.group}</h3>{n.players.map((p:any)=><button className="text-link" style={{display:'flex',alignItems:'center',gap:10,margin:'10px 0'}} key={p.id} onClick={()=>navigate('/player/'+p.id)}><PlayerAvatar playerId={p.id} gamertag={p.gamertag} overall={0} size="sm"/>{p.gamertag}</button>)}</article>)}</div>
    </section>
    {!!entrants.length&&<><h2>Groups · BO2 double round robin</h2><div className="event-groups">{national.groups.map((g:any)=><article className="event-group panel" key={g.name}><header><h3>Group {g.name}</h3><span>Top four qualify</span></header><table><thead><tr><th>#</th><th>Nation</th><th>P</th><th>W–D–L</th><th>GD</th><th>Pts</th></tr></thead><tbody>{g.standings.map((r:any,i:number)=><tr key={r.id} className={i<4?'upper-place':'out-place'}><td>{i+1}</td><td>{r.name}</td><td>{r.played}/14</td><td>{r.wins}–{r.draws}–{r.losses}</td><td>{r.goalDiff}</td><td>{r.points}</td></tr>)}</tbody></table></article>)}</div>
      <section className="panel"><h2>Results and fixtures</h2><div className="segmented-tabs">{['knockouts','A','B','all'].map(s=><button key={s} className={s===stage?'active':''} onClick={()=>setStage(s)}>{s==='A'||s==='B'?'Group '+s:s}</button>)}</div>
        {!matches.length&&<p>Quarterfinal pairings appear after every group matchup has finished.</p>}
        {matches.map((f:any)=><div className="list-row fixture-line" key={f.id}><span><strong>{f.homeTeamName} vs {f.awayTeamName}</strong><small>{f.scheduledDate} · {f.stage} · {f.seriesFormat}</small></span><strong>{f.status==='completed'?`${f.homeScore}–${f.awayScore}`:'Scheduled'}</strong>{national.managedNationId&&[f.homeTeamId,f.awayTeamId].includes(national.managedNationId)&&<button className="btn btn-secondary" onClick={()=>navigate('/national-match-day/'+f.id)}>{f.status==='completed'?'View result':f.scheduledDate<=date?'Play national match':'View match'}</button>}</div>)}
      </section></>}
  </div>;
}
