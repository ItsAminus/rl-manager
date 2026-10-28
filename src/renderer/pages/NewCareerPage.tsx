import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCareerStore } from '../../stores/careerStore';
import { Region, Difficulty, Team, matchesRegion } from '../../types';
import './NewCareerPage.css';
import {selectableTeam,selectTeams,TEAM_SORTS,type TeamSort} from '../../game/team-selection';
import {validateCustomOrganization} from '../../game/custom-organization';
import {imageFilePng} from '../utils/design-images';

export const NewCareerPage: React.FC = () => {
  const navigate = useNavigate();
  const { createCareer, allTeams, initialize } = useCareerStore();

  const [step, setStep] = useState<number>(1);
  const [managerName, setManagerName] = useState<string>('Alex Mercer');
  const [selectedRegion, setSelectedRegion] = useState<string>(Region.EUROPE);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [customOrgName, setCustomOrgName] = useState<string>('');
  const [customShort,setCustomShort]=useState(''),[customLogo,setCustomLogo]=useState<string|null>(null),[imageBusy,setImageBusy]=useState(false);
  const [customPlayers,setCustomPlayers]=useState([{gamertag:'Striker',overall:70,age:18},{gamertag:'Playmaker',overall:70,age:18},{gamertag:'Anchor',overall:70,age:18}]);
  const customDesign=()=>validateCustomOrganization({name:customOrgName,shortName:customShort,logo:customLogo,players:customPlayers});
  const [isCustomOrg, setIsCustomOrg] = useState<boolean>(false);
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.HARD);
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [teamSearch,setTeamSearch]=useState('');
  const [teamSort,setTeamSort]=useState<TeamSort>('reputation');
  const [ascending,setAscending]=useState(false);

  useEffect(() => {
    async function load() {
      await initialize();
      if (window.api?.teams) {
        const t = await window.api.teams.getSelectable();
        const selectable = (t as Team[]).filter(selectableTeam);
        setTeams(selectable);
        const inReg = selectable.filter((item: Team) => matchesRegion(item.region, selectedRegion));
        if (inReg.length > 0) {
          setSelectedTeamId(inReg[0].id);
        } else if (selectable.length > 0) {
          setSelectedTeamId(selectable[0].id);
        }
      }
    }
    load();
  }, [initialize]);

  const filteredTeams = selectTeams(teams,selectedRegion,teamSearch,teamSort,ascending);
  const regionTeams=teams.filter(t=>matchesRegion(t.region,selectedRegion));

  const handleNext = () => {
    setError(null);
    if (step === 1 && !managerName.trim()) {
      setError('Please enter your manager gamertag/name.');
      return;
    }
    if (step === 2) {
      if (!selectedRegion) {
        setError('Please select a starting region.');
        return;
      }
      const inReg = teams.filter((t) => matchesRegion(t.region, selectedRegion));
      if (inReg.length > 0 && (!selectedTeamId || !inReg.some((t) => t.id === selectedTeamId))) {
        setSelectedTeamId(inReg[0].id);
      }
    }
    if (step === 3 && !isCustomOrg && !regionTeams.some(t=>t.id===selectedTeamId)) {
      setError('Please select an organization.');
      return;
    }
    if(step===3&&isCustomOrg){try{customDesign();}catch(e){setError(String(e));return;}if(imageBusy)return;}
    setStep((s) => Math.min(5, s + 1));
  };

  const handleBack = () => {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  };

  const handleFinish = async () => {
    if(isCustomOrg){try{customDesign();}catch(e){setError(String(e));return;}}
    setSubmitting(true);
    setError(null);

    const targetTeamId = isCustomOrg ? `team_custom_${crypto.randomUUID()}` : selectedTeamId || teams[0]?.id || 'team_1';

    const result = await createCareer({
      managerName: managerName.trim(),
      teamId: targetTeamId,
      region: selectedRegion,
      difficulty,
      customOrgName: isCustomOrg ? customOrgName.trim() : undefined,
      customOrganization:isCustomOrg?customDesign():undefined,
    });

    setSubmitting(false);

    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.error || 'Failed to create career save.');
    }
  };

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);

  return (
    <div className="new-career-page">
      <div className="new-career-header">
        <button className="back-btn" onClick={() => (step > 1 ? handleBack() : navigate('/'))}>
          ← {step > 1 ? 'PREVIOUS STEP' : 'CANCEL'}
        </button>
        <h1 className="wizard-title">MANAGER CAREER SETUP</h1>
        <div className="step-counter">STEP {step} OF 5</div>
      </div>

      <div className="wizard-progress-bar">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`progress-segment ${i <= step ? 'active' : ''} ${i === step ? 'current' : ''}`}
          />
        ))}
      </div>

      <div className="wizard-body">
        {error && <div className="wizard-error-banner">{error}</div>}

        {/* STEP 1: Manager Name */}
        {step === 1 && (
          <div className="wizard-step step-1">
            <h2 className="step-heading">Manager Identity</h2>
            <p className="step-subheading">
              Choose your manager alias. This name will appear on official contracts, team press
              conferences, and the global leaderboards.
            </p>
            <div className="input-field-group">
              <label>MANAGER / GM GAMERTAG</label>
              <input
                type="text"
                className="input-text"
                placeholder="e.g. Kronovi, Gregan, Fireburner"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                autoFocus
              />
            </div>
          </div>
        )}

        {/* STEP 2: Region Selection */}
        {step === 2 && (
          <div className="wizard-step step-2">
            <h2 className="step-heading">Select Starting Region</h2>
            <p className="step-subheading">
              Select the competitive region your organization will compete in for Regional Opens
              and World Championship qualification.
            </p>
            <div className="region-grid">
              {Object.values(Region).map((reg) => (
                <div
                  key={reg}
                  className={`region-card ${matchesRegion(selectedRegion, reg) ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedRegion(reg);
                    const inReg = teams.filter((t) => matchesRegion(t.region, reg));
                    setSelectedTeamId(inReg[0]?.id||'');setTeamSearch('');
                  }}
                >
                  <div className="region-name">{reg}</div>
                  <div className="region-teams-count">
                    {teams.filter((t) => matchesRegion(t.region, reg)).length} Organizations Available
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 3: Choose or Create Organization */}
        {step === 3 && (
          <div className="wizard-step step-3">
            <h2 className="step-heading">Organization Selection</h2>
            <p className="step-subheading">
              Take helm of an established organization or found your own expansion franchise in{' '}
              {selectedRegion}.
            </p>

            <div className="org-tabs">
              <button
                className={`org-tab ${!isCustomOrg ? 'active' : ''}`}
                onClick={() => setIsCustomOrg(false)}
              >
                Existing Organization
              </button>
              <button
                className={`org-tab ${isCustomOrg ? 'active' : ''}`}
                onClick={() => setIsCustomOrg(true)}
              >
                + Found Custom Franchise
              </button>
            </div>

            {!isCustomOrg ? (
              <>
              <div className="team-selection-controls">
                <label htmlFor="team-search">Search teams<input id="team-search" className="input-text" type="search" placeholder="Team name or abbreviation…" value={teamSearch} onChange={e=>setTeamSearch(e.target.value)}/></label>
                <label htmlFor="team-sort">Sort by<select id="team-sort" value={teamSort} onChange={e=>{const sort=e.target.value as TeamSort;setTeamSort(sort);setAscending(sort==='name');}}>{Object.entries(TEAM_SORTS).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>
                <button type="button" className="org-tab" onClick={()=>setAscending(v=>!v)} aria-label={'Change sort direction, currently '+(ascending?'ascending':'descending')}>{teamSort==='name'?(ascending?'A → Z':'Z → A'):(ascending?'Lowest first ↑':'Highest first ↓')}</button>
              </div>
              <div className="team-selection-summary"><span role="status">{filteredTeams.length} of {regionTeams.length} teams in {selectedRegion}</span>{selectedTeam&&<span>Selected: <strong>{selectedTeam.name}</strong></span>}{teamSearch&&<button className="text-link" onClick={()=>setTeamSearch('')}>Clear search</button>}</div>
              <p className="team-pool-note">“Last registered lineup” teams remain available, but their current status is unverified. Confirmed disbanded teams and incomplete rosters are excluded.</p>
              <div className="teams-selection-grid">
                {filteredTeams.length === 0 ? (
                  <div className="empty-teams-notice">
                    {teamSearch?'No teams match your search in this region. Try another name or clear the search.':`No eligible teams in ${selectedRegion}. Choose another region or create a custom organization.`}
                  </div>
                ) : (
                  filteredTeams.map((t) => (
                    <button type="button" aria-pressed={selectedTeamId===t.id}
                      key={t.id}
                      className={`team-select-card ${selectedTeamId === t.id ? 'selected' : ''}`}
                      onClick={() => setSelectedTeamId(t.id)}
                    >
                      <div className="team-select-header">
                        <span className="team-tag">{t.shortName || t.name.slice(0, 3)}</span>
                        <span className="team-rep">Reputation: {t.reputation}/100</span>
                      </div>
                      <div className="team-select-name">{t.name}</div>
                      {t.rosterVerifiedAt && <div className="text-muted" style={{ fontSize: 12, marginBottom: 8 }} title={t.rosterNote}>
                        {t.rosterStatus==='historical'?'Last registered lineup':'Confirmed roster'} · {t.rosterVerifiedAt}
                      </div>}
                      <div className="team-select-stats">
                        <span>Budget: ${(t.budget ?? 0).toLocaleString()}</span>
                        <span>Facilities: Tier {t.facilityLevel || 1}</span>
                      </div>
                      <small className="text-muted">Fanbase: {(t.fanbase??0).toLocaleString()}</small>
                    </button>
                  ))
                )}
              </div>
              </>
            ) : (
              <div className="custom-org-panel">
                <div className="input-field-group">
                  <label>NEW ORGANIZATION NAME</label>
                  <input
                    type="text"
                    className="input-text"
                    placeholder="e.g. Apex Predators, Solar Esports"
                    value={customOrgName}
                    maxLength={50}
                    onChange={(e) => setCustomOrgName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="custom-squad-fields">
                  <label className="input-field-group">TEAM ABBREVIATION<input className="input-text" maxLength={6} placeholder="e.g. APEX" value={customShort} onChange={e=>setCustomShort(e.target.value.toUpperCase())}/></label>
                  <div className="input-field-group"><label htmlFor="custom-club-logo">TEAM LOGO · OPTIONAL</label><input id="custom-club-logo" type="file" accept="image/png,image/jpeg,image/webp" disabled={imageBusy} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setImageBusy(true);setError(null);try{setCustomLogo(await imageFilePng(file,512,512));}catch(err){setError(String(err));}finally{setImageBusy(false);e.target.value='';}}}/><small>PNG, JPG or WebP up to 10 MB. Used throughout RLM and the in-game timer.</small>{imageBusy&&<p role="status">Preparing logo…</p>}{customLogo&&<div className="custom-logo-preview"><img src={customLogo} alt="Your organization logo"/><button className="org-tab" onClick={()=>setCustomLogo(null)}>Remove logo</button></div>}</div>
                </div>
                <h3>Your starting squad</h3><p>Create your own three players. Their ratings set their attributes and affect simulation and live bot selection within your chosen difficulty. These players belong only to this save.</p>
                <div className="custom-squad-grid">{customPlayers.map((p,i)=><article className="custom-player-card" key={i}><h4>Player {i+1} · {['Attack','Support','Defence'][i]}</h4><label>Gamertag<input className="input-text" maxLength={24} value={p.gamertag} onChange={e=>setCustomPlayers(v=>v.map((x,n)=>n===i?{...x,gamertag:e.target.value}:x))}/></label><label>OVR / rating<input className="input-text" type="number" min={1} max={99} value={p.overall} onChange={e=>setCustomPlayers(v=>v.map((x,n)=>n===i?{...x,overall:Number(e.target.value)}:x))}/></label><label>Age<input className="input-text" type="number" min={15} max={45} value={p.age} onChange={e=>setCustomPlayers(v=>v.map((x,n)=>n===i?{...x,age:Number(e.target.value)}:x))}/></label></article>)}</div>
                <div className="custom-org-info">
                  Starting cash: $350,000. Your custom squad is created directly; no free agents are taken from the database. You can change your club branding later in Club Studio.
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Difficulty */}
        {step === 4 && (
          <div className="wizard-step step-4">
            <h2 className="step-heading">Live Match Difficulty</h2>
            <p className="step-subheading">
              Choose the bot strength for your Rocket League matches. You can change this later in Settings.
            </p>
            <div className="difficulty-grid">
              <div
                className={`difficulty-card ${difficulty === Difficulty.EASY ? 'selected' : ''}`}
                onClick={() => setDifficulty(Difficulty.EASY)}
              >
                <div className="difficulty-title">Easy</div>
                <div className="difficulty-desc">
                  Local Gold, Silver and Rookie bots. Career names, timer, portraits and titles remain enabled.
                </div>
              </div>

              <div
                className={`difficulty-card ${difficulty === Difficulty.HARD ? 'selected' : ''}`}
                onClick={() => setDifficulty(Difficulty.HARD)}
              >
                <div className="difficulty-title">Hard</div>
                <div className="difficulty-desc">
                    Experimental. Full rating tiers with Rocket Host for stronger matchups. Hosted matches can be unstable or laggy; their private bots do not follow local tactical commands.
                </div>
              </div>

              <div
                className={`difficulty-card ${difficulty === Difficulty.MEDIUM ? 'selected' : ''}`}
                onClick={() => setDifficulty(Difficulty.MEDIUM)}
              >
                <div className="difficulty-title">Medium</div>
                <div className="difficulty-desc">
                  Local Platinum and Diamond bots for the strongest players, with weaker bots for lower ratings.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: Summary & Confirm */}
        {step === 5 && (
          <div className="wizard-step step-5">
            <h2 className="step-heading">Career Confirmation</h2>
            <p className="step-subheading">Review your career configuration before kick-off.</p>

            <div className="summary-card">
              <div className="summary-row">
                <span className="summary-label">Manager</span>
                <span className="summary-val">{managerName}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Organization</span>
                <span className="summary-val">
                  {isCustomOrg ? customOrgName : selectedTeam?.name || 'Selected Org'}
                </span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Region</span>
                <span className="summary-val">{selectedRegion}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Difficulty</span>
                <span className="summary-val">{difficulty}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Matchday Integration</span>
                <span className="summary-val highlight">RLBot v5 Offline / Simulation Bridge</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="notice">The board monitors debt, wages and cash reserves. Financial mismanagement can get you fired and permanently end this career.</p><div className="wizard-footer">
        {step > 1 && (
          <button className="btn btn-secondary wizard-btn" onClick={handleBack}>
            Back
          </button>
        )}
        {step < 5 ? (
          <button className="btn btn-primary wizard-btn" onClick={handleNext}>
            Continue
          </button>
        ) : (
          <button
            className="btn btn-primary wizard-btn create-btn"
            onClick={handleFinish}
            disabled={submitting}
          >
            {submitting ? 'INITIALIZING CAREER...' : 'CREATE SAVE & ENTER DASHBOARD'}
          </button>
        )}
      </div>
    </div>
  );
};
