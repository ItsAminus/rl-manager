import React,{useEffect,useRef,useState} from 'react';
import {useCareerStore} from '../../stores/careerStore';
import {TeamCrest} from './TeamCrest';
import {commentatorVolume} from '../../game/commentary-audio';
import './PrematchDesk.css';
import {CompetitionIntro} from './CompetitionIntro';
import {competitionPresentation} from '../utils/competition-presentation';

export function PrematchDesk({fixtureId,onPlay,disabled=false,national=false}:{fixtureId:string;onPlay:()=>void;disabled?:boolean;national?:boolean}){
  const career=useCareerStore(s=>s.career);
  const [desk,setDesk]=useState<any>(null),[error,setError]=useState(''),[status,setStatus]=useState<any>({state:'idle',clips:[]});
  const [watching,setWatching]=useState(false),[turn,setTurn]=useState(0),[audioError,setAudioError]=useState('');
  const audio=useRef<HTMLAudioElement|null>(null);
  const generation=useRef(0);
  const [introDone,setIntroDone]=useState(false);
  const [muted,setMuted]=useState(()=>{try{return localStorage.getItem('rlm:desk-muted')==='true';}catch{return false;}});
  const mutedRef=useRef(muted);
  const volumeRef=useRef(1);
  useEffect(()=>{window.api.app.integration().then(value=>{volumeRef.current=commentatorVolume(value.commentaryVolume);if(audio.current)audio.current.volume=volumeRef.current;if(value.commentaryEnabled===false)setMuted(true);}).catch(()=>{});},[]);
  useEffect(()=>{mutedRef.current=muted;if(audio.current)audio.current.muted=muted;try{localStorage.setItem('rlm:desk-muted',String(muted));}catch{/* Optional preference. */}},[muted]);
  useEffect(()=>{
    if(!career)return;
    let alive=true;
    setDesk(null);setError('');setWatching(false);setTurn(0);setIntroDone(false);setStatus({state:'idle',clips:[]});
    const id=career.id;
    void window.api.management.prematchDesk(id,fixtureId,national).then(async result=>{
      if(!alive)return;if(result.error){setError(result.error);return;}setDesk(result);
      if(!competitionPresentation({competitionName:result.event,competitionType:result.competitionType}))setIntroDone(true);
      if(result.tier==='graphics')return;
      const prepared=await window.api.management.prepareDeskAudio(id,fixtureId,national);if(!alive)return;setStatus(prepared);
      if(prepared.error)return;

    }).catch(()=>{if(alive)setError('The preview could not load. You can still play now.');});
    return()=>{alive=false;generation.current++;audio.current?.pause();void window.api.management.cancelDeskAudio(id,fixtureId);};
  },[career?.id,fixtureId,national]);
  useEffect(()=>{if(introDone&&desk?.turns?.length&&['ready','partial','unavailable'].includes(status.state)){setTurn(0);setWatching(true);}},[introDone,desk,status.state]);
  useEffect(()=>{
    const token=++generation.current;audio.current?.pause();audio.current=null;setAudioError('');
    if(!watching||!introDone||!career||!desk)return;
    let fallback:ReturnType<typeof setTimeout>|undefined;
    const advance=()=>{if(token===generation.current){if(turn+1<desk.turns.length)setTurn(turn+1);else setWatching(false);}};
    void window.api.management.deskAudioClip(career.id,fixtureId,turn).then(source=>{
      if(token!==generation.current)return;
      if(!source){setAudioError('Audio unavailable for this section. Subtitles continue.');fallback=setTimeout(advance,Math.max(3000,desk.turns[turn].text.split(/\s+/).length*350));return;}
      const player=audio.current=new Audio(source);
      player.volume=volumeRef.current;player.muted=mutedRef.current;
      player.onended=()=>{if(token===generation.current){if(turn+1<desk.turns.length)setTurn(turn+1);else setWatching(false);}};
      player.onerror=()=>setAudioError('Audio could not play. The discussion is available below.');
      void player.play().catch(()=>setAudioError('Select Resume audio to listen.'));
    }).catch(()=>setAudioError('Audio unavailable. You can still read the discussion.'));
    return()=>{generation.current++;audio.current?.pause();if(fallback)clearTimeout(fallback);};
  },[watching,introDone,turn,desk,career?.id,fixtureId]);
  const stop=()=>{generation.current++;audio.current?.pause();setWatching(false);if(career)void window.api.management.cancelDeskAudio(career.id,fixtureId);};
  return <section className="prematch-desk panel" aria-label="Pre-match broadcast desk">
    {desk&&career&&competitionPresentation({competitionName:desk.event,competitionType:desk.competitionType})&&<CompetitionIntro key={`${career.id}:${fixtureId}`} fixtureKey={`${career.id}:${fixtureId}`} eventName={desk.event} presentation={competitionPresentation({competitionName:desk.event,competitionType:desk.competitionType})!} onComplete={()=>setIntroDone(true)}/>}
    <header><div><span className="eyebrow">RLM MATCH CENTRE</span><h2>{desk?.tier==='extended'?'The big match desk':desk?.tier==='short'?'Pre-match desk':'Matchup briefing'}</h2></div><button className="desk-play" disabled={disabled} onClick={()=>{stop();onPlay();}}>Play now · Skip preview →</button></header>
    {error?<p role="alert">{error}</p>:!desk?<p role="status">Loading matchup… You can play immediately.</p>:<>
      {watching&&<div className="desk-live desk-subtitles" aria-live="polite"><span className="desk-onair">ON AIR · {desk.turns[turn]?.speaker}</span><button onClick={()=>setMuted(value=>!value)} aria-pressed={muted}>{muted?'Unmute commentary':'Mute commentary'}</button><p>{desk.turns[turn]?.text}</p>{audioError&&<p>{audioError} <button onClick={()=>void audio.current?.play()}>Resume audio</button></p>}<button onClick={()=>turn+1<desk.turns.length?setTurn(turn+1):setWatching(false)}>Next section →</button><button onClick={()=>{stop();onPlay();}} disabled={disabled}>Skip · Play now →</button></div>}
      <p className="desk-event">{desk.event} <span>· {desk.round}</span></p>
      <div className="desk-matchup">{[desk.own,desk.opponent].map((team:any,i:number)=><React.Fragment key={team.id}>{i===1&&<b className="desk-vs">VS</b>}<article><TeamCrest id={team.id} name={team.name}/><h3>{team.name}</h3><p>{team.players.map((p:any)=>p.gamertag).join(' · ')}</p><small>Selected lineup · {team.average.toFixed(1)} OVR</small><div className="desk-form" aria-label={`${team.name} recent results`}>{team.recent.map((r:any)=><span key={r.id} className={r.won===null?'draw':r.won?'win':'loss'} title={`${r.score} vs ${r.opponent}`}>{r.won===null?'D':r.won?'W':'L'}</span>)}</div><small>{team.form}</small></article></React.Fragment>)}</div>
      <p className="desk-lead">{desk.preview.comparison}</p>
      <div className="desk-columns"><article><small>PLAYER TO WATCH</small><h3>{desk.preview.keyPlayer||'Lineup unconfirmed'}</h3><p>{desk.preview.form}</p><div className="desk-form">{desk.preview.recent.map((r:any)=><span key={r.id} className={r.won===null?'draw':r.won?'win':'loss'} title={`${r.score} vs ${r.opponent}`}>{r.won===null?'D':r.won?'W':'L'}</span>)}</div></article><article><small>TACTICAL FOCUS</small><p>{desk.preview.advice[0]}</p></article><article><small>DESK PICKS · EDITORIAL</small>{desk.picks.map((p:any)=><p key={p.analyst}><b>{p.analyst}: {p.team}</b><br/><small>{p.reason}</small></p>)}</article></div>
      <details className="desk-history"><summary>Tournament journey & previous meetings</summary><div className="desk-journeys">{[desk.own,desk.opponent].map((team:any)=><article key={team.id}><h3>{team.name} · route so far</h3>{team.journey?.length?<ol>{team.journey.map((r:any)=><li key={r.id}><span className={r.won===null?'draw':r.won?'win':'loss'}>{r.won===null?'D':r.won?'W':'L'}</span><div><b>{r.score} vs {r.opponent}</b><small>{r.round} · {r.date}</small></div></li>)}</ol>:<p>No completed series in this event yet.</p>}</article>)}</div><h3>Head-to-head</h3>{desk.preview.headToHead?.length?<ul>{desk.preview.headToHead.map((r:any)=><li key={r.id}>{r.date} · {desk.opponent.name} {r.score} {desk.own.name}</li>)}</ul>:<p>No previous meeting recorded in this career.</p>}</details>
      {desk.tier!=='graphics'&&<div className="desk-discussion"><div className="desk-audio-controls"><button onClick={()=>setMuted(value=>!value)} aria-pressed={muted} aria-label={muted?'Unmute desk commentary':'Mute desk commentary'}>{muted?'Unmute commentary':'Mute commentary'}</button><span role="status">{!introDone?'Commentary follows the introduction.':watching?'Analyst discussion · Subtitles on':status.error||'Analyst discussion finished. You can play now.'}</span></div>
        <details><summary>Read the desk discussion</summary>{desk.turns.map((t:any,i:number)=><p key={i}><b>{t.speaker}: </b>{t.text}</p>)}</details>
      </div>}
      <footer>Based on this career’s current lineup and recorded results. Desk picks are opinions. Audio is optional and never delays kickoff.</footer>
    </>}
  </section>;
}
