import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { clientRoutes, therapistRoutes } from './routes';
import './DashboardShell.css';

export default function DashboardShell({ role, profile }) {
  const routes = role === 'therapist' ? therapistRoutes : clientRoutes;


  
  return (
    <div className="dashboard-container">
      <aside className="dashboard-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">NessaHub</div>
          <div className="sidebar-user">
            {profile?.photoURL ? (
              <img src={profile.photoURL} alt="avatar" className="user-avatar" />
            ) : (
              <div className="user-avatar">{(profile?.name || 'N')[0]}</div>
            )}
            <div className="user-info">
              <div className="user-name">{profile?.name || 'User'}</div>
              <div className="user-role">{role}</div>
            </div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-section-title">Navigation</div>
            {routes.map((r) => (
              <NavLink key={r.path} className="nav-item" to={r.path}>
                <div className="nav-item-icon">{r.icon}</div>
                {r.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </aside>
      <main className="dashboard-main">
        <Outlet />
      </main>
    </div>
  );
}


