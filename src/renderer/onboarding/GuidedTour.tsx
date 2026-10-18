import React,{useEffect,useRef,useState} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {useCareerStore} from '../../stores/careerStore';
import {GUIDE_STEPS} from './guide-steps';
import './GuidedTour.css';

export function GuidedTour(){
  const navigate=useNavigate(),location=useLocation();
  const [screen,setScreen]=useState<'closed'|'intro'|'tour'>('closed'),[index,setIndex]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
  const [rect,setRect]=useState<{x:number;y:number;width:number;height:number}|null>(null);
  const mode=useRef(''),card=useRef<HTMLElement>(null),target=useRef<Element|null>(null);
  const checkedFirstLaunch=useRef(false);
  const [ready,setReady]=useState(false);
  const step=GUIDE_STEPS[index];
  useEffect(()=>{let alive=true;if(!checkedFirstLaunch.current)window.api?.app?.playerInfo?.().then(info=>{if(!alive)return;checkedFirstLaunch.current=true;if((info.preferences?.tutorialVersion||0)<info.tutorialVersion)setScreen('intro');}).catch(()=>{});
    const open=()=>{if(screen==='closed'){setIndex(0);setScreen('intro');}};window.addEventListener('rlm:open-tutorial',open);return()=>{alive=false;window.removeEventListener('rlm:open-tutorial',open);};
  },[screen]);
  const finish=async(outcome:'completed'|'skipped')=>{
    if(busy)return;setBusy(true);setError('');
    try{await window.api.tutorial.finish(outcome);useCareerStore.getState().unloadCareer();mode.current='';setScreen('closed');navigate('/',{replace:true});}
    catch(e){setError(String(e));}finally{setBusy(false);}
  };
  useEffect(()=>{
    if(screen!=='tour')return;let alive=true;setBusy(true);setReady(false);setDone(false);setRect(null);setError('');
    (async()=>{
      if(mode.current!==step.mode){
        const result=await window.api.tutorial.start(step.mode);if(!alive)return;
        if(!result.success)throw Error(result.error);
        if(!await useCareerStore.getState().loadCareer(result.id))throw Error('Could not open the practice squad.');
        mode.current=step.mode;
      }
      if(!alive)return;
      const state=useCareerStore.getState(),fixture=state.upcomingFixtures[0];
      const route=step.route.replace('$fixture',fixture?.id||'').replace('$event',fixture?.competitionId||'');
      navigate(route,{replace:true});setReady(true);
    })().catch(e=>{if(alive)setError(String(e));}).finally(()=>{if(alive)setBusy(false);});
    return()=>{alive=false;};
  },[screen,index]);
  useEffect(()=>{
    if(screen!=='tour'||!ready)return;
    let scrolled=false,initialLineup:string|null=null;const measure=()=>{
      if(step.event==='post'&&document.querySelector('.chirp-thread-root'))setDone(true);
      if(step.event==='saved'&&document.querySelector('.tactics-save-banner'))setDone(true);
      if(step.event==='lineup'){const value=document.querySelector('.squad-page')?.getAttribute('data-lineup')||null;if(initialLineup===null)initialLineup=value;else if(value&&value!==initialLineup)setDone(true);}
      const found=document.querySelector(step.target)||(!step.event?document.querySelector('.main-content'):null);
      target.current=found;
      if(!found)return;
      if(!scrolled){found.scrollIntoView({block:'center',behavior:'instant' as ScrollBehavior});scrolled=true;}
      const b=found.getBoundingClientRect(),x=Math.max(7,b.x-7),y=Math.max(38,b.y-7);
      const next={x,y,width:Math.max(0,Math.min(window.innerWidth-x-7,b.right-x+7)),height:Math.max(0,Math.min(window.innerHeight-y-7,b.bottom-y+7))};
      setRect(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);
      if(step.event==='upgrade'&&document.querySelector('.skill-upgrade-receipt'))setDone(true);
    };
    const observer=new MutationObserver(measure);observer.observe(document.body,{childList:true,subtree:true,attributes:true});measure();
    const resize=new ResizeObserver(measure);resize.observe(document.body);
    window.addEventListener('scroll',measure,true);window.addEventListener('resize',measure);
    const interaction=(event:Event)=>{
      const node=event.target as Element;if(card.current?.contains(node))return;
      if(target.current&&!target.current.contains(node)){event.preventDefault();event.stopPropagation();return;}
      if(step.event&&event.type===step.event)setDone(true);
    };
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();void finish('skipped');return;}
      if(event.key==='Tab'){
        const options=[...(target.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,a[href],textarea')||[]),...(card.current?.querySelectorAll<HTMLElement>('button:not(:disabled)')||[])].filter(e=>e.getBoundingClientRect().height>0);
        if(target.current?.matches('button,select,input,a'))options.unshift(target.current as HTMLElement);
        const current=options.indexOf(document.activeElement as HTMLElement);
        if(options.length){event.preventDefault();options[(current+(event.shiftKey?-1:1)+options.length)%options.length].focus();}
      }
    };
    document.addEventListener('click',interaction,true);document.addEventListener('change',interaction,true);document.addEventListener('keydown',key,true);
    return()=>{observer.disconnect();resize.disconnect();window.removeEventListener('scroll',measure,true);window.removeEventListener('resize',measure);document.removeEventListener('click',interaction,true);document.removeEventListener('change',interaction,true);document.removeEventListener('keydown',key,true);};
  },[screen,index,ready,location.pathname]);
  useEffect(()=>{if(screen!=='closed')card.current?.focus();},[screen,index]);
  if(screen==='closed')return null;
  if(screen==='intro')return <div className="tour-intro-screen"><section className="tour-intro" role="dialog" aria-modal="true" aria-labelledby="tour-intro-title" tabIndex={-1} ref={card}>
    <div className="tour-kicker">WELCOME TO RLM · THE COACH’S INDUCTION</div><h1 id="tour-intro-title">Your story starts<br/><em>with a game plan.</em></h1><p>Take a guided lap through both careers. Open real tabs, try controls and make your first skill upgrade in a practice squad.</p>
    <div className="tour-mode-preview"><article><span>01 / MANAGER CAREER</span><h2>Build the club.</h2><div className="tour-path-diagram"><i>Squad</i><b>→</b><i>Qualify</i><b>→</b><i>Worlds</i></div><p>Transfers. Tactics. Players. The entire esports world.</p></article><article><span>02 / PATH TO GLORY</span><h2>Build the players.</h2><div className="tour-path-diagram"><i>Learn</i><b>→</b><i>Upgrade</i><b>→</b><i>99</i></div><p>One squad. Earned progression. A climb from the ground up.</p></article></div>
    <p className="tour-safe">✦ Practice is separate. Your saves, money and players stay untouched. Skip any time. Replay from Settings.</p>{error&&<p role="alert">{error}</p>}<div className="tour-intro-actions"><button className="tour-primary" disabled={busy} onClick={()=>setScreen('tour')}>Take the guided tour <span>↗</span></button><button className="tour-secondary" disabled={busy} onClick={()=>finish('skipped')}>Skip to main menu</button></div>
  </section></div>;
  const cardWidth=Math.min(390,window.innerWidth-32),left=rect&&rect.x>window.innerWidth*.5?24:window.innerWidth-cardWidth-24;
  const top=rect&&rect.y>window.innerHeight*.55?70:Math.max(80,window.innerHeight-430);
  const end={x:rect?rect.x+Math.min(rect.width/2,60):window.innerWidth/2,y:rect?rect.y+Math.min(rect.height/2,35):120},start={x:left+cardWidth/2,y:top+10};
  return <div className="tour-root" data-step={step.id}>
    <svg className="tour-spotlight" width="100%" height="100%" aria-hidden="true"><defs><mask id="tour-cutout"><rect width="100%" height="100%" fill="white"/>{rect&&<rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx="13" fill="black"/>}</mask><marker id="tour-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#ffbd57"/></marker></defs><rect width="100%" height="100%" fill="#020812cc" mask="url(#tour-cutout)"/>{rect&&<><rect className="tour-outline" x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx="13"/><path d={`M${start.x},${start.y} Q${start.x},${end.y-70} ${end.x},${end.y}`} fill="none" stroke="#ffbd57" strokeWidth="2" strokeDasharray="5 6" markerEnd="url(#tour-arrowhead)"/><circle className="tour-pulse" cx={end.x} cy={end.y} r="13"/></>}</svg>
    <div className="tour-top-label"><span>RLM FIELD GUIDE</span><strong>{step.mode}</strong><small>PRACTICE CAREER · {index+1}/{GUIDE_STEPS.length}</small></div>
    <section ref={card} className="tour-coach-card" style={{left,top,width:cardWidth,maxHeight:Math.max(180,window.innerHeight-top-18)}} role="dialog" aria-label={step.title} tabIndex={-1}><div className="tour-card-progress"><i style={{width:`${(index+1)/GUIDE_STEPS.length*100}%`}}/></div><div className="tour-kicker">{step.chapter}</div><h2>{step.title}</h2><p>{step.body}</p>{step.task&&<div className={`tour-task ${done?'complete':''}`} role="status">{done?'✓ Done. Nice work.':'◎ '+step.task}</div>}{busy&&<p role="status">Preparing your practice workspace…</p>}{error&&<p className="tour-error" role="alert">{error}</p>}
      <div className="tour-card-actions"><button className="tour-secondary" disabled={busy||index===0} onClick={()=>setIndex(n=>n-1)}>← Back</button><button className="tour-primary" disabled={busy||!ready||!!step.event&&!done} onClick={()=>index===GUIDE_STEPS.length-1?finish('completed'):setIndex(n=>n+1)}>{index===GUIDE_STEPS.length-1?'Choose your career →':'Continue →'}</button></div><button className="tour-skip" disabled={busy} onClick={()=>finish('skipped')}>Skip tour · return to menu</button>
    </section>
  </div>;
}
