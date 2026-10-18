import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCareerStore } from '../../stores/careerStore';
import { Region, Difficulty, Team, matchesRegion } from '../../types';
import './NewCareerPage.css';

export const NewCareerPage: React.FC = () => {
  const navigate = useNavigate();
  const { createCareer, allTeams, initialize } = useCareerStore();

  const [step, setStep] = useState<number>(1);
  const [managerName, setManagerName] = useState<string>('Alex Mercer');
  const [selectedRegion, setSelectedRegion] = useState<string>(Region.EUROPE);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [customOrgName, setCustomOrgName] = useState<string>('');
  const [isCustomOrg, setIsCustomOrg] = useState<boolean>(false);
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.HARD);
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    async function load() {
      await initialize();
      if (window.api?.teams) {
        const t = await window.api.teams.getAll();
        const selectable = (t as Team[]).filter(item => item.rosterStatus !== 'inactive' && item.roster.length >= 3);
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

  const filteredTeams = teams.filter((t) => matchesRegion(t.region, selectedRegion));

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
    if (step === 3 && !isCustomOrg && !selectedTeamId) {
      setError('Please select an organization.');
      return;
    }
    if (step === 3 && isCustomOrg && !customOrgName.trim()) {
      setError('Please enter your custom organization name.');
      return;
    }
    setStep((s) => Math.min(5, s + 1));
  };

  const handleBack = () => {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  };

  const handleFinish = async () => {
    setSubmitting(true);
    setError(null);

    const targetTeamId = isCustomOrg ? `team_custom_${crypto.randomUUID()}` : selectedTeamId || teams[0]?.id || 'team_1';

    const result = await createCareer({
      managerName: managerName.trim(),
      teamId: targetTeamId,
      region: selectedRegion,
      difficulty,
      customOrgName: isCustomOrg ? customOrgName.trim() : undefined,
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
                    if (inReg.length > 0) setSelectedTeamId(inReg[0].id);
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
              <div className="teams-selection-grid">
                {filteredTeams.length === 0 ? (
                  <div className="empty-teams-notice">
                    No registered teams in {selectedRegion}. You can create a custom organization or
                    pick Europe / North America.
                  </div>
                ) : (
                  filteredTeams.map((t) => (
                    <div
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
                        Confirmed roster · {t.rosterVerifiedAt}
                      </div>}
                      <div className="team-select-stats">
                        <span>Budget: ${(t.budget || 250000).toLocaleString()}</span>
                        <span>Facilities: Tier {t.facilityLevel || 1}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="custom-org-panel">
                <div className="input-field-group">
                  <label>NEW ORGANIZATION NAME</label>
                  <input
                    type="text"
                    className="input-text"
                    placeholder="e.g. Apex Predators, Solar Esports"
                    value={customOrgName}
                    onChange={(e) => setCustomOrgName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="custom-org-info">
                  Starting budget will be standard expansion allotment ($350,000) with full
                  free-agent signing priority.
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

      <div className="wizard-footer">
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
