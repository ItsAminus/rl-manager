import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCareerStore } from '../../stores/careerStore';
import { RatingBadge } from '../components/RatingBadge';
import { FormIndicator } from '../components/FormIndicator';
import { Modal } from '../components/Modal';
import { Fixture, Player, GameResult, GamePlayerStats, SeriesFormat, Region, PlayerTendency, ScoutKnowledge } from '../../types';
import { forecastGame, forecastSeries, simulateGame } from '../../game/match-simulation';
import './MatchDayPage.css';
import { TeamTalkPanel } from '../components/TeamTalkPanel';
import {SERIES_MAPS} from '../../services/series-maps';
import {TeamCrest} from '../components/TeamCrest';
import {botDifficulty} from '../../game/bot-difficulty';
import {isPath} from '../../game/career-mode';
import {PathMatchProgress} from '../components/SeriesTimeoutPanel';
import {TimedSeriesTimeout as SeriesTimeoutPanel} from '../components/TimedSeriesTimeout';

interface TeamStarters {
  teamName: string;
  players: Player[];
  avgOvr: number;
  chemistry: number;
}

export const MatchDayPage: React.FC = () => {
  const { fixtureId } = useParams<{ fixtureId: string }>();
  const navigate = useNavigate();
  const { team, roster, career, advanceDay, saveCareer } = useCareerStore();

  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [homeStarters, setHomeStarters] = useState<Player[]>([]);
  const [awayStarters, setAwayStarters] = useState<Player[]>([]);
  const [opponentTeam, setOpponentTeam] = useState<any>(null);
  const [tactics, setTactics] = useState<any>({});
  const [loading, setLoading] = useState<boolean>(true);

  // Series state
  const [homeScore, setHomeScore] = useState<number>(0);
  const [awayScore, setAwayScore] = useState<number>(0);
  const [currentGameNum, setCurrentGameNum] = useState<number>(1);
  const [completedGames, setCompletedGames] = useState<GameResult[]>([]);
  const [lastGameResult, setLastGameResult] = useState<GameResult | null>(null);
  const [isSeriesOver, setIsSeriesOver] = useState<boolean>(false);

  // Play Match / Human control modal
  const [isPlayModalOpen, setIsPlayModalOpen] = useState<boolean>(false);
  const [selectedHumanPlayerId, setSelectedHumanPlayerId] = useState<string>('');
  const [matchRunning, setMatchRunning] = useState<boolean>(false);
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [playedResultPending, setPlayedResultPending] = useState(false);
  const [matchStatusText, setMatchStatusText] = useState<string>('');
  const [commentaryWarning, setCommentaryWarning] = useState('');
  const [botPlan, setBotPlan] = useState<any>(null);
  const [botPlanRevision, setBotPlanRevision] = useState(0);
  const [rocketHostRegion, setRocketHostRegion] = useState('US-CENTRAL');
  const [timeoutActive,setTimeoutActive]=useState(false);
  const [liveAssignments, setLiveAssignments] = useState<any[]>([]);
  const [matchReady, setMatchReady] = useState(false);
  const [injectorRequestId,setInjectorRequestId]=useState('');
  const [confirmingInjector,setConfirmingInjector]=useState(false);
  const [injectorError,setInjectorError]=useState('');
  const [matchError, setMatchError] = useState('');
  const [simulating, setSimulating] = useState(false);
  const simulationLock = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const launchPending = useRef(false);
  const syncedResult = useRef('');
  const statusHandler = useRef<(status: any) => Promise<void>>(async () => {});
  useEffect(() => {
    let cancelled = false, polling = false;
    const poll = async () => {
      if (cancelled || polling || launchPending.current) return;
      polling = true;
      try {
        const status = await window.api.rlbot.status();
        if (!cancelled && !launchPending.current) await statusHandler.current(status);
      } catch (err: any) {
        if (!cancelled) setMatchStatusText(`Connection interrupted. Retrying the played result: ${err.message}`);
      } finally { polling = false; }
    };
    pollRef.current = setInterval(poll, 1500);
    void poll();
    return () => { cancelled = true; if (pollRef.current) clearInterval(pollRef.current); };
  }, [fixtureId, career?.id]);
  const runSimulation = async (action: () => Promise<void>) => {
    if (simulationLock.current || matchRunning || bridgeBusy || playedResultPending) return;
    simulationLock.current = true; setSimulating(true); setMatchError('');
    try { await action(); }
    catch (e: any) { setMatchError(e.message || 'The result could not be saved.'); if (career) await useCareerStore.getState().loadCareer(career.id); }
    finally { simulationLock.current = false; setSimulating(false); }
  };

  useEffect(() => {
    if (!isPlayModalOpen || !fixtureId || !selectedHumanPlayerId) return;
    let cancelled = false;
    setBotPlan(null);
    window.api.rlbot.botPlan({ fixtureId, gameNumber: currentGameNum, humanPlayerId: selectedHumanPlayerId, botSelectionRevision: botPlanRevision })
      .then(result => { if (!cancelled) setBotPlan(result); })
      .catch(err => { if (!cancelled) setBotPlan({ success: false, error: String(err) }); });
    return () => { cancelled = true; };
  }, [isPlayModalOpen, fixtureId, currentGameNum, selectedHumanPlayerId, botPlanRevision,career?.difficulty]);

  // Safe parsing helper for series length (e.g. 'BO5' -> 5, 5 -> 5, 'BO7' -> 7)
  const parseSeriesLength = (fmt: any): number => {
    if (!fmt) return 5;
    if (typeof fmt === 'number' && !isNaN(fmt)) return fmt;
    const str = String(fmt);
    const match = str.match(/\d+/);
    return match ? parseInt(match[0], 10) : 5;
  };

  // Required wins for series
  const seriesFormatNum = parseSeriesLength(fixture?.seriesFormat);
  const winsRequired = Math.ceil(seriesFormatNum / 2); // e.g. 3 for BO5, 4 for BO7

  useEffect(() => {
    async function loadFixtureData() {
      setLoading(true);
      setFixture(null); setHomeStarters([]); setAwayStarters([]); setLastGameResult(null);
      try {
        if (!fixtureId || !career || !team) { setMatchError('Load your career to view a series.'); return; }

        let fix: any = null;
        if (window.api?.fixtures) {
          fix = await window.api.fixtures.getById(fixtureId);
        }

        if (!fix || ![fix.homeTeamId, fix.awayTeamId].includes(team.id)) {
          setMatchError('You can only play fixtures involving your own team.'); return;
        }
        if (fix.playError && fix.status !== 'completed') { setMatchError(fix.playError); return; }
        if (fix.awayTeamId === team.id) fix = { ...fix,
          homeTeamId: fix.awayTeamId, awayTeamId: fix.homeTeamId,
          homeTeamName: fix.awayTeamName, awayTeamName: fix.homeTeamName,
          homeScore: fix.awayScore, awayScore: fix.homeScore };
        setMatchError('');

        let calculatedHomeScore = 0;
        let calculatedAwayScore = 0;
        const existingGames = fix.games || [];
        for (const g of existingGames) {
          if (g.blueScore > g.orangeScore) calculatedHomeScore++;
          else if (g.orangeScore > g.blueScore) calculatedAwayScore++;
        }

        setFixture(fix);
        setHomeScore(calculatedHomeScore);
        setAwayScore(calculatedAwayScore);
        setCompletedGames(existingGames);

        const sFormatNum = parseSeriesLength(fix.seriesFormat);
        const reqWins = Math.ceil(sFormatNum / 2);
        const seriesFinished = calculatedHomeScore >= reqWins || calculatedAwayScore >= reqWins;
        if (seriesFinished && fix.status !== 'completed') {
          const recovered = await window.api.fixtures.updateResult(fixtureId, calculatedHomeScore, calculatedAwayScore, 'completed');
          if (!recovered.success) throw new Error(recovered.error);
          fix.status = 'completed';
        }
        setIsSeriesOver(seriesFinished);

        if (seriesFinished) {
          setCurrentGameNum(existingGames.length);
        } else {
          setCurrentGameNum(existingGames.length + 1);
        }

        if (existingGames.length > 0) {
          setLastGameResult(existingGames[existingGames.length - 1]);
        }

        // Load home starters
        let hPlayers: Player[] = [];
        if (fix.homeTeamId === team?.id) {
          hPlayers = roster.slice(0, 3);
        } else if (window.api?.players) {
          hPlayers = (await window.api.players.getByTeam(fix.homeTeamId)).slice(0, 3);
        }
        setHomeStarters(hPlayers);
        if(hPlayers.length>0)setSelectedHumanPlayerId(previous=>hPlayers.some(p=>p.id===previous)?previous:hPlayers[0].id);

        // Load away starters
        let aPlayers: Player[] = [];
        if (fix.awayTeamId === team?.id) {
          aPlayers = roster.slice(0, 3);
        } else if (window.api?.players) {
          aPlayers = (await window.api.players.getByTeam(fix.awayTeamId)).slice(0, 3);
        }
        if (aPlayers.length !== 3 || hPlayers.length !== 3) {
          setMatchError('Both teams need three starting players before this series can begin.'); return;
        }
        setAwayStarters(aPlayers);
        setOpponentTeam(await window.api.teams.getById(fix.awayTeamId));
        setTactics(await window.api.management.tactics(career.id));
      } catch (err) {
        console.error('Failed to load matchday fixture', err);
        setMatchError(String(err));
      } finally {
        setLoading(false);
      }
    }
    loadFixtureData();
  }, [fixtureId, team, roster, career]);

  // Forecast uses exactly the strengths, goal rates and overtime model used by simulation.
  const homeAvg = homeStarters.length > 0 ? homeStarters.reduce((s, p) => s + p.overall, 0) / homeStarters.length : 80;
  const awayAvg = awayStarters.length > 0 ? awayStarters.reduce((s, p) => s + p.overall, 0) / awayStarters.length : 80;
  const forecast = homeStarters.length && awayStarters.length ? forecastGame(
    { ...team, players: homeStarters }, { ...opponentTeam, players: awayStarters }, tactics, {}
  ) : null;
  const formatProbability = (probability: number) => probability > .999 ? '>99.9' : probability < .001 ? '<0.1' : (probability * 100).toFixed(1);
  const homeProb = formatProbability(forecast?.homeWinProbability ?? .5);
  const awayProb = formatProbability(forecast?.awayWinProbability ?? .5);
  const seriesForecast = !loading && forecast ? forecastSeries(forecast.homeWinProbability, seriesFormatNum, homeScore, awayScore)
    : { homeWinProbability: .5, awayWinProbability: .5 };
  const formLabel = (value: number | undefined) => value === undefined ? 'Unknown'
    : value >= 80 ? 'Excellent' : value >= 60 ? 'Good' : value >= 40 ? 'Standard' : value >= 20 ? 'Poor' : 'Very poor';
  const oddsExplanation = (profile: NonNullable<typeof forecast>['homeProfile'] | undefined) => profile
    ? `Simulation estimate based on this starting lineup. Average OVR ${profile.averageOverall.toFixed(1)}; lineup balance -${profile.lineupPenalty.toFixed(1)}; form, fitness, morale and tactics ${profile.conditionAdjustment >= 0 ? '+' : ''}${profile.conditionAdjustment.toFixed(1)}. Live bot matches and human performance can differ.`
    : 'Estimated chance of winning one simulated game, including overtime.';

  // Record completed game
  const recordGame = async (blueScore: number, orangeScore: number, playerStats: GamePlayerStats[], wasHuman: boolean) => {
    const isHome = fixture?.homeTeamId === team?.id;
    const isBlueWin = blueScore > orangeScore;

    const newHomeScore = homeScore + (isBlueWin ? 1 : 0);
    const newAwayScore = awayScore + (!isBlueWin ? 1 : 0);

    const gameRes: GameResult = {
      id: `game_${fixtureId}_${currentGameNum}`,
      fixtureId: fixtureId || 'fix_1',
      gameNumber: currentGameNum,
      blueTeamId: fixture?.homeTeamId || 'home',
      orangeTeamId: fixture?.awayTeamId || 'away',
      blueScore,
      orangeScore,
      playerStats,
      wasPlayed: wasHuman,
      playedByHuman: wasHuman,
    };

    if (window.api?.gameResults) {
      const saved = await window.api.gameResults.create(gameRes);
      if (!saved.success) throw new Error(saved.error);
    }
    const newCompleted = [...completedGames, gameRes];
    setCompletedGames(newCompleted); setLastGameResult(gameRes);
    setHomeScore(newHomeScore); setAwayScore(newAwayScore);

    // Check if series is won
    const over = newHomeScore >= winsRequired || newAwayScore >= winsRequired;
    if (over) {
      await finishSeries(newHomeScore, newAwayScore);
      setIsSeriesOver(true);
    } else {
      setCurrentGameNum(currentGameNum + 1);
      if (window.api?.fixtures?.updateResult) {
        const saved = await window.api.fixtures.updateResult(
          fixtureId || 'fix_1',
          newHomeScore,
          newAwayScore,
          'in_progress'
        );
        if (!saved.success) throw new Error(saved.error);
      }
    }
  };

  // 1. SIMULATE SINGLE GAME
  const handleSimulateGame = async () => {
    const homeTeamSim = { ...team, id: fixture?.homeTeamId, players: homeStarters };
    const awayTeamSim = { ...opponentTeam, id: fixture?.awayTeamId, players: awayStarters };

    const simRes = simulateGame(homeTeamSim, awayTeamSim, tactics, {});

    // Convert player stats to array
    const pStats: GamePlayerStats[] = [];
    if (simRes.stats) {
      Object.entries(simRes.stats).forEach(([pId, st]: [string, any]) => {
        pStats.push({
          playerId: pId,
          goals: st.goals || 0,
          assists: st.assists || 0,
          saves: st.saves || 0,
          shots: st.shots || 0,
          demos: st.demos || 0,
          score: st.score || 0,
        });
      });
    }

    await recordGame(simRes.blueScore, simRes.orangeScore, pStats, false);
  };

  // 2. SIMULATE REMAINING SERIES
  const handleSimulateRemaining = async () => {
    let curHome = homeScore;
    let curAway = awayScore;

    while (curHome < winsRequired && curAway < winsRequired) {
      const homeTeamSim = { ...team, id: fixture?.homeTeamId, players: homeStarters };
      const awayTeamSim = { ...opponentTeam, id: fixture?.awayTeamId, players: awayStarters };

      const simRes = simulateGame(homeTeamSim, awayTeamSim, tactics, {});
      const isBlueWin = simRes.blueScore > simRes.orangeScore;
      if (isBlueWin) curHome++;
      else curAway++;

      const pStats: GamePlayerStats[] = [];
      if (simRes.stats) {
        Object.entries(simRes.stats).forEach(([pId, st]: [string, any]) => {
          pStats.push({
            playerId: pId,
            goals: st.goals || 0,
            assists: st.assists || 0,
            saves: st.saves || 0,
            shots: st.shots || 0,
            demos: st.demos || 0,
            score: st.score || 0,
          });
        });
      }

      const gameRes: GameResult = {
        id: `game_${fixtureId}_${curHome + curAway}`,
        fixtureId: fixtureId || 'fix_1',
        gameNumber: curHome + curAway,
        blueTeamId: fixture?.homeTeamId || 'home',
        orangeTeamId: fixture?.awayTeamId || 'away',
        blueScore: simRes.blueScore,
        orangeScore: simRes.orangeScore,
        playerStats: pStats,
        wasPlayed: false,
        playedByHuman: false,
      };

      if (window.api?.gameResults) {
        const saved = await window.api.gameResults.create(gameRes);
      if (!saved.success) throw new Error(saved.error);
      }
    }

    setHomeScore(curHome);
    setAwayScore(curAway);
    await finishSeries(curHome, curAway);
    setIsSeriesOver(true);
  };

  // 3. PLAY MATCH (RLBOT OFFLINE 3v3)
  const handleStartPlayMatch = () => {
    if (bridgeBusy || playedResultPending) return;
    setIsPlayModalOpen(true);
  };

  statusHandler.current = async (status: any) => {
    if (!fixtureId || status?.fixtureId !== fixtureId) return;
    setBridgeBusy(!!status.cleanupPending);
    setPlayedResultPending(!!status.result && !status.resultSaved);
    if (status.assignments) setLiveAssignments(status.assignments);
    setCommentaryWarning(status.commentaryWarning || '');
    setMatchReady(status.phase === 'playing');
    setInjectorRequestId(status.state==='running'&&status.phase==='awaiting_injector_confirmation'?status.injectorRequestId||'':'');
    if (status.resultSaved) {
      const key = `${fixtureId}:${status.savedGameId}`;
      if (syncedResult.current !== key) {
        const saved = await window.api.fixtures.getById(fixtureId);
        const games = saved?.games || [];
        if (!games.some((g: GameResult) => g.id === status.savedGameId)) throw new Error('The saved game is not available yet.');
        const blue = games.filter((g: GameResult) => g.blueScore > g.orangeScore).length;
        const orange = games.length - blue;
        const required = Math.ceil(parseSeriesLength(saved.seriesFormat) / 2);
        setCompletedGames(games);
        setLastGameResult(games[games.length - 1]);
        setHomeScore(blue); setAwayScore(orange);
        setIsSeriesOver(Math.max(blue, orange) >= required);
        setCurrentGameNum(Math.max(blue, orange) >= required ? games.length : games.length + 1);
        syncedResult.current = key;
        setMatchError('');
        if (career) await useCareerStore.getState().loadCareer(career.id);
      }
      setMatchRunning(false);
      if(status.phase==='next_game_failed')setMatchError(status.message);
      setMatchStatusText(status.message || (status.cleanupPending ? 'Played result saved. The postgame desk is finishing.' : 'Played result saved.'));
      return;
    }
    if (status.state === 'failed') {
      setMatchRunning(false);
      setMatchError(status.message);
      return;
    }
    if (status.state === 'running') {
      setMatchRunning(true);
      setMatchStatusText(status.message || 'Waiting for the played result…');
    }
    if (status.saveError) setMatchError(status.message);
  };

  const handleConfirmLaunch = async () => {
    if (bridgeBusy || playedResultPending || launchPending.current) return;
    launchPending.current = true;
    setIsPlayModalOpen(false);
    setMatchRunning(true);
    setCommentaryWarning('');
    setLiveAssignments([]);
    setMatchReady(false);
    setInjectorRequestId('');setInjectorError('');
    setMatchError('');
    setMatchStatusText(`Preparing ${botPlan?.route || 'Rocket League'} 3v3 match...`);

    try {
      // Build match config
      const humanPlayer = homeStarters.find((p) => p.id === selectedHumanPlayerId) || homeStarters[0];

      setMatchStatusText(`Preparing match: You control "${humanPlayer.gamertag}" + 2 bot teammates vs 3 bot opponents...`);

      // Attempt to launch via RLBot provider or mock simulation
      let matchLaunched = false;
      if (window.api?.rlbot) {
        const detectRes = await window.api.rlbot.detect();
        if (detectRes?.overall) {
          const launchResult = await window.api.rlbot.launch({
            fixtureId,
            gameNumber: currentGameNum,
            humanPlayerId: humanPlayer.id,
            rocketHostRegion,
            botSelectionRevision: botPlanRevision,
            autoContinueSeries:false,
          });
          if (!launchResult?.success) throw new Error(launchResult?.error || 'Match launch failed');
          matchLaunched = true;
          setMatchStatusText(launchResult.message || 'Preparing the match; waiting for all players...');


        }
      }

      if (!matchLaunched) throw new Error('Local RLBot is unavailable. Check Settings or choose Simulate; no live game was recorded.');
    } catch (err: any) {
      console.error('Launch failed', err);
      setMatchRunning(false);
      setMatchStatusText(`Match error: ${err.message}. ${isPath(career)?'Retry this played game; no result has been simulated.':'You can retry or simulate.'}`);
      setMatchError(err.message || String(err));
    } finally { launchPending.current = false; }
  };

  // Recovery never substitutes a simulation for a game the user played.
  const handleForceComplete = async () => {
    try {
      const status = await window.api.rlbot.status();
      await statusHandler.current(status);
      if (!status.resultSaved) setMatchStatusText(status.message || 'No finished score has arrived yet. Waiting for the played result; nothing has been simulated.');
    } catch (e: any) { setMatchError(e.message); setMatchStatusText(`Recovery failed: ${e.message}. Your played result has not been replaced.`); }
  };

  // Finalize series
  const finishSeries = async (finalHome: number, finalAway: number) => {
    if (window.api?.fixtures) {
      const result = await window.api.fixtures.updateResult(fixtureId!, finalHome, finalAway, 'completed');
      if (!result.success) { setMatchError(result.error); throw new Error(result.error); }
    }
    await saveCareer();
    if (career) await useCareerStore.getState().loadCareer(career.id);
  };

  const handleReturnToDashboard = () => {
    navigate('/dashboard');
  };

  if (!loading && matchError && !matchRunning && (!fixture || !homeStarters.length || !awayStarters.length)) return <div className="management-page"><h1>Series unavailable</h1><p className="notice notice-error">{matchError}</p><button className="btn btn-primary" onClick={() => navigate('/calendar')}>Back to your calendar</button></div>;
  if (loading || !fixture) {
    return <div className="matchday-loading">Loading match day arena...</div>;
  }

  const isHome = fixture.homeTeamId === team?.id;
  const myTeamName = isHome ? fixture.homeTeamName : fixture.awayTeamName;
  const oppTeamName = isHome ? fixture.awayTeamName : fixture.homeTeamName;
  const myScore = isHome ? homeScore : awayScore;
  const oppScore = isHome ? awayScore : homeScore;

  return (
    <div className="matchday-page">
      {/* Top Breadcrumb & Header */}
      <div className="matchday-topbar">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>
          ← DASHBOARD
        </button>
        <div className="matchday-title-badge">
          {fixture.competitionName || 'RLCS TOURNAMENT'} • BEST OF {seriesFormatNum}
          <button className="text-link" onClick={()=>navigate(`/competition/${fixture.competitionId}?tab=bracket`)}>View tournament bracket →</button>
        </div>
        <div className="series-tracker-pill">
          SERIES: <strong className="score-num">{homeScore} - {awayScore}</strong> (First to {winsRequired})
        </div>
      </div>

      <div className="matchday-map-rotation">{SERIES_MAPS.slice(0,seriesFormatNum).map((arena,i)=><span key={arena.code} className={i+1===currentGameNum&&!isSeriesOver?'current':''}><small>GAME {i+1}</small>{arena.name}</span>)}<small>Broadcast HUD supports Fullscreen with BakkesMod running. Hold Tab for player details.</small></div>
      {career&&(isPath(career)||botDifficulty(career.difficulty)!=='Hard')&&<details className="notice"><summary>In-game commands · D-pad Up: press · Down: defend · Right: pass · Left: demo</summary><p>Tap once. These controls work independently of exhibition chat. Keyboard: F1 press, F2 defend, F3 pass, F4 demo, F5 resume your saved plan. Orders expire automatically. Look for TEAM COMMS CONFIRMED and your teammates’ names.</p></details>}
      {(completedGames.length===0||isSeriesOver)&&<TeamTalkPanel fixtureId={fixtureId!} phase={isSeriesOver ? 'postgame' : 'pregame'} revision={completedGames.length} disabled={matchRunning || simulating || bridgeBusy} />}
      {completedGames.length>0&&!isSeriesOver&&!matchRunning&&<SeriesTimeoutPanel fixtureId={fixtureId!} game={currentGameNum} players={homeStarters} disabled={bridgeBusy||simulating||playedResultPending} local={botPlan?.route!=='Rocket Host'&&(isPath(career)||botDifficulty(career?.difficulty)!=='Hard')} onActiveChange={setTimeoutActive} onContinue={()=>{void handleConfirmLaunch();}}/>}
      {completedGames.length>0&&!matchRunning&&<PathMatchProgress revision={completedGames.length}/>}
      {/* Main Pitch Matchup Banner */}
      <div className="pitch-banner">
        {/* Blue Team (Home) */}
        <div className="pitch-team home-side">
          <div className="team-header-row">
            <TeamCrest id={fixture.homeTeamId} name={fixture.homeTeamName || 'Your team'} />
            <h2 className="team-banner-name">{fixture.homeTeamName}</h2>
            <span className="side-badge side-blue">BLUE</span>
          </div>
          <div className="team-metrics-row">
            <span>Avg OVR: <strong>{homeAvg.toFixed(1)}</strong></span>
            <span>•</span>
            <span>Career squad</span>
            <span>•</span>
            <span>Form: <strong>{formLabel(team?.teamForm)}</strong></span>
          </div>
          <div className="team-odds-row">
            <span title={oddsExplanation(forecast?.homeProfile)}>Game win chance: <strong>{homeProb}%</strong></span>
            <span title="Estimated chance of winning the series from its current score, assuming the same lineup and readiness.">Series win chance: <strong>{formatProbability(seriesForecast.homeWinProbability)}%</strong></span>
          </div>

          <div className="pitch-starters">
            {homeStarters.map((p, idx) => (
              <div key={p.id} className="pitch-player-card">
                <RatingBadge rating={p.overall} size="md" />
                <div className="pitch-player-info">
                  <div className="pitch-gamertag">{p.gamertag}</div>
                  <div className="pitch-tendency">{p.preferredTendency}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Center Score & Series Status */}
        <div className="pitch-center">
          <div className="series-score-box">
            <span className="series-score-num">{homeScore}</span>
            <span className="series-dash">-</span>
            <span className="series-score-num">{awayScore}</span>
          </div>
          <div className="game-counter-tag">
            {isSeriesOver ? (
              <span className="series-over-label">SERIES COMPLETE</span>
            ) : (
              <span>GAME {currentGameNum} OF {seriesFormatNum}</span>
            )}
          </div>
        </div>

        {/* Orange Team (Away) */}
        <div className="pitch-team away-side">
          <div className="team-header-row">
            <span className="side-badge side-orange">ORANGE</span>
            <h2 className="team-banner-name">{fixture.awayTeamName}</h2>
            <TeamCrest id={fixture.awayTeamId} name={fixture.awayTeamName || 'Opponent'} />
          </div>
          <div className="team-metrics-row">
            <span>Form: <strong>{formLabel(opponentTeam?.teamForm)}</strong></span>
            <span>•</span>
            <span>Avg OVR: <strong>{awayAvg.toFixed(1)}</strong></span>
          </div>
          <div className="team-odds-row">
            <span title={oddsExplanation(forecast?.awayProfile)}>Game win chance: <strong>{awayProb}%</strong></span>
            <span title="Estimated chance of winning the series from its current score, assuming the same lineup and readiness.">Series win chance: <strong>{formatProbability(seriesForecast.awayWinProbability)}%</strong></span>
          </div>

          <div className="pitch-starters">
            {awayStarters.map((p, idx) => (
              <div key={p.id} className="pitch-player-card away-card">
                <div className="pitch-player-info text-right">
                  <div className="pitch-gamertag">{p.gamertag}</div>
                  <div className="pitch-tendency">{p.preferredTendency}</div>
                </div>
                <RatingBadge rating={p.overall} size="md" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MATCH RUNNING OVERLAY / MONITOR */}
      {matchError && <div role="alert" className="match-launch-error">{matchError} {!matchRunning && <button className="btn btn-secondary" onClick={handleForceComplete}>Recover played result</button>}</div>}
      {bridgeBusy && !matchRunning && <div role="status" className="notice"><strong>{isSeriesOver ? 'Series finished' : `Between games · Game ${currentGameNum} next`}</strong><p>{matchStatusText}</p>{!isSeriesOver && <p>Choose whether to continue or use your one 60-second timeout after commentary finishes.</p>}</div>}
      {matchRunning && (
        <div className="match-running-overlay">
          <div className="match-running-box">
            <div className="running-spinner">⚡</div>
            <h2>{injectorRequestId?'READY AT THE ROCKET LEAGUE MENU?':matchReady ? 'ROCKET LEAGUE MATCH ACTIVE' : 'PREPARING MATCH • WAITING FOR PLAYERS'}</h2>
            <p className="running-status-desc">{matchStatusText}</p>
            {injectorRequestId&&<div className="injector-confirmation">
              <p>Wait until you can see Rocket League’s main menu, then click below. RLM will start BakkesMod, or restart its app if it is stuck, and check that the career HUD has loaded before joining.</p>
              <button className="btn btn-primary" disabled={confirmingInjector} onClick={async()=>{
                setConfirmingInjector(true);setInjectorError('');
                try{
                  const result=await window.api.rlbot.confirmBakkesmod(fixtureId!,injectorRequestId);
                  if(!result.success)throw Error(result.error);
                  setInjectorRequestId('');setMatchStatusText('Starting / restarting BakkesMod. Checking injection and the career HUD...');
                }catch(error:any){setInjectorError(error.message||'Unable to confirm startup.');}
                finally{setConfirmingInjector(false);}
              }}>{confirmingInjector?'Starting BakkesMod…':'I’m at the menu — Start / restart BakkesMod'}</button>
              {injectorError&&<p role="alert">{injectorError}</p>}
            </div>}
            {commentaryWarning && <p role="status" className="running-status-desc">{commentaryWarning}</p>}
            {liveAssignments.length > 0 && <ul>{liveAssignments.map(p => (
              <li key={p.slot}>{p.name}: {p.type === 'Human' ? 'You' : p.bot || 'Built-in bot'}{p.profile?.luckyGame ? ' • Breakout game' : ''}</li>
            ))}</ul>}
            <div className="running-instructions">
              <ul>
                <li>Your Rocket League window will launch and connect to the selected match.</li>
                <li>Your chosen athlete is assigned to your keyboard/controller.</li>
                <li>The other five participants use the bot assignments shown above.</li>
                <li>Match results will automatically synchronize upon game completion.</li>
              </ul>
            </div>
            <div className="running-actions">
              <button className="btn btn-secondary" onClick={handleForceComplete}>
                Recover played result
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LAST GAME RESULT CARD */}
      {lastGameResult && !matchRunning && (
        <div className="last-game-card">
          <div className="last-game-header">
            <h3>GAME {lastGameResult.gameNumber} SUMMARY</h3>
            <span className="final-score-badge">
              FINAL: {fixture.homeTeamName} {lastGameResult.blueScore} - {lastGameResult.orangeScore} {fixture.awayTeamName}
            </span>
          </div>

          <div className="stats-table-wrapper">
            <table className="match-stats-table">
              <thead>
                <tr>
                  <th>PLAYER</th>
                  <th>SCORE</th>
                  <th>GOALS</th>
                  <th>ASSISTS</th>
                  <th>SAVES</th>
                  <th>SHOTS</th>
                  <th>DEMOS</th>
                </tr>
              </thead>
              <tbody>
                {lastGameResult.playerStats.map((st) => {
                  const allPlayers = [...homeStarters, ...awayStarters];
                  const p = allPlayers.find((pl) => pl.id === st.playerId);
                  return (
                    <tr key={st.playerId}>
                      <td className="stat-pname">
                        <strong>{p?.gamertag || st.playerId}</strong>{' '}
                        <small>({p?.teamId === fixture.homeTeamId ? 'Blue' : 'Orange'})</small>
                      </td>
                      <td>{st.score}</td>
                      <td className={st.goals > 0 ? 'highlight-stat' : ''}>{st.goals}</td>
                      <td>{st.assists}</td>
                      <td>{st.saves}</td>
                      <td>{st.shots}</td>
                      <td>{st.demos}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MATCHDAY ACTION BAR */}
      <div className="matchday-actions-footer">
        {!isSeriesOver ? (
          <div className="series-active-actions">
            <button className="btn btn-hero-play" onClick={handleStartPlayMatch} disabled={matchRunning || simulating || bridgeBusy || playedResultPending || timeoutActive}>
              🎮 PLAY MATCH IN ROCKET LEAGUE (RLBOT)
            </button>
            {!isPath(career)&&<button className="btn btn-secondary-action" onClick={() => runSimulation(handleSimulateGame)} disabled={matchRunning || simulating || bridgeBusy || playedResultPending || timeoutActive}>
              ⚡ SIMULATE GAME {currentGameNum}
            </button>}
            {!isPath(career)&&<button className="btn btn-secondary-action" onClick={() => runSimulation(handleSimulateRemaining)} disabled={matchRunning || simulating || bridgeBusy || playedResultPending || timeoutActive}>
              ⏩ SIMULATE ENTIRE SERIES
            </button>}
          </div>
        ) : (
          <div className="series-finished-bar">
            <div className="winner-announcement">
              🎉 {homeScore > awayScore ? fixture.homeTeamName : fixture.awayTeamName} WINS THE SERIES ({homeScore} - {awayScore})!
            </div>
            <button className="btn btn-primary finish-series-btn" onClick={handleReturnToDashboard}>
              RETURN TO DASHBOARD & ADVANCE
            </button>
          </div>
        )}
      </div>

      {/* HUMAN PLAYER SELECTION MODAL */}
      <Modal
        isOpen={isPlayModalOpen}
        onClose={() => setIsPlayModalOpen(false)}
        title="WHICH PLAYER DO YOU WANT TO CONTROL?"
        width="600px"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setIsPlayModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleConfirmLaunch} disabled={!botPlan?.success}>
              LAUNCH 3v3 MATCH
            </button>
          </>
        }
      >
        <div className="human-selector-body">

          <p className="modal-desc">
            Select which member of your 3-man roster you will personally control on the pitch.
            Your remaining 2 teammates and all 3 opponents will be controlled by RLBot AI
            selected using their ratings and saved bot preferences.
          </p>

          <div className="human-starters-list">
            {homeStarters.map((p) => (
              <div
                key={p.id}
                className={`starter-choice-card ${selectedHumanPlayerId === p.id ? 'selected' : ''}`}
                onClick={() => setSelectedHumanPlayerId(p.id)}
              >
                <div className="choice-left">
                  <RatingBadge rating={p.overall} size="lg" />
                  <div>
                    <div className="choice-gamertag">{p.gamertag}</div>
                    <div className="choice-meta">
                      {p.preferredTendency} • Form: {p.form}%
                    </div>
                  </div>
                </div>
                <div className="choice-radio">
                  {selectedHumanPlayerId === p.id ? '● SELECTED' : '○ SELECT'}
                </div>
              </div>
            ))}
          </div>

          <div className="bot-assignment-preview">
            <h3>BOT ASSIGNMENTS {botPlan?.route ? `• ${botPlan.route}` : ''}</h3>
            {botPlan?.route === 'Rocket Host' && <label>Server region <select value={rocketHostRegion} onChange={event => setRocketHostRegion(event.target.value)}>
              <option value="US-CENTRAL">North America — US Central</option>
              <option value="EU-HEL">Europe — Helsinki</option>
            </select></label>}
            <button className="btn btn-secondary" disabled={!botPlan || botPlan.seriesLocked || completedGames.length>0 || matchRunning || bridgeBusy} onClick={() => setBotPlanRevision(value => value + 1)}>{botPlan?.seriesLocked || completedGames.length>0?'Assignments locked for this series':'Refresh assignments'}</button>
            {!botPlan && <p role="status">Checking bot assignments…</p>}
            {botPlan?.error && <p role="alert">{botPlan.error}</p>}
            {botPlan && [...homeStarters, ...awayStarters].map(p => {
              const assignment = botPlan.assignments?.find((a: any) => a.playerId === p.id);
              const human = p.id === selectedHumanPlayerId;
              return <div key={p.id} className="bot-assignment-row">
                <div><strong>{p.gamertag} • {p.overall}</strong><br />
                  <small>{human ? 'You control this player' : `${assignment?.engine || 'Unassigned'} • ${p.preferredTendency}`}
                    {assignment?.luckyGame ? ' • Breakout game' : ''}</small>
                  {!human && assignment && <small className="bot-assignment-detail">{assignment.availableLevel}
                    {assignment.styleApplied ? ' • Ground support follows player style' : assignment.type === 'Rocket Host' ? ' • Hosted bot policy' : ' • Bot-pack policy'}</small>}
                  {!human&&assignment?.performance&&<small className="bot-assignment-detail">{assignment.performance.state} · Form {Math.round(assignment.performance.form)} · Confidence {Math.round(assignment.performance.confidence)} · Fatigue {Math.round(assignment.performance.fatigue*100)} · Cohesion {Math.round(assignment.performance.cohesion*100)}</small>}
                </div>
              </div>;
            })}
            {botPlan?.notice && <p className="launch-note">{botPlan.notice}</p>}
          </div>
          <div className="launch-note">🎮 Use your regular controller or keyboard.</div>
        </div>
      </Modal>
    </div>
  );
};
