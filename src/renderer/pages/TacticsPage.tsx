import React, { useEffect, useState } from 'react';
import { useCareerStore } from '../../stores/careerStore';
import { RatingBadge } from '../components/RatingBadge';
import { tacticalFit } from '../../game/tactics';
import './TacticsPage.css';
import {botDifficulty} from '../../game/bot-difficulty';
import {DEFAULT_TACTICS,TACTIC_CHOICES} from '../../game/tactics';

export const TacticsPage: React.FC = () => {
  const { roster, team, career } = useCareerStore();
  const starters = roster.slice(0, 3);

  // Tactic settings
  const [overallStyle, setOverallStyle] = useState<string>('Aggressive');
  const [challengeFreq, setChallengeFreq] = useState<string>('Aggressive');
  const [rotation, setRotation] = useState<string>('Fluid');
  const [boostPriority, setBoostPriority] = useState<string>('Balanced');
  const [demoFreq, setDemoFreq] = useState<string>('High');
  const [passingStyle, setPassingStyle] = useState<string>('Passing Focus');
  const [pressure, setPressure] = useState<string>('High');
  const [local,setLocal]=useState<Record<string,string>>({supportDepth:'Balanced',outletWidth:'Balanced',demoTarget:'Star player',boostReserve:'0'});

  // Player assignments
  const [roles, setRoles] = useState<Record<string, string>>({
    0: 'First Man (Primary Striker / Disruptor)',
    1: 'Second Man (Playmaker / Midfield Infield)',
    2: 'Third Man / Anchor (Last Man Back / Goal Defense)',
  });

  const [savedNotice, setSavedNotice] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const indexedRoles=Object.fromEntries(starters.map((p,i)=>[i,roles[p.id]??roles[i]]));
  const plan = { ...local,overallStyle, challengeFreq, rotation, boostPriority, demoFreq, passingStyle, pressure, roles:indexedRoles,
    rolesByPlayer:Object.fromEntries(starters.map((p,i)=>[p.id,roles[p.id]??roles[i]])) };
  useEffect(() => {
    if (!career) return;
    window.api.management.tactics(career.id).then(p => {
      if (p.error) { setSaveError(p.error); return; }
      setOverallStyle(p.overallStyle); setChallengeFreq(p.challengeFreq); setRotation(p.rotation); setBoostPriority(p.boostPriority);
      setDemoFreq(p.demoFreq); setPassingStyle(p.passingStyle); setPressure(p.pressure); setRoles(p.rolesByPlayer||p.roles);
      setLocal(Object.fromEntries(['supportDepth','outletWidth','demoTarget','boostReserve'].map(key=>[key,p[key]??(DEFAULT_TACTICS as any)[key]])));
    });
  }, [career?.id]);

  const handleSave = async () => {
    if (!career || saving) return;
    setSaving(true); setSavedNotice(false); setSaveError('');
    try {
      const result = await window.api.management.saveTactics(career.id, plan);
      if (!result.success) throw new Error(result.error);
      setSavedNotice(true);
    } catch (e: any) { setSaveError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="tactics-page">
      {saveError && <div className="notice notice-error" role="alert">{saveError}</div>}
      <div className="tactics-header">
        <div>
          <h1 className="page-heading">TEAM TACTICS & ROTATIONS</h1>
          <p className="page-subheading">
            Design match strategies, rotation patterns, challenge aggression, and assign match roles to
            your active 3v3 starters.
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          💾 Save Match Plan
        </button>
      </div>
      <div className="notice">Saved roles and plans guide local bots' ground positioning and challenges. Between-game timeout orders take priority; live D-pad orders temporarily override them. Aerial mechanics and emergency saves remain with the original policy. Hosted bots retain their private tactics.</div>
      {career&&botDifficulty(career.difficulty)!=='Hard'&&<section className="notice local-comms-help"><strong>Mid-game commands · Easy / Medium</strong><p>Use your normal D-pad quick-chat menu. “Go for it!” presses forward (18s), “Defending…” drops the support players back (20s), “Centering!” favours infield outlets (18s), and “Incoming!” requests brief demo pressure with defensive cover (12s). “In position.” restores normal tactics. Add these messages in Rocket League’s Quick Chat settings if needed.</p><small>Only your own human quick chats command your teammates. Commands keep normal physics and preserve kickoffs, aerials and urgent saves. They request attempts; they cannot guarantee a pass or demo.</small></section>}

      {savedNotice && (
        <div className="tactics-save-banner">
          ✓ Tactical setup successfully locked in for upcoming fixtures!
        </div>
      )}

      <div className="tactics-content-grid">
        {career&&botDifficulty(career.difficulty)!=='Hard'&&<section className="tactics-panel"><h3>Local bot ground instructions</h3><p>These change off-ball positioning and grounded tactical attempts. Emergency saves, kickoffs and aerials retain the original bot policy.</p>{[['supportDepth','Support distance'],['outletWidth','Passing outlet width'],['demoTarget','Demo target priority'],['boostReserve','Minimum boost reserve']].map(([key,label])=><label key={key} style={{display:'block',marginBottom:14}}>{label}<select value={local[key]} onChange={e=>setLocal(old=>({...old,[key]:e.target.value}))}>{TACTIC_CHOICES[key].map(value=><option key={value}>{value}</option>)}</select></label>)}<small>Demo priority applies when demo pressure is ordered. Boost reserve controls tactical pursuit only; native emergency decisions stay with the bot.</small></section>}
        {/* Left: Tactical Parameters */}
        <div className="tactics-panel">
          <h3 className="panel-title">SYSTEM PREFERENCES</h3>

          {/* Overall Style */}
          <div className="tactic-group">
            <label className="tactic-label">OVERALL TEAM STYLE</label>
            <div className="tactic-pills">
              {['Defensive', 'Balanced', 'Aggressive'].map((opt) => (
                <button
                  key={opt}
                  className={`tactic-pill ${overallStyle === opt ? 'active' : ''}`}
                  onClick={() => setOverallStyle(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Challenge Frequency */}
          <div className="tactic-group">
            <label className="tactic-label">CHALLENGE FREQUENCY</label>
            <div className="tactic-pills">
              {['Conservative', 'Balanced', 'Aggressive'].map((opt) => (
                <button
                  key={opt}
                  className={`tactic-pill ${challengeFreq === opt ? 'active' : ''}`}
                  onClick={() => setChallengeFreq(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Rotation Discipline */}
          <div className="tactic-group">
            <label className="tactic-label">ROTATION DISCIPLINE</label>
            <div className="tactic-pills">
              {['Structured', 'Balanced', 'Fluid'].map((opt) => (
                <button
                  key={opt}
                  className={`tactic-pill ${rotation === opt ? 'active' : ''}`}
                  onClick={() => setRotation(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Boost Priority */}
          <div className="tactic-group">
            <label className="tactic-label">BOOST PRIORITY & STARVATION</label>
            <div className="tactic-pills">
              {['Conservative', 'Balanced', 'Heavy'].map((opt) => (
                <button
                  key={opt}
                  className={`tactic-pill ${boostPriority === opt ? 'active' : ''}`}
                  onClick={() => setBoostPriority(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Demo Frequency */}
          <div className="tactic-group">
            <label className="tactic-label">DEMOLITION / BUMP FOCUS</label>
            <div className="tactic-pills">
              {['Low', 'Normal', 'High'].map((opt) => (
                <button
                  key={opt}
                  className={`tactic-pill ${demoFreq === opt ? 'active' : ''}`}
                  onClick={() => setDemoFreq(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Passing Style */}
          <div className="tactic-group">
            <label className="tactic-label">PASSING & INFIELD FOCUS</label>
            <div className="tactic-pills">
              {['Solo Focus', 'Balanced', 'Passing Focus'].map((opt) => (
                <button
                  key={opt}
                  className={`tactic-pill ${passingStyle === opt ? 'active' : ''}`}
                  onClick={() => setPassingStyle(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Pressure */}
          <div className="tactic-group">
            <label className="tactic-label">MIDFIELD PRESSURE INTENSITY</label>
            <div className="tactic-pills">
              {['Low', 'Medium', 'High'].map((opt) => (
                <button
                  key={opt}
                  className={`tactic-pill ${pressure === opt ? 'active' : ''}`}
                  onClick={() => setPressure(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Starter Roles & Pitch Visualization */}
        <div className="tactics-panel">
          <h3 className="panel-title">MATCH ROLE ASSIGNMENTS</h3>

          <div className="roles-assignment-list">
            {starters.map((player, idx) => (
              <div key={player.id} className="role-assign-card">
                <div className="role-card-top">
                  <RatingBadge rating={player.overall} size="md" />
                  <div className="role-player-names">
                    <span className="role-gamertag">{player.gamertag}</span>
                    <span className="role-tendency">Natural: {player.preferredTendency}</span>
                  </div>
                </div>

                <div className="role-dropdown-wrap">
                  <label>ASSIGNED MATCHDAY ROLE</label>
                  <select
                    className="role-select"
                    value={roles[player.id]??roles[idx]}
                    onChange={(e) => setRoles({ ...roles, [player.id]: e.target.value })}
                  >
                    <option value="First Man (Primary Striker / Disruptor)">
                      First Man (Primary Striker / Disruptor)
                    </option>
                    <option value="Second Man (Playmaker / Midfield Infield)">
                      Second Man (Playmaker / Midfield Infield)
                    </option>
                    <option value="Third Man / Anchor (Last Man Back / Goal Defense)">
                      Third Man / Anchor (Last Man Back / Goal Defense)
                    </option>
                  </select>
                </div>
              </div>
            ))}
          </div>

          {/* Tactical Chemistry Summary */}
          <div className="tactical-compatibility-box">
            <div className="compatibility-title">TACTICAL COMPATIBILITY</div>
            <div className="compatibility-score">{tacticalFit(starters, plan)} / 100 in relevant skills</div>
            <p className="compatibility-desc">
              This score reflects the attributes your plan asks for. Match strategies work best when they suit your starting three.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
