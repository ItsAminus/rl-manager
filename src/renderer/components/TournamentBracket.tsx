import {TeamLink} from './TeamLink';
import React,{useLayoutEffect,useRef,useState} from 'react';
import {officialProfile} from '../../services/broadcast-assets';
import './TournamentBracket.css';
import {TournamentStages} from './TournamentStages';
import {publicAssetUrl} from '../utils/public-assets';
const logo=(teamId:string)=>officialProfile({teamId,kind:'Club'}).avatarUrl;
function TeamLogo({id}:{id:string}){const [failed,setFailed]=useState(false);const src=logo(id);React.useEffect(()=>setFailed(false),[id,src]);return src&&!failed?<img src={publicAssetUrl(src)} alt="" onError={()=>setFailed(true)}/>:<span className="bracket-crest">◇</span>;}

export function TournamentBracket({competition,teamId,onOpen}:{competition:any;teamId?:string;onOpen:(id:string)=>void}){
  const [search,setSearch]=useState(''),[mine,setMine]=useState(false),[limit,setLimit]=useState(32);
  const container=useRef<HTMLDivElement>(null),[lines,setLines]=useState<any[]>([]);
  const knockout=competition.format==='single_elimination'||competition.format==='double_elimination';
  const all:any[]=competition.fixtures||[],byes:any[]=competition.byes||[];
  const rounds=[...new Set([...all.map(f=>f.round),...byes.map(f=>f.round)])].sort((a,b)=>a-b);
  const allowed=(f:any)=> (!mine||[f.homeTeamId,f.awayTeamId].includes(teamId))&&(!search||`${f.homeTeamName} ${f.awayTeamName}`.toLowerCase().includes(search.toLowerCase()));
  const visible=all.filter(allowed);
  useLayoutEffect(()=>{
    const element=container.current;if(!element)return;
    const measure=()=>{
      const base=element.getBoundingClientRect(),edges:any[]=[];
      if(knockout)for(const f of visible){
        if(f.status!=='completed')continue;
        const winner=f.homeScore>f.awayScore?f.homeTeamId:f.awayTeamId;
        const next=visible.filter(g=>g.round>f.round&&[g.homeTeamId,g.awayTeamId].includes(winner)).sort((a,b)=>a.round-b.round)[0];
        const a=element.querySelector(`[data-match="${f.id}"]`)?.getBoundingClientRect(),b=next&&element.querySelector(`[data-match="${next.id}"]`)?.getBoundingClientRect();
        if(a&&b){const x1=a.right-base.left,y1=a.top-base.top+a.height/2,x2=b.left-base.left,y2=b.top-base.top+b.height/2;edges.push({key:f.id,path:`M ${x1} ${y1} H ${(x1+x2)/2} V ${y2} H ${x2}`,own:winner===teamId});}
      }
      setLines(edges);
    };
    measure();const observer=new ResizeObserver(measure);observer.observe(element);return ()=>observer.disconnect();
  },[competition,search,mine,limit,teamId]);
  const qualified=competition.qualified||[];
  if(competition.tournament)return <TournamentStages competition={competition} teamId={teamId} onOpen={onOpen}/>;
  return <section className="tournament-bracket"><div className="bracket-toolbar"><div><span className="eyebrow">TOURNAMENT STAGE</span><h2>{competition.format==='archived_results'?'Prior-format results':knockout?'Qualification bracket':competition.format==='friendlies'?'Practice schedule':'Group stage'}</h2><p>{competition.format==='archived_results'?'These completed series are career history. They do not count towards the current tournament group standings.':knockout?'Winners advance. This career qualifier re-seeds surviving teams between rounds.':'Round-robin series: each result updates the group standings.'}</p></div><label><input aria-label="Search bracket teams" placeholder="Find a team…" value={search} onChange={e=>setSearch(e.target.value)}/></label><button className={`btn ${mine?'btn-primary':'btn-secondary'}`} onClick={()=>setMine(v=>!v)}>{mine?'Show all teams':'Your team’s route'}</button></div>
    <div className="bracket-scroll"><div className="bracket-canvas" ref={container}><svg className="bracket-connectors" aria-hidden="true">{lines.map(l=><path key={l.key} d={l.path} className={l.own?'own':''}/>)}</svg>
      {rounds.map((round:number)=><section className="bracket-column" key={round}><header><span>{knockout?'OPEN QUALIFIER':'GROUP STAGE'}</span><h3>Round {round}</h3><small>{all.filter(f=>f.round===round&&f.status==='completed').length} / {all.filter(f=>f.round===round).length} series complete</small></header><div className="bracket-cards">{visible.filter(f=>f.round===round).slice(0,limit).map((f:any)=>{
        const own=[f.homeTeamId,f.awayTeamId].includes(teamId),complete=f.status==='completed';
        return <div data-match={f.id} className={`tournament-match ${own?'your-match':''} ${f.status==='in_progress'?'live':''}`} key={f.id} ><div className="tournament-match-meta"><button className="text-link" onClick={()=>onOpen(f.id)}>{f.seriesFormat} · View series →</button><span>{complete?'FINAL':f.status==='in_progress'?'IN PROGRESS':f.scheduledDate}</span></div>{[true,false].map(home=>{const name=home?f.homeTeamName:f.awayTeamName,id=home?f.homeTeamId:f.awayTeamId,score=home?f.homeScore:f.awayScore,winner=complete&&(home?f.homeScore>f.awayScore:f.awayScore>f.homeScore);return <div className={`tournament-team ${winner?'winner':''} ${id===teamId?'managed':''}`} key={id}><TeamLogo id={id}/><span><TeamLink id={id}>{name}</TeamLink>{id===teamId&&<small>YOUR TEAM</small>}</span><b>{complete||f.status==='in_progress'?score??0:'–'}</b>{winner&&<i>✓</i>}</div>;})}</div>;
      })}{byes.filter(b=>b.round===round&&(!mine||b.teamId===teamId)&&(!search||b.teamName.toLowerCase().includes(search.toLowerCase()))).slice(0,limit).map((b:any)=><div className={'tournament-match bye '+(b.teamId===teamId?'your-match':'')} key={b.teamId}><div className="tournament-match-meta">SEEDED BYE · ADVANCES</div><div className="tournament-team"><TeamLogo id={b.teamId}/><TeamLink id={b.teamId}>{b.teamName}</TeamLink><b>BYE</b></div></div>)}{Math.max(visible.filter(f=>f.round===round).length,byes.filter(b=>b.round===round&&(!mine||b.teamId===teamId)&&(!search||b.teamName.toLowerCase().includes(search.toLowerCase()))).length)>limit&&<button className="bracket-more" onClick={()=>setLimit(l=>l+32)}>Show more matchups</button>}</div></section>)}
      {knockout&&<section className="bracket-column qualification"><header><span>NEXT STAGE</span><h3>Regional qualification</h3><small>{qualified.length?`${qualified.length} confirmed qualifiers`:'Final sixteen advance'}</small></header><div className="bracket-cards">{qualified.length?qualified.map((t:any)=><div className={'tournament-match qualified '+(t.id===teamId?'your-match':'')} key={t.id}><div className="tournament-team"><TeamLogo id={t.id}/><TeamLink id={t.id}>{t.name}</TeamLink><b>✓</b></div></div>):<div className="bracket-awaiting">Awaiting qualifier results<br/><small>Teams appear here when qualification is confirmed.</small></div>}</div></section>}
    </div></div>{!rounds.length&&<div className="empty-state">The stage draw appears once its entrants qualify.</div>}
    <footer className="bracket-legend"><span><i className="managed"/> Your team</span><span><i className="winner"/> Series winner</span><span>Updates automatically from saved results</span></footer>
  </section>;
}
