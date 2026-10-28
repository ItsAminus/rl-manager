import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {CompetitionPresentation} from '../utils/competition-presentation';
import {publicAssetUrl} from '../utils/public-assets';
import {readSoundSettings} from '../audio/ui-sounds';
import './CompetitionIntro.css';

type Props = {presentation: CompetitionPresentation; fixtureKey: string; eventName: string; onComplete?:()=>void};
const storageKey = (key: string) => `rlm:matchday-intro:${key}`;
function alreadySeen(key: string) {
  try { return sessionStorage.getItem(storageKey(key)) === 'seen'; } catch { return false; }
}

// The parent keys this component by career + fixture. No saved match results or
// career data are touched by watching, skipping, or failing to load a video.
export function CompetitionIntro({presentation, fixtureKey, eventName,onComplete}: Props) {
  const [phase, setPhase] = useState<'loading' | 'playing' | 'blocked' | 'leaving' | 'done'>(() => alreadySeen(fixtureKey) ? 'done' : 'loading');
  const [muted, setMuted] = useState(() => !readSoundSettings().enabled);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const modal = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const skip = useRef<HTMLButtonElement>(null);
  const exiting = useRef(false);
  const frame = useRef(0);
  const stall = useRef<ReturnType<typeof setTimeout>>();
  const done = phase === 'done';
  const notified=useRef(false);
  useEffect(()=>{if(done&&!notified.current){notified.current=true;onComplete?.();}},[done,onComplete]);

  const finish = useCallback(() => {
    if (exiting.current) return;
    exiting.current = true;
    if (stall.current) clearTimeout(stall.current);
    try { sessionStorage.setItem(storageKey(fixtureKey), 'seen'); } catch { /* Private storage must not block matchday. */ }
    setPhase('leaving');
    const media = video.current;
    const initialVolume = media?.volume || 0;
    const started = performance.now();
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320;
    const fade = () => {
      const fraction = duration ? Math.min(1, (performance.now() - started) / duration) : 1;
      if (media) media.volume = initialVolume * (1 - fraction);
      if (fraction < 1) frame.current = requestAnimationFrame(fade);
      else { media?.pause(); modal.current?.close(); setPhase('done'); }
    };
    frame.current = requestAnimationFrame(fade);
  }, [fixtureKey]);

  const clearStall = () => { if (stall.current) clearTimeout(stall.current); };
  const watchStall = () => {
    clearStall();
    // A missing or stalled file must never strand the player before a fixture.
    stall.current = setTimeout(finish, 10_000);
  };

  useLayoutEffect(() => {
    if (done) return;
    const dialog = modal.current;
    if (dialog && !dialog.open) dialog.showModal();
    skip.current?.focus();
    return () => { dialog?.close(); };
  }, [done]);

  useEffect(() => {
    if (done) return;
    const media = video.current;
    if (!media) return;
    media.volume = readSoundSettings().volume;
    watchStall();
    void media.play().catch(error => {
      if (exiting.current || error?.name === 'AbortError') return;
      clearStall();
      if (error?.name === 'NotAllowedError') setPhase('blocked');
      else finish();
    });
    const settings = () => { const value = readSoundSettings(); media.volume = value.volume; setMuted(!value.enabled); };
    window.addEventListener('rl-manager-sound-settings', settings);
    return () => {
      clearStall(); cancelAnimationFrame(frame.current); media.pause();
      window.removeEventListener('rl-manager-sound-settings', settings);
    };
  }, [done, finish]);

  if (done) return null;
  const togglePlayback = () => {
    const media = video.current;
    if (!media || exiting.current) return;
    clearStall();
    if (!media.paused) { media.pause(); setPaused(true); }
    else {
      watchStall();
      void media.play().then(() => { setPaused(false); setPhase('playing'); }).catch(() => { clearStall(); setPhase('blocked'); });
    }
  };

  return <dialog ref={modal} className={`competition-intro ${phase === 'leaving' ? 'is-leaving' : ''}`} aria-label={`${eventName} introduction`}
    onCancel={event => { event.preventDefault(); finish(); }}>
    <video ref={video} src={publicAssetUrl(presentation.video)} poster={publicAssetUrl(presentation.background)}
      preload="auto" playsInline muted={muted} disablePictureInPicture aria-label={`${presentation.label} introduction video`}
      onEnded={finish} onError={finish} onWaiting={watchStall} onStalled={watchStall}
      onPlaying={() => { clearStall(); if (!exiting.current) { setPhase('playing'); setPaused(false); } }}
      onTimeUpdate={event => {
        clearStall();
        const media = event.currentTarget;
        if (Number.isFinite(media.duration) && media.duration > 0) setProgress(media.currentTime / media.duration);
      }}/>
    <header><span>RLM · MATCHDAY</span><strong>{eventName}</strong></header>
    {phase === 'loading' && <p className="competition-intro-status" role="status">Preparing your matchday…</p>}
    {phase === 'blocked' && <button className="competition-intro-play" data-sound="none" onClick={togglePlayback}>Play introduction</button>}
    <footer>
      <div className="competition-intro-controls">
        <button data-sound="none" onClick={togglePlayback} aria-label={paused || phase === 'blocked' ? 'Play introduction' : 'Pause introduction'}>{paused || phase === 'blocked' ? 'Play' : 'Pause'}</button>
        <button data-sound="none" onClick={() => setMuted(value => !value)} aria-pressed={muted} aria-label={muted ? 'Unmute introduction' : 'Mute introduction'}>{muted ? 'Sound off' : 'Sound on'}</button>
      </div>
      <button ref={skip} data-sound="none" className="competition-intro-skip" onClick={finish}>Skip intro <span aria-hidden="true">→</span><small>Esc</small></button>
    </footer>
    <div className="competition-intro-progress" aria-hidden="true"><i style={{transform: `scaleX(${progress})`}}/></div>
  </dialog>;
}
