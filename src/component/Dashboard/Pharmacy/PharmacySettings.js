import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../../services/firestoreShim';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  serverTimestamp,
} from '../../../services/firestoreShim';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
  signOut,
  updateEmail,
  updatePassword,
} from '../../../services/authShim';
import { SUPPORTED_COUNTRIES } from '../../../utils/featureFlags';
import useAddressAutofill from '../../../hooks/useAddressAutofill';

const SETTINGS_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'business', label: 'Business' },
  { id: 'security', label: 'Security' },
  { id: 'data', label: 'Data & session' },
];

function getSystemTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function formatTs(ts) {
  if (!ts?.toDate) return '—';
  try {
    return ts.toDate().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

export default function PharmacySettings({ profile }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [createdAt, setCreatedAt] = useState(null);
  const [stats, setStats] = useState({ branches: 0, branchesActive: 0, branchesSuspended: 0, rxTotal: 0 });

  const [biz, setBiz] = useState({
    pharmacyName: '',
    businessReg: '',
    phone: '',
    address: '',
    country: 'GH',
    city: '',
    area: '',
    region: '',
    street: '',
    ghanaDigitalAddress: '',
    latitude: null,
    longitude: null,
    licenseNote: '',
  });
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofill();
  const [systemTimezone, setSystemTimezone] = useState(getSystemTimeZone);
  const [storedTimezone, setStoredTimezone] = useState(null);
  const [timezoneSyncing, setTimezoneSyncing] = useState(false);
  const [prefsMsg, setPrefsMsg] = useState('');
  const [prefsErr, setPrefsErr] = useState('');
  const [localTimeLabel, setLocalTimeLabel] = useState('');

  const [bizSaving, setBizSaving] = useState(false);
  const [bizErr, setBizErr] = useState('');

  const [newEmail, setNewEmail] = useState('');
  const [emailPw, setEmailPw] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [verifySending, setVerifySending] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState('');

  const [pwCur, setPwCur] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [settingsTab, setSettingsTab] = useState('overview');

  // The pharmacy org doc id = organization id, which equals the user id only for
  // self-registered pharmacies. Prefer the org id so admin-onboarded ones resolve.
  const orgId = profile?.organizationId || profile?.id;

  useEffect(() => {
    let c = false;
    (async () => {
      if (!orgId) return;
      setLoading(true);
      try {
        const [snap, branchSnap, rxSnap] = await Promise.all([
          getDoc(doc(db, 'pharmacies', orgId)),
          getDocs(query(collection(db, 'pharmacyBranches'), where('pharmacyId', '==', orgId))),
          getDocs(query(collection(db, 'doctorPrescriptions'), where('pharmacyId', '==', orgId))),
        ]);
        if (!snap.exists() || c) return;
        const d = snap.data();
        setCreatedAt(d.createdAt || null);
        setBiz({
          pharmacyName: d.pharmacyName || '',
          businessReg: d.businessReg || '',
          phone: d.phone || '',
          address: d.address || '',
          country: d.country || 'GH',
          city: d.city || d.location?.city || '',
          area: d.area || d.location?.area || '',
          region: d.region || d.location?.region || '',
          street: d.street || d.location?.street || '',
          ghanaDigitalAddress: d.ghanaDigitalAddress || '',
          latitude: d.latitude ?? d.location?.latitude ?? null,
          longitude: d.longitude ?? d.location?.longitude ?? null,
          licenseNote: d.licenseNote || '',
        });
        const detected = getSystemTimeZone();
        setSystemTimezone(detected);
        setStoredTimezone(d.timezone || null);
        if (d.timezone !== detected) {
          try {
            await updateDoc(doc(db, 'pharmacies', orgId), {
              timezone: detected,
              timezoneSource: 'system',
              timezoneSyncedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            setStoredTimezone(detected);
            setPrefsMsg('Timezone matched to your device and saved.');
          } catch (syncErr) {
            console.error(syncErr);
            setPrefsErr('Could not sync timezone to your profile.');
          }
        }
        setNewEmail(auth.currentUser?.email || d.email || '');
        const bl = branchSnap.docs.map(x => x.data());
        setStats({
          branches: branchSnap.size,
          branchesActive: bl.filter(b => (b.status || 'active') === 'active').length,
          branchesSuspended: bl.filter(b => (b.status || '') === 'suspended').length,
          rxTotal: rxSnap.size,
        });
      } catch (e) {
        console.error(e);
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => { c = true; };
  }, [profile?.id]);

  const copyText = (label, text) => {
    navigator.clipboard.writeText(text).then(() => {
      setVerifyMsg(`${label} copied.`);
      setTimeout(() => setVerifyMsg(''), 2500);
    }).catch(() => {});
  };

  const copyPrefsField = (label, text) => {
    navigator.clipboard.writeText(text).then(() => {
      setPrefsMsg(`${label} copied.`);
      setTimeout(() => setPrefsMsg(''), 2500);
    }).catch(() => {});
  };

  const saveBusiness = async (e) => {
    e.preventDefault();
    if (!biz.pharmacyName.trim()) {
      setBizErr('Pharmacy name is required.');
      return;
    }
    setBizErr('');
    setBizSaving(true);
    try {
      await updateDoc(doc(db, 'pharmacies', orgId), {
        pharmacyName: biz.pharmacyName.trim(),
        businessReg: biz.businessReg.trim(),
        phone: biz.phone.trim(),
        address: biz.address.trim(),
        country: biz.country,
        city: biz.city.trim(),
        area: biz.area.trim(),
        region: biz.region.trim(),
        street: biz.street.trim(),
        ghanaDigitalAddress: biz.ghanaDigitalAddress.trim(),
        latitude: Number.isFinite(Number(biz.latitude)) ? Number(biz.latitude) : null,
        longitude: Number.isFinite(Number(biz.longitude)) ? Number(biz.longitude) : null,
        location: {
          country: biz.country,
          city: biz.city.trim(),
          area: biz.area.trim(),
          region: biz.region.trim(),
          street: biz.street.trim(),
          latitude: Number.isFinite(Number(biz.latitude)) ? Number(biz.latitude) : null,
          longitude: Number.isFinite(Number(biz.longitude)) ? Number(biz.longitude) : null,
        },
        licenseNote: biz.licenseNote.trim(),
        updatedAt: serverTimestamp(),
      });
      window.location.reload();
    } catch (err) {
      setBizErr('Could not save profile.');
    } finally {
      setBizSaving(false);
    }
  };

  const refreshTimezoneFromDevice = async () => {
    const detected = getSystemTimeZone();
    setSystemTimezone(detected);
    setPrefsErr('');
    setPrefsMsg('');
    setTimezoneSyncing(true);
    try {
      await updateDoc(doc(db, 'pharmacies', orgId), {
        timezone: detected,
        timezoneSource: 'system',
        timezoneSyncedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setStoredTimezone(detected);
      setPrefsMsg('Timezone refreshed from this device and saved.');
    } catch (err) {
      setPrefsErr('Could not save timezone.');
    } finally {
      setTimezoneSyncing(false);
    }
  };

  useEffect(() => {
    if (settingsTab !== 'preferences') return undefined;
    const tz = systemTimezone || getSystemTimeZone();
    const tick = () => {
      setLocalTimeLabel(new Date().toLocaleString(undefined, {
        timeZone: tz,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [settingsTab, systemTimezone]);

  const exportProfile = async () => {
    try {
      const snap = await getDoc(doc(db, 'pharmacies', orgId));
      if (!snap.exists()) return;
      const d = snap.data();
      const safe = {
        exportedAt: new Date().toISOString(),
        pharmacyId: profile.id,
        pharmacyName: d.pharmacyName,
        businessReg: d.businessReg,
        email: d.email,
        phone: d.phone,
        address: d.address,
        country: d.country,
        status: d.status,
        username: d.username,
        timezone: d.timezone,
        timezoneSource: d.timezoneSource,
      };
      const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `nessahub-pharmacy-profile-${profile.id.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendVerification = async () => {
    const user = auth.currentUser;
    if (!user || user.emailVerified) return;
    setVerifySending(true);
    setVerifyMsg('');
    try {
      await sendEmailVerification(user);
      setVerifyMsg('Verification email sent. Check your inbox.');
    } catch {
      setVerifyMsg('Could not send email. Try again later.');
    } finally {
      setVerifySending(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (_) {}
  };

  const saveEmail = async (e) => {
    e.preventDefault();
    setEmailErr('');
    setEmailMsg('');
    const next = newEmail.trim().toLowerCase();
    const cur = auth.currentUser?.email;
    if (!next || next === cur?.toLowerCase()) {
      setEmailErr('Enter a new email address.');
      return;
    }
    if (!emailPw) {
      setEmailErr('Enter your current password to confirm.');
      return;
    }
    setEmailSaving(true);
    try {
      const user = auth.currentUser;
      const credential = EmailAuthProvider.credential(user.email, emailPw);
      await reauthenticateWithCredential(user, credential);
      await updateEmail(user, next);
      await updateDoc(doc(db, 'pharmacies', orgId), {
        email: next,
        updatedAt: serverTimestamp(),
      });
      setEmailMsg('Login email updated. Refreshing…');
      setEmailPw('');
      window.location.reload();
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setEmailErr('Current password is incorrect.');
      } else if (err.code === 'auth/email-already-in-use') {
        setEmailErr('That email is already in use.');
      } else if (err.code === 'auth/requires-recent-login') {
        setEmailErr('Please sign out and sign in again, then retry.');
      } else {
        setEmailErr('Could not update email.');
      }
    } finally {
      setEmailSaving(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setPwErr('');
    setPwMsg('');
    if (pwNew.length < 8) {
      setPwErr('New password must be at least 8 characters.');
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwErr('New passwords do not match.');
      return;
    }
    if (pwNew === pwCur) {
      setPwErr('Choose a different password than your current one.');
      return;
    }
    setPwSaving(true);
    try {
      const user = auth.currentUser;
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, pwCur));
      await updatePassword(user, pwNew);
      await updateDoc(doc(db, 'pharmacies', orgId), {
        mustChangePassword: false,
        updatedAt: serverTimestamp(),
      });
      setPwMsg('Password updated.');
      setPwCur('');
      setPwNew('');
      setPwConfirm('');
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setPwErr('Current password is incorrect.');
      } else {
        setPwErr('Could not update password.');
      }
    } finally {
      setPwSaving(false);
    }
  };

  const emailVerified = auth.currentUser?.emailVerified === true;

  if (loading) {
    return (
      <div className="pharmacy-page pharmacy-settings-page">
        <p className="pharmacy-settings-muted">Loading settings…</p>
      </div>
    );
  }

  return (
    <div className="pharmacy-page pharmacy-settings-page pharmacy-settings-page--wide">
      <header className="pharmacy-settings-header">
        <h1 className="pharmacy-page-title">Settings</h1>
        <p className="pharmacy-page-sub pharmacy-settings-sub">Account, preferences, security, and workspace shortcuts.</p>
      </header>

      <div className="pharmacy-settings-sheet pharmacy-settings-sheet--tabs">
        <div className="pharmacy-settings-tabs" role="tablist" aria-label="Settings sections">
          {SETTINGS_TABS.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`settings-tab-${t.id}`}
              aria-selected={settingsTab === t.id}
              aria-controls={`settings-panel-${t.id}`}
              className={`pharmacy-settings-tab ${settingsTab === t.id ? 'pharmacy-settings-tab--active' : ''}`}
              onClick={() => setSettingsTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {settingsTab === 'overview' && (
          <div
            className="pharmacy-settings-tab-panel"
            role="tabpanel"
            id="settings-panel-overview"
            aria-labelledby="settings-tab-overview"
          >
            <div className="pharmacy-settings-toolbar">
              <span className="pharmacy-settings-toolbar-label">Jump to</span>
              <button type="button" className="pharmacy-settings-chip" onClick={() => navigate('/dashboard')}>Dashboard</button>
              <button type="button" className="pharmacy-settings-chip" onClick={() => navigate('/dashboard/branches')}>Branches</button>
              <button type="button" className="pharmacy-settings-chip" onClick={() => navigate('/dashboard/prescriptions')}>Prescriptions</button>
              <button type="button" className="pharmacy-settings-chip" onClick={() => navigate('/dashboard/reports')}>Reports</button>
            </div>

            <div className="pharmacy-settings-stats">
              <button type="button" className="pharmacy-settings-stat" onClick={() => navigate('/dashboard/branches')}>
                <span className="pharmacy-settings-stat-value">{stats.branches}</span>
                <span className="pharmacy-settings-stat-label">Branches</span>
                <span className="pharmacy-settings-stat-hint">{stats.branchesActive} active · {stats.branchesSuspended} suspended</span>
              </button>
              <button type="button" className="pharmacy-settings-stat" onClick={() => navigate('/dashboard/prescriptions')}>
                <span className="pharmacy-settings-stat-value">{stats.rxTotal}</span>
                <span className="pharmacy-settings-stat-label">Routed prescriptions</span>
                <span className="pharmacy-settings-stat-hint">All branches</span>
              </button>
              <div className="pharmacy-settings-stat pharmacy-settings-stat--static">
                <span className="pharmacy-settings-stat-value pharmacy-settings-stat-value--sm">{profile.mustChangePassword ? 'Yes' : 'No'}</span>
                <span className="pharmacy-settings-stat-label">Password reset required</span>
                <span className="pharmacy-settings-stat-hint">Clear in Security after you change password</span>
              </div>
            </div>

            <section className="pharmacy-settings-section pharmacy-settings-section--flush">
              <h2 className="pharmacy-settings-heading">Account identifiers</h2>
              <p className="pharmacy-settings-lead">Use these when contacting support. They do not grant access by themselves.</p>
              <dl className="pharmacy-settings-kv">
                <div><dt>Pharmacy ID</dt><dd className="pharmacy-settings-kv-actions"><code className="pharmacy-settings-code">{profile.id}</code><button type="button" className="pharmacy-settings-mini" onClick={() => copyText('Pharmacy ID', profile.id)}>Copy</button></dd></div>
                <div><dt>User UID</dt><dd className="pharmacy-settings-kv-actions"><code className="pharmacy-settings-code">{auth.currentUser?.uid || '—'}</code><button type="button" className="pharmacy-settings-mini" disabled={!auth.currentUser?.uid} onClick={() => copyText('UID', auth.currentUser?.uid || '')}>Copy</button></dd></div>
                <div><dt>Username</dt><dd className="pharmacy-settings-mono">{profile.username || '—'}</dd></div>
                <div><dt>Login email</dt><dd>{auth.currentUser?.email || profile.email || '—'}</dd></div>
                <div><dt>Email verified</dt><dd>{emailVerified ? <span className="pharmacy-settings-ok">Verified</span> : <span className="pharmacy-settings-warn">Not verified</span>}</dd></div>
                <div><dt>Account status</dt><dd><span className="pharmacy-settings-pill">{profile.status || '—'}</span></dd></div>
                <div><dt>Registered</dt><dd>{formatTs(createdAt)}</dd></div>
              </dl>
              {!emailVerified && (
                <div className="pharmacy-settings-inline-actions">
                  <button type="button" className="pharmacy-settings-btn pharmacy-settings-btn--secondary" disabled={verifySending} onClick={handleSendVerification}>
                    {verifySending ? 'Sending…' : 'Send verification email'}
                  </button>
                  {verifyMsg && <span className="pharmacy-settings-inline-msg">{verifyMsg}</span>}
                </div>
              )}
            </section>
          </div>
        )}

        {settingsTab === 'preferences' && (
          <div
            className="pharmacy-settings-tab-panel"
            role="tabpanel"
            id="settings-panel-preferences"
            aria-labelledby="settings-tab-preferences"
          >
            <section className="pharmacy-settings-section pharmacy-settings-section--flush">
              <h2 className="pharmacy-settings-heading">Regional &amp; display</h2>
              <p className="pharmacy-settings-lead">
                Your timezone comes from this browser&apos;s system settings. It cannot be set to a different region here—only refreshed if your device location or OS timezone changes.
              </p>
              <div className="pharmacy-settings-callout">
                Reports and timestamps in this dashboard follow your device timezone once it is saved to your pharmacy profile.
              </div>
              {prefsErr && <div className="pharmacy-settings-alert pharmacy-settings-alert--err">{prefsErr}</div>}
              {prefsMsg && <div className="pharmacy-settings-alert pharmacy-settings-alert--ok">{prefsMsg}</div>}
              <dl className="pharmacy-settings-kv pharmacy-settings-kv--prefs">
                <div>
                  <dt>Device timezone</dt>
                  <dd className="pharmacy-settings-kv-actions">
                    <code className="pharmacy-settings-code">{systemTimezone}</code>
                    <button type="button" className="pharmacy-settings-mini" onClick={() => copyPrefsField('Timezone', systemTimezone)}>Copy</button>
                  </dd>
                </div>
                <div>
                  <dt>Stored on account</dt>
                  <dd>{storedTimezone ? <code className="pharmacy-settings-code">{storedTimezone}</code> : '—'}{timezoneSyncing ? ' · Saving…' : ''}</dd>
                </div>
                <div>
                  <dt>Local date &amp; time</dt>
                  <dd className="pharmacy-settings-localtime">{localTimeLabel || '…'}</dd>
                </div>
                <div>
                  <dt>Browser locale</dt>
                  <dd><span className="pharmacy-settings-mono">{typeof navigator !== 'undefined' ? navigator.language : '—'}</span></dd>
                </div>
              </dl>
              <div className="pharmacy-settings-actions pharmacy-settings-actions--prefs">
                <button
                  type="button"
                  className="pharmacy-settings-btn pharmacy-settings-btn--secondary"
                  disabled={timezoneSyncing}
                  onClick={refreshTimezoneFromDevice}
                >
                  {timezoneSyncing ? 'Saving…' : 'Refresh timezone from this device'}
                </button>
              </div>
              <p className="pharmacy-settings-footnote pharmacy-settings-footnote--block">
                If you travel or change your computer&apos;s timezone, open this tab and tap refresh so reports stay aligned.
              </p>
            </section>
          </div>
        )}

        {settingsTab === 'business' && (
          <div
            className="pharmacy-settings-tab-panel"
            role="tabpanel"
            id="settings-panel-business"
            aria-labelledby="settings-tab-business"
          >
            <section className="pharmacy-settings-section pharmacy-settings-section--flush">
              <h2 className="pharmacy-settings-heading">Business profile</h2>
              <p className="pharmacy-settings-lead">Shown on internal records and routing. Save updates your pharmacy directory entry.</p>
              {bizErr && <div className="pharmacy-settings-alert pharmacy-settings-alert--err">{bizErr}</div>}
              <form onSubmit={saveBusiness} className="pharmacy-settings-form">
                <div className="pharmacy-settings-grid">
                  <label className="pharmacy-settings-field">
                    <span>Pharmacy name *</span>
                    <input value={biz.pharmacyName} onChange={e => setBiz(p => ({ ...p, pharmacyName: e.target.value }))} required />
                  </label>
                  <label className="pharmacy-settings-field">
                    <span>Business registration</span>
                    <input value={biz.businessReg} onChange={e => setBiz(p => ({ ...p, businessReg: e.target.value }))} />
                  </label>
                  <label className="pharmacy-settings-field">
                    <span>Phone</span>
                    <input value={biz.phone} onChange={e => setBiz(p => ({ ...p, phone: e.target.value }))} />
                  </label>
                  <label className="pharmacy-settings-field">
                    <span>Country</span>
                    <select value={biz.country} onChange={e => setBiz(p => ({ ...p, country: e.target.value }))}>
                      {SUPPORTED_COUNTRIES.map(c => (
                        <option key={c.code} value={c.code}>{c.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="pharmacy-settings-field pharmacy-settings-field--full">
                    <span>Address</span>
                    <input value={biz.address} onChange={e => setBiz(p => ({ ...p, address: e.target.value }))} />
                  </label>
                  <label className="pharmacy-settings-field pharmacy-settings-field--full">
                    <span>Location assist</span>
                    <button
                      type="button"
                      className="pharmacy-settings-btn pharmacy-settings-btn--secondary"
                      onClick={() => detectAddress((loc) => {
                        setBiz(p => ({
                          ...p,
                          address: loc.address || p.address || '',
                          country: loc.countryCode || p.country || 'GH',
                          city: loc.city || p.city || '',
                          area: loc.area || p.area || '',
                          region: loc.region || p.region || '',
                          street: loc.street || p.street || '',
                          latitude: loc.latitude ?? p.latitude ?? null,
                          longitude: loc.longitude ?? p.longitude ?? null,
                        }));
                      })}
                      disabled={locating}
                    >
                      {locating ? 'Detecting...' : 'Use current location'}
                    </button>
                    {locationMsg ? <small>{locationMsg}</small> : null}
                  </label>
                  <label className="pharmacy-settings-field">
                    <span>City</span>
                    <input value={biz.city} onChange={e => setBiz(p => ({ ...p, city: e.target.value }))} />
                  </label>
                  <label className="pharmacy-settings-field">
                    <span>Area / locality</span>
                    <input value={biz.area} onChange={e => setBiz(p => ({ ...p, area: e.target.value }))} />
                  </label>
                  <label className="pharmacy-settings-field">
                    <span>Region / state</span>
                    <input value={biz.region} onChange={e => setBiz(p => ({ ...p, region: e.target.value }))} />
                  </label>
                  <label className="pharmacy-settings-field">
                    <span>Street</span>
                    <input value={biz.street} onChange={e => setBiz(p => ({ ...p, street: e.target.value }))} />
                  </label>
                  <label className="pharmacy-settings-field">
                    <span>Latitude</span>
                    <input type="number" step="any" value={biz.latitude ?? ''} onChange={e => setBiz(p => ({ ...p, latitude: e.target.value }))} />
                  </label>
                  <label className="pharmacy-settings-field">
                    <span>Longitude</span>
                    <input type="number" step="any" value={biz.longitude ?? ''} onChange={e => setBiz(p => ({ ...p, longitude: e.target.value }))} />
                  </label>
                  <label className="pharmacy-settings-field pharmacy-settings-field--full">
                    <span>Ghana digital address (optional)</span>
                    <input value={biz.ghanaDigitalAddress} onChange={e => setBiz(p => ({ ...p, ghanaDigitalAddress: e.target.value }))} />
                  </label>
                  <label className="pharmacy-settings-field pharmacy-settings-field--full">
                    <span>License / regulatory notes</span>
                    <textarea rows={3} value={biz.licenseNote} onChange={e => setBiz(p => ({ ...p, licenseNote: e.target.value }))} />
                  </label>
                </div>
                <div className="pharmacy-settings-actions">
                  <button type="submit" className="pharmacy-settings-btn pharmacy-settings-btn--primary" disabled={bizSaving}>
                    {bizSaving ? 'Saving…' : 'Save business profile'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {settingsTab === 'security' && (
          <div
            className="pharmacy-settings-tab-panel"
            role="tabpanel"
            id="settings-panel-security"
            aria-labelledby="settings-tab-security"
          >
            <section className="pharmacy-settings-section pharmacy-settings-section--flush">
              <h2 className="pharmacy-settings-heading">Login email</h2>
              <p className="pharmacy-settings-lead">Changes the email you use to sign in. Requires your current password.</p>
              {emailErr && <div className="pharmacy-settings-alert pharmacy-settings-alert--err">{emailErr}</div>}
              {emailMsg && <div className="pharmacy-settings-alert pharmacy-settings-alert--ok">{emailMsg}</div>}
              <form onSubmit={saveEmail} className="pharmacy-settings-form">
                <div className="pharmacy-settings-grid">
                  <label className="pharmacy-settings-field pharmacy-settings-field--full">
                    <span>New login email</span>
                    <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} autoComplete="email" />
                  </label>
                  <label className="pharmacy-settings-field pharmacy-settings-field--full">
                    <span>Current password</span>
                    <input type="password" value={emailPw} onChange={e => setEmailPw(e.target.value)} autoComplete="current-password" />
                  </label>
                </div>
                <div className="pharmacy-settings-actions">
                  <button type="submit" className="pharmacy-settings-btn pharmacy-settings-btn--secondary" disabled={emailSaving}>
                    {emailSaving ? 'Updating…' : 'Update login email'}
                  </button>
                </div>
              </form>
            </section>

            <div className="pharmacy-settings-rule pharmacy-settings-rule--inset" />

            <section className="pharmacy-settings-section pharmacy-settings-section--flush">
              <h2 className="pharmacy-settings-heading">Password</h2>
              <p className="pharmacy-settings-lead">Use a strong password you do not reuse elsewhere.</p>
              {pwErr && <div className="pharmacy-settings-alert pharmacy-settings-alert--err">{pwErr}</div>}
              {pwMsg && <div className="pharmacy-settings-alert pharmacy-settings-alert--ok">{pwMsg}</div>}
              <form onSubmit={savePassword} className="pharmacy-settings-form">
                <div className="pharmacy-settings-grid">
                  <label className="pharmacy-settings-field pharmacy-settings-field--full">
                    <span>Current password</span>
                    <input type="password" value={pwCur} onChange={e => setPwCur(e.target.value)} autoComplete="current-password" />
                  </label>
                  <label className="pharmacy-settings-field">
                    <span>New password</span>
                    <input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} autoComplete="new-password" />
                  </label>
                  <label className="pharmacy-settings-field">
                    <span>Confirm new password</span>
                    <input type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} autoComplete="new-password" />
                  </label>
                </div>
                <div className="pharmacy-settings-actions">
                  <button type="submit" className="pharmacy-settings-btn pharmacy-settings-btn--secondary" disabled={pwSaving}>
                    {pwSaving ? 'Updating…' : 'Change password'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {settingsTab === 'data' && (
          <div
            className="pharmacy-settings-tab-panel"
            role="tabpanel"
            id="settings-panel-data"
            aria-labelledby="settings-tab-data"
          >
            <section className="pharmacy-settings-section pharmacy-settings-section--flush">
              <h2 className="pharmacy-settings-heading">Data &amp; session</h2>
              <p className="pharmacy-settings-lead">Export non-sensitive profile fields as JSON. Sign out ends this browser session.</p>
              <div className="pharmacy-settings-actions-row">
                <button type="button" className="pharmacy-settings-btn pharmacy-settings-btn--secondary" onClick={exportProfile}>Download profile JSON</button>
                <button type="button" className="pharmacy-settings-btn pharmacy-settings-btn--danger-outline" onClick={handleLogout}>Sign out</button>
              </div>
              <p className="pharmacy-settings-footnote">
                <a href="/terms" className="pharmacy-settings-link">Terms</a>
                {' · '}
                <a href="/privacy" className="pharmacy-settings-link">Privacy</a>
              </p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
