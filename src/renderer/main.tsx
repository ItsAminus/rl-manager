import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';
import './styles/modern.css';
import {BroadcastScoreboard} from './pages/BroadcastScoreboard';
import {GameErrorBoundary} from './components/GameErrorBoundary';

function PlayerApp(){React.useEffect(()=>{requestAnimationFrame(()=>requestAnimationFrame(()=>window.api?.app?.ready?.()));},[]);return <GameErrorBoundary><App/></GameErrorBoundary>;}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {new URLSearchParams(location.search).has('broadcast')?<BroadcastScoreboard/>:<PlayerApp />}
  </React.StrictMode>
);
