import React, { useEffect, useState } from 'react';
import { useCareerStore } from '../../stores/careerStore';
import '../pages/DressingRoomPage.css';

const TONES = {
  pregame: [{ id: 'encourage', label: 'Back the squad' }, { id: 'focus', label: 'Focus on rotations' }, { id: 'relax', label: 'Ease the pressure' }, { id: 'challenge', label: 'Demand commitment' }],
  postgame: [{ id: 'praise', label: 'Recognise the effort' }, { id: 'reassure', label: 'Support and reset' }, { id: 'critical', label: 'Challenge the performance' }],
};
export function TeamTalkPanel({ fixtureId, phase, revision, disabled }: { fixtureId: string; phase: 'pregame' | 'postgame'; revision: number; disabled?: boolean }) {
  const { career, reloadRoster } = useCareerStore();
  const [data, setData] = useState<any>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    if (!career) return;
    let active = true;
    window.api.management.teamTalks(career.id, fixtureId).then(result => { if (active) { if (!result.success) setError(result.error); else { setData(result); setError(''); } } }).catch(e => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, [career?.id, fixtureId, phase, revision]);
  const deliver = async (tone: string) => {
    if (!career || busy || disabled) return;
    setBusy(true); setError('');
    try {
      const result = await window.api.management.giveTeamTalk(career.id, fixtureId, phase, tone);
      if (!result.success) throw new Error(result.error);
      setData(await window.api.management.teamTalks(career.id, fixtureId));
      await reloadRoster();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const talk = data?.talks?.find((t: any) => t.phase === phase);
  const available = phase === 'pregame' ? data?.canPregame : data?.canPostgame;
  if (!talk && !available && !error) return null;
  return <section className="panel team-talk-panel" aria-label={`${phase === 'pregame' ? 'Pregame' : 'Postgame'} team talk`}>
    <div className="card-topline"><h2>{phase === 'pregame' ? 'Before the first kickoff' : 'Series debrief'}</h2><span className="soft-badge">Team talk</span></div>
    {error && <p role="alert" className="notice notice-error">{error}</p>}
    {talk ? <><p className="coach-quote">“{talk.body}”</p><div className="talk-reactions">{talk.reactions.map((r: any) => <div key={r.playerId}><strong>{r.gamertag}</strong><span>{r.reaction}</span><small>Morale {r.morale >= 0 ? '+' : ''}{r.morale} · Confidence {r.confidence >= 0 ? '+' : ''}{r.confidence}</small></div>)}</div></>
      : <><p>Choose your message. Reactions depend on each player’s pressure resistance and trust in you.</p><div className="conversation-actions">{TONES[phase].map(t => <button className="btn btn-secondary" key={t.id} disabled={busy || disabled} onClick={() => deliver(t.id)}>{t.label}</button>)}</div></>}
  </section>;
}
