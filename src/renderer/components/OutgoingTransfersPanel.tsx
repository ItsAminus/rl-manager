import React, { useEffect, useState } from 'react';
import { useCareerStore } from '../../stores/careerStore';
import { transferWindow } from '../../game/career-rules';
import { PlayerAvatar } from './PlayerAvatar';

export const OutgoingTransfersPanel: React.FC = () => {
  const { career, currentDate, roster, reloadRoster } = useCareerStore();
  const [data, setData] = useState<any>({ listings: [], offers: [] });
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [offerFeedback, setOfferFeedback] = useState<{ id: string; text: string; error: boolean } | null>(null);
  const load = async () => {
    if (career) {
      const r = await window.api.management.outgoingTransfers(career.id);
      if (r.error) throw new Error(r.error);
      setData(r);
    }
  };
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [career?.id, currentDate]);
  const act = async (fn: () => Promise<any>, offerId?: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setOfferFeedback(null);
    try {
      const r = await fn();
      if (!r.success) throw new Error(r.error);
      if (offerId) setOfferFeedback({ id: offerId, text: r.message || 'Your response has been saved.', error: false });
      await reloadRoster();
      await load();
      const n = await window.api.inbox.getUnreadCount(career!.id);
      useCareerStore.setState({ unreadInboxCount: n });
    } catch (e: any) {
      if (offerId) setOfferFeedback({ id: offerId, text: e.message, error: true });
      else setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (!career) return null;
  const windowOpen = transferWindow(currentDate).open;
  const input = (key: string, initial: number, label: string) => (
    <input
      aria-label={label}
      type="number"
      min="0"
      max="100000000"
      step="1000"
      value={prices[key] ?? String(initial)}
      onChange={(e) => setPrices({ ...prices, [key]: e.target.value })}
    />
  );
  return (
    <div className="outgoing-market">
      <div className="panel">
        <h2>Outgoing transfers</h2>
        <p>
          Set an asking price, then advance the calendar. Clubs approach players who fit their squad
          and budget during open windows. After agreeing a fee, the player must agree to the move.
          Keep at least three players in your squad.
        </p>
      </div>
      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
      <section className="panel">
        <h3>Your squad</h3>
        {roster.map((p) => {
          const l = data.listings.find((l: any) => l.playerId === p.id);
          return (
            <div className="sale-player" key={p.id}>
              <PlayerAvatar playerId={p.id} gamertag={p.gamertag} overall={p.overall} size="sm" />
              <div className="sale-player-detail">
                <strong>{p.gamertag}</strong>
                <small>
                  {l ? 'Transfer listed' : 'Not listed'} · Estimated value $
                  {(p.marketValue || 0).toLocaleString()}
                </small>
              </div>
              <label>
                Asking price{' '}
                {input(p.id, l?.askingPrice ?? p.marketValue, `Asking price for ${p.gamertag}`)}
              </label>
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() =>
                  act(() =>
                    window.api.management.listForTransfer(
                      career.id,
                      p.id,
                      Number(prices[p.id] ?? l?.askingPrice ?? p.marketValue),
                      true
                    )
                  )
                }
              >
                {l ? 'Update price' : 'List for transfer'}
              </button>
              {l && (
                <button
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() =>
                    act(() => window.api.management.listForTransfer(career.id, p.id, 0, false))
                  }
                >
                  Remove listing
                </button>
              )}
            </div>
          );
        })}
      </section>
      <section className="panel">
        <h3>Club offers</h3>
        {!data.offers.length && (
          <p>
            No offers yet. Sensible asking prices improve the chance of interest; offers are not
            guaranteed.
          </p>
        )}
        {data.offers.map((o: any) => (
          <article className="sale-offer" key={o.id}>
            <div className="card-topline">
              <h3>
                {o.gamertag} → {o.buyerName}
              </h3>
              <span className="soft-badge">{o.status.replace('_', ' ')}</span>
            </div>
            <p>
              <strong>${o.fee.toLocaleString()}</strong> transfer fee · Reply by {o.expiresDate}
            </p>
            <p>
              Proposed player terms: ${o.salary.toLocaleString()}/month for {o.duration} months,
              plus ${o.bonus.toLocaleString()} signing bonus.
            </p>
            <p>{o.reason}</p>
            {offerFeedback && offerFeedback.id === o.id && <p role={offerFeedback.error ? 'alert' : 'status'} className={`notice ${offerFeedback.error ? 'notice-error' : ''}`}>{offerFeedback.text}</p>}
            {o.status === 'player_talks' && (
              <p>Player decision expected {o.responseDate}. {roster.length <= 3 ? 'Sign a replacement before the offer expires.' : 'Advance the calendar for completion.'}</p>
            )}
            {o.status === 'countered' && <p>Club response expected {o.responseDate}.</p>}
            {o.status === 'pending' && (
              <div className="conversation-actions">
                <button
                  className="btn btn-primary"
                  disabled={busy || !windowOpen || currentDate > o.expiresDate}
                  onClick={() =>
                    act(() => window.api.management.respondToOffer(career.id, o.id, 'accept'), o.id)
                  }
                >
                  Agree fee
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={busy || !windowOpen || currentDate > o.expiresDate}
                  onClick={() =>
                    act(() => window.api.management.respondToOffer(career.id, o.id, 'reject'), o.id)
                  }
                >
                  Reject
                </button>
                <label>
                  Counteroffer{' '}
                  {input(o.id, Math.round(o.fee * 1.1), `Counteroffer for ${o.gamertag}`)}
                </label>
                <button
                  className="btn btn-secondary"
                  disabled={busy || !windowOpen || o.rounds >= 2 || currentDate > o.expiresDate}
                  onClick={() =>
                    act(() =>
                      window.api.management.respondToOffer(
                        career.id,
                        o.id,
                        'counter',
                        Number(prices[o.id] ?? Math.round(o.fee * 1.1))
                      ), o.id
                    )
                  }
                >
                  Send counteroffer
                </button>
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
};
