import React, { useEffect, useState } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from '../../../services/authShim';
import { doc, getDoc } from '../../../services/firestoreShim';
import { auth, db } from '../../../services/firestoreShim';
import GlobalReportForm from '../Common/GlobalReportForm';
import ForcedPasswordChangeOverlay from '../../Common/ForcedPasswordChangeOverlay';
import SidebarSavedLocation from '../../Common/SidebarSavedLocation';
import DiagOverview from './DiagOverview';
import DiagWorklist, { DiagOrderDetail } from './DiagWorklist';
import DiagCatalog from './DiagCatalog';
import { DiagReports, DiagResultsLog } from './DiagReports';
import DiagSettings from './DiagSettings';

export default function DiagnosticBranchDashboard({ profile, type = 'lab' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [parentOrgName, setParentOrgName] = useState('');
  useEffect(() => {
    const parentId = type === 'lab' ? profile?.labId : profile?.scanId;
    if (!parentId) return;
    const col = type === 'lab' ? 'labs' : 'scanCenters';
    (async () => {
      const snap = await getDoc(doc(db, col, parentId));
      if (!snap.exists()) return;
      const d = snap.data();
      const nm = type === 'lab' ? (d.labName || d.name || '') : (d.centerName || d.name || '');
      setParentOrgName(nm || '');
    })();
  }, [type, profile?.labId, profile?.scanId]);

  const nav = [
    { path: '/dashboard', label: 'Overview', icon: '📊' },
    { path: '/dashboard/orders', label: 'Worklist', icon: '📋' },
    { path: '/dashboard/results', label: 'Results', icon: type === 'lab' ? '🧪' : '🩻' },
    { path: '/dashboard/catalog', label: type === 'lab' ? 'Test Catalog' : 'Scan Catalog', icon: '🏷️' },
    { path: '/dashboard/reports', label: 'Reports', icon: '📈' },
    { path: '/dashboard/report-issue', label: 'Report Issue', icon: '📩' },
    { path: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
  ];
  const isActive = (path) => (path === '/dashboard' ? location.pathname === '/dashboard' : location.pathname.startsWith(path));
  const logout = async () => { try { await signOut(auth); navigate('/'); } catch (_) {} };

  return (
    <div className="pharmacy-dashboard">
      <aside className="pharmacy-sidebar">
        <div className="pharmacy-sidebar-header">
          <div className="pharmacy-logo">
            <span>{type === 'lab' ? '🧪' : '🩻'}</span>
            <h2>NessaHub</h2>
            <span className="pharmacy-logo-badge">{type === 'lab' ? 'Lab Branch' : 'Scan Branch'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="pharmacy-avatar">{(profile?.branchName || 'B')[0].toUpperCase()}</div>
            <div>
              <p className="pharmacy-user-name">{profile?.branchName || 'Branch'}</p>
              {parentOrgName ? (
                <p className="pharmacy-user-role" style={{ fontWeight: 700, color: '#e0f2fe' }}>{parentOrgName}</p>
              ) : null}
              <p className="pharmacy-user-role">{type === 'lab' ? 'Lab' : 'Scan'} branch</p>
              <SidebarSavedLocation profile={profile} />
            </div>
          </div>
        </div>
        <nav className="pharmacy-nav">
          <div className="pharmacy-nav-section">
            <h3>Navigation</h3>
            <ul className="pharmacy-nav-list">
              {nav.map(item => (
                <li key={item.path}>
                  <button className={`pharmacy-nav-item ${isActive(item.path) ? 'active' : ''}`} onClick={() => navigate(item.path)}>
                    <span>{item.icon}</span><span>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>
        <div className="pharmacy-sidebar-footer">
          <button className="pharmacy-logout-btn" onClick={logout}>🚪 Logout</button>
        </div>
      </aside>
      <main className="pharmacy-main">
        <ForcedPasswordChangeOverlay
          profile={profile}
          firestoreCollection={type === 'lab' ? 'labBranches' : 'scanBranches'}
        />
        <Routes>
          <Route path="/" element={<DiagOverview type={type} profile={profile} mode="branch" />} />
          <Route path="/orders/:orderId" element={<DiagOrderDetail type={type} />} />
          <Route path="/orders" element={<DiagWorklist type={type} profile={profile} mode="branch" />} />
          <Route path="/results" element={<DiagResultsLog type={type} />} />
          <Route path="/catalog" element={<DiagCatalog type={type} mode="branch" />} />
          <Route path="/reports" element={<DiagReports type={type} mode="branch" />} />
          <Route path="/report-issue" element={<GlobalReportForm profile={profile} reporterType={type === 'lab' ? 'lab_branch' : 'scan_branch'} />} />
          <Route path="/settings" element={<DiagSettings type={type} profile={profile} mode="branch" />} />
        </Routes>
      </main>
    </div>
  );
}
