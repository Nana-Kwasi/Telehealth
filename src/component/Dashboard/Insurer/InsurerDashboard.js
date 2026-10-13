import React, { useEffect, useState } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from '../../../services/authShim';
import { auth } from '../../../services/firestoreShim';
import ForcedPasswordChangeOverlay from '../../Common/ForcedPasswordChangeOverlay';
import { INS, get } from './insurerUi';
import { InsOverview, InsClaims, InsPreauth, InsFraud } from './InsurerWork';
import { InsMembers, InsNetwork, InsPriceLists, InsCare } from './InsurerPeople';
import { InsFinance, InsReports, InsNotices, InsIntegration, InsStaff, InsSettings, InsAudit } from './InsurerAdmin';
import '../Pharmacy/PharmacyDashboard.css';
import RoleAssistant from '../../Common/RoleAssistant';
import Paged from '../../Common/Paged';

import BrandLogo from '../../Common/BrandLogo';
/** The insurer's dashboard on NessaHub. Insurer staff are created by the NessaHub super admin or their own insurer admin. */
const NAV = [
  ['WORK', [['/dashboard', 'Overview', '📊'], ['/dashboard/claims', 'Claims', '🧾'], ['/dashboard/preauth', 'Pre-authorisation', '✅'], ['/dashboard/fraud', 'Fraud & audit', '🛡️']]],
  ['PEOPLE', [['/dashboard/members', 'Members on NessaHub', '👥'], ['/dashboard/network', 'Provider network', '🏥'], ['/dashboard/price-lists', 'Price lists', '🏷️'], ['/dashboard/care', 'Care management', '💙']]],
  ['MONEY', [['/dashboard/finance', 'Payment files', '💳'], ['/dashboard/reports', 'Reports', '📈']]],
  ['SETUP', [['/dashboard/notices', 'Notices', '📣'], ['/dashboard/integration', 'Integration', '🔌'], ['/dashboard/staff', 'Staff & roles', '🧑‍💼'], ['/dashboard/audit', 'Audit log', '📜'], ['/dashboard/settings', 'Settings', '⚙️']]],
];

export default function InsurerDashboard({ profile }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [counts, setCounts] = useState({});
  useEffect(() => { get(`${INS}/me`).then(setMe).catch(() => setMe({ error: true })); }, []);
  useEffect(() => {
    const load = () => get(`${INS}/overview?days=30`).then(d => setCounts({
      '/dashboard/claims': d.queue?.to_review, '/dashboard/preauth': d.preauth?.open, '/dashboard/fraud': d.fraud?.high,
    })).catch(() => {});
    load(); const t = setInterval(load, 60000); return () => clearInterval(t);
  }, []);
  const isActive = (p) => (p === '/dashboard' ? location.pathname === '/dashboard' : location.pathname.startsWith(p));
  const logout = async () => { try { await signOut(auth); navigate('/'); } catch (_) {} };

  if (me?.error) {
    return <div style={{ padding: '3rem', textAlign: 'center' }}><h2>This account is not linked to an insurer.</h2><p>Ask your insurer admin or NessaHub support.</p><button type="button" onClick={logout}>Log out</button></div>;
  }
  return (
    <div className="pharmacy-dashboard">
      <aside className="pharmacy-sidebar">
        <div className="pharmacy-sidebar-header">
          <BrandLogo tone="dark" badge="Insurer" />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="pharmacy-avatar">{(me?.insurerName || profile?.insurerName || 'I')[0].toUpperCase()}</div>
            <div><p className="pharmacy-user-name">{me?.insurerName || profile?.insurerName || 'Insurer'}</p><p className="pharmacy-user-role">{profile?.fullName || ''} · {(me?.staffRole || '').replace('_', ' ').toLowerCase()}</p></div>
          </div>
        </div>
        <nav className="pharmacy-nav">
          {NAV.map(([section, all]) => [section, all.filter(([path]) => !(me?.claimsMode === 'API' && path === '/dashboard/finance') && !(me && !me.preauthEnabled && path === '/dashboard/preauth'))]).map(([section, items]) => (
            <div key={section} className="pharmacy-nav-section"><h3>{section}</h3>
              <ul className="pharmacy-nav-list"><Paged items={items}>{(items) => items.map(([path, label, icon]) => (
                <li key={path}><button type="button" className={`pharmacy-nav-item ${isActive(path) ? 'active' : ''}`} onClick={() => navigate(path)}>
                  <span>{icon}</span><span style={{ flex: 1 }}>{label}</span>{counts[path] ? <span style={{ background: '#dc2626', color: '#fff', borderRadius: 999, padding: '0 0.45rem', fontSize: '0.7rem', fontWeight: 800 }}>{counts[path]}</span> : null}
                </button></li>))}</Paged></ul>
            </div>
          ))}
        </nav>
        <div className="pharmacy-sidebar-footer"><button type="button" className="pharmacy-logout-btn" onClick={logout}>🚪 Logout</button></div>
      </aside>
      <main className="pharmacy-main">
        <RoleAssistant kind="insurer" accent="#1d4ed8" />
        <ForcedPasswordChangeOverlay profile={profile} firestoreCollection="auth" />
        <Routes>
          <Route path="/" element={<InsOverview me={me} />} />
          <Route path="/claims" element={<InsClaims me={me} initialStatus={location.state?.status} />} />
          <Route path="/preauth" element={<InsPreauth me={me} />} />
          <Route path="/fraud" element={<InsFraud me={me} />} />
          <Route path="/members" element={<InsMembers me={me} />} />
          <Route path="/network" element={<InsNetwork me={me} />} />
          <Route path="/price-lists" element={<InsPriceLists me={me} />} />
          <Route path="/care" element={<InsCare me={me} />} />
          <Route path="/finance" element={<InsFinance me={me} />} />
          <Route path="/reports" element={<InsReports me={me} />} />
          <Route path="/notices" element={<InsNotices me={me} />} />
          <Route path="/integration" element={<InsIntegration me={me} />} />
          <Route path="/staff" element={<InsStaff me={me} />} />
          <Route path="/audit" element={<InsAudit me={me} />} />
          <Route path="/settings" element={<InsSettings me={me} onChanged={() => get(`${INS}/me`).then(setMe).catch(() => {})} />} />
        </Routes>
      </main>
    </div>
  );
}
