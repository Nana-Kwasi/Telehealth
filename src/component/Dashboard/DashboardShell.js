import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { clientRoutes, therapistRoutes } from './routes';
import './DashboardShell.css';
import { avatarUrlOf, initialsOf } from '../../utils/profileImage';

export default function DashboardShell({ role, profile }) {
  const routes = role === 'therapist' ? therapistRoutes : clientRoutes;


  
  return (
    <div className="dashboard-container">
      <aside className="dashboard-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">NessaHub</div>
          <div className="sidebar-user">
            {/* Reads every field name a saved picture might arrive under
                (avatarUrl / photoURL / profilePhotoUrl), ignores stale blob: urls
                and falls back to initials — so one saved image shows everywhere
                instead of only on the screen that wrote it. */}
            {avatarUrlOf(profile) ? (
              <img src={avatarUrlOf(profile)} alt="avatar" className="user-avatar" />
            ) : (
              <div className="user-avatar">{initialsOf(profile, 'N')}</div>
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


