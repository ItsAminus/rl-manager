import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCareerStore } from '../../stores/careerStore';
import { GARAGE_ITEMS, type CarPreset } from '../../game/club-design';
import { CarPreview } from '../components/ClubDesignPreviews';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { DesignColor } from './ClubStudioPage';
import { playUiSound } from '../audio/ui-sounds';
import './ClubStudio.css';
const PAINTS = [
  'Unpainted',
  'Crimson',
  'Lime',
  'Black',
  'Sky Blue',
  'Cobalt',
  'Burnt Sienna',
  'Forest Green',
  'Purple',
  'Pink',
  'Orange',
  'Grey',
  'Titanium White',
  'Saffron',
];
export function SquadGaragePage() {
  const { career, team } = useCareerStore(),
    navigate = useNavigate();
  const [data, setData] = useState<any>(null),
    [selected, setSelected] = useState(''),
    [side, setSide] = useState<'blue' | 'orange'>('blue'),
    [dirty, setDirty] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  useEffect(() => {
    let live = true;
    setData(null);
    setDirty([]);
    setError('');
    setNotice('');
    if (career)
      window.api.management
        .squadGarage(career.id)
        .then((r) => {
          if (live) {
            if (!r.success) setError(r.error);
            else {
              setData(r);
              setSelected(r.players[0]?.id || '');
            }
          }
        })
        .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [career?.id]);
  const player = data?.players.find((p: any) => p.id === selected),
    preset = player?.preset as CarPreset;
  const patch = (change: Partial<CarPreset>) => {
    setData((d: any) => ({
      ...d,
      players: d.players.map((p: any) =>
        p.id === selected ? { ...p, preset: { ...p.preset, enabled: true, ...change } } : p
      ),
    }));
    setDirty((d) => (d.includes(selected) ? d : [...d, selected]));
    setNotice('');
  };
  const action = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
      playUiSound('error');
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    action(async () => {
      if (!career || !player) return;
      const id = selected,
        r = await window.api.management.saveCarPreset(career.id, id, preset);
      if (useCareerStore.getState().career?.id !== career.id) return;
      if (!r.success) throw Error(r.error);
      setData((d: any) => ({
        ...d,
        players: d.players.map((p: any) => (p.id === id ? { ...p, preset: r.preset } : p)),
      }));
      setDirty((d) => d.filter((x) => x !== id));
      setNotice(
        `Saved ${player.gamertag}’s ${preset.name}. It applies to their next local bot appearance.`
      );
      playUiSound('success');
    });
  const reset = () =>
    action(async () => {
      if (!career) return;
      const id = selected,
        r = await window.api.management.resetCarPreset(career.id, id);
      if (useCareerStore.getState().career?.id !== career.id) return;
      if (!r.success) throw Error(r.error);
      setData((d: any) => ({
        ...d,
        players: d.players.map((p: any) => (p.id === id ? { ...p, preset: r.preset } : p)),
      }));
      setDirty((d) => d.filter((x) => x !== id));
      setNotice('Original bot appearance restored for this player.');
    });
  const coordinate = () =>
    action(async () => {
      if (!career) return;
      const r = await window.api.management.coordinateCars(career.id);
      if (useCareerStore.getState().career?.id !== career.id) return;
      if (!r.success) throw Error(r.error);
      setData(r);
      setDirty([]);
      setNotice(
        'Saved squad coordination. Every player uses your club colours while keeping their saved body and items.'
      );
      playUiSound('success');
    });
  const copy = () =>
    action(async () => {
      if (!career) return;
      const r = await window.api.management.copyCarPreset(career.id, preset);
      if (useCareerStore.getState().career?.id !== career.id) return;
      if (!r.success) throw Error(r.error);
      setData(r);
      setDirty([]);
      setNotice('Saved this design for the whole squad.');
      playUiSound('success');
    });
  if (!career || !team)
    return <div className="empty-state">Load a career to open your squad garage.</div>;
  if (!data) return <div className="empty-state">{error || 'Opening squad garage…'}</div>;
  const items = data.items || GARAGE_ITEMS;
  const selectItem = (label: string, field: keyof CarPreset, group: string) => (
    <label>
      {label}
      <select
        value={preset[field] as number}
        onChange={(e) =>
          patch({ [field]: Number(e.target.value), ...(field === 'bodyId' ? { decalId: 0 } : {}) })
        }
      >
        {items[group]
          .filter(
            (item: any) => group !== 'decals' || !item.bodyId || item.bodyId === preset.bodyId
          )
          .map((item: any) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
      </select>
    </label>
  );
  return (
    <div className="design-page squad-garage">
      <header className="design-heading">
        <div>
          <span className="eyebrow">Squad garage</span>
          <h1>A signature for every player.</h1>
          <p>
            Individual bodies, cosmetics and blue/orange colourways. Saved by player, never by bot
            engine.
          </p>
        </div>
        <div className="design-heading-actions">
          <button className="btn btn-secondary" onClick={() => navigate('/club-studio')}>
            Club studio →
          </button>
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={busy || !dirty.includes(selected) || !player}
          >
            {busy ? 'Saving…' : dirty.includes(selected) ? 'Save player preset' : 'Preset saved'}
          </button>
        </div>
      </header>
      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      <div className="garage-layout">
        <aside className="design-panel garage-roster">
          <span className="eyebrow">Your squad</span>
          <h2>{team.shortName || team.name}</h2>
          {data.players.map((p: any) => (
            <button
              key={p.id}
              className={`garage-player ${p.id === selected ? 'selected' : ''}`}
              disabled={busy}
              onClick={() => setSelected(p.id)}
            >
              <PlayerAvatar playerId={p.id} gamertag={p.gamertag} overall={p.overall} size="sm" />
              <span>
                <strong>{p.gamertag}</strong>
                <small>
                  {dirty.includes(p.id)
                    ? 'Unsaved draft'
                    : p.preset.enabled
                      ? GARAGE_ITEMS.bodies.find((b) => b.id === p.preset.bodyId)?.name
                      : 'Original appearance'}
                </small>
              </span>
              {dirty.includes(p.id) && <i title="Unsaved changes" />}
            </button>
          ))}
          <div className="garage-squad-actions">
            <button
              className="btn btn-secondary"
              onClick={coordinate}
              disabled={busy || !data.players.length}
            >
              Coordinate club colours
            </button>
            <small>
              Updates the whole squad’s colours. Their saved car bodies and items stay the same.
            </small>
          </div>
        </aside>
        {!player ? (
          <div className="empty-state">Your squad has no players to customise.</div>
        ) : (
          <div className="garage-workspace">
            <section className="garage-showroom design-panel">
              <div className="design-preview-label">
                <div>
                  <strong>{player.gamertag}</strong>
                  <span>
                    {dirty.includes(selected) ? ' · Unsaved draft' : ' · Saved appearance'}
                  </span>
                </div>
                <div className="design-segments">
                  <button
                    className={side === 'blue' ? 'active' : ''}
                    onClick={() => setSide('blue')}
                  >
                    Blue side
                  </button>
                  <button
                    className={side === 'orange' ? 'active' : ''}
                    onClick={() => setSide('orange')}
                  >
                    Orange side
                  </button>
                </div>
              </div>
              <CarPreview preset={preset} brand={data.branding} side={side} />
              <div className="garage-build-details">
                <span>{GARAGE_ITEMS.bodies.find((x) => x.id === preset.bodyId)?.name}</span>
                <span>
                  {GARAGE_ITEMS.wheels.find((x) => x.id === preset.wheelsId)?.name} wheels
                </span>
                <span>{GARAGE_ITEMS.boosts.find((x) => x.id === preset.boostId)?.name} boost</span>
              </div>
            </section>
            <div className="garage-controls-grid">
              <section className="design-panel">
                <span className="eyebrow">01 / The build</span>
                <h2>Car & cosmetics</h2>
                <label>
                  Preset name
                  <input
                    value={preset.name}
                    maxLength={32}
                    onChange={(e) => patch({ name: e.target.value })}
                  />
                </label>
                <label className="design-toggle">
                  <input
                    type="checkbox"
                    checked={preset.enabled}
                    onChange={(e) => patch({ enabled: e.target.checked })}
                  />
                  <span>Use this preset in local bot matches</span>
                </label>
                <div className="design-fields-grid">
                  {selectItem('Body', 'bodyId', 'bodies')}
                  {selectItem('Decal', 'decalId', 'decals')}
                  {selectItem('Wheels', 'wheelsId', 'wheels')}
                  {selectItem('Boost', 'boostId', 'boosts')}
                  {selectItem('Paint finish', 'finishId', 'finishes')}
                  {selectItem('Trail', 'trailId', 'trails')}
                  {selectItem('Goal explosion', 'goalExplosionId', 'explosions')}
                  <label>
                    Body paint
                    <select
                      value={preset.paintId}
                      onChange={(e) => patch({ paintId: Number(e.target.value) })}
                    >
                      {PAINTS.map((p, i) => (
                        <option key={i} value={i}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>
              <section className="design-panel">
                <span className="eyebrow">02 / Colourway</span>
                <h2>{side === 'blue' ? 'Blue' : 'Orange'} side</h2>
                <label className="design-toggle">
                  <input
                    type="checkbox"
                    checked={preset.useClubColors}
                    onChange={(e) => patch({ useClubColors: e.target.checked })}
                  />
                  <span>Follow your club’s primary and accent colours</span>
                </label>
                <div className="design-color-grid">
                  <DesignColor
                    label="Car primary"
                    value={preset.useClubColors ? data.branding.primary : preset[side].primary}
                    disabled={preset.useClubColors}
                    onChange={(primary) => patch({ [side]: { ...preset[side], primary } })}
                  />
                  <DesignColor
                    label="Car secondary"
                    value={preset.useClubColors ? data.branding.accent : preset[side].secondary}
                    disabled={preset.useClubColors}
                    onChange={(secondary) => patch({ [side]: { ...preset[side], secondary } })}
                  />
                </div>
                <p className="design-hint">
                  Rocket League selects the closest available team colour. Switch sides above to
                  design both colourways.
                </p>
                <div className="garage-preset-actions">
                  <button className="btn btn-secondary" disabled={busy} onClick={copy}>
                    Copy this design to squad
                  </button>
                  <button className="text-link" disabled={busy} onClick={reset}>
                    Restore original appearance
                  </button>
                </div>
              </section>
            </div>
            <section className="design-panel garage-support">
              <strong>Where your designs appear</strong>
              <p>
                Local AI cars use these saved presets. Your controlled car uses your Rocket League
                garage. Rocket Host bots keep the server’s car loadouts; your club crest and
                broadcast branding still apply to hosted matches.
              </p>
              <small>
                Changing cosmetics does not change player ratings or bot assignments. The showroom
                is a design illustration.
              </small>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
