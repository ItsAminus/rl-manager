import React from 'react';
import { NavLink } from 'react-router-dom';
import { useUiStore } from '../../../stores/uiStore';
import { useCareerStore } from '../../../stores/careerStore';
import './Sidebar.css';
import {isPath} from '../../../game/career-mode';
import {publicAssetUrl} from '../../utils/public-assets';

const GROUPS = [
  {label:'Identity',items:[['/club-studio','Club studio','M12 3l8 4v6c0 4-8 8-8 8s-8-4-8-8V7z'],['/garage','Squad garage','M3 14l2-7h14l2 7v6h-3v-3H6v3H3z M3 14h18 M7 10h10']]},
  { label: 'People', items: [['/dressing-room', 'Dressing room', 'M4 4h16v12H9l-5 4z M8 8h8 M8 12h5']] },
  { label: 'Club', items: [['/dashboard', 'Overview', 'M3 10l9-7 9 7v10H3z M9 20v-7h6v7'], ['/inbox', 'Inbox', 'M3 5h18v14H3z M3 6l9 7 9-7'], ['/social', 'Chirp', 'M4 4h16v12H9l-5 4z M8 8h8 M8 12h5']] },
  { label: 'Squad', items: [['/squad', 'Players', 'M16 21v-3a4 4 0 00-4-4H6a4 4 0 00-4 4v3 M9 10a4 4 0 100-8 4 4 0 000 8 M18 8a3 3 0 013 3 M22 21v-3a4 4 0 00-3-4'], ['/tactics', 'Tactics', 'M4 4h16v16H4z M4 12h16 M12 4v16'], ['/challenges', 'Challenges & rewards', 'M8 3h8v7a4 4 0 01-8 0z M12 14v7 M8 21h8'], ['/training', 'Training', 'M3 8v8 M7 5v14 M7 12h10 M17 5v14 M21 8v8']] },
  { label: 'Recruitment', items: [['/scouting', 'Scouting', 'M10 17a7 7 0 110-14 7 7 0 010 14 M15 15l6 6'], ['/transfers', 'Transfers', 'M4 7h16l-4-4 M20 17H4l4 4']] },
  { label: 'Season', items: [['/calendar', 'Calendar', 'M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4'], ['/competitions', 'Competitions', 'M8 3h8v7a4 4 0 01-8 0z M8 5H3v3a4 4 0 004 4 M16 5h5v3a4 4 0 01-4 4 M12 14v6 M8 21h8'], ['/statistics', 'Statistics', 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2'], ['/finances', 'Finances', 'M3 6h18v14H3z M3 10h18 M16 15h2']] },
];
export default function Sidebar() {
  const { sidebarCollapsed } = useUiStore();
  const { isLoaded, team, unreadInboxCount,career } = useCareerStore();
  if (!isLoaded) return null;
  return <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
    <div className="sidebar-header"><img src={publicAssetUrl('/brand/app-icon.png')} alt="RLM" style={{width:38,height:38,borderRadius:10,objectFit:'cover'}}/>{!sidebarCollapsed && <div className="logo-text">RL Manager<small>YOUR CLUB. YOUR STORY.</small></div>}</div>
    <nav className="sidebar-nav" aria-label="Main navigation">{GROUPS.map(group=>({...group,items:group.items.filter(([route])=>(route!=='/challenges'||isPath(career))&&(!isPath(career)||!['/scouting','/transfers','/social','/finances'].includes(route)))})).filter(g=>g.items.length).map(group => <div className="nav-group" key={group.label}>{!sidebarCollapsed && <div className="nav-group-label">{group.label}</div>}{group.items.map(([route, label, shape]) => <NavLink key={route} to={route} title={label} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>{route==='/social'?<img className="nav-icon" src={publicAssetUrl('/brand/chirp-emblem.png')} alt="" style={{width:24,height:24,borderRadius:6,objectFit:'contain'}}/>:<svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={shape}/></svg>}{!sidebarCollapsed && <><span className="nav-label">{route==='/dashboard'&&isPath(career)?'Your climb':label}</span>{route === '/inbox' && unreadInboxCount > 0 && <span className="nav-count">{unreadInboxCount}</span>}</>}</NavLink>)}</div>)}</nav>
    <div className="sidebar-footer"><NavLink className="nav-item" to="/settings"><span className="settings-symbol">⚙</span>{!sidebarCollapsed && <span>Settings</span>}</NavLink><div className="sidebar-club-mark">{team?.shortName || 'RLM'}</div>{!sidebarCollapsed && <div className="team-summary"><div className="team-name">{team?.name}</div><div className="team-date">Your organization</div></div>}</div>
  </aside>;
}
