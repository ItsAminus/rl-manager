import React, { useEffect, useState, useRef } from 'react';
import { useCareerStore } from '../../stores/careerStore';
import './TrainingPage.css';
import {playUiSound} from '../audio/ui-sounds';
import {isPath} from '../../game/career-mode';
import {CORE_SKILLS} from '../../game/local-skill-progression';

interface TrainingScheduleDay {
  day: string;
  category: string;
  intensity: 'Low' | 'Normal' | 'High';
}

const CATEGORIES = [
  'Mechanics',
  'Shooting',
  'Aerial',
  'Defense',
  'Positioning',
  'Team Play',
  'Boost Management',
  'Recovery',
  'Mental / Pressure',
  'Rest',
];

export const TrainingPage: React.FC = () => {
  const { roster, career, currentDate,team } = useCareerStore();
  const [logs, setLogs] = useState<any[]>([]);
  const [development,setDevelopment]=useState<any[]|null>(null);
  const [developmentOwner,setDevelopmentOwner]=useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [allocating,setAllocating]=useState<string|null>(null);
  const [celebration,setCelebration]=useState<any>(null),celebrationTimer=useRef<ReturnType<typeof setTimeout>>();
  useEffect(()=>()=>{if(celebrationTimer.current)clearTimeout(celebrationTimer.current);},[]);
  const [schedule, setSchedule] = useState<TrainingScheduleDay[]>([
    { day: 'Monday', category: 'Mechanics', intensity: 'High' },
    { day: 'Tuesday', category: 'Aerial', intensity: 'Normal' },
    { day: 'Wednesday', category: 'Positioning', intensity: 'Normal' },
    { day: 'Thursday', category: 'Team Play', intensity: 'High' },
    { day: 'Friday', category: 'Shooting', intensity: 'Normal' },
    { day: 'Saturday', category: 'Mental / Pressure', intensity: 'Low' },
    { day: 'Sunday', category: 'Rest', intensity: 'Low' },
  ]);

  const [savedNotice, setSavedNotice] = useState<boolean>(false);

  const updateDay = (index: number, key: 'category' | 'intensity', val: any) => {
    const updated = [...schedule];
    updated[index] = { ...updated[index], [key]: val };
    setSchedule(updated);
  };

  useEffect(() => {
    if (!career) return;
    let cancelled=false;
    window.api.management.training(career.id).then(data => {
      if(cancelled)return;
      if (data.error) { setError(data.error); return; }
      setSchedule(data.schedule.map((s: any, i: number) => ({ ...s, day: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i] })));
      setLogs(data.logs);
      setDevelopment(data.earned||null);
      setDevelopmentOwner(career.id);
    }).catch(err => {if(!cancelled)setError(String(err));});
    return()=>{cancelled=true;};
  }, [career?.id, currentDate]);
  const handleApply = async () => {
    if (!career || saving) return;
    setSaving(true); setError('');
    try {
      const res = await window.api.management.saveTraining(career.id, schedule.map((s, day) => ({ ...s, day })));
      if (!res.success) throw new Error(res.error);
      setSavedNotice(true);
    } catch (err) { setError(String(err)); }
    finally { setSaving(false); }
  };
  const allocate=async(playerId:string,skill:string)=>{
    if(!career||allocating)return;setAllocating(playerId+skill);setError('');
    const before=development?.find(p=>p.playerId===playerId);
    try{
      const result=await window.api.management.allocateSkill(career.id,playerId,skill);
      if(result.error)throw new Error(result.error);
      const data=await window.api.management.training(career.id);
      if(data.error)throw new Error(data.error);setDevelopment(data.earned||null);setLogs(data.logs);
      const after=data.earned?.find((p:any)=>p.playerId===playerId);
      if(after){
        if(celebrationTimer.current)clearTimeout(celebrationTimer.current);
        setCelebration({key:Date.now(),playerId,skill,from:before?.skills.find((s:any)=>s.id===skill)?.value,to:after.skills.find((s:any)=>s.id===skill)?.value,
          ovr:after.overall>before?.overall?after.overall:null,tier:after.tier.level!==before?.tier?.level?after.tier.level:null});
        celebrationTimer.current=setTimeout(()=>setCelebration(null),2200);playUiSound('success');
      }
      await useCareerStore.getState().reloadRoster();
    }catch(err){setError(String(err));}finally{setAllocating(null);}
  };

  return (
    <div className="training-page">
      <div className="training-header">
        <aside className="notice"><strong>Team chemistry · {Math.round(team?.teamChemistry??50)}/100</strong><p>Schedule Team Play sessions to build understanding slowly. Sessions improve both individual and team chemistry when average fatigue stays at 70 or below. Add rest days rather than overloading the squad.</p></aside>
        <div>
          <h1 className="page-heading">{isPath(career)?'SQUAD DEVELOPMENT':'WEEKLY TRAINING SCHEDULE'}</h1>
          <p className="page-subheading">
            {isPath(career)?'Invest earned match XP in your squad. Your weekly regimen manages condition, confidence and teamwork; permanent skill growth comes from allocated points.':'Schedule attribute focus and intensity across the week. High intensity accelerates growth but elevates player match fatigue.'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleApply} disabled={saving}>
          💾 Save Weekly Regimen
        </button>
      </div>

      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {development&&developmentOwner===career?.id&&!isPath(career)&&<section className="panel earned-development"><h3>Earn your next OVR point</h3><p>At least 30 productive sessions over 35+ days and sustained individual performances in six or more credible series are needed. A win alone does not award OVR. Elite players develop more slowly.</p>{development.map(p=><p key={p.playerId}><b>{p.name} · {p.overall} / {p.potential}</b> · Training {p.trainingPercent}% · Match evidence {p.matchPercent}% · {p.status}</p>)}</section>}
      {development&&developmentOwner===career?.id&&isPath(career)&&<section className="panel earned-development"><h3>Develop your squad</h3><p>Played wins and losses earn XP for all three squad members, including the player you control. XP becomes points; winning streaks speed this up. Five total core-skill improvements earn one OVR, within potential. Upgrades cost more above 80 and 90.</p>
        <p className="skill-difficulty-note">Meet the OVR and core-skill requirements across all three players, then win a promotion trial. It unlocks stronger bots next series. The Champ trial unlocks Rocket Host. Upgrades affect AI play, never your own controls.</p>
        <details className="skill-controls-guide"><summary>What each attribute changes within the same local bot</summary><p>Upgrades apply when the next game loads, even if the bot engine and OVR stay the same. Each skill changes its own controller; it is not a guaranteed success percentage. Hosted bots retain their private policies.</p><dl>{CORE_SKILLS.map(s=><React.Fragment key={s.id}><dt>{s.label}</dt><dd>{s.effect}</dd></React.Fragment>)}</dl></details>
        <div className="skill-player-grid">{development.map(p=><article key={p.playerId} className={`skill-player-card ${allocating?.startsWith(p.playerId)?'skill-investing':''} ${celebration?.playerId===p.playerId?'skill-celebrating':''}`}>
          {celebration?.playerId===p.playerId&&<span key={celebration.key} className="skill-gold-wash" aria-hidden="true"/>}
          <header><div><h4>{p.name}</h4><span key={celebration?.playerId===p.playerId?celebration.key:'ovr'} className={celebration?.playerId===p.playerId&&celebration.ovr?'skill-ovr-gain':''}>OVR {p.overall} / {p.potential} potential</span></div><strong key={p.points} className="skill-points-balance">{p.points} points</strong></header>
          <div className="skill-evidence"><span>Match XP: {p.xp} / {p.xpNeeded} to the next point</span></div>
          <p>{p.status}</p><div className="skill-allocation-list">{p.skills.map((s:any)=><div key={s.id} className={celebration?.playerId===p.playerId&&celebration.skill===s.id?'skill-row-upgraded':''}><span>{s.label} <b key={s.value}>{s.value.toFixed(1)}</b>{celebration?.playerId===p.playerId&&celebration.skill===s.id&&<em key={celebration.key} className="skill-floating-gain" aria-hidden="true">+1</em>}</span><button className="btn btn-secondary" disabled={!!allocating||s.atCap||p.points<s.cost} aria-label={`Improve ${p.name} ${s.label} for ${s.cost} points`} onClick={()=>allocate(p.playerId,s.id)}>{s.atCap?'At ceiling':allocating===p.playerId+s.id?'Saving…':`+1 · ${s.cost} ${s.cost===1?'point':'points'}`}</button><div className="skill-value-track" aria-hidden="true"><i style={{width:`${s.value}%`}}/></div></div>)}</div>
          <footer><b>Skill eligibility: {p.tier.level}</b>{p.tier.next?<span>Next: {p.tier.next.level} · OVR {p.tier.next.cutoff}+ and every core skill {p.tier.next.minimumSkill}+{p.tier.next.missing.length?` · Develop: ${p.tier.next.missing.join(', ')}`:''}</span>:<span>Elite skill requirements met.</span>}
            {celebration?.playerId===p.playerId&&<div key={celebration.key} className="skill-upgrade-receipt" role="status">{celebration.tier?`✦ ${celebration.tier} eligibility reached · squad promotion trial still required`:celebration.ovr?`✦ OVR increased to ${celebration.ovr}`:`✦ ${p.skills.find((s:any)=>s.id===celebration.skill)?.label} ${celebration.from.toFixed(1)} → ${celebration.to.toFixed(1)}`}</div>}
          </footer>
        </article>)}</div><small>Form, confidence, fatigue and chemistry remain temporary. Points belong to this save; a played game cannot earn XP twice.</small></section>}
      {savedNotice && (
        <div className="training-save-banner">
          ✓ Weekly training plan applied to squad development engine!
        </div>
      )}

      {/* Days Table */}
      <div className="training-days-grid">
        {schedule.map((slot, idx) => (
          <div key={slot.day} className="training-day-card">
            <div className="day-name">{slot.day}</div>

            <div className="day-select-group">
              <label>FOCUS DRILL</label>
              <select
                className="training-select"
                value={slot.category}
                onChange={(e) => updateDay(idx, 'category', e.target.value)}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="day-select-group">
              <label>INTENSITY</label>
              <div className="intensity-buttons">
                {(['Low', 'Normal', 'High'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    className={`intensity-btn ${slot.intensity === lvl ? 'active' : ''} lvl-${lvl.toLowerCase()}`}
                    onClick={() => updateDay(idx, 'intensity', lvl)}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            <div className="impact-indicator">
              <span>Fatigue Impact:</span>
              <span className={`impact-tag impact-${slot.intensity.toLowerCase()}`}>
                {slot.category === 'Rest'
                  ? '-20% (Recovery)'
                  : slot.intensity === 'High'
                  ? '+10%'
                  : slot.intensity === 'Normal'
                  ? '+3%'
                  : '-2%'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Squad Readiness Summary */}
      <div className="training-bottom-grid">
        <div className="training-panel">
          <h3 className="panel-title">SQUAD CONDITIONING SUMMARY</h3>
          <div className="squad-fatigue-list">
            {roster.map((player) => (
              <div key={player.id} className="player-fatigue-row">
                <span className="fatigue-gamertag">{player.gamertag}</span>
                <span className="fatigue-tendency">{player.preferredTendency}</span>
                <div className="fatigue-meter-track">
                  <div
                    className={`fatigue-meter-fill ${player.fatigue > 35 ? 'meter-high' : 'meter-good'}`}
                    style={{ width: `${Math.max(5, player.fatigue || 0)}%` }}
                  />
                </div>
                <span className="fatigue-pct">{player.fatigue || 0}% Fatigue</span>
              </div>
            ))}
          </div>
        </div>

        <div className="training-panel">
          <h3 className="panel-title">RECENT DEVELOPMENT LOGS</h3>
          <div className="dev-logs-list">
            {logs.length ? logs.map(log => <div key={log.id} className="dev-log-item"><span className="log-date">{log.date}</span><span className="log-text">{log.body}</span></div>) : <p className="empty-state">No rating gains yet. Saved sessions run as the calendar advances; growth is gradual and capped by potential.</p>}

          </div>
        </div>
      </div>
    </div>
  );
};
