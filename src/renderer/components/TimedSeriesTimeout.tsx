import React, { useEffect, useRef, useState } from 'react';
import { useCareerStore } from '../../stores/careerStore';
import {syncTimeoutMusic} from '../audio/timeout-music';
const ORDERS = [
  ['balanced', 'Play your normal role'],
  ['press', 'Press the ball'],
  ['defend', 'Protect our half'],
  ['infield', 'Find infield outlets'],
  ['demo', 'Create space with demos'],
];
export function TimedSeriesTimeout({
  fixtureId,
  game,
  players,
  disabled,
  local,
  onContinue,
  onActiveChange,
}: {
  fixtureId: string;
  game: number;
  players: any[];
  disabled: boolean;
  local: boolean;
  onContinue: () => void;
  onActiveChange: (active: boolean) => void;
}) {
  const career = useCareerStore((s) => s.career),
    [state, setState] = useState<any>(null),
    [orders, setOrders] = useState<Record<string, string>>({}),
    [tone, setTone] = useState('encourage'),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [clock, setClock] = useState(Date.now()),
    offset = useRef(0),
    ownDeadline = useRef(0),
    continued = useRef(false),
    alive = useRef(true);
  const receive = (s: any) => {
    if (s?.error) throw Error(s.error);
    if(career)syncTimeoutMusic(career.id,fixtureId,s);
    offset.current = s.serverNow - Date.now();
    if (s.own?.afterGame === game-1) ownDeadline.current = s.own.endsAt;
    setState(s);
    setClock(Date.now());
  };
  useEffect(() => {
    let mounted = true,
      polling = false;
    alive.current = true;
    ownDeadline.current = 0;
    continued.current = false;
    setState(null);
    setNotice('');
    if (!career) return;
    window.api.management
      .tactics(career.id)
      .then((p) => {
        if (mounted)
          setOrders(
            Object.fromEntries(players.map((v) => [v.id, p.ordersByPlayer?.[v.id] || 'balanced']))
          );
      })
      .catch((e) => {
        if (mounted) setNotice(String(e));
      });
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const s = await window.api.management.seriesTimeoutState(career.id, fixtureId);
        if (mounted) receive(s);
      } catch (e) {
        if (mounted) setNotice(String(e));
      } finally {
        polling = false;
      }
    };
    void poll();
    const interval = setInterval(poll, 1000),
      tick = setInterval(() => setClock(Date.now()), 200);
    return () => {
      mounted = false;
      alive.current = false;
      clearInterval(interval);
      clearInterval(tick);
    };
  }, [career?.id, fixtureId, game]);
  const now = clock + offset.current,
    seconds = state?.active ? Math.max(0, Math.ceil((state.active.endsAt - now) / 1000)) : 0,
    active = seconds > 0 ? state?.active : null,
    ours = active?.side === 'manager';
  useEffect(() => {
    onActiveChange(!!active);
  }, [!!active, onActiveChange]);
  useEffect(() => () => onActiveChange(false), [onActiveChange]);
  useEffect(() => {
    if (
      ownDeadline.current &&
      now >= ownDeadline.current &&
      !continued.current &&
      !disabled &&
      !busy && !active
    ) {
      continued.current = true;
      onContinue();
    }
  }, [now, disabled, busy]);
  const start = async () => {
    if (!career || busy || disabled) return;
    setBusy(true);
    setNotice('');
    try {
      const r = await window.api.management.startSeriesTimeout(career.id, fixtureId);
      receive(r);
    } catch (e) {
      setNotice(String(e));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!career || busy || disabled || !ours) return;
    setBusy(true);
    try {
      const r = await window.api.management.seriesTimeout(career.id, fixtureId, orders, tone);
      if (!r.success) throw Error(r.error);
      if (alive.current)
        setNotice(
          r.alreadyTalked
            ? 'Instructions saved. Your team talk has already counted for this timeout.'
            : 'Plan saved and team talk delivered.'
        );
    } catch (e) {
      if (alive.current) setNotice(String(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <section className="panel series-timeout" aria-label="Between-game decision">
      <div className="card-topline">
        <span className="eyebrow">Before game {game}</span>
        <span className="soft-badge">
          Your timeout: {state?.used ? '0' : '1'}/1 · {state?.opponentName || 'Opponent'}:{' '}
          {state?.opponentUsed ? '0' : '1'}/1
        </span>
      </div>
      {active ? (
        <>
          <div className="timeout-clock" role="timer" aria-label="Timeout time remaining">
            {Math.floor(seconds/60)}:{String(seconds%60).padStart(2, '0')}
          </div>
          <h2>{ours ? 'Your tactical timeout' : `${state.opponentName} have called a timeout`}</h2>
          <p>
            {ours
              ? 'One minute to talk to the squad and save your adjustments. The next game begins when your timeout ends.'
              : `${state.active.reason || 'The opposing coach is resetting the team.'} Wait for their minute to finish, then continue or call your own timeout.`}
          </p>
        </>
      ) : (
        <>
          <h2>Ready for the next game?</h2>
          <p>Continue now, or use your one 60-second tactical timeout for this series.</p>
        </>
      )}
      {ours && (
        <>
          {!local && (
            <p>
              Hosted bot policies retain their own tactics. The team talk affects career morale.
            </p>
          )}
          <div className="path-timeout-players">
            {players.map((p) => (
              <label key={p.id}>
                {p.gamertag}
                <select
                  aria-label={'Order for ' + p.gamertag}
                  disabled={!local || busy || disabled}
                  value={orders[p.id] || 'balanced'}
                  onChange={(e) => setOrders({ ...orders, [p.id]: e.target.value })}
                >
                  {ORDERS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <label>
            Team talk{' '}
            <select
              aria-label="Timeout team talk"
              value={tone}
              disabled={busy || disabled}
              onChange={(e) => setTone(e.target.value)}
            >
              <option value="encourage">Back each other. We learn together.</option>
              <option value="focus">Reset our spacing and rotations.</option>
              <option value="relax">Forget the score. Play the next touch.</option>
            </select>
          </label>
          <button
            className="btn btn-primary"
            disabled={busy || disabled || players.some((p) => !orders[p.id])}
            onClick={save}
          >
            {busy ? 'Saving…' : 'Save plan & talk to squad'}
          </button>
          <p>
            <small>Save before 0:00. The last saved plan carries into the next game.</small>
          </p>
        </>
      )}
      {!active && (
        <div className="conversation-actions">
          <button
            className="btn btn-primary"
            disabled={disabled || busy || !state}
            onClick={onContinue}
          >
            Continue to game {game} →
          </button>
          <button
            className="btn btn-secondary"
            disabled={disabled || busy || !state || state.used}
            onClick={start}
          >
            {state?.used ? 'Timeout used · 0/1' : 'Use timeout · 1/1'}
          </button>
        </div>
      )}
      {disabled && <p>Waiting for postgame commentary and match cleanup.</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
