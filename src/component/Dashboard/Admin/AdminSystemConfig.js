import React, { useState, useEffect } from 'react';
import { db } from '../../../services/firestoreShim';
import { doc, getDoc, setDoc, serverTimestamp } from '../../../services/firestoreShim';
import { SUPPORTED_COUNTRIES, getFlags } from '../../../utils/featureFlags';

const FEATURE_META = {
  pharmacyOnboarding:  { label: 'Pharmacy Onboarding',    desc: 'Allow pharmacies to be onboarded in this country' },
  prescriptionRouting: { label: 'Prescription Routing',   desc: 'Route prescriptions to pharmacies automatically' },
  pharmacyFulfillment: { label: 'Pharmacy Fulfillment',   desc: 'Enable full pharmacy fulfillment workflow' },
  labOrdering:         { label: 'Lab Ordering',           desc: 'Allow doctors to order lab tests' },
  scanOrdering:        { label: 'Scan / Imaging Orders',  desc: 'Allow doctors to order scan/imaging tests' },
  videoConsultation:   { label: 'Video Consultation',     desc: 'Enable video call appointments' },
  therapistBooking:    { label: 'Therapist Booking',      desc: 'Allow clients to book therapists directly' },
  walkInVerify:        { label: 'Walk-in Verification',   desc: 'Enable walk-in prescription verification at pharmacies' },
};

const CONFIG_SECTIONS = [
  { key: 'general',       label: '🏥 General Platform',    icon: '🏥' },
  { key: 'appointments',  label: '📅 Appointments',        icon: '📅' },
  { key: 'prescriptions', label: '💊 Prescriptions',       icon: '💊' },
  { key: 'notifications', label: '🔔 Notifications',       icon: '🔔' },
  { key: 'security',      label: '🔐 Security & Access',   icon: '🔐' },
  { key: 'payments',      label: '💳 Payments & Currency', icon: '💳' },
  { key: 'dataRetention', label: '🗄 Data & Retention',    icon: '🗄' },
  { key: 'flags',         label: '🌍 Country Feature Flags', icon: '🌍' },
];

const DEFAULT_SETTINGS = {
  general: {
    platformName:         { label: 'Platform Name', type: 'text',   value: 'NessaHub Telehealth', desc: 'Name shown across the platform' },
    supportEmail:         { label: 'Support Email', type: 'email',  value: 'support@nessahub.com', desc: 'Email displayed to users for help' },
    supportPhone:         { label: 'Support Phone', type: 'text',   value: '', desc: 'Support phone number' },
    maintenanceMode:      { label: 'Maintenance Mode', type: 'toggle', value: false, desc: 'Puts platform in read-only mode, blocking new bookings' },
    newRegistrationsOpen: { label: 'Open Registrations', type: 'toggle', value: true, desc: 'Allow new patient/client registrations' },
    platformVersion:      { label: 'Platform Version', type: 'text', value: '2.0', desc: 'Displayed in footers and system info' },
  },
  appointments: {
    maxApptPerDoctorPerDay:   { label: 'Max Appts per Doctor/Day', type: 'number', value: 20, desc: 'Maximum appointments a doctor can have per day' },
    maxApptPerTherapistPerDay:{ label: 'Max Sessions per Therapist/Day', type: 'number', value: 10, desc: 'Maximum sessions a therapist can have per day' },
    apptBufferMinutes:        { label: 'Appointment Buffer (mins)', type: 'number', value: 15, desc: 'Gap between consecutive appointments' },
    allowRescheduling:        { label: 'Allow Rescheduling', type: 'toggle', value: true, desc: 'Allow patients to reschedule appointments' },
    cancelCutoffHours:        { label: 'Cancel Cutoff (hours)', type: 'number', value: 2, desc: 'Minimum hours before appointment to allow cancellation' },
    defaultSessionDuration:   { label: 'Default Session (mins)', type: 'number', value: 30, desc: 'Default duration for doctor appointments' },
    videoCallProvider:        { label: 'Video Call Provider', type: 'select', value: 'twilio', options: ['twilio', 'daily.co', 'agora'], desc: 'Video call integration used' },
  },
  prescriptions: {
    maxMedsPerPrescription:   { label: 'Max Medications per Rx', type: 'number', value: 10, desc: 'Maximum drugs on a single prescription' },
    prescriptionValidityDays: { label: 'Prescription Validity (days)', type: 'number', value: 30, desc: 'Days a prescription remains valid' },
    requireDiagnosis:         { label: 'Require Diagnosis', type: 'toggle', value: true, desc: 'Force doctors to enter a diagnosis before prescribing' },
    autoFlagDrugInteractions: { label: 'Auto-Flag Drug Interactions', type: 'toggle', value: true, desc: 'Automatically detect and flag dangerous drug combinations' },
    allowRefills:             { label: 'Allow Refills', type: 'toggle', value: true, desc: 'Allow pharmacies to process prescription refills' },
    maxRefillCount:           { label: 'Max Refill Count', type: 'number', value: 3, desc: 'Maximum times a prescription can be refilled' },
  },
  notifications: {
    emailNotifications:   { label: 'Email Notifications', type: 'toggle', value: true, desc: 'Send email alerts for appointments, prescriptions, results' },
    smsNotifications:     { label: 'SMS Notifications', type: 'toggle', value: false, desc: 'Send SMS alerts (requires SMS gateway config)' },
    pushNotifications:    { label: 'Push Notifications', type: 'toggle', value: true, desc: 'Send in-app push notifications on mobile and web' },
    apptReminderHours:    { label: 'Appointment Reminder (hours before)', type: 'number', value: 24, desc: 'When to send appointment reminder notifications' },
    adminAlertOnEmergency:{ label: 'Alert Admin on Emergency Reports', type: 'toggle', value: true, desc: 'Notify admin email when an emergency report is submitted' },
    adminEmail:           { label: 'Admin Alert Email', type: 'email', value: '', desc: 'Email address for admin emergency alerts' },
  },
  security: {
    sessionTimeoutMinutes:    { label: 'Session Timeout (minutes)', type: 'number', value: 60, min: 1, max: 35791, desc: 'Auto-logout after inactivity (1–35791 minutes / ~24.8 days max)' },
    requireEmailVerification: { label: 'Require Email Verification', type: 'toggle', value: true, desc: 'Users must verify email before accessing platform' },
    twoFactorAuth:            { label: 'Two-Factor Authentication', type: 'toggle', value: false, desc: 'Require 2FA for all admin logins' },
    maxLoginAttempts:         { label: 'Max Failed Login Attempts', type: 'number', value: 5, desc: 'Lock account after this many failed logins' },
    lockoutDurationMinutes:   { label: 'Lockout Duration (minutes)', type: 'number', value: 30, desc: 'How long accounts remain locked after too many failures' },
    adminIpWhitelist:         { label: 'Admin IP Whitelist', type: 'text', value: '', desc: 'Comma-separated IPs allowed for admin login (blank = all)' },
  },
  payments: {
    defaultCurrency:    { label: 'Default Currency', type: 'select', value: 'GHS', options: ['GHS', 'USD', 'EUR', 'NGN', 'KES', 'ZAR'], desc: 'Default currency for all transactions' },
    paymentProvider:    { label: 'Payment Provider', type: 'select', value: 'paystack', options: ['paystack', 'flutterwave', 'stripe', 'momo'], desc: 'Payment gateway integration' },
    platformFeePercent: { label: 'Platform Fee (%)', type: 'number', value: 5, desc: 'Percentage the platform takes from each consultation' },
    taxPercent:         { label: 'Tax Rate (%)', type: 'number', value: 0, desc: 'VAT or sales tax applied to consultations' },
    allowFreeTrial:     { label: 'Free Trial Period', type: 'toggle', value: true, desc: 'Allow new patients one free consultation' },
    freeTrialDays:      { label: 'Free Trial Duration (days)', type: 'number', value: 7, desc: 'How long the free trial lasts' },
  },
  dataRetention: {
    patientRecordRetentionYears:    { label: 'Patient Records Retention (years)', type: 'number', value: 10, desc: 'How long to keep patient medical records' },
    prescriptionRetentionYears:     { label: 'Prescription Retention (years)', type: 'number', value: 7, desc: 'How long to keep prescription data' },
    appointmentRetentionYears:      { label: 'Appointment Retention (years)', type: 'number', value: 5, desc: 'How long to keep appointment history' },
    auditLogRetentionDays:          { label: 'Audit Log Retention (days)', type: 'number', value: 365, desc: 'How long to keep system audit logs' },
    deleteInactiveAccountsDays:     { label: 'Delete Inactive Accounts (days)', type: 'number', value: 730, desc: 'Auto-delete accounts inactive for this long (0 = never)' },
    backupFrequency:                { label: 'Backup Frequency', type: 'select', value: 'daily', options: ['hourly', 'daily', 'weekly'], desc: 'How often to backup platform data' },
  },
};

export default function AdminSystemConfig() {
  const [overrides, setOverrides]     = useState({});
  const [settings, setSettings]       = useState(() => {
    const s = {};
    Object.entries(DEFAULT_SETTINGS).forEach(([sec, fields]) => {
      s[sec] = {};
      Object.entries(fields).forEach(([key, cfg]) => { s[sec][key] = cfg.value; });
    });
    return s;
  });
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState('');
  const [activeSection, setActiveSection] = useState('general');
  const [activeCountry, setActiveCountry] = useState('GH');

  useEffect(() => { loadConfig(); }, []);

  const loadConfig = async () => {
    try {
      const [flagSnap, settingsSnap] = await Promise.all([
        getDoc(doc(db, 'systemConfig', 'featureFlags')),
        getDoc(doc(db, 'systemConfig', 'settings')),
      ]);
      if (flagSnap.exists()) setOverrides(flagSnap.data().overrides || {});
      if (settingsSnap.exists()) {
        const saved = settingsSnap.data();
        setSettings(prev => {
          const merged = { ...prev };
          Object.entries(saved).forEach(([sec, fields]) => {
            if (merged[sec]) merged[sec] = { ...merged[sec], ...fields };
          });
          return merged;
        });
      }
    } catch (e) { console.error('SystemConfig load error:', e); }
  };

  const getEffectiveFlag = (country, feature) => {
    const override = overrides?.[country]?.[feature];
    if (override !== undefined) return override;
    return getFlags(country)[feature] || false;
  };

  const toggleFlag = (country, feature, val) => {
    setOverrides(prev => ({ ...prev, [country]: { ...(prev[country] || {}), [feature]: val } }));
    setSaved('');
  };

  const updateSetting = (section, key, val) => {
    setSettings(prev => ({ ...prev, [section]: { ...prev[section], [key]: val } }));
    setSaved('');
  };

  const saveSection = async (section) => {
    setSaving(true);
    try {
      if (section === 'flags') {
        await setDoc(doc(db, 'systemConfig', 'featureFlags'), { overrides, updatedAt: serverTimestamp() }, { merge: true });
      } else {
        await setDoc(doc(db, 'systemConfig', 'settings'), {
          [section]: settings[section],
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
      setSaved(section);
      setTimeout(() => setSaved(''), 3000);
    } catch { alert('Failed to save. Try again.'); }
    finally { setSaving(false); }
  };

  const renderField = (section, key, cfg) => {
    const val = settings[section]?.[key] ?? cfg.value;
    if (cfg.type === 'toggle') {
      return (
        <div key={key} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '0.85rem 0', borderBottom: '1px solid #f1f5f9', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: '0 0 2px', fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>{cfg.label}</p>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>{cfg.desc}</p>
          </div>
          <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, flexShrink: 0 }}>
            <input type="checkbox" checked={!!val} onChange={e => updateSetting(section, key, e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
            <span style={{
              position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
              background: val ? '#2563eb' : '#cbd5e1', borderRadius: 24, transition: '0.2s',
            }}>
              <span style={{
                position: 'absolute', height: 18, width: 18, left: val ? 23 : 3, bottom: 3,
                background: '#fff', borderRadius: '50%', transition: '0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </span>
          </label>
        </div>
      );
    }
    if (cfg.type === 'select') {
      return (
        <div key={key} style={{ padding: '0.85rem 0', borderBottom: '1px solid #f1f5f9' }}>
          <p style={{ margin: '0 0 2px', fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>{cfg.label}</p>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: '#64748b' }}>{cfg.desc}</p>
          <select value={val} onChange={e => updateSetting(section, key, e.target.value)}
            style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: '0.85rem', background: '#fff', minWidth: 180 }}>
            {(cfg.options || []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }
    return (
      <div key={key} style={{ padding: '0.85rem 0', borderBottom: '1px solid #f1f5f9' }}>
        <p style={{ margin: '0 0 2px', fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>{cfg.label}</p>
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: '#64748b' }}>{cfg.desc}</p>
        <input
          type={cfg.type || 'text'}
          value={val}
          min={cfg.type === 'number' && cfg.min !== undefined ? cfg.min : undefined}
          max={cfg.type === 'number' && cfg.max !== undefined ? cfg.max : undefined}
          onChange={e => updateSetting(section, key, cfg.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
          onBlur={e => {
            if (cfg.type !== 'number' || e.target.value === '') return;
            let n = Number(e.target.value);
            if (Number.isNaN(n)) n = cfg.min !== undefined ? cfg.min : 0;
            if (cfg.min !== undefined) n = Math.max(cfg.min, n);
            if (cfg.max !== undefined) n = Math.min(cfg.max, n);
            if (n !== val) updateSetting(section, key, n);
          }}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: '0.85rem', minWidth: 240, boxSizing: 'border-box' }} />
      </div>
    );
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">System Configuration</h1>
          <p className="admin-page-sub">Platform-wide settings, feature flags, security, payments, and data policies</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1.5rem' }}>
        {/* Section sidebar */}
        <div className="admin-table-card" style={{ padding: '0.5rem', height: 'fit-content', position: 'sticky', top: '1rem' }}>
          {CONFIG_SECTIONS.map(s => (
            <button key={s.key} onClick={() => setActiveSection(s.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%',
                padding: '0.6rem 0.85rem', border: 'none', borderRadius: 8, cursor: 'pointer',
                background: activeSection === s.key ? '#eff6ff' : 'transparent',
                color: activeSection === s.key ? '#2563eb' : '#475569',
                fontWeight: activeSection === s.key ? 700 : 500, fontSize: '0.82rem',
                marginBottom: '2px', textAlign: 'left',
              }}>
              <span>{s.icon}</span> {s.label.replace(/^[^ ]+ /, '')}
            </button>
          ))}
        </div>

        {/* Section content */}
        <div>
          {activeSection !== 'flags' && (() => {
            const section = DEFAULT_SETTINGS[activeSection];
            if (!section) return null;
            const sectionCfg = CONFIG_SECTIONS.find(s => s.key === activeSection);
            return (
              <div className="admin-table-card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{sectionCfg?.label}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {saved === activeSection && <span style={{ color: '#16a34a', fontSize: '0.82rem', fontWeight: 600 }}>✓ Saved</span>}
                    <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => saveSection(activeSection)}>
                      {saving ? 'Saving…' : '💾 Save Section'}
                    </button>
                  </div>
                </div>
                {Object.entries(section).map(([key, cfg]) => renderField(activeSection, key, cfg))}
              </div>
            );
          })()}

          {activeSection === 'flags' && (
            <div>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>🌍 Country Feature Flags</h3>
                  <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#64748b' }}>Enable or disable platform features per country. Changes sync across web and mobile instantly.</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {saved === 'flags' && <span style={{ color: '#16a34a', fontSize: '0.82rem', fontWeight: 700 }}>✓ All changes saved</span>}
                  <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => saveSection('flags')}>
                    {saving ? 'Saving…' : '💾 Save All Flags'}
                  </button>
                </div>
              </div>

              {/* Country cards grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                {SUPPORTED_COUNTRIES.map(c => {
                  const activeCount  = Object.keys(FEATURE_META).filter(k => getEffectiveFlag(c.code, k)).length;
                  const totalCount   = Object.keys(FEATURE_META).length;
                  const isSelected   = activeCountry === c.code;
                  return (
                    <div key={c.code}
                      onClick={() => setActiveCountry(isSelected ? '' : c.code)}
                      style={{
                        background: '#fff', borderRadius: 14,
                        border: `2px solid ${isSelected ? '#2563eb' : '#e2e8f0'}`,
                        boxShadow: isSelected ? '0 0 0 4px #dbeafe' : '0 1px 4px rgba(0,0,0,0.04)',
                        cursor: 'pointer', overflow: 'hidden', transition: 'all 0.15s',
                      }}>
                      {/* Country header */}
                      <div style={{ padding: '0.9rem 1.1rem', background: isSelected ? '#eff6ff' : '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <img src={`https://flagcdn.com/24x18/${c.code.toLowerCase()}.png`}
                            alt={c.code} style={{ height: 18, borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}
                            onError={e => { e.target.style.display = 'none'; }} />
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '0.88rem', color: isSelected ? '#1d4ed8' : '#0f172a' }}>{c.label}</div>
                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>{c.code}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: activeCount === totalCount ? '#16a34a' : activeCount === 0 ? '#dc2626' : '#d97706' }}>
                            {activeCount}/{totalCount}
                          </div>
                          <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>features on</div>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div style={{ height: 4, background: '#f1f5f9' }}>
                        <div style={{ height: '100%', width: `${(activeCount / totalCount) * 100}%`, background: activeCount === totalCount ? '#16a34a' : activeCount === 0 ? '#e2e8f0' : '#2563eb', transition: 'width 0.3s ease' }} />
                      </div>

                      {/* Feature toggles (expanded when selected) */}
                      {isSelected && (
                        <div style={{ padding: '0.75rem 1.1rem' }}>
                          {Object.entries(FEATURE_META).map(([key, meta]) => {
                            const isOn = getEffectiveFlag(c.code, key);
                            return (
                              <div key={key} onClick={e => e.stopPropagation()}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #f8fafc', gap: '0.75rem' }}>
                                <div style={{ flex: 1 }}>
                                  <p style={{ margin: '0 0 1px', fontSize: '0.8rem', fontWeight: 600, color: '#0f172a' }}>{meta.label}</p>
                                  <p style={{ margin: 0, fontSize: '0.7rem', color: '#94a3b8' }}>{meta.desc}</p>
                                </div>
                                <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, flexShrink: 0, cursor: 'pointer' }}>
                                  <input type="checkbox" checked={isOn} onChange={e => toggleFlag(c.code, key, e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                                  <span style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: isOn ? '#2563eb' : '#cbd5e1', borderRadius: 22, transition: '0.2s', cursor: 'pointer' }}>
                                    <span style={{ position: 'absolute', height: 16, width: 16, left: isOn ? 21 : 3, bottom: 3, background: '#fff', borderRadius: '50%', transition: '0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                                  </span>
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Collapsed summary dots */}
                      {!isSelected && (
                        <div style={{ padding: '0.65rem 1.1rem', display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                          {Object.entries(FEATURE_META).map(([key, meta]) => {
                            const isOn = getEffectiveFlag(c.code, key);
                            return (
                              <div key={key} title={`${meta.label}: ${isOn ? 'On' : 'Off'}`}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.15rem 0.45rem', borderRadius: 20, fontSize: '0.62rem', fontWeight: 600,
                                  background: isOn ? '#f0fdf4' : '#fff1f2', color: isOn ? '#16a34a' : '#dc2626',
                                  border: `1px solid ${isOn ? '#bbf7d0' : '#fecdd3'}` }}>
                                {isOn ? '✓' : '✕'} {meta.label.split(' ')[0]}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Reference summary table */}
              <div className="admin-table-card">
                <div className="admin-table-header">
                  <p className="admin-table-title">📊 Full Reference — All Countries × All Features</p>
                </div>
                <div style={{ overflowX: 'auto', padding: '0 0 0.5rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>Country</th>
                        {Object.values(FEATURE_META).map(m => (
                          <th key={m.label} style={{ padding: '0.6rem 0.5rem', fontWeight: 700, color: '#374151', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', textAlign: 'center', maxWidth: 80 }}>
                            {m.label.replace('Verification', 'Verify')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {SUPPORTED_COUNTRIES.map((c, i) => (
                        <tr key={c.code} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }} onClick={() => setActiveCountry(c.code)}>
                          <td style={{ padding: '0.55rem 1rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <img src={`https://flagcdn.com/20x15/${c.code.toLowerCase()}.png`} alt={c.code}
                                style={{ height: 13, borderRadius: 1 }} onError={e => { e.target.style.display = 'none'; }} />
                              {c.label}
                            </div>
                          </td>
                          {Object.keys(FEATURE_META).map(key => {
                            const isOn = getEffectiveFlag(c.code, key);
                            return (
                              <td key={key} style={{ textAlign: 'center', padding: '0.45rem 0.5rem', borderBottom: '1px solid #f1f5f9' }}>
                                <span style={{ fontSize: '1rem', lineHeight: 1 }}>{isOn ? '✅' : '⬜'}</span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
