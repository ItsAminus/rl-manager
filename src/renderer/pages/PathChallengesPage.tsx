import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useCareerStore } from '../../stores/careerStore';
import { isPath } from '../../game/career-mode';
import './PathToGloryPage.css';
export function PathChallengesPage() {
  const career = useCareerStore((s) => s.career),
    navigate = useNavigate();
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [filter, setFilter] = useState('all'),
    [selected, setSelected] = useState(''),
    [busy, setBusy] = useState(false);
  const load = async () => {
    if (!career) return;
    const r = await window.api.management.pathOverview(career.id);
    if (r.error) throw Error(r.error);
    setData(r);
    setSelected((p) => p || r.players[1]?.id || r.players[0]?.id);
  };
  useEffect(() => {
    load().catch((e) => setError(String(e)));
  }, [career?.id]);
  if (!isPath(career)) return <Navigate to="/dashboard" replace />;
  const activate = async (key: string) => {
    if (!career || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await window.api.management.pathFormReward(
        career.id,
        key,
        selected,
        data.nextFixture.id
      );
      if (r.error || !r.success) throw Error(r.error || 'Reward unavailable');
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="management-page path-challenges-page">
      <header className="page-intro">
        <div>
          <span className="eyebrow">Path To Glory · Challenges & rewards</span>
          <h1>Every game builds something.</h1>
          <p>
            Wins, losses, saves, passes and perseverance. XP rewards go to all three players
            automatically.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
          Your climb →
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {!data ? (
        <p>Loading your challenges…</p>
      ) : (
        <>
          <section className="panel path-reward-explainer">
            <h2>
              {data.challenges.filter((c: any) => c.completed).length} / {data.challenges.length}{' '}
              challenges completed
            </h2>
            <p>
              Breakthrough form rewards let one of your existing players use a 92+ AI snapshot for
              one BO3 or BO5 series: two to five games. Their permanent skills and OVR stay
              unchanged. Local play uses Nexto, with its existing ability ceiling. Your own controls
              receive no assistance.
            </p>
            <label>
              Who should receive your next form reward?{' '}
              <select
                aria-label="Form reward player"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {data.players.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.gamertag} · {p.overall} OVR
                  </option>
                ))}
              </select>
            </label>
            <p>
              Activate before the first game. One reward per series. You can bank rewards until you
              need them.
            </p>
          </section>
          <div className="conversation-actions" aria-label="Filter challenges">
            {['all', 'available', 'completed'].map((f) => (
              <button
                key={f}
                className={'btn ' + (filter === f ? 'btn-primary' : 'btn-secondary')}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All challenges' : f === 'available' ? 'Still to earn' : 'Completed'}
              </button>
            ))}
          </div>
          <section className="path-challenge-grid">
            {data.challenges
              .filter(
                (c: any) =>
                  filter === 'all' || (filter === 'completed' ? c.completed : !c.completed)
              )
              .map((ch: any) => (
                <article className={'panel ' + (ch.completed ? 'completed' : '')} key={ch.key}>
                  <strong>
                    {ch.completed ? '✓ ' : ''}
                    {ch.title}
                  </strong>
                  <p>{ch.description}</p>
                  <progress max={ch.target} value={ch.progress} />
                  <small>
                    {ch.progress} / {ch.target} · +{ch.xp} XP each
                    {ch.completed ? ' · XP awarded' : ''}
                  </small>
                  {ch.boost && (
                    <div className="path-form-reward">
                      <b>✦ Breakthrough form · one series</b>
                      {ch.reward ? (
                        <small>
                          Activated for{' '}
                          {data.players.find((p: any) => p.id === ch.reward.playerId)?.gamertag}.
                          This reward has been used.
                        </small>
                      ) : (
                        <button
                          className="btn btn-secondary"
                          disabled={
                            !ch.completed ||
                            busy ||
                            !data.nextFixture ||
                            data.nextFixture.status !== 'scheduled' ||
                            !['BO3', 'BO5'].includes(data.nextFixture.seriesFormat)
                          }
                          onClick={() => activate(ch.key)}
                        >
                          {ch.completed ? 'Use on next series' : 'Earn challenge to unlock'}
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
          </section>
        </>
      )}
    </main>
  );
}
