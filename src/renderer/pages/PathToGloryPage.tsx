import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCareerStore } from '../../stores/careerStore';
import { TeamCrest } from '../components/TeamCrest';
import { PlayerAvatar } from '../components/PlayerAvatar';
import './PathToGloryPage.css';
import { PATH_RANKS } from '../../game/path-start';
const lessons = [
  [
    'One squad. The whole journey.',
    'Your generated academy squad is based on your selected IRL rank, capped at 80 OVR at the start. Your three players stay together. There are no transfers, contracts, scouting, Chirp or finances. Every played win and loss earns XP for all three. Enter the RLCS circuit through qualifiers, earn points and fight for Majors and Worlds.',
  ],
  [
    'Earn it. Build it.',
    'XP becomes development points. Spend them on passing, dribbling, aerial, shooting and saving in Training. Five total skill improvements earn one OVR. Costs increase as your players improve. Your own controls never receive an artificial boost.',
  ],
  [
    'Prove the promotion.',
    'Meet every skill requirement across the squad, then win a promotion trial. Bots stay fixed within a series. Local bots carry the early climb; the Champ trial unlocks Rocket Host. Winning streaks increase match XP up to 2×, while losses still teach the squad.',
  ],
  [
    'Make your own history.',
    'Rivals recur during each chapter. Achievements give one-time XP. Your timeline keeps victories, streaks, setbacks and promotions. All three at 99 completes the challenge—you can keep playing this save afterwards.',
  ],
];
export function NewPathToGloryPage() {
  const navigate = useNavigate(),
    create = useCareerStore((s) => s.createCareer);
  const [name, setName] = useState('Coach'),
    [club, setClub] = useState('Phoenix Academy'),
    [rank, setRank] = useState(''),
    [region, setRegion] = useState('Europe'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const preset = PATH_RANKS.find((r) => r.rank === rank);
  const start = async () => {
    if (!rank || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await create({
        managerName: name.trim(),
        teamId: 'path_generated',
        region,
        difficulty: 'Hard',
        mode: 'Path To Glory',
        pathRank: rank,
        customOrgName: club.trim(),
      });
      if (!result.success) throw Error(result.error);
      navigate('/dashboard');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="path-setup">
      <button className="btn btn-secondary" onClick={() => navigate('/')}>
        ← Main menu
      </button>
      <span className="eyebrow">Your squad. Your climb.</span>
      <h1>Path To Glory</h1>
      <p>
        Build a generated academy squad around your real Rocket League rank. The same three players
        stay with you from your first qualifier to Worlds.
      </p>
      <div className="path-start-fields">
        <label>
          Your name
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Club name
          <input
            value={club}
            minLength={2}
            maxLength={40}
            onChange={(e) => setClub(e.target.value)}
          />
        </label>
        <label>
          Your IRL rank
          <select aria-label="Your IRL rank" value={rank} onChange={(e) => setRank(e.target.value)}>
            <option value="">Choose your rank…</option>
            {PATH_RANKS.map((r) => (
              <option key={r.rank}>{r.rank}</option>
            ))}
          </select>
        </label>
        <label>
          Competitive region
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            {[
              'Europe',
              'North America',
              'MENA',
              'South America',
              'Oceania',
              'Asia-Pacific',
              'Sub-Saharan Africa',
            ].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
      </div>
      {preset && (
        <section className="panel path-start-preview">
          <h2>Your starting point</h2>
          <p>
            Three academy players:{' '}
            {[0, 1, 2].map((i) => Math.min(80, preset.start + i - 1)).join(' / ')} OVR. No starting
            player can exceed 80.
          </p>
          <p>
            Ladder opposition starts around {preset.opposition} OVR and grows with your squad.
            Official tournaments retain their real career rosters and qualification rules.
          </p>
          {preset.opposition >= 84 && (
            <small>
              The strongest local opponents use Nexto until your squad unlocks Rocket Host. Local
              Nexto has a GC-level ceiling; it cannot reproduce full SSL play.
            </small>
          )}
        </section>
      )}
      {error && <p role="alert">{error}</p>}
      <button
        className="btn btn-primary"
        disabled={!rank || !name.trim() || club.trim().length < 2 || busy}
        onClick={start}
      >
        {busy ? 'Building your squad…' : 'Begin Path To Glory →'}
      </button>
    </main>
  );
}
export function PathRankControl({ onSaved }: { onSaved?: () => void }) {
  const career = useCareerStore((s) => s.career),
    [rank, setRank] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  useEffect(() => {
    if (career) window.api.management.pathOverview(career.id).then((r) => setRank(r.rank || ''));
  }, [career?.id]);
  const save = async () => {
    if (!career || !rank || busy) return;
    setBusy(true);
    try {
      const r = await window.api.management.pathRank(career.id, rank);
      if (r.error) throw Error(r.error);
      await useCareerStore.getState().reloadRoster();
      const loaded = await window.api.fixtures.getUpcoming(career.teamId, career.currentDate);
      useCareerStore.setState({ upcomingFixtures: loaded });
      setNotice('Rank saved. New ladder opponents adjusted; earned progress is unchanged.');
      onSaved?.();
    } catch (e) {
      setNotice(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel path-rank-control">
      <div>
        <h3>Your real Rocket League rank</h3>
        <p>
          Calibrate ladder opposition. This never grants free OVR or alters official tournament
          squads.
        </p>
      </div>
      <select aria-label="Your IRL rank" value={rank} onChange={(e) => setRank(e.target.value)}>
        <option value="">Choose your rank…</option>
        {PATH_RANKS.map((r) => (
          <option key={r.rank}>{r.rank}</option>
        ))}
      </select>
      <button className="btn btn-secondary" disabled={!rank || busy} onClick={save}>
        {busy ? 'Saving…' : 'Apply rank'}
      </button>
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
export function PathToGloryPage() {
  const { career, team, currentDate } = useCareerStore(),
    navigate = useNavigate(),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [completionDismissed, setCompletionDismissed] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!career) return;
    let cancelled = false;
    setError('');
    setCompletionDismissed(false);
    window.api.management
      .pathOverview(career.id)
      .then((r) => {
        if (cancelled) return;
        if (r.error) setError(r.error);
        else setData({ ...r, owner: career.id });
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [career?.id, currentDate, revision]);
  const tutorial = async (step: number) => {
    if (!career) return;
    const r = await window.api.management.pathTutorial(career.id, step);
    if (r.error) setError(r.error);
    else setData((d: any) => ({ ...d, tutorialStep: step }));
  };
  if (!career || !team || !data || data.owner !== career.id)
    return (
      <main className="management-page">
        <p>{error || 'Preparing your climb…'}</p>
      </main>
    );
  const f = data.nextFixture;
  return (
    <main className="management-page path-hub">
      <header className="page-intro">
        <div>
          <span className="eyebrow">Path To Glory · Fixed squad</span>
          <h1>From the trenches.</h1>
          <p>Three players. Every game counts. Build your way to 99.</p>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('/challenges')}>
          Challenges & rewards →
        </button>
        <button className="btn btn-secondary" onClick={() => tutorial(0)}>
          How to play
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      <PathRankControl onSaved={() => setRevision((n) => n + 1)} />
      <section className="path-metrics panel">
        <div>
          <span>Current streak</span>
          <strong>{data.streak} wins</strong>
        </div>
        <div>
          <span>Match XP multiplier</span>
          <strong>{data.multiplier.toFixed(2)}×</strong>
        </div>
        <div>
          <span>Games played</span>
          <strong>{data.games}</strong>
        </div>
        <div>
          <span>Best streak</span>
          <strong>{data.bestStreak}</strong>
        </div>
      </section>
      {data.completedAt && !completionDismissed && (
        <section className="panel path-complete">
          <span className="eyebrow">The summit · {data.completedAt}</span>
          <h2>All three. 99 OVR. Path To Glory complete.</h2>
          <p>
            This squad earned its place. You can keep playing here for as long as you like. Manager
            Career is available whenever you want a different challenge.
          </p>
          <button className="btn btn-primary" onClick={() => setCompletionDismissed(true)}>
            Keep playing this save
          </button>{' '}
          <button className="btn btn-secondary" onClick={() => navigate('/career/new')}>
            Start a separate Manager Career
          </button>
        </section>
      )}
      <section className="panel path-next">
        <span className="eyebrow">
          {f?.trialCutoff ? 'Promotion trial' : f?.competitionName || 'Next challenge'}
        </span>
        <div className="path-matchup">
          <div>
            <TeamCrest id={team.id} name={team.name} />
            <h2>{team.name}</h2>
          </div>
          <span>vs</span>
          <div>
            <TeamCrest id={f?.opponentId} name={f?.opponentName || 'Opponent'} />
            <h2>{f?.opponentName}</h2>
          </div>
        </div>
        <p>
          {f?.trialCutoff
            ? `Win this BO5 to unlock the next bot tier. A loss earns XP and gives you another attempt.`
            : `${f?.seriesFormat || 'BO3'} · Your squad learns from wins and losses. A win builds the XP streak.`}
        </p>
        {f && (
          <button
            className="btn btn-primary"
            onClick={() => navigate('/match-day/' + f.id)}
            disabled={f.scheduledDate > currentDate}
          >
            {f.scheduledDate > currentDate
              ? `Next series · ${f.scheduledDate} · use Continue`
              : 'Play next series →'}
          </button>
        )}
      </section>
      <section className="path-squad">
        {data.players.map((p: any) => (
          <article className="panel" key={p.id}>
            <PlayerAvatar playerId={p.id} gamertag={p.gamertag} overall={p.overall} size="lg" />
            <h2>
              {p.gamertag} <b>{p.overall}</b>
            </h2>
            <span>
              {p.xp} / {p.xpNeeded} XP to the next point
            </span>
            <div className="path-xp-track">
              <i style={{ width: `${Math.min(100, (p.xp / p.xpNeeded) * 100)}%` }} />
            </div>
            <button className="text-link" onClick={() => navigate('/training')}>
              Develop skills →
            </button>
          </article>
        ))}
      </section>
      <section className="panel path-circuit">
        <span className="eyebrow">The road to the world stage</span>
        <h2>Earn your place in RLCS.</h2>
        <p>
          Open qualifiers lead into RLCS Opens. Earn circuit points for Majors, or fight through an
          LCQ for Worlds. Your fixed squad can win it all—every played competition game earns XP.
        </p>
        <button className="btn btn-secondary" onClick={() => navigate('/competitions')}>
          Competitions &amp; qualification →
        </button>
        {data.circuit?.slice(0, 3).map((e: any) => (
          <div className="path-memory" key={e.id}>
            <strong>{e.name}</strong>
            <small>
              {e.startDate} ·{' '}
              {e.entered
                ? e.stage === 'QUALIFIER'
                  ? 'Registered'
                  : 'Qualified / entered'
                : 'Qualification required'}
            </small>
            <button className="text-link" onClick={() => navigate('/competition/' + e.id)}>
              View event →
            </button>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>The next promotion</h2>
        <p>
          {data.nextTier
            ? `${data.nextTier.level}: all three need ${data.nextTier.cutoff}+ OVR and every core skill ${data.nextTier.minimumSkill}+. Then win the trial.`
            : 'Every bot tier unlocked. The final goal is all three players at 99.'}
        </p>
        <p>
          {data.unlockedCutoff >= 84
            ? 'Rocket Host unlocked.'
            : 'Local RLBot matches. Rocket Host unlocks after the Champ trial.'}
        </p>
      </section>
      <section className="panel path-challenges">
        <span className="eyebrow">Challenges · bonus XP for every squad member</span>
        <h2>{data.challenges.length} challenges. Every result counts.</h2>
        <p>
          Early challenges reward games played and resilience as well as wins. Special milestones
          unlock a temporary 92+ AI form boost.
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/challenges')}>
          Open all challenges & rewards →
        </button>
        <div className="path-challenge-grid">
          {data.challenges?.slice(0, 6).map((ch: any) => (
            <article className={ch.completed ? 'completed' : ''} key={ch.key}>
              <strong>
                {ch.completed ? '✓ ' : ''}
                {ch.title}
              </strong>
              <p>{ch.description}</p>
              <progress max={ch.target} value={ch.progress} />
              <small>
                {ch.progress} / {ch.target} · +{ch.xp} XP each
                {ch.completed ? ' · Reward claimed' : ''}
              </small>
            </article>
          ))}
        </div>
      </section>
      <div className="path-history">
        <section className="panel">
          <span className="eyebrow">A familiar opponent</span>
          <h2>{data.rival?.name || 'Your next rival awaits'}</h2>
          <p>
            {data.rival
              ? `${data.rival.wins} series wins · ${data.rival.losses} defeats`
              : 'A recurring rival is chosen for each chapter.'}
          </p>
          <h3>Achievements</h3>
          {data.achievements.length ? (
            data.achievements.map((a: any) => (
              <div className="path-memory" key={a.key}>
                <strong>✦ {a.title}</strong>
                <small>
                  {a.date} · {a.xp ? `+${a.xp} XP per player` : 'Completed'}
                </small>
              </div>
            ))
          ) : (
            <p>
              Your first achievement is still ahead. Complete a game to get started—losses count
              too.
            </p>
          )}
        </section>
        <section className="panel">
          <span className="eyebrow">Your journey</span>
          <h2>The story so far</h2>
          {data.memories.map((m: any) => (
            <article className="path-memory" key={m.id}>
              <small>
                {m.date} · {m.kind}
              </small>
              <strong>{m.title}</strong>
              <p>{m.body}</p>
              {m.fixtureId && (
                <button className="text-link" onClick={() => navigate('/match-day/' + m.fixtureId)}>
                  View series →
                </button>
              )}
            </article>
          ))}
        </section>
      </div>
      {data.tutorialStep < 4 && (
        <div className="path-tutorial-shade">
          <section
            className="panel path-tutorial"
            role="dialog"
            aria-modal="true"
            aria-labelledby="path-lesson"
          >
            <span className="eyebrow">Welcome · {data.tutorialStep + 1} / 4</span>
            <h2 id="path-lesson">{lessons[data.tutorialStep][0]}</h2>
            <p>{lessons[data.tutorialStep][1]}</p>
            <button className="btn btn-primary" onClick={() => tutorial(data.tutorialStep + 1)}>
              {data.tutorialStep === 3 ? 'Start the climb' : 'Next →'}
            </button>
            <button className="btn btn-secondary" onClick={() => tutorial(4)}>
              Skip tutorial
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
export function PathPlayerPage() {
  const { roster } = useCareerStore(),
    navigate = useNavigate();
  return (
    <main className="management-page">
      <h1>Your fixed squad</h1>
      <section className="path-squad">
        {roster.map((p) => (
          <article className="panel" key={p.id}>
            <PlayerAvatar playerId={p.id} gamertag={p.gamertag} overall={p.overall} size="lg" />
            <h2>{p.gamertag}</h2>
            <p>OVR {p.overall} · Potential 99</p>
            <button className="btn btn-primary" onClick={() => navigate('/training')}>
              Develop skills
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}
