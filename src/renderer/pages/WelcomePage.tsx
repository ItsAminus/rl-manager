import React,{useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {publicAssetUrl} from '../utils/public-assets';
import './WelcomePage.css';
import {ArenaBackdrops,readBackdrop,backdropUrl} from '../components/ArenaBackdrops';
export const WelcomePage:React.FC=()=>{
 const navigate=useNavigate(),[version,setVersion]=useState('1.0.0');
 const [background,setBackground]=useState(()=>readBackdrop().file);
 useEffect(()=>{window.api?.app?.playerInfo?.().then(info=>setVersion(info.version)).catch(()=>{});},[]);
 return <div className="welcome-page">
 <div className="welcome-art" style={{backgroundImage:`url("${backdropUrl(background)}")`}}/><div className="welcome-vignette"/>
 <header className="welcome-brand"><img src={publicAssetUrl('/brand/app-icon.png')} alt="RLM orange car emblem"/><div>RL MANAGER<small>YOUR CLUB. YOUR STORY.</small></div></header>
 <div className="welcome-content"><span className="welcome-badge">THE NEXT CHAPTER IS YOURS</span><h1>From the dugout<br/>to the <em>world stage.</em></h1><p className="welcome-subtitle">Build a club that belongs at the top.<br/>Or take one squad all the way from the trenches.</p>
 <div className="welcome-actions"><button className="welcome-career-card" onClick={()=>navigate('/career/new')}><span className="welcome-card-number">01</span><div><strong>Manager Career</strong><small>Lead the club. Shape the esports world.</small></div><b>↗</b></button><button className="welcome-career-card path" onClick={()=>navigate('/career/path/new')}><span className="welcome-card-number">02</span><div><strong>Path To Glory</strong><small>One squad. Earn every step to 99.</small></div><b>↗</b></button><button className="welcome-load" onClick={()=>navigate('/career/load')}><span>↳</span> Continue a saved career <b>→</b></button></div>
 <nav className="welcome-utilities" aria-label="Game menu"><button onClick={()=>window.dispatchEvent(new Event('rlm:open-tutorial'))}>Guided tutorial</button><span>·</span><button onClick={()=>navigate('/settings')}>Settings</button><span>·</span><button onClick={()=>window.api.app.quit()}>Quit game</button></nav>
 </div><ArenaBackdrops onChange={setBackground}/><footer className="welcome-footer"><span>RLM <b>{version}</b></span><span>MAKE THE NEXT GAME MATTER.</span></footer></div>;
};
