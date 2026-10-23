import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCareerStore } from '../../stores/careerStore';
import { RatingBadge } from '../components/RatingBadge';
import { getPlayerPhotoCredit, getPlayerPhotoKind } from '../utils/player-avatars';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { FormIndicator } from '../components/FormIndicator';
import { AttributeBar } from '../components/AttributeBar';
import { RadarChart, RadarDataPoint } from '../components/RadarChart';
import { transferWindow } from '../../game/career-rules';
import { Player } from '../../types';
import './PlayerProfilePage.css';

export const PlayerProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { team, roster, career, currentDate, reloadRoster } = useCareerStore();
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPlayer() {
      if (!id) return;
      setLoading(true);
      try {
        if (window.api?.players) {
          const p = await window.api.players.getById(id);
          if (p) {
            setPlayer(p);
          } else {
            // fallback to finding in roster
            const found = roster.find((r) => r.id === id);
            if (found) setPlayer(found);
          }
        }
      } catch (err) {
        console.error('Error fetching player', err);
      } finally {
        setLoading(false);
      }
    }
    fetchPlayer();
  }, [id, roster]);

  if (loading) {
    return <div className="profile-loading">Loading player dossier...</div>;
  }

  if (!player) {
    return (
      <div className="profile-not-found">
        <h2>Player Not Found</h2>
        <button className="btn btn-secondary" onClick={() => navigate('/squad')}>
          Return to Squad
        </button>
      </div>
    );
  }

  const isMyPlayer = player.teamId === team?.id;
  const a = player.attributes;
  const known=isMyPlayer||player.scoutKnowledge==='Full';
  const market = transferWindow(currentDate,career?.transferWindows);

  // Compute 6 radar categories
  const radarData: RadarDataPoint[] = [
    {
      label: 'Control',
      value: Math.round(((a?.mechanics || 50) + (a?.aerial || 50) + (a?.groundControl || 50)) / 3),
    },
    {
      label: 'Shooting',
      value: Math.round(((a?.shooting || 50) + (a?.shotPower || 50) + (a?.shotAccuracy || 50)) / 3),
    },
    {
      label: 'Playmaking',
      value: Math.round(((a?.passing || 50) + (a?.gameSense || 50) + (a?.positioning || 50)) / 3),
    },
    {
      label: 'Defense',
      value: Math.round(((a?.defense || 50) + (a?.goalkeeping || 50) + (a?.fiftyFifty || 50)) / 3),
    },
    {
      label: 'Physical',
      value: Math.round(((a?.speed || 50) + (a?.recovery || 50) + (a?.boostManagement || 50) + (a?.demolitions || 50)) / 4),
    },
    {
      label: 'Mental',
      value: Math.round(((a?.rotations || 50) + (a?.consistency || 50) + (a?.clutch || 50)) / 3),
    },
  ];

  const handleAction = async (actionName: string) => {
    if (!career) return;
    const result = actionName === 'Scouting Assignment Sent'
      ? await window.api.management.dispatchScout(career.id, player.id)
      : await window.api.management.shortlist(career.id, player.id, true);
    setStatusMsg(result.success ? (actionName === 'Scouting Assignment Sent' ? `Scout dispatched. Report due ${result.dueDate}.` : 'Added to your shortlist.') : result.error);
    await reloadRoster();
  };

  return (
    <div className="player-profile-page">
      <div className="profile-nav-bar">
        <button className="back-btn" onClick={() => navigate(-1)}>
          ← BACK
        </button>
        <span className="profile-breadcrumbs">
          ESPORTS DATABASE / {player.region} / {player.gamertag}
        </span>
      </div>

      {statusMsg && <div className="status-notification-banner">{statusMsg}</div>}

      {/* Main Header Card */}
      <div className="profile-header-card">
        <div className="header-left">
          <PlayerAvatar playerId={player.id} gamertag={player.gamertag} overall={player.overall} size="xl" showBadge />
          <div className="header-ovr-wrap">
            <RatingBadge rating={player.overall} size="xl" showLabel label="OVR" />
            <div className="header-pot-badge">POT {player.estimatedPotential||player.potential||"?"}</div>
          </div>

          <div className="header-title-group">
            <div className="header-top-tags">
              <span className="nat-flag">{player.nationality}</span>
              <span className="region-tag">{player.region}</span>
              <span className="tendency-tag">{player.preferredTendency}</span>
            </div>
            <h1 className="header-gamertag">{player.gamertag}</h1>
            {player.careerTitle&&<span className="soft-badge">{player.careerTitle} · Career title</span>}
            {getPlayerPhotoCredit(player.gamertag,player.id) && <a className="portrait-credit" href={getPlayerPhotoCredit(player.gamertag,player.id)!} target="_blank" rel="noreferrer">{getPlayerPhotoKind(player.gamertag,player.id)==='headshot'?'Headshot source':'Account avatar · no verified headshot'} ↗</a>}
            <div className="header-realname">
              {player.realName || 'Real name unconfirmed'} • Age {player.age ?? 'unconfirmed'} • Team:{' '}
              <strong className="header-team-name">{player.teamName || (isMyPlayer ? team?.name : player.affiliationStatus === 'unverified' ? 'Affiliation unverified' : player.affiliationStatus === 'inactive' ? 'Inactive' : 'Free Agent')}</strong>
            </div>
          </div>
        </div>

        <div className="header-contract-box">
          <div className="contract-col">
            <span className="contract-label">MARKET VALUE</span>
            <span className="contract-val">${(player.marketValue || 120000).toLocaleString()}</span>
          </div>
          <div className="contract-col">
            <span className="contract-label">MONTHLY SALARY</span>
            <span className="contract-val">{player.salary==null?'Ask agent':`$${player.salary.toLocaleString()}/mo`}</span>
          </div>
          <div className="contract-col">
            <span className="contract-label">BUYOUT CLAUSE</span>
            <span className="contract-val">{player.buyout==null?'Ask agent':`$${player.buyout.toLocaleString()}`}</span>
          </div>
          <div className="contract-col">
            <span className="contract-label">FORM</span>
            {player.form==null?<span>Not observed</span>:<FormIndicator form={player.form} showNumber />}
          </div>
        </div>
      </div>

      {/* Action Buttons Toolbar */}
      {!!player.careerHonours?.length&&<section className="card" style={{marginBottom:16,padding:20}}><h3>Career honours</h3><p className="text-muted">Earned in this save.</p>{player.careerHonours.map(h=><div className="list-row" key={h.competitionId}><span><strong>{h.competitionName} — Champion</strong><small>{h.title||'Championship honour · no official player title'}</small></span><span>{h.earnedDate}</span></div>)}</section>}
      {player.ratingMethod && <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <strong>Rating review · {player.ratingReviewedAt} · {player.ratingConfidence === 'low' || player.ratingConfidence === 'unknown' ? 'Provisional estimate' : 'Recent LAN evidence'}</strong>
        <p className="text-muted" style={{ margin: '8px 0' }}>{player.ratingMethod}</p>
        {(() => {
          let sources: {source: string; event: string; date: string; games?: number; rating?: number; honors?: string[]}[] = [];
          try { sources = JSON.parse(player.ratingSources || '[]'); } catch { /* Older saves may not have provenance. */ }
          const names: Record<string,string> = { 'rlcs-world-championship-2026': 'Worlds 2026', 'esports-world-cup-2026': 'Esports World Cup 2026', 'rlcs-paris-major-2-2026': 'Paris Major 2026', 'rlcs-major-1-2026': 'Boston Major 2026' };
          return <><div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>{sources.map((s,i) => <a key={i} href={s.source} target="_blank" rel="noreferrer">{names[s.event] || s.event} · {s.date}{s.games ? ` · ${s.games} games` : ''} ↗</a>)}</div>
            {sources.flatMap(s=>s.honors || []).map((honor,i)=><p className="text-muted" key={i} style={{margin:'8px 0 0'}}>{honor}</p>)}</>;
        })()}
        {player.affiliationNote && <p className="text-muted" style={{margin:'12px 0 0'}}>Roster record: {player.affiliationNote}</p>}
      </div>}
      <div className="profile-actions-toolbar">
        {isMyPlayer ? (
          <>
            <button className="btn btn-secondary" onClick={() => navigate(`/dressing-room?player=${encodeURIComponent(player.id)}`)}>Talk to player</button>
            <button className="btn btn-primary" onClick={() => navigate('/training')}>
              ⚡ Focus Training
            </button>
            <button className="btn btn-secondary" disabled={!market.open} title={market.label} onClick={() => navigate(`/negotiate/${player.id}`)}>
              📝 Contract Extension
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-primary" disabled={!market.open || (!player.teamId && ['unverified', 'inactive'].includes(player.affiliationStatus || ''))} title={!player.teamId && player.affiliationStatus === 'unverified' ? 'Current affiliation and availability have not been verified.' : market.label} onClick={() => navigate(`/negotiate/${player.id}`)}>
              🤝 Approach Player
            </button>
            <button className="btn btn-secondary" onClick={() => handleAction('Scouting Assignment Sent')}>
              🔍 Dispatch Scout
            </button>
            <button className="btn btn-secondary" onClick={() => handleAction('Added to Shortlist')}>
              ⭐ Add to Shortlist
            </button>
          </>
        )}
      </div>

      {/* Main Attributes Grid & Radar */}
      {!known&&<section className="panel"><h3>Scouting knowledge: {player.scoutKnowledge}</h3><p>Overall: {player.estimatedOverall||'Unscouted'} · Potential: {player.estimatedPotential||'Unknown'}</p><p>Last observation: {player.lastScouted||'None'}. Reports lose precision after 120 days.</p><p>Exact attributes, personality and condition are unavailable. Assign a scout to observe this player over several weeks.</p></section>}
      {known&&<div className="profile-attributes-grid">
        {/* Radar & Summary Column */}
        <div className="profile-radar-panel">
          <h3 className="panel-title">CORE ATTRIBUTE RADAR</h3>
          <RadarChart data={radarData} size={280} />

          {isMyPlayer&&<div className="condition-bars-group">
            <div className="condition-row">
              <span>Morale</span>
              <div className="progress-track">
                <div
                  className="progress-fill fill-morale"
                  style={{ width: `${player.morale || 80}%` }}
                />
              </div>
              <span className="condition-val">{player.morale || 80}%</span>
            </div>

            <div className="condition-row">
              <span>Match Fatigue</span>
              <div className="progress-track">
                <div
                  className="progress-fill fill-fatigue"
                  style={{ width: `${player.fatigue || 0}%` }}
                />
              </div>
              <span className="condition-val">{player.fatigue || 0}%</span>
            </div>

            <div className="condition-row">
              <span>Consistency</span>
              <div className="progress-track">
                <div
                  className="progress-fill fill-consistency"
                  style={{ width: `${player.consistency || 75}%` }}
                />
              </div>
              <span className="condition-val">{player.consistency || 75}%</span>
            </div>
          </div>}
        </div>

        {/* Detailed 6 Attributes Panels */}
        <div className="profile-attributes-columns">
          {/* Group 1: Ball Control & Mechanics */}
          <div className="attr-group-card">
            <h4 className="attr-group-title">BALL CONTROL & MECHANICS</h4>
            <AttributeBar label="Mechanics" value={a?.mechanics || 50} />
            <AttributeBar label="Aerial Control" value={a?.aerial || 50} />
            <AttributeBar label="Ground Control" value={a?.groundControl || 50} />
          </div>

          {/* Group 2: Shooting & Finishing */}
          <div className="attr-group-card">
            <h4 className="attr-group-title">SHOOTING & FINISHING</h4>
            <AttributeBar label="Shooting" value={a?.shooting || 50} />
            <AttributeBar label="Shot Power" value={a?.shotPower || 50} />
            <AttributeBar label="Shot Accuracy" value={a?.shotAccuracy || 50} />
          </div>

          {/* Group 3: Playmaking & Vision */}
          <div className="attr-group-card">
            <h4 className="attr-group-title">PLAYMAKING & VISION</h4>
            <AttributeBar label="Passing" value={a?.passing || 50} />
            <AttributeBar label="Game Sense" value={a?.gameSense || 50} />
            <AttributeBar label="Positioning" value={a?.positioning || 50} />
          </div>

          {/* Group 4: Defense & Net Protection */}
          <div className="attr-group-card">
            <h4 className="attr-group-title">DEFENSE & PROTECTION</h4>
            <AttributeBar label="Defense" value={a?.defense || 50} />
            <AttributeBar label="Goalkeeping" value={a?.goalkeeping || 50} />
            <AttributeBar label="50/50s" value={a?.fiftyFifty || 50} />
          </div>

          {/* Group 5: Physical & Pace */}
          <div className="attr-group-card">
            <h4 className="attr-group-title">PHYSICAL & SPEED</h4>
            <AttributeBar label="Speed" value={a?.speed || 50} />
            <AttributeBar label="Recovery" value={a?.recovery || 50} />
            <AttributeBar label="Boost Management" value={a?.boostManagement || 50} />
            <AttributeBar label="Demolitions" value={a?.demolitions || 50} />
          </div>

          {/* Group 6: Mental & Clutch */}
          <div className="attr-group-card">
            <h4 className="attr-group-title">MENTAL & CLUTCH</h4>
            <AttributeBar label="Rotations" value={a?.rotations || 50} />
            <AttributeBar label="Consistency" value={a?.consistency || 50} />
            <AttributeBar label="Clutch Factor" value={a?.clutch || 50} />
          </div>
        </div>
      </div>}
    </div>
  );
};
