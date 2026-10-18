import React, { useEffect, useState } from 'react';
import { useCareerStore } from '../../stores/careerStore';
import { isPath } from '../../game/career-mode';
import { useNavigate } from 'react-router-dom';
export function PathMatchProgress({ revision }: { revision: number }) {
  const career = useCareerStore((s) => s.career),
    navigate = useNavigate(),
    [data, setData] = useState<any>(null);
  useEffect(() => {
    let active = true;
    if (career && isPath(career))
      window.api.management
        .pathOverview(career.id)
        .then((r) => {
          if (active && !r.error) setData(r);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [career?.id, revision]);
  if (!isPath(career) || !data?.lastReward) return null;
  return (
    <section className="panel path-game-progress" aria-label="Game development rewards">
      <span className="eyebrow">Your squad learned from this game</span>
      <h2>+{data.lastReward.xp} match XP each</h2>
      <p>
        Individual contribution bonuses and completed challenges add extra XP. Losses count towards
        your development and resilience challenges.
      </p>
      <div className="path-timeout-players">
        {data.players.map((p: any) => (
          <div key={p.id}>
            <strong>{p.gamertag}</strong>
            <p>
              {p.points} development points ready · {p.xp} / {p.xpNeeded} XP
            </p>
          </div>
        ))}
      </div>
      <div className="conversation-actions">
        <button className="btn btn-primary" onClick={() => navigate('/training')}>
          Spend development points →
        </button>
        <button className="btn btn-secondary" onClick={() => navigate('/challenges')}>
          Challenges & rewards →
        </button>
      </div>
    </section>
  );
}
