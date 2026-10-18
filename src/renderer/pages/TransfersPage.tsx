import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCareerStore } from '../../stores/careerStore';
import { RatingBadge } from '../components/RatingBadge';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { transferWindow, wageDemands } from '../../game/career-rules';
import { Player, Region, matchesRegion } from '../../types';
import './TransfersPage.css';
import { OutgoingTransfersPanel } from '../components/OutgoingTransfersPanel';

export const TransfersPage: React.FC = () => {
  const navigate = useNavigate();
  const { team, career, currentDate } = useCareerStore();

  // Restore filters and expanded rows when Back returns from a player dossier.
  const [params, setParams] = useSearchParams();
  const updateView = (key: string, value: string, resetLimit = true) => {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      next.set(key, value);
      if (resetLimit) next.delete('limit');
      return next;
    }, { replace: true });
  };
  const tab = params.get('tab');
  const activeTab = ['free_agents', 'shortlist', 'history', 'outgoing'].includes(tab || '') ? tab! : 'available';
  const setActiveTab = (value: string) => updateView('tab', value);
  const [players, setPlayers] = useState<Player[]>([]);
  const [freeAgents, setFreeAgents] = useState<Player[]>([]);
  const search = params.get('search') || '';
  const setSearch = (value: string) => updateView('search', value);
  const selectedRegion = params.get('region') || 'ALL';
  const setSelectedRegion = (value: string) => updateView('region', value);
  const minOvr = Math.max(0, Math.min(100, Number(params.get('ovr') || 70) || 0));
  const setMinOvr = (value: number) => updateView('ovr', String(value));
  const [loading, setLoading] = useState<boolean>(true);

  const [overview, setOverview] = useState<any>({ shortlist: [], history: [] });
  const limit = Math.max(50, Math.min(10000, Number(params.get('limit') || 50) || 50));
  const [error, setError] = useState('');
  const market = transferWindow(currentDate,career?.transferWindows);
  useEffect(() => {
    async function loadPlayers() {
      setLoading(true);
      try {
        if (window.api?.players) {
          const all = await window.api.players.getAll();
          setPlayers(all || []);
          if (career) setOverview(await window.api.management.overview(career.id));
          const fa = await window.api.players.getFreeAgents();
          setFreeAgents(fa || []);
        }
      } catch (err) {
        console.error('Failed to load transfers', err);
      } finally {
        setLoading(false);
      }
    }
    loadPlayers();
  }, [career?.id, currentDate]);

  const toggleShortlist = async (p: Player) => {
    if (!career) return;
    const result = await window.api.management.shortlist(career.id, p.id, !overview.shortlist.includes(p.id));
    if (!result.success) { setError(result.error); return; }
    setOverview(await window.api.management.overview(career.id));
  };
  const displayList = activeTab === 'free_agents' ? freeAgents : activeTab === 'shortlist' ? players.filter(p => overview.shortlist.includes(p.id)) : players;

  const filtered = displayList.filter((p) => {
    if (p.teamId === team?.id) return false;
    if (p.overall < minOvr) return false;
    if (selectedRegion !== 'ALL' && !matchesRegion(p.region, selectedRegion)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        p.gamertag.toLowerCase().includes(q) ||
        (p.realName && p.realName.toLowerCase().includes(q)) ||
        (p.preferredTendency && p.preferredTendency.toLowerCase().includes(q))
      );
    }
    return true;
  }).sort((a, b) => b.overall - a.overall || b.potential - a.potential || a.gamertag.localeCompare(b.gamertag));

  return (
    <div className="transfers-page">
      <div className="transfers-header">
        <div>
          <h1 className="page-heading">TRANSFER MARKET & RECRUITMENT</h1>
          <p className="page-subheading">
            Negotiate player contracts, scout upcoming prospects, and sign world-class talent to bolster
            your 3v3 roster.
          </p>
          <p className="text-muted" style={{fontSize:13}}>Real players and confirmed 2026 rosters. Ratings are estimates; open a dossier for sources and confidence.</p>
        </div>

        <div className="transfer-budget-pill">
          <span>AVAILABLE CLUB FUNDS: <strong>${(team?.cashBalance ?? 0).toLocaleString()}</strong></span>
        </div>
      </div>

      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <div className={`notice ${market.open ? 'notice-success' : ''}`}>{market.label}. Scouting and shortlisting remain available all season.</div>

      <div className="transfer-tabs">
        <button className={`tab-btn ${activeTab === 'outgoing' ? 'active' : ''}`} onClick={() => setActiveTab('outgoing')}>Sell players & offers</button>
        <button
          className={`tab-btn ${activeTab === 'available' ? 'active' : ''}`}
          onClick={() => setActiveTab('available')}
        >
          All Players
        </button>
        <button
          className={`tab-btn ${activeTab === 'free_agents' ? 'active' : ''}`}
          onClick={() => setActiveTab('free_agents')}
        >
          Free Agents ({freeAgents.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'shortlist' ? 'active' : ''}`}
          onClick={() => setActiveTab('shortlist')}
        >
          Shortlisted Targets
        </button>
        <button
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Recent Signings & Trades
        </button>
      </div>

      {/* Filter Toolbar */}
      {activeTab !== 'outgoing' && <div className="filters-toolbar">
        <input
          type="text"
          className="search-input"
          placeholder="Search by gamertag, name, or playstyle..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="filter-select"
          value={selectedRegion}
          onChange={(e) => setSelectedRegion(e.target.value)}
        >
          <option value="ALL">All Regions</option>
          {Object.values(Region).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <div className="min-ovr-control">
          <span>Min OVR: {minOvr}</span>
          <input
            type="range"
            min="65"
            max="95"
            value={minOvr}
            onChange={(e) => setMinOvr(Number(e.target.value))}
          />
        </div>
      </div>

      }
      {/* Players List Table */}
      {activeTab === 'outgoing' ? <OutgoingTransfersPanel /> : activeTab === 'history' ? <div className="panel"><h3>Completed business</h3>{overview.history.length ? overview.history.map((t: any) => <div className="list-row" key={t.id}><span>{t.gamertag} · {t.type}</span><span>{t.date} · ${t.fee.toLocaleString()}</span></div>) : <p className="empty-state">No completed transfers yet.</p>}</div> : <div className="transfers-table-wrap">
        <table className="transfers-table">
          <thead>
            <tr>
              <th>OVR</th>
              <th>POT</th>
              <th>GAMERTAG</th>
              <th>ORGANIZATION</th>
              <th>REGION</th>
              <th>AGE</th>
              <th>PLAYSTYLE</th>
              <th>MARKET VALUE</th>
              <th>EST. MONTHLY ASK</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((p) => (
              <tr key={p.id}>
                <td>
                  <span title={p.ratingMethod || 'Gameplay rating estimate'}><RatingBadge rating={p.overall} size="sm" /></span>
                </td>
                <td>
                  <strong className="pot-text">{p.potential}</strong>
                </td>
                <td>
                  <span
                    className="player-name-link font-bold"
                    onClick={() => navigate(`/player/${p.id}`)}
                  >
                    <span className="player-cell"><PlayerAvatar playerId={p.id} gamertag={p.gamertag} overall={p.overall} size="sm" />{p.gamertag}</span>
                  </span>
                </td>
                <td>{p.teamName || (p.teamId ? 'Contracted' : p.affiliationStatus === 'unverified' ? 'Affiliation unverified' : p.affiliationStatus === 'inactive' ? 'Inactive' : 'Free Agent')}</td>
                <td>{p.region}</td>
                <td>{p.age ?? '—'}</td>
                <td className="tendency-text">{p.preferredTendency}</td>
                <td>${(p.marketValue || 80000).toLocaleString()}</td>
                <td>${wageDemands(p).salary.toLocaleString()}/mo</td>
                <td>
                  <div className="actions-cell">
                    <button
                      className="btn-table-action btn-approach"
                      disabled={!market.open || (!p.teamId && ['unverified', 'inactive'].includes(p.affiliationStatus || ''))} title={!p.teamId && p.affiliationStatus === 'unverified' ? 'Current affiliation and availability have not been verified.' : market.label} onClick={() => navigate(`/negotiate/${p.id}`)}
                    >
                      Approach
                    </button>
                    <button
                      className="btn-table-action"
                      onClick={() => navigate(`/player/${p.id}`)}
                    >
                      Dossier
                    </button>
                    <button className="btn-table-action" onClick={() => toggleShortlist(p)}>{overview.shortlist.includes(p.id) ? 'Remove' : 'Shortlist'}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      }
      {!loading && !['history', 'outgoing'].includes(activeTab) && filtered.length > limit && <button className="btn btn-secondary" onClick={() => updateView('limit', String(limit + 50), false)}>Show more · {Math.min(limit, filtered.length)} of {filtered.length}</button>}
    </div>
  );
};
