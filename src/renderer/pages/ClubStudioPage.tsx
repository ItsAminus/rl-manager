import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCareerStore } from '../../stores/careerStore';
import type { ClubBranding } from '../../game/club-design';
import {
  BannerPreview,
  CrestPreview,
  JerseyPreview,
  clubAsset,
} from '../components/ClubDesignPreviews';
import { teamCrest } from '../../services/team-crest';
import { downloadDesign, imageFilePng, svgPng } from '../utils/design-images';
import { playUiSound } from '../audio/ui-sounds';
import './ClubStudio.css';

export function DesignColor({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="design-color">
      <span>{label}</span>
      <div>
        <input
          type="color"
          value={value}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
        />
        <code>{value.toUpperCase()}</code>
      </div>
    </label>
  );
}
export function ClubStudioPage() {
  const { career, team, roster } = useCareerStore(),
    navigate = useNavigate();
  const [brand, setBrand] = useState<ClubBranding | null>(null),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState('');
  const [back, setBack] = useState(false),
    [player, setPlayer] = useState('');
  const crest = useRef<HTMLDivElement>(null),
    banner = useRef<HTMLDivElement>(null),
    jersey = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    setBrand(null);
    setDirty(false);
    setNotice('');
    setError('');
    if (career)
      window.api.management
        .clubBranding(career.id)
        .then((r) => {
          if (live) {
            if (r.success) setBrand(r.branding);
            else setError(r.error);
          }
        })
        .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [career?.id]);
  const patch = (change: Partial<ClubBranding>) => {
    setBrand((b) => (b ? { ...b, ...change } : b));
    setDirty(true);
    setNotice('');
  };
  const refresh = async () => {
    if (!career || !team) return;
    const t = await window.api.teams.getById(team.id);
    const fixtures = await window.api.fixtures.getUpcoming(
      team.id,
      useCareerStore.getState().currentDate
    );
    if (useCareerStore.getState().career?.id !== career.id) return;
    useCareerStore.setState((s) => ({
      team: t || s.team,
      allTeams: s.allTeams.map((x) => (x.id === team.id ? t || x : x)),
      upcomingFixtures: fixtures,
    }));
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
      if (!brand || !career) return;
      const design = {
        ...brand,
        logo:
          brand.logoMode === 'builder'
            ? await svgPng(crest.current?.querySelector('svg') || null, 512, 512)
            : brand.logoMode === 'official'
              ? null
              : brand.logo,
        banner:
          brand.bannerMode === 'builder'
            ? await svgPng(banner.current?.querySelector('svg') || null, 1000, 300)
            : brand.banner,
      };
      const r = await window.api.management.saveClubBranding(career.id, design);
      if (useCareerStore.getState().career?.id !== career.id) return;
      if (!r.success) throw Error(r.error);
      setBrand(r.branding);
      setDirty(false);
      await refresh();
      setNotice('Club identity saved. Your next match uses this crest and colour palette.');
      playUiSound('success');
    });
  const reset = () =>
    action(async () => {
      if (!career) return;
      const r = await window.api.management.resetClubBranding(career.id);
      if (useCareerStore.getState().career?.id !== career.id) return;
      if (!r.success) throw Error(r.error);
      setBrand(r.branding);
      setDirty(false);
      await refresh();
      setNotice('Original club identity restored.');
    });
  const upload = (kind: 'logo' | 'banner', file?: File) =>
    action(async () => {
      if (!file) return;
      const png = await imageFilePng(
        file,
        kind === 'logo' ? 512 : 1000,
        kind === 'logo' ? 512 : 300
      );
      patch(
        kind === 'logo' ? { logo: png, logoMode: 'upload' } : { banner: png, bannerMode: 'upload' }
      );
    });
  if (!career || !team)
    return <div className="empty-state">Load a career to open your club studio.</div>;
  if (!brand) return <div className="empty-state">{error || 'Opening club studio…'}</div>;
  const logo =
    brand.logoMode === 'official'
      ? teamCrest(team.id)
      : brand.logoMode === 'upload'
        ? brand.logo
        : null;
  const exportJersey = (away: boolean) =>
    action(async () => {
      const node = jersey.current?.querySelectorAll(':scope > div > svg')[
        away ? 1 : 0
      ] as SVGSVGElement;
      if (node?.getAttribute('viewBox') !== '0 0 320 360') throw Error('Jersey preview not ready.');
      downloadDesign(
        await svgPng(node, 640, 720),
        `${brand.shortName}-${away ? 'away' : 'home'}-${back ? 'back' : 'front'}.png`
      );
      setNotice('Jersey design exported.');
    });
  return (
    <div className="design-page club-studio">
      <header className="design-heading">
        <div>
          <span className="eyebrow">Club identity</span>
          <h1>Your club. Your colours.</h1>
          <p>Build your crest, matchday kits and banner. Everything stays in this career.</p>
        </div>
        <div className="design-heading-actions">
          <button className="btn btn-secondary" onClick={() => navigate('/garage')}>
            Squad garage →
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !dirty}>
            {busy ? 'Saving…' : dirty ? 'Save identity' : 'Identity saved'}
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
      <div className="studio-layout">
        <div className="design-controls">
          <section className="design-panel">
            <span className="eyebrow">01 / The organisation</span>
            <h2>Identity</h2>
            <label>
              Club name
              <input
                value={brand.name}
                maxLength={50}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            <label>
              Broadcast abbreviation
              <input
                value={brand.shortName}
                maxLength={6}
                onChange={(e) => patch({ shortName: e.target.value.toUpperCase() })}
              />
            </label>
            <div className="design-color-grid">
              <DesignColor
                label="Primary"
                value={brand.primary}
                onChange={(primary) => patch({ primary })}
              />
              <DesignColor
                label="Secondary"
                value={brand.secondary}
                onChange={(secondary) => patch({ secondary })}
              />
              <DesignColor
                label="Accent / lettering"
                value={brand.accent}
                onChange={(accent) => patch({ accent })}
              />
            </div>
          </section>
          <section className="design-panel">
            <span className="eyebrow">02 / Your mark</span>
            <h2>Club crest</h2>
            <div className="design-segments">
              {(['official', 'builder', 'upload'] as const).map((mode) => (
                <button
                  key={mode}
                  className={brand.logoMode === mode ? 'active' : ''}
                  onClick={() => patch({ logoMode: mode })}
                >
                  {mode === 'official'
                    ? 'Original'
                    : mode === 'builder'
                      ? 'Create crest'
                      : 'Upload'}
                </button>
              ))}
            </div>
            {brand.logoMode === 'builder' ? (
              <>
                <label>
                  Shape
                  <select
                    value={brand.shape}
                    onChange={(e) => patch({ shape: e.target.value as any })}
                  >
                    <option value="shield">Shield</option>
                    <option value="circle">Circle</option>
                    <option value="diamond">Diamond</option>
                  </select>
                </label>
                <label>
                  Emblem
                  <select
                    value={brand.emblem}
                    onChange={(e) => patch({ emblem: e.target.value as any })}
                  >
                    <option value="initials">Club initials</option>
                    <option value="bolt">Lightning bolt</option>
                    <option value="star">Star</option>
                    <option value="crown">Crown</option>
                  </select>
                </label>
              </>
            ) : brand.logoMode === 'upload' ? (
              <label className="design-upload">
                Choose crest image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => upload('logo', e.target.files?.[0])}
                />
                <small>PNG, JPG or WebP · transparent PNG recommended</small>
              </label>
            ) : (
              <p className="design-hint">
                Keep your club’s original crest and customise the rest of its identity.
              </p>
            )}
          </section>
          <section className="design-panel">
            <span className="eyebrow">03 / Matchday kit</span>
            <h2>Home & away jerseys</h2>
            <label>
              Kit pattern
              <select
                value={brand.jerseyPattern}
                onChange={(e) => patch({ jerseyPattern: e.target.value as any })}
              >
                <option value="plain">Clean</option>
                <option value="stripes">Vertical stripes</option>
                <option value="diagonal">Diagonal sash</option>
              </select>
            </label>
            <label>
              Sponsor / chest text
              <input
                value={brand.sponsor}
                maxLength={30}
                placeholder="Your sponsor"
                onChange={(e) => patch({ sponsor: e.target.value })}
              />
            </label>
            <div className="design-color-grid">
              <DesignColor
                label="Away primary"
                value={brand.awayPrimary}
                onChange={(awayPrimary) => patch({ awayPrimary })}
              />
              <DesignColor
                label="Away secondary"
                value={brand.awaySecondary}
                onChange={(awaySecondary) => patch({ awaySecondary })}
              />
              <DesignColor
                label="Away lettering"
                value={brand.awayAccent}
                onChange={(awayAccent) => patch({ awayAccent })}
              />
            </div>
            <p className="design-hint">
              Jerseys are club presentation assets you can export. Cars use the presets in your
              garage.
            </p>
          </section>
          <section className="design-panel">
            <span className="eyebrow">04 / Your voice</span>
            <h2>Club banner</h2>
            <label>
              Club slogan
              <input
                value={brand.slogan}
                maxLength={80}
                onChange={(e) => patch({ slogan: e.target.value })}
              />
            </label>
            <div className="design-segments">
              <button
                className={brand.bannerMode === 'builder' ? 'active' : ''}
                onClick={() => patch({ bannerMode: 'builder' })}
              >
                Designed banner
              </button>
              <button
                className={brand.bannerMode === 'upload' ? 'active' : ''}
                onClick={() => patch({ bannerMode: 'upload' })}
              >
                Upload image
              </button>
            </div>
            {brand.bannerMode === 'upload' && (
              <label className="design-upload">
                Choose banner
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => upload('banner', e.target.files?.[0])}
                />
                <small>Prepared at 1000 × 300 pixels</small>
              </label>
            )}
            <button className="btn btn-secondary" onClick={reset} disabled={busy}>
              Restore original club identity
            </button>
          </section>
        </div>
        <div className="design-preview-stack">
          <section className="design-panel club-brand-preview">
            <div className="design-preview-label">
              <span>Live identity preview</span>
              <span>{dirty ? 'Unsaved changes' : 'Saved design'}</span>
            </div>
            <div className="brand-banner" ref={banner}>
              {brand.bannerMode === 'upload' && brand.banner ? (
                <img src={brand.banner} alt="Custom club banner" />
              ) : (
                <BannerPreview brand={brand} />
              )}
            </div>
            <div className="brand-lockup">
              <div className="brand-crest" ref={crest}>
                {brand.logoMode === 'builder' ? (
                  <CrestPreview brand={brand} />
                ) : logo ? (
                  <img src={clubAsset(logo)} alt="Club crest" />
                ) : (
                  <span>{brand.shortName}</span>
                )}
              </div>
              <div>
                <h2>{brand.name}</h2>
                <p>{brand.slogan}</p>
                <div className="brand-swatches">
                  {[brand.primary, brand.secondary, brand.accent].map((c, i) => (
                    <i key={i} style={{ background: c }} title={c} />
                  ))}
                </div>
              </div>
            </div>
          </section>
          <section className="design-panel">
            <div className="design-preview-label">
              <span>Matchday jerseys</span>
              <div className="design-segments">
                <button className={!back ? 'active' : ''} onClick={() => setBack(false)}>
                  Front
                </button>
                <button className={back ? 'active' : ''} onClick={() => setBack(true)}>
                  Back
                </button>
              </div>
            </div>
            {back && (
              <label>
                Player lettering
                <select value={player} onChange={(e) => setPlayer(e.target.value)}>
                  <option value="">Player name</option>
                  {roster.map((p) => (
                    <option key={p.id} value={p.gamertag}>
                      {p.gamertag}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="jersey-pair" ref={jersey}>
              {[false, true].map((away) => (
                <div key={String(away)}>
                  <JerseyPreview
                    brand={brand}
                    away={away}
                    back={back}
                    player={player || roster[0]?.gamertag || 'PLAYER'}
                    crest={logo || brand.logo}
                  />
                  <div>
                    <strong>{away ? 'Away' : 'Home'}</strong>
                    <button
                      className="text-link"
                      disabled={busy}
                      onClick={() => exportJersey(away)}
                    >
                      Export PNG ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="design-panel">
            <div className="design-preview-label">
              <span>Next match broadcast</span>
              <span>Preview</span>
            </div>
            <div className="studio-timer">
              <div className="studio-timer-heading">
                YOUR COMPETITION <span>G1 BO5</span>
              </div>
              <div className="studio-timer-main">
                <div className="studio-timer-team" style={{background:brand.secondary,borderTop:`4px solid ${brand.primary}`}}>
                  {logo ? (
                    <img src={clubAsset(logo)} alt="Club crest" />
                  ) : brand.logoMode === 'builder' ? (
                    <CrestPreview brand={brand} />
                  ) : (
                    <b>{brand.shortName}</b>
                  )}
                  <small>{brand.shortName}</small>
                </div>
                <strong className="studio-blue">0</strong>
                <strong className="studio-time">5:00</strong>
                <strong className="studio-orange">0</strong>
                <div className="studio-timer-team">
                  <b>RL</b>
                  <small>OPP</small>
                </div>
              </div>
              <div className="studio-series">
                {[0, 1, 2, 3, 4].map((i) => (
                  <i key={i} />
                ))}
              </div>
            </div>
            <p className="design-hint">
              Your custom crest and abbreviation appear in local and Rocket Host career HUDs. Blue
              and orange remain the match-side colours.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
