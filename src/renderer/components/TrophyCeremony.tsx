import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {useCareerStore} from '../../stores/careerStore';
import {publicAssetUrl} from '../utils/public-assets';
import {readSoundSettings} from '../audio/ui-sounds';
import './TrophyCeremony.css';

function Ceremony({award,onDismiss}:{award:any;onDismiss:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),media=useRef<HTMLVideoElement>(null);
  const [playing,setPlaying]=useState(!!award.video),[blocked,setBlocked]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [muted,setMuted]=useState(!readSoundSettings().enabled);
  useLayoutEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
  useEffect(()=>{if(media.current){media.current.volume=readSoundSettings().volume;void media.current.play().catch(()=>setBlocked(true));}},[]);
  const dismiss=async()=>{if(busy)return;setBusy(true);try{await window.api.competitions.dismissCeremony(award.competitionId);onDismiss();}catch{setError('Could not save the celebration. Please try again.');}finally{setBusy(false);}};
  return <dialog ref={dialog} className="trophy-ceremony" aria-label={`${award.winnerName} trophy celebration`} onCancel={e=>{e.preventDefault();void dismiss();}}>
    {playing&&award.video?<video ref={media} src={publicAssetUrl(award.video)} playsInline muted={muted} onEnded={()=>setPlaying(false)} onError={()=>setPlaying(false)}/>:<div className="trophy-ceremony-backdrop"/>}
    <div className={`trophy-ceremony-content ${playing?'with-video':''}`}><span className="eyebrow">{award.competitionName}</span>
      {!playing&&<svg className="ceremony-cup" viewBox="0 0 120 140" aria-hidden="true"><path d="M30 12h60v38c0 28-14 42-30 42S30 78 30 50V12Zm0 8H12v22c0 20 13 28 24 28m54-50h18v22c0 20-13 28-24 28M60 92v27m-24 9h48" fill="none" stroke="currentColor" strokeWidth="8" strokeLinejoin="round"/></svg>}
      <p className="ceremony-kicker">Champions</p><h1>{award.winnerName}</h1><p>{award.earnedDate} · A place in this career’s history.</p>
    </div>
    {error&&<p className="ceremony-error" role="alert">{error}</p>}
    <footer>{playing&&<><button className="btn btn-secondary" onClick={()=>{if(media.current?.paused)void media.current.play().then(()=>setBlocked(false));else{media.current?.pause();setBlocked(true);}}}>{blocked?'Play ceremony':'Pause'}</button><button className="btn btn-secondary" onClick={()=>setMuted(v=>!v)}>{muted?'Sound on':'Sound off'}</button><button className="btn btn-secondary" onClick={()=>{media.current?.pause();setPlaying(false);}}>Skip video</button></>}
      <button autoFocus className="btn btn-primary" disabled={busy} onClick={()=>void dismiss()}>{busy?'Saving…':'Continue →'}</button></footer>
  </dialog>;
}
export function TrophyCeremony(){
  const careerId=useCareerStore(s=>s.career?.id),date=useCareerStore(s=>s.currentDate),loaded=useCareerStore(s=>s.isLoaded),{pathname}=useLocation();
  const [award,setAward]=useState<any>(null);
  useEffect(()=>{
    setAward(null);if(!careerId||!loaded||pathname.startsWith('/career')||pathname==='/')return;
    let live=true,busy=false;const eventId=pathname.match(/^\/competition\/([^/?]+)/)?.[1];
    const refresh=async()=>{if(busy||document.hidden)return;busy=true;try{const row=await window.api.competitions.ceremony(eventId);if(live)setAward((old:any)=>old?.competitionId===row?.competitionId?old:row);}catch{/* No active career while switching saves. */}finally{busy=false;}};
    void refresh();const interval=setInterval(()=>void refresh(),3000);return()=>{live=false;clearInterval(interval);};
  },[careerId,loaded,date,pathname]);
  return award?<Ceremony key={award.competitionId} award={award} onDismiss={()=>setAward(null)}/>:null;
}
