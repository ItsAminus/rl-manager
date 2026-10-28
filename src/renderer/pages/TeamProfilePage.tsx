import React,{useEffect,useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import {TeamCrest} from '../components/TeamCrest';
import './TeamProfilePage.css';
import {PlayerAvatar} from '../components/PlayerAvatar';
import {TeamLink} from '../components/TeamLink';
import {OpponentReport} from '../components/OpponentReport';
import {useCareerStore} from '../../stores/careerStore';

export function TeamProfilePage(){
  const {id}=useParams(),{career,currentDate}=useCareerStore();
  const [club,setClub]=useState<any>(null),[players,setPlayers]=useState<any[]>([]),[error,setError]=useState(''),[results,setResults]=useState<any[]>([]);
  useEffect(()=>{let alive=true;setClub(null);setError('');Promise.all([window.api.teams.getById(id!),window.api.players.getByTeam(id!),window.api.teams.recentResults(id!)]).then(([t,p,r])=>{if(alive){if(!t||t.error)throw Error(t?.error||'Team not found.');setClub(t);setPlayers(p);setResults(r);}}).catch(e=>{if(alive)setError(String(e));});return()=>{alive=false;};},[id,career?.id,currentDate]);
  return <main className="management-page club-profile"><Link className="text-link" to="/competitions">← Competitions</Link>{error?<p role="alert">{error}</p>:!club?<p role="status">Loading club…</p>:<><header className="panel"><div className="club-heading"><TeamCrest id={club.id} name={club.name}/><div><span className="eyebrow">{club.region} · Club profile</span><h1>{club.name}</h1></div></div><p>{club.shortName} · Reputation {club.reputation}/100 · {players.length} players in this career</p>{club.rosterNote&&<p>{club.rosterNote}</p>}</header><section className="panel"><h2>Current squad</h2><p>Transfers and player information belong to this save.</p><div className="reports-grid">{players.map(p=><article className="panel club-player" key={p.id}><PlayerAvatar playerId={p.id} gamertag={p.gamertag} overall={p.overall??0} size="md"/><div><Link className="text-link" to={`/player/${p.id}`}><strong>{p.gamertag}</strong></Link><p>{p.preferredTendency} · {p.nationality||'Nationality unconfirmed'}</p><p>OVR {p.overall??p.estimatedOverall??'Unscouted'}</p></div></article>)}</div>{!players.length&&<p>No confirmed players on file.</p>}</section><section className="panel club-results"><h2>Recent series</h2>{results.map(r=><article key={r.id}><TeamLink id={r.homeTeamId}>{r.homeTeamName}</TeamLink> <strong>{r.homeScore}–{r.awayScore}</strong> <TeamLink id={r.awayTeamId}>{r.awayTeamName}</TeamLink><small>{r.scheduledDate} · {r.competitionName}</small></article>)}{!results.length&&<p>No completed series in this career yet.</p>}</section><OpponentReport teamId={club.id}/></>}</main>;
}
