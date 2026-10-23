import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCareerStore } from '../../stores/careerStore';
import './LoadCareerPage.css';
interface SaveMeta {
  employment?: string;
  mode?:string;
  id: string;
  managerName: string;
  teamId: string;
  teamName?: string;
  region: string;
  difficulty: string;
  currentDate: string;
  updatedAt: string;
}
export const LoadCareerPage: React.FC = () => {
  const navigate = useNavigate();
  const { loadCareer, error } = useCareerStore();
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    async function fetchSaves() {
      setLoading(true);
      try {
        if (window.api?.career) {
          const list = await window.api.career.list();
          setSaves(list || []);
          if (list && list.length > 0) {
            setSelectedId(list[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to list careers', err);
      } finally {
        setLoading(false);
      }
    }
    fetchSaves();
  }, []);
  const handleLoad = async () => {
    if (!selectedId||saves.find(s=>s.id===selectedId)?.employment==='dismissed') return;
    const ok = await loadCareer(selectedId);
    if (ok) {
      navigate('/dashboard');
    }
  };
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this career save?')) return;
    try {
      if (window.api?.career) {
        await window.api.career.delete(id);
        const updated = saves.filter((s) => s.id !== id);
        setSaves(updated);
        if (selectedId === id) {
          setSelectedId(updated[0]?.id || null);
        }
      }
    } catch (err) {
      console.error('Failed to delete save', err);
    }
  };
  return (
    <div className="load-career-page">
      <div className="load-career-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          ← MAIN MENU
        </button>
        <h1 className="load-title">SAVED CAMPAIGNS</h1>
        <button className="new-career-shortcut-btn" onClick={() => navigate('/career/new')}>
          + NEW CAREER
        </button>
      </div>
      <div className="load-career-content">{error&&<p className="notice notice-error" role="alert">{error}</p>}
        {loading ? (
          <div className="loading-saves">Scanning career database...</div>
        ) : saves.length === 0 ? (
          <div className="no-saves-card">
            <div className="no-saves-icon">📂</div>
            <h2>No Saved Careers Found</h2>
            <p>Start a new managerial campaign to begin your journey to the RLCS World Championship.</p>
            <button className="btn btn-primary" onClick={() => navigate('/career/new')}>
              START NEW CAREER
            </button>
          </div>
        ) : (
          <div className="saves-list">
            {saves.map((s) => (
              <div
                key={s.id}
                className={`save-item-card ${selectedId === s.id ? 'selected' : ''}`}
                onClick={() => setSelectedId(s.id)}
              >
                <div className="save-primary-info">
                  <div className="save-manager-name">{s.managerName}</div>
                  <div className="save-team-name">{s.teamName || s.teamId}</div>
                </div>
                <div className="save-meta-info">
                  <span className="save-badge region-badge">{s.region}</span>
                  <span className="save-badge">{s.employment==='dismissed'?'Dismissed · career over':s.mode||'Manager Career'}</span>
                  <span className="save-badge difficulty-badge">{s.difficulty}</span>
                  <span className="save-date">In-Game: {s.currentDate}</span>
                </div>
                <div className="save-actions">
                  <span className="save-last-saved">
                    Saved: {new Date(s.updatedAt).toLocaleDateString()}
                  </span>
                  <button
                    className="delete-save-btn"
                    onClick={(e) => handleDelete(s.id, e)}
                    title="Delete save"
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="load-footer">
        <button className="btn btn-secondary" onClick={() => navigate('/')}>
          Cancel
        </button>
        <button
          className="btn btn-primary load-btn"
          disabled={!selectedId || saves.length === 0 || saves.find(s=>s.id===selectedId)?.employment==='dismissed'}
          onClick={handleLoad}
        >
          RESUME CAREER
        </button>
      </div>
    </div>
  );
};
