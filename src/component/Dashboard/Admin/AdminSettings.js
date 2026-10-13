import React, { useCallback, useEffect, useState } from 'react';
import { api, getStoredRefreshToken, storeSession } from '../../../services/apiClient';

/**
 * The super admin's own account: profile, password, two-step sign-in, the
 * devices they are signed in on, and recent sign-in activity.
 */
const ME = '/api/v1/auth/me';
const when = (v) => (v ? new Date(v).toLocaleString() : '');

const SIGN_IN_LABEL = {
  LOGIN_SUCCESS: ['Signed in', 'badge-green'],
  LOGIN_FAILED: ['Wrong password', 'badge-red'],
  LOGIN_BLOCKED: ['Blocked (account not active)', 'badge-red'],
  LOGIN_2FA_FAILED: ['Wrong sign-in code', 'badge-orange'],
  SESSIONS_ENDED: ['Signed out other devices', 'badge-blue'],
  SESSION_ENDED: ['Signed out a device', 'badge-blue'],
  PASSWORD_CHANGED: ['Password changed', 'badge-purple'],
};

const ipOf = (details) => (/ip: ([0-9a-f.:]+)/i.exec(details || '') || [])[1] || '';

function Card({ title, sub, children, actions }) {
  return (
    <section className="admin-table-card">
      <div className="admin-table-header">
        <div><p className="admin-table-title">{title}</p>{sub && <p className="admin-page-sub" style={{ margin: '2px 0 0' }}>{sub}</p>}</div>
        {actions && <div className="admin-table-actions">{actions}</div>}
      </div>
      <div style={{ padding: '1rem 1.25rem 1.25rem' }}>{children}</div>
    </section>
  );
}

function Note({ msg }) {
  if (!msg) return null;
  return <div className={`admin-alert ${msg.ok ? 'admin-alert-success' : 'admin-alert-danger'}`} style={{ marginTop: '0.9rem', marginBottom: 0 }}>{msg.text}</div>;
}

export default function AdminSettings() {
  const [me, setMe] = useState(null);
  const [profile, setProfile] = useState({ fullName: '', phone: '' });
  const [profileMsg, setProfileMsg] = useState(null);
  const [email, setEmail] = useState({ newEmail: '', currentPassword: '' });
  const [emailMsg, setEmailMsg] = useState(null);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState(null);
  const [twoStep, setTwoStep] = useState(null);
  const [twoMsg, setTwoMsg] = useState(null);
  const [devices, setDevices] = useState(null);
  const [devMsg, setDevMsg] = useState(null);
  const [signIns, setSignIns] = useState(null);
  const [busy, setBusy] = useState('');

  const loadDevices = useCallback(() => api(`${ME}/sessions`, { method: 'POST', body: { refreshToken: getStoredRefreshToken() } })
    .then(setDevices).catch(() => setDevices([])), []);
  const loadSignIns = useCallback(() => api(`${ME}/sign-ins`).then(setSignIns).catch(() => setSignIns([])), []);

  useEffect(() => {
    api(ME).then((m) => { setMe(m); setProfile({ fullName: m.fullName || '', phone: m.phone || '' }); }).catch(() => {});
    api('/api/v1/auth/2fa').then(setTwoStep).catch(() => {});
    loadDevices();
    loadSignIns();
  }, [loadDevices, loadSignIns]);

  const act = async (key, fn, setMsg) => {
    setBusy(key);
    setMsg(null);
    try { await fn(); } catch (e) { setMsg({ ok: false, text: e?.message || 'That did not work' }); } finally { setBusy(''); }
  };

  const saveProfile = () => act('profile', async () => {
    const m = await api(ME, { method: 'PATCH', body: profile });
    setMe(m);
    setProfileMsg({ ok: true, text: 'Saved.' });
  }, setProfileMsg);

  const changeEmail = () => act('email', async () => {
    await api('/api/v1/auth/email-change', { method: 'POST', body: { userId: me.id, currentPassword: email.currentPassword, newEmail: email.newEmail } });
    setMe({ ...me, email: email.newEmail.trim().toLowerCase() });
    setEmail({ newEmail: '', currentPassword: '' });
    setEmailMsg({ ok: true, text: 'Email changed. Use the new address to sign in; a notice went to the old one.' });
  }, setEmailMsg);

  const strength = (p) => {
    let s = 0;
    if (p.length >= 12) s++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
    if (/\d/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    if (/^(.)\1+$/.test(p) || /^(0123|1234|password|nessa)/i.test(p)) s = 0;
    return s;
  };
  const pwScore = strength(pw.next);
  const pwOk = pw.next.length >= 12 && pwScore >= 3 && pw.next === pw.confirm && pw.current;

  const changePassword = () => act('pw', async () => {
    await api('/api/v1/auth/password-change', { method: 'POST', body: { currentPassword: pw.current, newPassword: pw.next } });
    setPw({ current: '', next: '', confirm: '' });
    setPwMsg({ ok: true, text: 'Password changed. If you think someone else knew your old one, sign out your other devices below.' });
    loadSignIns();
  }, setPwMsg);

  const setTwo = (enabled) => act('two', async () => {
    const r = await api('/api/v1/auth/2fa', { method: 'PUT', body: { enabled } });
    setTwoStep({ ...twoStep, enabled: r.enabled });
    setTwoMsg({ ok: true, text: enabled ? 'On: a code is emailed to you at each sign-in.' : 'Off.' });
  }, setTwoMsg);

  const endDevice = (d) => act(`dev-${d.id}`, async () => {
    await api(`${ME}/sessions/${d.id}/end`, { method: 'POST' });
    setDevMsg({ ok: true, text: `${d.device} is signed out. It loses access when its current sign-in expires (within 2 hours); use "Sign out all other devices" for immediate effect.` });
    loadDevices();
  }, setDevMsg);

  const endOthers = () => {
    if (!window.confirm('Sign out every other device now? This browser stays signed in.')) return;
    act('others', async () => {
      const r = await api(`${ME}/sessions/sign-out-others`, { method: 'POST' });
      storeSession({ token: r.token, refreshToken: r.refreshToken });
      setDevMsg({ ok: true, text: 'Every other device is signed out.' });
      loadDevices();
      loadSignIns();
    }, setDevMsg);
  };

  if (!me) return <div className="admin-page"><div className="admin-empty"><p>Loading your account…</p></div></div>;
  const others = (devices || []).filter((d) => !d.current).length;

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Settings</h1>
          <p className="admin-page-sub">Your super admin account: {me.email}</p>
        </div>
      </div>

      <div className="st-grid">
        <div>
          <Card title="Profile" sub="Shown to other super admins and in the activity trail.">
            <div className="admin-form-grid">
              <div className="admin-field"><label htmlFor="st-name">Full name</label><input id="st-name" type="text" value={profile.fullName} onChange={(e) => setProfile({ ...profile, fullName: e.target.value })} /></div>
              <div className="admin-field"><label htmlFor="st-phone">Phone</label><input id="st-phone" type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></div>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy === 'profile' || (profile.fullName === (me.fullName || '') && profile.phone === (me.phone || ''))} onClick={saveProfile}>{busy === 'profile' ? 'Saving…' : 'Save profile'}</button>
            </div>
            <Note msg={profileMsg} />
          </Card>

          <Card title="Sign-in email" sub={`Currently ${me.email}. Changing it needs your password; a notice goes to the old address.`}>
            <div className="admin-form-grid">
              <div className="admin-field"><label htmlFor="st-email">New email</label><input id="st-email" type="email" value={email.newEmail} onChange={(e) => setEmail({ ...email, newEmail: e.target.value })} /></div>
              <div className="admin-field"><label htmlFor="st-email-pw">Current password</label><input id="st-email-pw" type="password" autoComplete="current-password" value={email.currentPassword} onChange={(e) => setEmail({ ...email, currentPassword: e.target.value })} /></div>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy === 'email' || !email.newEmail.includes('@') || !email.currentPassword} onClick={changeEmail}>{busy === 'email' ? 'Changing…' : 'Change email'}</button>
            </div>
            <Note msg={emailMsg} />
          </Card>

          <Card title="Password" sub="At least 12 characters, mixing letters, numbers and symbols. Never one you use elsewhere.">
            <div className="admin-form-grid cols-1">
              <div className="admin-field"><label htmlFor="st-cur">Current password</label><input id="st-cur" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></div>
              <div className="admin-form-grid">
                <div className="admin-field"><label htmlFor="st-new">New password</label><input id="st-new" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></div>
                <div className="admin-field"><label htmlFor="st-conf">Repeat new password</label><input id="st-conf" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></div>
              </div>
            </div>
            {pw.next && (
              <div style={{ marginTop: '0.7rem' }}>
                <div className="st-meter" aria-hidden="true">{[0, 1, 2, 3].map((i) => <span key={i} className={i < pwScore ? `on s${pwScore}` : ''} />)}</div>
                <div className="toggle-desc" style={{ marginTop: 4 }}>
                  {pw.next.length < 12 ? `${12 - pw.next.length} more characters needed` : pwScore < 3 ? 'Add a mix of upper and lower case, numbers and symbols' : 'Strong'}
                  {pw.confirm && pw.next !== pw.confirm ? ' · the two passwords differ' : ''}
                </div>
              </div>
            )}
            <div style={{ marginTop: '1rem' }}>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy === 'pw' || !pwOk} onClick={changePassword}>{busy === 'pw' ? 'Changing…' : 'Change password'}</button>
            </div>
            <Note msg={pwMsg} />
          </Card>
        </div>

        <div>
          <Card title="Two-step sign-in" sub="After your password, a 6-digit code is emailed to you. A stolen password alone is then not enough.">
            {!twoStep ? <p className="toggle-desc">Loading…</p> : (
              <div className="toggle-row" style={{ borderBottom: 'none', paddingTop: 0 }}>
                <div className="toggle-info">
                  <span className="toggle-label">{twoStep.enabled ? 'On' : 'Off'}</span>
                  <span className="toggle-desc">{twoStep.requiredByOrganisation ? 'Required for every super admin (System Config → Sign-in security).' : 'Recommended for every super admin.'}</span>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" checked={!!twoStep.enabled} disabled={busy === 'two' || twoStep.requiredByOrganisation} onChange={(e) => setTwo(e.target.checked)} aria-label="Two-step sign-in" />
                  <span className="toggle-slider" />
                </label>
              </div>
            )}
            <Note msg={twoMsg} />
          </Card>

          <Card title="Where you're signed in" sub="Each browser or phone with an open sign-in."
            actions={<button type="button" className="btn btn-danger btn-sm" disabled={busy === 'others' || !others} onClick={endOthers}>Sign out all other devices</button>}>
            {!devices ? <p className="toggle-desc">Loading…</p> : devices.length === 0 ? <p className="toggle-desc">No open sign-ins.</p> : devices.map((d) => (
              <div key={d.id} className="admin-info-row">
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--a-ink)', fontSize: '0.88rem' }}>{d.device}{d.current && <span className="badge badge-green" style={{ marginLeft: 6 }}>This device</span>}</div>
                  <div className="toggle-desc">{d.ip ? `${d.ip} · ` : ''}active {when(d.lastActive)} · signed in {when(d.signedInAt)}</div>
                </div>
                {!d.current && <button type="button" className="btn btn-ghost btn-sm" disabled={busy === `dev-${d.id}`} onClick={() => endDevice(d)}>Sign out</button>}
              </div>
            ))}
            <Note msg={devMsg} />
          </Card>

          <Card title="Recent sign-in activity" sub="If you see a sign-in you don't recognise, change your password and sign out other devices.">
            {!signIns ? <p className="toggle-desc">Loading…</p> : signIns.length === 0 ? <p className="toggle-desc">Nothing yet.</p> : signIns.map((s, i) => {
              const [label, tone] = SIGN_IN_LABEL[s.action] || [s.action, 'badge-gray'];
              return (
                <div key={i} className="admin-info-row">
                  <div><span className={`badge ${tone}`}>{label}</span>{s.platform && <span className="toggle-desc" style={{ marginLeft: 8 }}>{s.platform}</span>}</div>
                  <div className="admin-info-label" style={{ textAlign: 'right' }}>{when(s.at)}{ipOf(s.details) && <div>{ipOf(s.details)}</div>}</div>
                </div>
              );
            })}
          </Card>
        </div>
      </div>
    </div>
  );
}
