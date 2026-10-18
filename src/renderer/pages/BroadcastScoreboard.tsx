import React,{useEffect,useState} from 'react';
import {PlayerAvatar} from '../components/PlayerAvatar';
import './BroadcastScoreboard.css';
import {publicAssetUrl as asset} from '../utils/public-assets';
function Crest({team}:{team:any}){
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[team.id,team.logo]);
  return team.logo&&!failed?<img src={asset(team.logo)} alt={team.name} onError={()=>setFailed(true)}/>:<span className="broadcast-crest-fallback">{team.shortName?.slice(0,3)}</span>;
}
export const BroadcastScoreboard=()=>{
  const [state,setState]=useState<any>(null);
  useEffect(()=>{
    document.documentElement.classList.add('broadcast-transparent');
    const unsubscribe=window.api.broadcast.onUpdate(setState);
    window.api.broadcast.state().then(setState);
    return ()=>{unsubscribe();document.documentElement.classList.remove('broadcast-transparent');};
  },[]);
  if(!state?.context)return null;
  const c=state.context,secs=Math.max(0,Math.ceil(Math.abs(state.remaining))),clock=`${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`;
  const team=(t:any,side:string)=> <div className={'broadcast-club '+side} style={{'--club-color':t.brandColor||(side==='blue'?'#2277DC':'#EA792F')} as React.CSSProperties}><Crest team={t}/><span>{t.shortName}<small>{t.name}</small></span></div>;
  const wins=(n:number)=><div className="broadcast-series-pips">{Array.from({length:Math.ceil(c.series.bestOf/2)},(_,i)=><i className={i<n?'won':''} key={i}/>)}</div>;
  return <div className="broadcast-root"><div className="broadcast-event">{c.event} <span>ROUND {c.round} · GAME {c.series.gameNumber} · BO{c.series.bestOf}</span></div>
    <div className="broadcast-bar">{team(c.blue,'blue')}<b className="broadcast-score blue">{state.blue}</b><div className={'broadcast-clock '+(state.overtime?'ot':'')}>{state.overtime&&<small>OVERTIME</small>}{state.overtime?'+':''}{clock}</div><b className="broadcast-score orange">{state.orange}</b>{team(c.orange,'orange')}</div>
    <div className="broadcast-bottom">{wins(c.series.blueWins)}<span>{c.arena}</span>{wins(c.series.orangeWins)}</div>
    {state.scoreboard&&<div className="broadcast-player-panel">{[c.blue,c.orange].map((t:any,side:number)=><section className={side?'orange':'blue'} key={t.id}><h3><Crest team={t}/>{t.name}</h3><div className="broadcast-stat-labels"><span>PLAYER</span><span>SCORE</span><span>G</span><span>A</span><span>SV</span><span>SH</span></div>{t.players.map((p:any,i:number)=>{const s=state.players.find((x:any)=>x.slot===side*3+i)||{};return <div className="broadcast-player" key={p.playerId}><div><PlayerAvatar playerId={p.playerId} gamertag={p.gamertag} overall={p.rating} size="sm" context="scoreboard"/><span>{p.gamertag}<small>{p.title||''}</small></span></div>{['score','goals','assists','saves','shots'].map(k=><b key={k}>{s[k]||0}</b>)}</div>;})}</section>)}</div>}
  </div>;
};
