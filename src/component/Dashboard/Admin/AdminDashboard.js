import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from '../../../services/authShim';
import { auth, db } from '../../../services/firestoreShim';
import { doc, getDoc } from '../../../services/firestoreShim';
import ForcedPasswordChangeOverlay from '../../Common/ForcedPasswordChangeOverlay';
import SidebarSavedLocation from '../../Common/SidebarSavedLocation';
import {
  LayoutDashboard, Users, BadgeCheck, CalendarDays, Pill, Building2, Stethoscope, Brain, Home, HeartHandshake,
  FlaskConical, BarChart3, FileDown, Inbox, ShieldCheck, BookOpen, Radar, ScrollText, Bell, Mail, Megaphone, Tag,
  Sparkles, Settings, LogOut, Menu, ChevronRight, Activity } from 'lucide-react';
import { api } from '../../../services/apiClient';
import AdminGlobalSearch from './AdminGlobalSearch';
import './AdminDashboard.css';

import AdminOverview          from './AdminOverview';
import AdminUserManagement    from './AdminUserManagement';
import AdminCreatePharmacy    from './AdminCreatePharmacy';
import AdminPrescriptionMonitor from './AdminPrescriptionMonitor';
import AdminSmsFollowUp from './AdminSmsFollowUp';
import AdminInsurance from './AdminInsurance';
import AdminSystemConfig      from './AdminSystemConfig';
import OnboardDoctor          from './OnboardDoctor';
import OnboardTherapist       from './OnboardTherapist';
import AdminOnboardHomeCareNurse from './AdminOnboardHomeCareNurse';
import AdminHomeCareManage from './AdminHomeCareManage';
import AdminCreateLabScan     from './AdminCreateLabScan';
import AdminAppointments      from './AdminAppointments';
import AdminNotifications     from './AdminNotifications';
import AdminNotificationTemplates from './AdminNotificationTemplates';
import AdminPromotions from './AdminPromotions';
import AdminPricePromotions from './AdminPricePromotions';
import AdminAiKnowledge from './AdminAiKnowledge';
import AdminReports           from './AdminReports';
import AdminReportsCenter     from './AdminReportsCenter';
import AdminInsuranceVerification from './AdminInsuranceVerification';
import FormularyManager from '../../Common/FormularyManager';
import AdminRiskAlerts from './AdminRiskAlerts';
import AdminSystemPdfExport   from './AdminSystemPdfExport';
import AdminAuditLog          from './AdminAuditLog';
import AdminActivityMonitor   from './AdminActivityMonitor';
import AdminApprovals         from './AdminApprovals';
import AdminUserDetail        from './AdminUserDetail';

const NAV = [
  // PLATFORM
  { path: '/dashboard',                   label: 'Overview',              icon: LayoutDashboard, section: 'PLATFORM' },
  { path: '/dashboard/users',             label: 'User Management',       icon: Users,           section: 'PLATFORM' },
  { path: '/dashboard/approvals',         label: 'Account Approvals',     icon: BadgeCheck,      section: 'PLATFORM', count: 'approvals' },
  { path: '/dashboard/appointments',      label: 'Appointments',          icon: CalendarDays,    section: 'PLATFORM' },
  { path: '/dashboard/prescriptions',     label: 'Prescription Monitor',  icon: Pill,            section: 'PLATFORM' },
  { path: '/dashboard/sms-follow-up',     label: 'SMS Follow-up',         icon: Pill,            section: 'PLATFORM' },
  { path: '/dashboard/insurers',          label: 'Insurers & Claims',     icon: ShieldCheck,     section: 'PLATFORM' },
  // ONBOARDING
  { path: '/dashboard/create-pharmacy',   label: 'Create Pharmacy',       icon: Building2,       section: 'ONBOARDING' },
  { path: '/dashboard/insurers?onboard=1', label: 'Onboard Insurer',     icon: ShieldCheck,     section: 'ONBOARDING' },
  { path: '/dashboard/onboard-doctor',    label: 'Onboard Doctor',        icon: Stethoscope,     section: 'ONBOARDING' },
  { path: '/dashboard/onboard-therapist', label: 'Onboard Therapist',     icon: Brain,           section: 'ONBOARDING' },
  { path: '/dashboard/onboard-homecare-nurse', label: 'Onboard Home-Care Nurse', icon: Home,     section: 'ONBOARDING' },
  { path: '/dashboard/home-care-manage', label: 'Home Care Manage',       icon: HeartHandshake,  section: 'ONBOARDING' },
  { path: '/dashboard/create-lab-scan',   label: 'Create Lab / Scan',     icon: FlaskConical,    section: 'ONBOARDING' },
  // ANALYTICS
  { path: '/dashboard/reports',           label: 'Analytics & Reports',   icon: BarChart3,       section: 'ANALYTICS' },
  { path: '/dashboard/system-pdf-export', label: 'System PDF export',     icon: FileDown,        section: 'ANALYTICS' },
  { path: '/dashboard/reports-center',    label: 'Reports & Feedback',    icon: Inbox,           section: 'ANALYTICS', count: 'reports' },
  { path: '/dashboard/insurance-verification', label: 'Insurance & Claims', icon: ShieldCheck,   section: 'ANALYTICS' },
  { path: '/dashboard/formulary',         label: 'Formulary',             icon: BookOpen,        section: 'ANALYTICS' },
  { path: '/dashboard/risk-alerts',       label: 'Patterns to review',    icon: Radar,           section: 'ANALYTICS', count: 'riskAlerts' },
  { path: '/dashboard/activity',          label: 'Activity monitor',      icon: Activity,        section: 'ANALYTICS' },
  { path: '/dashboard/audit-log',         label: 'Audit Log',             icon: ScrollText,      section: 'ANALYTICS' },
  // ENGAGEMENT
  { path: '/dashboard/notifications',     label: 'Notifications',         icon: Bell,            section: 'ENGAGEMENT' },
  { path: '/dashboard/notification-templates', label: 'Message Templates', icon: Mail,           section: 'ENGAGEMENT' },
  { path: '/dashboard/promotions',        label: 'Promo Campaigns',       icon: Megaphone,       section: 'ENGAGEMENT' },
  { path: '/dashboard/price-promotions',  label: 'Price Promotions',      icon: Tag,             section: 'ENGAGEMENT' },
  // SYSTEM
  { path: '/dashboard/ai-knowledge',      label: 'AI Knowledge Base',     icon: Sparkles,        section: 'SYSTEM' },
  { path: '/dashboard/system-config',     label: 'System Config',         icon: Settings,        section: 'SYSTEM' },
];

export default function AdminDashboard({ profile }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [forcedPwCollection, setForcedPwCollection] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [counts, setCounts] = useState({});

  // Queue sizes beside the menu items that have work waiting.
  useEffect(() => {
    let alive = true;
    const load = () => api('/api/v1/admin/overview?days=7')
      .then((d) => { if (alive) setCounts(d?.queues || {}); })
      .catch(() => {});
    load();
    const t = setInterval(load, 2 * 60 * 1000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // A menu choice closes the drawer on small screens.
  useEffect(() => { setNavOpen(false); }, [location.pathname]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    (async () => {
      const adm = await getDoc(doc(db, 'admins', uid));
      setForcedPwCollection(adm.exists() ? 'admins' : 'therapists');
    })();
  }, []);

  const handleLogout = async () => {
    try { await signOut(auth); navigate('/'); } catch {}
  };

  const isActive = (path) =>
    // Exact, or a sub-page of it — a plain prefix made /dashboard/reports light
    // up on /dashboard/reports-center too.
    path === '/dashboard'
      ? location.pathname === '/dashboard'
      : location.pathname === path || location.pathname.startsWith(`${path}/`);

  const sections = [...new Set(NAV.map(n => n.section))];

  return (
    <div className={`admin-dashboard ${navOpen ? 'nav-open' : ''}`}>
      <div className="admin-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />
      <aside className="admin-sidebar" aria-label="Admin menu">
        <div className="admin-sidebar-header">
          <div className="admin-logo">
            <span className="admin-logo-mark">N</span>
            <h2>NessaHub</h2>
            <span className="admin-logo-badge">Admin</span>
          </div>
          <div className="admin-user-info">
            <div className="admin-avatar">{(profile?.name || profile?.fullName)?.[0]?.toUpperCase() || 'A'}</div>
            <div>
              <p className="admin-user-name">{profile?.name || profile?.fullName || 'Admin'}</p>
              <p className="admin-user-role">Super Admin</p>
              <SidebarSavedLocation profile={profile} />
            </div>
          </div>
        </div>

        <nav className="admin-nav">
          {sections.map(section => (
            <div key={section} className="admin-nav-section">
              <h3>{section}</h3>
              <ul className="admin-nav-list">
                {NAV.filter(n => n.section === section).map(item => (
                  <li key={item.path}>
                    <button
                      className={`admin-nav-item ${isActive(item.path) ? 'active' : ''}`}
                      onClick={() => navigate(item.path)}
                      aria-current={isActive(item.path) ? 'page' : undefined}>
                      <item.icon size={17} strokeWidth={2} />
                      <span>{item.label}</span>
                      {item.count && counts[item.count] ? (
                        <span className="admin-nav-count" aria-label={`${counts[item.count]} waiting`}>{counts[item.count]}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <button className="admin-logout-btn" onClick={handleLogout}>
            <LogOut size={16} /> <span>Log out</span>
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <button type="button" className="admin-menu-btn" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <Menu size={18} />
          </button>
          <nav className="admin-crumbs" aria-label="Breadcrumb">
            <span>Admin</span>
            <ChevronRight size={14} />
            <strong>{(NAV.find((n) => isActive(n.path)) || NAV[0]).label}</strong>
          </nav>
          <AdminGlobalSearch pages={NAV} />
          <div className="admin-topbar-right">
            <span className="admin-date">
              {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        </header>
        {forcedPwCollection ? (
          <ForcedPasswordChangeOverlay profile={profile} firestoreCollection={forcedPwCollection} />
        ) : null}
        <Routes>
          <Route path="/"                    element={<AdminOverview profile={profile} />} />
          <Route path="/users"               element={<AdminUserManagement />} />
          <Route path="/users/:col/:userId"  element={<AdminUserDetail />} />
          <Route path="/approvals"           element={<AdminApprovals />} />
          <Route path="/appointments"        element={<AdminAppointments />} />
          <Route path="/prescriptions"       element={<AdminPrescriptionMonitor />} />
          <Route path="/sms-follow-up"       element={<AdminSmsFollowUp />} />
          <Route path="/insurers"            element={<AdminInsurance />} />
          <Route path="/create-pharmacy"     element={<AdminCreatePharmacy />} />
          <Route path="/onboard-doctor"      element={<OnboardDoctor />} />
          <Route path="/onboard-therapist"   element={<OnboardTherapist />} />
          <Route path="/onboard-homecare-nurse" element={<AdminOnboardHomeCareNurse />} />
          <Route path="/home-care-manage" element={<AdminHomeCareManage />} />
          <Route path="/create-lab-scan"     element={<AdminCreateLabScan />} />
          <Route path="/reports"             element={<AdminReports />} />
          <Route path="/system-pdf-export"   element={<AdminSystemPdfExport />} />
          <Route path="/reports-center"      element={<AdminReportsCenter />} />
          <Route path="/insurance-verification" element={<AdminInsuranceVerification />} />
          <Route path="/formulary" element={<FormularyManager />} />
          <Route path="/risk-alerts" element={<AdminRiskAlerts />} />
          <Route path="/notifications"       element={<AdminNotifications />} />
          <Route path="/notification-templates" element={<AdminNotificationTemplates />} />
          <Route path="/promotions" element={<AdminPromotions />} />
          <Route path="/price-promotions" element={<AdminPricePromotions />} />
          <Route path="/ai-knowledge" element={<AdminAiKnowledge />} />
          <Route path="/activity"            element={<AdminActivityMonitor />} />
          <Route path="/audit-log"           element={<AdminAuditLog />} />
          <Route path="/system-config"       element={<AdminSystemConfig />} />
        </Routes>
      </main>
    </div>
  );
}
