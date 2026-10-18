import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUiStore } from '../../../stores/uiStore';
import { useCareerStore } from '../../../stores/careerStore';
import './TopBar.css';
import {playUiSound} from '../../audio/ui-sounds';

export default function TopBar() {
  const navigate = useNavigate(), location = useLocation();
  const { toggleSidebar } = useUiStore();
  const { isLoaded, currentDate, advanceToNextEvent, upcomingFixtures, unreadInboxCount } = useCareerStore();
  const [busy, setBusy] = useState(false);
  const canGoBack = Number(window.history.state?.idx || 0) > 0;
  const goBack = () => { if (canGoBack) navigate(-1); };
  const today = upcomingFixtures.find(f => f.scheduledDate <= currentDate);
  const continueCareer = async () => {
    if (today) { navigate(`/match-day/${today.id}`); return; }
    setBusy(true); try { await advanceToNextEvent();playUiSound('success'); } finally { setBusy(false); }
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.altKey && e.key === 'ArrowLeft' && canGoBack) { e.preventDefault(); navigate(-1); } };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [navigate, canGoBack]);
  const page = location.pathname === '/social' ? 'Chirp' : location.pathname.split('/')[1].replace(/-/g, ' ');
  return <header className="topbar"><div className="topbar-left"><button className="btn-icon" onClick={toggleSidebar} title="Toggle navigation" aria-label="Toggle navigation">☰</button><button className="back-button" onClick={goBack} disabled={!canGoBack} aria-label="Back to previous page" title="Back to previous page">← Back</button><span className="workspace-breadcrumb">Club workspace <span>/</span> <strong>{page === 'dashboard' ? 'Overview' : page}</strong></span></div>{isLoaded && <div className="topbar-right"><span className="date-text">{new Date(currentDate + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</span><button className="btn-icon notification-btn" onClick={() => navigate('/inbox')} aria-label={`Inbox, ${unreadInboxCount} unread messages`} title="Inbox"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 5h16v14H4z M4 6l8 7 8-7" /></svg>{unreadInboxCount > 0 && <span className="notification-dot" />}</button><button className="btn btn-primary" disabled={busy} onClick={continueCareer}>{busy ? 'Advancing…' : today ? 'Match day →' : 'Continue →'}</button></div>}</header>;
}
