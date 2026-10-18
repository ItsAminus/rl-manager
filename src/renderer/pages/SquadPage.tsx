import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCareerStore } from '../../stores/careerStore';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { RatingBadge } from '../components/RatingBadge';
import { FormIndicator } from '../components/FormIndicator';
import './SquadPage.css';

export const SquadPage: React.FC = () => {
  const navigate = useNavigate();
  const { roster, team, career, reloadRoster } = useCareerStore();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [dropSlot, setDropSlot] = useState<number | null>(null);

  const starters = roster.slice(0, 3);

  const teamAvgOvr =
    starters.length > 0
      ? Math.round(starters.reduce((acc, p) => acc + p.overall, 0) / starters.length)
      : 80;

  const placePlayer = async (playerId: string, starterIndex: number) => {
    if (!career || saving) return;
    const sourceIndex = roster.findIndex(p => p.id === playerId);
    if (sourceIndex < 0 || sourceIndex === starterIndex || roster.length < 3) return;
    setSaving(true); setError('');
    const newRoster = [...roster];
    const starterPlayer = newRoster[starterIndex];
    newRoster[starterIndex] = newRoster[sourceIndex];
    newRoster[sourceIndex] = starterPlayer;
    try {
      const result = await window.api.management.setLineup(career.id, newRoster.slice(0, 3).map(p => p.id));
      if (!result.success) throw new Error(result.error);
      await reloadRoster();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); setSelectedPlayer(null); setDropSlot(null); }
  };

  return (
    <div className="squad-page" data-lineup={starters.map(p=>p.id).join(',')}>
      {error && <div role="alert" className="notice notice-error">{error}</div>}
      {team?.rosterVerifiedAt && <div className="notice">Real roster checked {team.rosterVerifiedAt}. {team.rosterNote || 'Later career transfers can change your squad.'}</div>}
      <div className="squad-header">
        <div>
          <h1 className="page-heading">SQUAD MANAGEMENT</h1>
          <p className="page-subheading">
            Manage your competitive 3v3 starters and reserve roster. Designate tactical roles and
            monitor player conditioning.
          </p>
        </div>

        <div className="squad-summary-badges">
          <button className="btn btn-secondary" onClick={() => navigate('/dressing-room')}>Talk to players</button>
          <div className="summary-pill">
            <span className="pill-label">STARTER AVERAGE</span>
            <RatingBadge rating={teamAvgOvr} size="md" />
          </div>
          <div className="summary-pill">
            <span className="pill-label">TEAM CHEMISTRY</span>
            <span className="pill-val cyan">{team?.teamChemistry || 75}/100</span>
          </div>
          <div className="summary-pill">
            <span className="pill-label">TOTAL PLAYERS</span>
            <span className="pill-val">{roster.length}</span>
          </div>
        </div>
      </div>

      {/* STARTERS SECTION */}
      <div className="squad-section">
        <div className="section-title-bar">
          <span className="section-title">ACTIVE 3v3 STARTING LINEUP</span>
          <span className="section-note">Drag a squad player into a slot, or select a player then click a slot. Changes save automatically.</span>
        </div>

        <div className="starters-cards-grid">
          {starters.map((player, idx) => (
            <div
              key={player.id}
              className={`starter-detailed-card ${dropSlot === idx ? 'lineup-drop-target' : ''} ${selectedPlayer === player.id ? 'lineup-selected' : ''}`}
              draggable={!saving}
              onDragStart={e => { e.dataTransfer.setData('application/x-rlmanager-player', player.id); e.dataTransfer.effectAllowed='move'; setSelectedPlayer(player.id); }}
              onDragEnd={() => {setSelectedPlayer(null);setDropSlot(null);}}
              onDragOver={e => {if(!saving && e.dataTransfer.types.includes('application/x-rlmanager-player')) {e.preventDefault(); e.dataTransfer.dropEffect='move'; setDropSlot(idx);}}}
              onDragLeave={() => setDropSlot(null)}
              onDrop={e => {e.preventDefault();void placePlayer(e.dataTransfer.getData('application/x-rlmanager-player'),idx);}}
              onClick={() => selectedPlayer ? void placePlayer(selectedPlayer,idx) : setSelectedPlayer(player.id)}
              role="button" tabIndex={saving ? -1 : 0} aria-label={`Starter slot ${idx+1}: ${player.gamertag}${selectedPlayer ? '. Select to place chosen player here' : '. Select to swap'}`}
              onKeyDown={e => {if(e.target===e.currentTarget && (e.key==='Enter'||e.key===' ')){e.preventDefault();selectedPlayer ? void placePlayer(selectedPlayer,idx) : setSelectedPlayer(player.id);}}}
            >
              <div className="starter-card-top">
                <span className="starter-slot-badge">STARTER #{idx + 1}</span>
                <RatingBadge rating={player.overall} size="lg" />
              </div>

              <PlayerAvatar playerId={player.id} gamertag={player.gamertag} overall={player.overall} size="hero" />
              <div className="starter-card-name-group">
                <div className="starter-gamertag">{player.gamertag}</div>
                <div className="starter-realname">
                  {player.realName ? player.realName + ' · ' : ''}{player.nationality || 'Nationality unknown'} · {player.age == null ? 'Age unknown' : `Age ${player.age}`}
                </div>
              </div>

              <div className="starter-card-tendency">
                <span className="tendency-label">Tactical Tendency</span>
                <span className="tendency-val">{player.preferredTendency}</span>
              </div>

              <div className="starter-card-stats-grid">
                <div className="stat-col">
                  <span className="stat-label">POTENTIAL</span>
                  <span className="stat-val">{player.potential}</span>
                </div>
                <div className="stat-col">
                  <span className="stat-label">FORM</span>
                  <FormIndicator form={player.form || 50}  />
                </div>
                <div className="stat-col">
                  <span className="stat-label">FATIGUE</span>
                  <span className={`stat-val ${player.fatigue > 30 ? 'text-red' : 'text-green'}`}>
                    {player.fatigue || 0}%
                  </span>
                </div>
              </div>

              <div className="starter-card-footer">
                <button
                  className="card-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/player/${player.id}`);
                  }}
                >
                  View Profile →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RESERVES & FULL ROSTER TABLE */}
      {selectedPlayer && <div className="notice" role="status">Selected {roster.find(p=>p.id===selectedPlayer)?.gamertag}. Choose a starting slot to place them there. <button className="btn btn-secondary" onClick={()=>setSelectedPlayer(null)}>Cancel</button></div>}
      {saving && <p role="status">Saving your starting lineup…</p>}
      <div className="squad-section">
        <div className="section-title-bar">
          <span className="section-title">COMPLETE ROSTER & RESERVES</span>
          <span className="section-note">Click any player to inspect full attributes and contracts</span>
        </div>

        <div className="roster-table-wrapper">
          <table className="roster-table">
            <thead>
              <tr>
                <th>STATUS</th>
                <th>GAMERTAG</th>
                <th>ROLE</th>
                <th>AGE</th>
                <th>OVR</th>
                <th>POT</th>
                <th>FORM</th>
                <th>MORALE</th>
                <th>FATIGUE</th>
                <th>MONTHLY SALARY</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((player, idx) => {
                const isStarter = idx < 3;
                return (
                  <tr
                    key={player.id}
                    className={`roster-row ${isStarter ? 'row-starter' : ''} ${selectedPlayer===player.id ? 'lineup-selected' : ''}`}
                    draggable={!saving}
                    onDragStart={e=>{e.dataTransfer.setData('application/x-rlmanager-player',player.id);e.dataTransfer.effectAllowed='move';setSelectedPlayer(player.id);}}
                    onDragEnd={()=>{setSelectedPlayer(null);setDropSlot(null);}}
                    onClick={() => navigate(`/player/${player.id}`)}
                  >
                    <td>
                      <span className={`status-tag ${isStarter ? 'tag-starter' : 'tag-reserve'}`}>
                        {isStarter ? `Starter #${idx + 1}` : 'Reserve'}
                      </span>
                    </td>
                    <td>
                      <div className="table-player-name">
                        <span className="gamertag-link">{player.gamertag}</span>
                        <span className="subname">{player.realName || player.nationality}</span>
                      </div>
                    </td>
                    <td>
                      <span className="table-tendency">{player.preferredTendency}</span>
                    </td>
                    <td>{player.age}</td>
                    <td>
                      <RatingBadge rating={player.overall} size="sm" />
                    </td>
                    <td>
                      <span className="pot-val">{player.potential}</span>
                    </td>
                    <td>
                      <FormIndicator form={player.form || 50} />
                    </td>
                    <td>
                      <span className="morale-val">{player.morale ?? 80}%</span>
                    </td>
                    <td>
                      <span className={`fatigue-val ${player.fatigue > 30 ? 'text-red' : ''}`}>
                        {player.fatigue || 0}%
                      </span>
                    </td>
                    <td>{player.salary ? `$${player.salary.toLocaleString()}/mo` : '—'}</td>
                    <td>
                      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                        {!isStarter && (
                          <button
                            className="btn-table-action"
                            disabled={saving}
                            onClick={() => setSelectedPlayer(player.id)}
                            title="Select this player, then choose any starting slot"
                          >
                            Choose slot
                          </button>
                        )}
                        <button
                          className="btn-table-action"
                          onClick={() => navigate('/transfers?tab=outgoing')}
                        >Sell</button>
                        <button
                          className="btn-table-action"
                          onClick={() => navigate(`/player/${player.id}`)}
                        >
                          Profile
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
