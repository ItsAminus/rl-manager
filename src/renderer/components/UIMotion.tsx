import {useLayoutEffect} from 'react';
import {useLocation} from 'react-router-dom';
import '../styles/motion.css';
export function UIMotion(){
  const {pathname}=useLocation();
  useLayoutEffect(()=>{
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const elements=[...document.querySelectorAll('.main-content .page-intro,.main-content .page-heading,.main-content .panel,.main-content .overview-metrics,.menu-fullscreen-container h1')].slice(0,7);
    const animations=elements.map((el,i)=>el.animate([{opacity:.3,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:230,delay:i*22,easing:'cubic-bezier(.2,.75,.25,1)'}));
    return()=>animations.forEach(a=>a.cancel());
  },[pathname]);return null;
}
