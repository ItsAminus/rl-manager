import React from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import MainLayout from './components/Layout/MainLayout';

// Pages
import { WelcomePage } from './pages/WelcomePage';
import { NewCareerPage } from './pages/NewCareerPage';
import { LoadCareerPage } from './pages/LoadCareerPage';
import { DashboardPage } from './pages/DashboardPage';
import { SquadPage } from './pages/SquadPage';
import { PlayerProfilePage } from './pages/PlayerProfilePage';
import { TacticsPage } from './pages/TacticsPage';
import { TrainingPage } from './pages/TrainingPage';
import { CalendarPage } from './pages/CalendarPage';
import { CompetitionsPage } from './pages/CompetitionsPage';
import { CompetitionDetailPage } from './pages/CompetitionDetailPage';
import { TransfersPage } from './pages/TransfersPage';
import { ScoutingPage } from './pages/ScoutingPage';
import { FinancesPage } from './pages/FinancesPage';
import { StatisticsPage } from './pages/StatisticsPage';
import { InboxPage } from './pages/InboxPage';
import { SettingsPage } from './pages/SettingsPage';
import { MatchDayPage } from './pages/MatchDayPage';
import { SocialPage } from './pages/SocialPage';
import { DressingRoomPage } from './pages/DressingRoomPage';
import { NegotiationPage } from './pages/NegotiationPage';
import {ClubStudioPage} from './pages/ClubStudioPage';
import {SquadGaragePage} from './pages/SquadGaragePage';
import {NewPathToGloryPage,PathToGloryPage,PathPlayerPage} from './pages/PathToGloryPage';
import {PathChallengesPage} from './pages/PathChallengesPage';
import {useCareerStore} from '../stores/careerStore';
import {isPath} from '../game/career-mode';
import {GuidedTour} from './onboarding/GuidedTour';
import {TrophyCeremony} from './components/TrophyCeremony';
import {NationalTeamPage} from './pages/NationalTeamPage';
import {NationalMatchDayPage} from './pages/NationalMatchDayPage';
function ModeRoutes({children}:{children:React.ReactNode}){const {pathname}=useLocation(),career=useCareerStore(s=>s.career);if(isPath(career)&&/^\/(social|chirp|scouting|transfers|negotiate|finances)(\/|$)/.test(pathname))return <Navigate to="/dashboard" replace/>;return <>{children}</>;}
function CareerDashboard(){return isPath(useCareerStore(s=>s.career))?<PathToGloryPage/>:<DashboardPage/>;}
function CareerPlayer(){return isPath(useCareerStore(s=>s.career))?<PathPlayerPage/>:<PlayerProfilePage/>;}
function CareerSquad(){return isPath(useCareerStore(s=>s.career))?<PathPlayerPage/>:<SquadPage/>;}

function ChirpRedirect() {
  const {search}=useLocation();
  return <Navigate to={'/social'+search} replace />;
}

export default function App() {
  const ended=useCareerStore(s=>s.careerEnded),unload=useCareerStore(s=>s.unloadCareer);
  if(ended)return <main className="management-page"><section className="panel" role="alert"><span className="eyebrow">Board decision · Final</span><h1>You have been dismissed.</h1><p>{ended}</p><p>Your job is gone. This career has ended permanently and cannot be resumed.</p><button className="btn btn-primary" onClick={()=>{unload();window.location.hash='/';}}>Return to main menu</button></section></main>;
  return (
    <HashRouter>
      <GuidedTour/>
      <TrophyCeremony/>
      <MainLayout>
        <ModeRoutes><Routes>
          {/* Main Menu & Save Management */}
          <Route path="/" element={<WelcomePage />} />
          <Route path="/career/new" element={<NewCareerPage />} />
          <Route path="/career/path/new" element={<NewPathToGloryPage/>}/>
          <Route path="/career/load" element={<LoadCareerPage />} />

          {/* In-Game Management Dashboard */}
          <Route path="/dashboard" element={<CareerDashboard />} />
          <Route path="/challenges" element={<PathChallengesPage/>}/>
          <Route path="/squad" element={<CareerSquad />} />
          <Route path="/player/:id" element={<CareerPlayer />} />
          <Route path="/tactics" element={<TacticsPage />} />
          <Route path="/training" element={<TrainingPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/competitions" element={<CompetitionsPage />} />
          <Route path="/competition/:id" element={<CompetitionDetailPage />} />
          <Route path="/transfers" element={<TransfersPage />} />
          <Route path="/scouting" element={<ScoutingPage />} />
          <Route path="/finances" element={<FinancesPage />} />
          <Route path="/statistics" element={<StatisticsPage />} />
          <Route path="/social" element={<SocialPage />} />
          <Route path="/chirp/*" element={<ChirpRedirect />} />
          <Route path="/dressing-room" element={<DressingRoomPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/club-studio" element={<ClubStudioPage />} />
          <Route path="/garage" element={<SquadGaragePage />} />

          {/* Match Day Experience (RLBot / Simulated 3v3) */}
          <Route path="/match-day/:fixtureId" element={<MatchDayPage />} />
          <Route path="/national-team" element={<NationalTeamPage/>}/>
          <Route path="/national-match-day/:matchId" element={<NationalMatchDayPage/>}/>

          {/* Live Contract Negotiations */}
          <Route path="/negotiate/:id" element={<NegotiationPage />} />

          {/* Wildcard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes></ModeRoutes>
      </MainLayout>
    </HashRouter>
  );
}
