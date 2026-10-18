import React from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import '../../styles/layout.css';
import {UISoundEffects} from '../UISoundEffects';
import {UIMotion} from '../UIMotion';

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const location = useLocation();
  const isMenuRoute = location.pathname === '/' || location.pathname.startsWith('/career');

  if (isMenuRoute) {
    return (
      <>
        <UISoundEffects/>
        <UIMotion/>
        <div className="titlebar-drag-region" />
        <main className="menu-fullscreen-container">
          {children}
        </main>
      </>
    );
  }

  return (
    <>
      <UISoundEffects/>
      <UIMotion/>
      <div className="titlebar-drag-region" />
      <div className="main-layout">
        {location.pathname !== '/social' && <Sidebar />}
        <div className="content-wrapper">
          <TopBar />
          <main className="main-content">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
