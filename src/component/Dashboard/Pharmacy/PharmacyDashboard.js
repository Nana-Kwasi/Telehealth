import React, { useState } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { signOut, updatePassword } from '../../../services/authShim';
import { auth, db } from '../../../services/firestoreShim';
import { doc, updateDoc } from '../../../services/firestoreShim';
import './PharmacyDashboard.css';

import PharmacyOverview from './PharmacyOverview';
import PharmacyBranches from './PharmacyBranches';
import PharmacyBranchDetail from './PharmacyBranchDetail';
import PharmacyPrescriptions from './PharmacyPrescriptions';
import PrescriptionOps from './PrescriptionOps';
import OpenPrescriptions from './OpenPrescriptions';
import PharmacyReports from './PharmacyReports';
import PharmacySettings from './PharmacySettings';
import FormularyManager from '../../Common/FormularyManager';
import GlobalReportForm from '../Common/GlobalReportForm';
import SidebarSavedLocation from '../../Common/SidebarSavedLocation';

const NAV = [
  { path: '/dashboard',              label: 'Overview',      icon: '📊' },
  { path: '/dashboard/branches',     label: 'Manage Branches', icon: '🏪' },
  { path: '/dashboard/prescriptions',label: 'Prescriptions', icon: '💊' },
  { path: '/dashboard/open-prescriptions', label: 'Open Prescriptions', icon: '📬' },
  { path: '/dashboard/reports',      label: 'Reports',       icon: '📈' },
  { path: '/dashboard/formulary',    label: 'Formulary',     icon: '📚' },
  { path: '/dashboard/report-issue', label: 'Report Issue',  icon: '📩' },
  { path: '/dashboard/settings',     label: 'Settings',      icon: '⚙️' },
];

export default function PharmacyDashboard({ profile }) {
  const location = useLocation();
  const navigate = useNavigate();

  // Forced password reset state
  const [mustChange, setMustChange] = useState(profile?.mustChangePassword === true);
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const mfaRequired = profile?.mfaRequired === true;
  const hasMfaFactor = (auth.currentUser?.multiFactor?.enrolledFactors || []).length > 0;

  const handleLogout = async () => { try { await signOut(auth); navigate('/'); } catch (_) {} };

  const isActive = (path) =>
    path === '/dashboard' ? location.pathname === '/dashboard' : location.pathname.startsWith(path);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    if (newPw.length < 8) { setPwError('Password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { setPwError('Passwords do not match.'); return; }
    setPwSaving(true);
    try {
      const user = auth.currentUser;
      await updatePassword(user, newPw);
      // Clear the flag in Firestore
      await updateDoc(doc(db, 'pharmacies', profile.id), { mustChangePassword: false });
      setMustChange(false);
    } catch (err) {
      if (err.code === 'auth/requires-recent-login') {
        setPwError('Please log out, sign in with your temporary password again, then set a new password.');
      } else {
        setPwError('Failed to update password. Please try again.');
      }
      console.error('Change password error:', err);
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="pharmacy-dashboard">
      <aside className="pharmacy-sidebar">
        <div className="pharmacy-sidebar-header">
          <div className="pharmacy-logo">
            <span>💊</span>
            <h2>NessaHub</h2>
            <span className="pharmacy-logo-badge">Pharmacy</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="pharmacy-avatar">{(profile?.pharmacyName || 'P')[0].toUpperCase()}</div>
            <div>
              <p className="pharmacy-user-name">{profile?.pharmacyName || 'Pharmacy'}</p>
              <p className="pharmacy-user-role">Parent Account</p>
              <SidebarSavedLocation profile={profile} />
            </div>
          </div>
        </div>

        <nav className="pharmacy-nav">
          <div className="pharmacy-nav-section">
            <h3>Navigation</h3>
            <ul className="pharmacy-nav-list">
              {NAV.map(item => (
                <li key={item.path}>
                  <button className={`pharmacy-nav-item ${isActive(item.path) ? 'active' : ''}`}
                    onClick={() => navigate(item.path)}>
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="pharmacy-sidebar-footer">
          <button className="pharmacy-logout-btn" onClick={handleLogout}>🚪 Logout</button>
        </div>
      </aside>

      <main className="pharmacy-main">
        {mfaRequired && !hasMfaFactor && (
          <div style={{ margin: '1rem', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '0.85rem 1rem', color: '#9a3412', fontSize: '0.86rem', fontWeight: 600 }}>
            Multi-factor authentication is required for this parent pharmacy account. Please enroll MFA in your account settings flow before production rollout.
          </div>
        )}
        {/* Forced password reset overlay — blocks ALL content */}
        {mustChange && (
          <div className="force-pw-overlay">
            <div className="force-pw-card">
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔐</div>
              <h2 className="force-pw-title">Password Reset Required</h2>
              <p className="force-pw-sub">
                Your account was created with a temporary password. You must set a new password before accessing your dashboard.
              </p>

              {pwError && (
                <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '0.65rem 0.875rem', color: '#be123c', fontSize: '0.83rem', marginBottom: '1rem' }}>
                  🚨 {pwError}
                </div>
              )}

              <form onSubmit={handleChangePassword}>
                {[
                  { label: 'New Password',                 key: 'new',     val: newPw,     set: setNewPw },
                  { label: 'Confirm New Password',         key: 'confirm', val: confirmPw, set: setConfirmPw },
                ].map(f => (
                  <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: '0.875rem' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151' }}>{f.label}</label>
                    <input type="password" value={f.val} onChange={e => f.set(e.target.value)} required
                      style={{ padding: '0.6rem 0.875rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.875rem', outline: 'none' }} />
                  </div>
                ))}
                <button type="submit" disabled={pwSaving}
                  style={{ width: '100%', padding: '0.7rem', borderRadius: 8, background: '#0c4a6e', color: '#fff', border: 'none', fontWeight: 700, cursor: pwSaving ? 'not-allowed' : 'pointer', fontSize: '0.9rem', marginTop: '0.25rem', opacity: pwSaving ? 0.7 : 1 }}>
                  {pwSaving ? 'Saving…' : 'Set New Password & Continue'}
                </button>
              </form>

              <button onClick={handleLogout}
                style={{ width: '100%', marginTop: '0.75rem', padding: '0.55rem', borderRadius: 8, background: 'none', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '0.83rem', color: '#64748b', fontWeight: 600 }}>
                Log Out
              </button>
            </div>
          </div>
        )}

        <Routes>
          <Route path="/"              element={<PharmacyOverview      profile={profile} />} />
          <Route path="/branches/:branchId" element={<PharmacyBranchDetail profile={profile} />} />
          <Route path="/branches"      element={<PharmacyBranches      profile={profile} />} />
          <Route path="/prescriptions/:rxId" element={<PrescriptionOps profile={profile} mode="parent" />} />
          <Route path="/prescriptions" element={<PharmacyPrescriptions profile={profile} />} />
          <Route path="/open-prescriptions" element={<OpenPrescriptions />} />
          <Route path="/reports"       element={<PharmacyReports       profile={profile} />} />
          <Route path="/formulary"     element={<FormularyManager />} />
          <Route path="/report-issue"  element={<GlobalReportForm profile={profile} reporterType="pharmacy_parent" />} />
          <Route path="/settings"      element={<PharmacySettings      profile={profile} />} />
        </Routes>
      </main>
    </div>
  );
}
