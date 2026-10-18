import {useEffect,useRef} from 'react';
import {useLocation} from 'react-router-dom';
import {useCareerStore} from '../../stores/careerStore';
import {playUiSound,type UISound} from '../audio/ui-sounds';
import {timeoutMusic,syncTimeoutMusic} from '../audio/timeout-music';
export function UISoundEffects(){
  const location=useLocation(),previous=useRef(location.pathname);
  const unread=useCareerStore(s=>s.unreadInboxCount),oldUnread=useRef(unread);
  const careerId=useCareerStore(s=>s.career?.id),menu=location.pathname==='/'||location.pathname.startsWith('/career');
  useEffect(()=>{
    let alive=true;
    timeoutMusic.stop();
    if(!careerId||menu)return;
    const restore=async()=>{
      const revision=timeoutMusic.revision;
      try{
        const state=await window.api.management.activeSeriesTimeout?.(careerId);
        if(alive&&revision===timeoutMusic.revision&&state&&!state.error)syncTimeoutMusic(careerId,state.fixtureId,state);
      }catch{/* A missing connection must not leave audio playing beyond its deadline. */}
    };
    const retry=()=>timeoutMusic.resume();
    void restore();
    window.addEventListener('focus',restore);
    window.addEventListener('rl-manager-sound-settings',retry);
    document.addEventListener('pointerdown',retry);
    document.addEventListener('keydown',retry);
    return()=>{
      alive=false;timeoutMusic.stop();
      window.removeEventListener('focus',restore);
      window.removeEventListener('rl-manager-sound-settings',retry);
      document.removeEventListener('pointerdown',retry);
      document.removeEventListener('keydown',retry);
    };
  },[careerId,menu]);
  useEffect(()=>{
    if(previous.current!==location.pathname)playUiSound(location.pathname==='/social'?'chirp':location.pathname.startsWith('/match-day')?'match':'navigate');
    previous.current=location.pathname;
  },[location.pathname]);
  useEffect(()=>{if(unread>oldUnread.current)playUiSound('message');oldUnread.current=unread;},[unread]);
  useEffect(()=>{
    const click=(event:MouseEvent)=>{
      const button=(event.target as Element)?.closest?.('button,[role=button],a');
      if(!button||button.hasAttribute('disabled'))return;
      const explicit=button.getAttribute('data-sound');if(explicit==='none')return;
      if(explicit)playUiSound(explicit as UISound);
      else if(!button.closest('.chirp-composer,.chirp-reply-composer,.chirp-actions,.chirp-person,.chirp-profile-top'))playUiSound('tap');
    };
    document.addEventListener('click',click);return()=>document.removeEventListener('click',click);
  },[]);
  return null;
}
