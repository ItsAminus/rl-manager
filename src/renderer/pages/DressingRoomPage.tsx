import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useCareerStore } from '../../stores/careerStore';
import { PlayerAvatar } from '../components/PlayerAvatar';
import './DressingRoomPage.css';

const TOPICS = [{ id: 'support', label: 'Offer support' }, { id: 'praise', label: 'Praise their work' }, { id: 'performance', label: 'Discuss performance' }, { id: 'tactics', label: 'Explain the tactics' }];
export const DressingRoomPage: React.FC = () => {
  const { career, currentDate, reloadRoster } = useCareerStore();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<any>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = async () => {
    if (!career) return;
    const result = await window.api.management.dressingRoom(career.id);
    if (result.error) throw new Error(result.error);
    setData(result);
    const count = await window.api.inbox.getUnreadCount(career.id);
    useCareerStore.setState({ unreadInboxCount: count });
  };
  useEffect(() => { load().catch(e => setError(String(e))); }, [career?.id, currentDate]);
  const act = async (action: () => Promise<any>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { const result = await action(); if (!result.success) throw new Error(result.error); await load(); await reloadRoster(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  if (!career) return <div className="management-page"><p>Load a career to meet your squad.</p></div>;
  const selected = data?.players.find((p: any) => p.id === params.get('player')) || data?.players[0];
  const conversations = data?.conversations.filter((c: any) => c.playerId === selected?.id) || [];
  const promises = data?.promises.filter((p: any) => p.playerId === selected?.id) || [];
  const pending = conversations.some((c: any) => c.status === 'pending');
  return <div className="management-page dressing-room-page">
    <div className="page-intro"><div><span className="eyebrow">Inside the squad</span><h1>Your relationship with the players.</h1><p>Listen to concerns, explain decisions and keep your promises. Trust carries through your career.</p></div><Link className="btn btn-secondary" to="/squad">Manage lineup</Link></div>
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {data?.dynamics&&<section className="panel"><h2>Squad dynamics</h2><div className="relationship-metrics"><span>Team cohesion <strong>{data.dynamics.cohesion}/100</strong></span><span>Dressing-room atmosphere <strong>{data.dynamics.atmosphere}/100</strong></span><span>Manager support <strong>{data.dynamics.managerSupport}/100</strong></span></div><p>{data.dynamics.note}</p><p>Influential voices: {data.dynamics.voices.map((p:any)=>p.name).join(' · ')||'Squad not established'}</p>{data.dynamics.concerns.map((p:any)=><p key={p.id}>{p.name}: {p.reasons.join(' · ')}</p>)}</section>}
    {!data ? <p>Opening the dressing room…</p> : <div className="dressing-room-layout"><aside className="panel player-meetings" aria-label="Choose player">{data.players.map((p: any) => <button className={`meeting-player ${p.id === selected?.id ? 'selected' : ''}`} key={p.id} onClick={() => setParams({ player: p.id }, { replace: true })}>
      <PlayerAvatar playerId={p.id} gamertag={p.gamertag} overall={p.overall} size="sm" /><span><strong>{p.gamertag}</strong><small>Trust {p.trust}/100{data.conversations.some((c: any) => c.playerId === p.id && c.status === 'pending') ? ' · Wants to talk' : ''}</small></span>
    </button>)}</aside><main className="meeting-content">{selected ? <>
      <section className="panel"><div className="card-topline"><h2>{selected.gamertag}</h2><span className="soft-badge">{selected.trust >= 70 ? 'Strong relationship' : selected.trust <= 30 ? 'Strained relationship' : 'Building trust'}</span></div>
        <div className="relationship-metrics"><span>Trust <strong>{selected.trust}/100</strong></span><span>Morale <strong>{selected.morale}/100</strong></span><span>Confidence <strong>{selected.confidence ?? 50}/100</strong></span></div>
        {!!selected.transferRequested && <div className="notice"><strong>Formal transfer request · {selected.requestStatus||'requested'}</strong><p>{selected.requestReason}</p><small>Requested {selected.requestedDate||'earlier in this career'}. {selected.requestStatus==='accepted'?'The player is listed; clubs can negotiate during the transfer window.':'The player remains under contract. Respond to their conversation below.'}</small></div>}
        <p>{pending ? 'This player has asked to speak. Respond below before starting another meeting.' : 'Start a private meeting. Allow a week between meetings so your feedback has time to matter.'}</p>
        <div className="conversation-actions">{TOPICS.map(t => <button className="btn btn-secondary" key={t.id} disabled={busy || pending || !!selected.lastChatDate && currentDate < new Date(new Date(selected.lastChatDate + 'T12:00:00Z').getTime() + 7 * 86400000).toISOString().slice(0, 10)} onClick={() => act(() => window.api.management.chatWithPlayer(career.id, selected.id, t.id))}>{t.label}</button>)}</div>
      </section>
      {!!promises.length && <section className="panel"><h2>Your commitments</h2>{promises.map((p: any) => <div className="player-promise" key={p.id}><div><strong>{p.label}</strong><small>Made {p.date} · Due {p.dueDate}</small></div><span className={`soft-badge ${p.status === 'broken' ? 'negative' : p.status === 'kept' ? 'positive' : ''}`}>{p.status}</span></div>)}</section>}
      {!conversations.length && <div className="panel empty-state">No conversations yet. Arrange a private meeting to get started.</div>}
      {conversations.map((c: any) => <section className="panel conversation-card" key={c.id}><div className="card-topline"><span className="eyebrow">{c.topic.replace('_', ' ')} · {c.date}</span><span className="soft-badge">{c.status === 'pending' ? 'Reply within 7 days' : c.status}</span></div>
        <div className="conversation-transcript">{c.transcript.map((line: any, i: number) => <div className={`conversation-line ${line.speaker}`} key={i}><strong>{line.speaker === 'manager' ? career.managerName : selected.gamertag}</strong><p>{line.text}</p></div>)}</div>
        {c.status === 'pending' && <div className="conversation-actions">{c.responses.map((r: any) => <button className="btn btn-secondary" disabled={busy} key={r.id} onClick={() => act(() => window.api.management.replyToPlayer(career.id, c.id, r.id))}>{r.label}</button>)}</div>}
      </section>)}
    </> : <div className="panel empty-state">Your squad has no players to meet.</div>}</main></div>}
  </div>;
};
