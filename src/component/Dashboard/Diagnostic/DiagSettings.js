import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../services/apiClient';
import { auth } from '../../../services/firestoreShim';
import {
  EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail, signOut, updatePassword,
} from '../../../services/authShim';
import useAddressAutofill from '../../../hooks/useAddressAutofill';

/**
 * Lab / scan Settings — same layout and styles as the pharmacy Settings page
 * (tabs: Overview · Profile · Operations · Preferences · Security · Data), for the
 * parent centre and for a branch. Saved through /diagnostics/operations/settings.
 */
const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
const DEFAULT_HOURS = Object.fromEntries(DAYS.map(([k]) => [k, k === 'sun' ? { closed: true, open: '08:00', close: '14:00' } : { closed: false, open: k === 'sat' ? '08:00' : '07:00', close: k === 'sat' ? '14:00' : '18:00' }]));
const SERVICES = {
  lab: ['Haematology', 'Clinical chemistry', 'Microbiology', 'Serology / immunology', 'Parasitology', 'Urinalysis', 'Histopathology', 'Molecular / PCR', 'Blood bank'],
  scan: ['X-ray', 'Ultrasound', 'CT', 'MRI', 'Mammography', 'Echocardiography', 'Doppler', 'Fluoroscopy', 'Bone densitometry (DEXA)'],
};
const PAYMENTS = ['Cash', 'Mobile money', 'Card', 'NHIS', 'Private insurance', 'Corporate account'];

function tz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } }
const fmt = (v) => { if (!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };
const statusLabel = (s) => ({ APPROVED: 'Active', REJECTED: 'Suspended', PENDING: 'Pending review', PENDING_REVIEW: 'Pending review' }[String(s || '').toUpperCase()] || s || '—');

export default function DiagSettings({ type = 'lab', profile, mode = 'parent' }) {
  const navigate = useNavigate();
  const isBranch = mode === 'branch';
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofill();
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [prof, setProf] = useState({});
  const [ops, setOps] = useState({});
  const [msg, setMsg] = useState({ tab: '', ok: '', err: '' });
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ cur: '', next: '', confirm: '' });

  const load = useCallback(async () => {
    try {
      const d = await api('/api/v1/diagnostics/operations/settings');
      setData(d);
      const p = d.profile || {};
      setProf({
        name: p.name || '', registrationNumber: p.registrationNumber || '', contactPhone: p.contactPhone || '', contactEmail: p.contactEmail || '',
        country: p.country || 'GH', city: p.city || '', address: p.address || '',
        latitude: p.latitude ?? '', longitude: p.longitude ?? '',
      });
      const s = d.settings || {};
      setOps({
        hours: s.hours || DEFAULT_HOURS, open24h: !!s.open24h, emergency: !!s.emergency, walkIns: s.walkIns !== false, appointmentsOnly: !!s.appointmentsOnly,
        homeCollection: !!s.homeCollection, homeCollectionFee: s.homeCollectionFee ?? '', services: s.services || [], payments: s.payments || ['Cash', 'Mobile money'],
        criticalName: s.criticalName || '', criticalPhone: s.criticalPhone || '', resultsEmail: s.resultsEmail || '', phone: s.phone || '',
        licenceNo: s.licenceNo || '', licenceExpiry: s.licenceExpiry || '', accreditation: s.accreditation || '', director: s.director || '', directorRegNo: s.directorRegNo || '',
        website: s.website || '', ghanaDigitalAddress: s.ghanaDigitalAddress || '', area: s.area || '', region: s.region || '',
        timezone: s.timezone || '', patientNote: s.patientNote || '',
      });
      // Keep the stored timezone in step with this device (as the pharmacy settings do).
      if (s.timezone !== tz()) api('/api/v1/diagnostics/operations/settings', { method: 'PUT', body: { settings: { timezone: tz() } } }).catch(() => {});
    } catch (e) { setMsg({ tab: 'overview', ok: '', err: e?.message || 'Could not load settings.' }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const flash = (t, ok, err = '') => { setMsg({ tab: t, ok, err }); if (ok) setTimeout(() => setMsg(m => (m.ok === ok ? { tab: '', ok: '', err: '' } : m)), 3500); };
  const save = async (t, body) => {
    setSaving(true); flash(t, '');
    try { const d = await api('/api/v1/diagnostics/operations/settings', { method: 'PUT', body }); setData(d); flash(t, 'Saved.'); }
    catch (e) { flash(t, '', e?.message || 'Could not save.'); }
    finally { setSaving(false); }
  };
  const Alert = ({ t }) => (msg.tab === t ? (
    <>{msg.err && <div className="pharmacy-settings-alert pharmacy-settings-alert--err">{msg.err}</div>}{msg.ok && <div className="pharmacy-settings-alert pharmacy-settings-alert--ok">{msg.ok}</div>}</>
  ) : null);

  const saveProfile = (e) => {
    e.preventDefault();
    if (!isBranch && !prof.name.trim()) return flash('profile', '', 'Name is required.');
    save('profile', {
      profile: isBranch
        ? { address: prof.address, city: prof.city, country: prof.country, latitude: prof.latitude, longitude: prof.longitude }
        : prof,
      settings: { phone: ops.phone, website: ops.website, ghanaDigitalAddress: ops.ghanaDigitalAddress, area: ops.area, region: ops.region,
        licenceNo: ops.licenceNo, licenceExpiry: ops.licenceExpiry, accreditation: ops.accreditation, director: ops.director, directorRegNo: ops.directorRegNo },
    });
  };
  const saveOps = (e) => {
    e.preventDefault();
    const { hours, open24h, emergency, walkIns, appointmentsOnly, homeCollection, homeCollectionFee, services, payments, criticalName, criticalPhone, resultsEmail, patientNote } = ops;
    save('operations', { settings: { hours, open24h, emergency, walkIns, appointmentsOnly, homeCollection, homeCollectionFee, services, payments, criticalName, criticalPhone, resultsEmail, patientNote } });
  };
  const toggleIn = (key, v) => setOps(o => ({ ...o, [key]: o[key].includes(v) ? o[key].filter(x => x !== v) : [...o[key], v] }));
  const setDay = (k, patch) => setOps(o => ({ ...o, hours: { ...o.hours, [k]: { ...o.hours[k], ...patch } } }));

  const changePassword = async (e) => {
    e.preventDefault();
    if (pw.next.length < 8) return flash('security', '', 'New password must be at least 8 characters.');
    if (pw.next !== pw.confirm) return flash('security', '', 'New passwords do not match.');
    if (pw.next === pw.cur) return flash('security', '', 'Choose a different password than your current one.');
    setSaving(true);
    try {
      const user = auth.currentUser;
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, pw.cur));
      await updatePassword(user, pw.next);
      setPw({ cur: '', next: '', confirm: '' });
      flash('security', 'Password updated.');
    } catch (err) {
      flash('security', '', err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential' ? 'Current password is incorrect.' : 'Could not update password.');
    } finally { setSaving(false); }
  };
  const resetLink = async () => {
    const email = auth.currentUser?.email || profile?.email;
    if (!email) return flash('security', '', 'No email on file.');
    try { await sendPasswordResetEmail(auth, email); flash('security', `Reset link sent to ${email}.`); }
    catch { flash('security', '', 'Could not send reset email.'); }
  };
  const copy = (label, text) => navigator.clipboard?.writeText(text).then(() => flash('overview', `${label} copied.`)).catch(() => {});
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), kind: data?.kind, id: data?.ownerId, profile: data?.profile, settings: data?.settings }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `nessahub-${type}-${isBranch ? 'branch' : 'centre'}-settings.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  const logout = async () => { try { await signOut(auth); navigate('/'); } catch (_) {} };

  if (loading) return <div className="pharmacy-page pharmacy-settings-page"><p className="pharmacy-settings-muted">Loading settings…</p></div>;
  const p = data?.profile || {};
  const st = data?.stats || {};
  const parentOps = data?.parentSettings || {};
  const kindLabel = type === 'lab' ? 'Lab' : 'Scan centre';
  const TABS = [['overview', 'Overview'], ['profile', isBranch ? 'Branch profile' : 'Business profile'], ['operations', 'Operations'], ['preferences', 'Preferences'], ['security', 'Security'], ['data', 'Data & session']];

  return (
    <div className="pharmacy-page pharmacy-settings-page pharmacy-settings-page--wide">
      <header className="pharmacy-settings-header">
        <h1 className="pharmacy-page-title">Settings</h1>
        <p className="pharmacy-page-sub pharmacy-settings-sub">{isBranch ? `Branch profile, opening hours, services and security for ${p.name || 'this branch'}.` : `${kindLabel} profile, licence, operations, security and workspace shortcuts.`}</p>
      </header>

      <div className="pharmacy-settings-sheet pharmacy-settings-sheet--tabs">
        <div className="pharmacy-settings-tabs" role="tablist" aria-label="Settings sections">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={`pharmacy-settings-tab ${tab === id ? 'pharmacy-settings-tab--active' : ''}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="pharmacy-settings-tab-panel" role="tabpanel">
            <div className="pharmacy-settings-toolbar">
              <span className="pharmacy-settings-toolbar-label">Jump to</span>
              <button type="button" className="pharmacy-settings-chip" onClick={() => navigate('/dashboard')}>Dashboard</button>
              <button type="button" className="pharmacy-settings-chip" onClick={() => navigate('/dashboard/orders')}>{isBranch ? 'Worklist' : 'All orders'}</button>
              {!isBranch && <button type="button" className="pharmacy-settings-chip" onClick={() => navigate('/dashboard/branches')}>Branches</button>}
              <button type="button" className="pharmacy-settings-chip" onClick={() => navigate('/dashboard/catalog')}>Catalog</button>
              <button type="button" className="pharmacy-settings-chip" onClick={() => navigate('/dashboard/reports')}>Reports</button>
            </div>
            <Alert t="overview" />
            <div className="pharmacy-settings-stats">
              {!isBranch && (
                <button type="button" className="pharmacy-settings-stat" onClick={() => navigate('/dashboard/branches')}>
                  <span className="pharmacy-settings-stat-value">{st.branches ?? 0}</span>
                  <span className="pharmacy-settings-stat-label">Branches</span>
                  <span className="pharmacy-settings-stat-hint">{st.branchesActive ?? 0} active</span>
                </button>
              )}
              <button type="button" className="pharmacy-settings-stat" onClick={() => navigate('/dashboard/orders')}>
                <span className="pharmacy-settings-stat-value">{st.openOrders ?? 0}</span>
                <span className="pharmacy-settings-stat-label">Open orders</span>
                <span className="pharmacy-settings-stat-hint">{st.completed30d ?? 0} completed in 30 days</span>
              </button>
              <button type="button" className="pharmacy-settings-stat" onClick={() => navigate('/dashboard/catalog')}>
                <span className="pharmacy-settings-stat-value">{st.catalogItems ?? 0}</span>
                <span className="pharmacy-settings-stat-label">{type === 'lab' ? 'Tests' : 'Scans'} in catalog</span>
                <span className="pharmacy-settings-stat-hint">{st.catalogItems ? 'Priced and active' : 'Add prices in Catalog'}</span>
              </button>
              <div className="pharmacy-settings-stat pharmacy-settings-stat--static">
                <span className="pharmacy-settings-stat-value pharmacy-settings-stat-value--sm">{profile?.mustChangePassword ? 'Yes' : 'No'}</span>
                <span className="pharmacy-settings-stat-label">Password change required</span>
                <span className="pharmacy-settings-stat-hint">Change it under Security</span>
              </div>
            </div>
            <section className="pharmacy-settings-section pharmacy-settings-section--flush">
              <h2 className="pharmacy-settings-heading">Account identifiers</h2>
              <p className="pharmacy-settings-lead">Use these when contacting support. They do not grant access by themselves.</p>
              <dl className="pharmacy-settings-kv">
                <div><dt>{isBranch ? 'Branch ID' : `${kindLabel} ID`}</dt><dd className="pharmacy-settings-kv-actions"><code className="pharmacy-settings-code">{data?.ownerId}</code><button type="button" className="pharmacy-settings-mini" onClick={() => copy('ID', data?.ownerId)}>Copy</button></dd></div>
                {isBranch && <div><dt>Parent {type === 'lab' ? 'lab' : 'centre'}</dt><dd>{p.parentName || '—'}</dd></div>}
                {isBranch && p.branchCode && <div><dt>Branch code</dt><dd className="pharmacy-settings-mono">{p.branchCode}</dd></div>}
                <div><dt>Login email</dt><dd>{auth.currentUser?.email || profile?.email || '—'}</dd></div>
                <div><dt>Account status</dt><dd><span className="pharmacy-settings-pill">{statusLabel(p.status)}</span></dd></div>
                {!isBranch && <div><dt>Registration no.</dt><dd className="pharmacy-settings-mono">{p.registrationNumber || '—'}</dd></div>}
                <div><dt>Facility licence</dt><dd>{(data?.settings?.licenceNo || parentOps.licenceNo) ? `${data?.settings?.licenceNo || parentOps.licenceNo}${(data?.settings?.licenceExpiry || parentOps.licenceExpiry) ? ` · expires ${data?.settings?.licenceExpiry || parentOps.licenceExpiry}` : ''}` : <span className="pharmacy-settings-warn">Not recorded</span>}</dd></div>
                <div><dt>Registered</dt><dd>{fmt(p.createdAt)}</dd></div>
              </dl>
            </section>
          </div>
        )}

        {tab === 'profile' && (
          <div className="pharmacy-settings-tab-panel" role="tabpanel">
            <section className="pharmacy-settings-section pharmacy-settings-section--flush">
              <h2 className="pharmacy-settings-heading">{isBranch ? 'Branch profile' : 'Business profile'}</h2>
              <p className="pharmacy-settings-lead">{isBranch ? 'Branch name, status and login email are managed by your parent centre. You can keep your contact and location details correct.' : 'Shown to doctors when they choose where to send a test, and on internal records.'}</p>
              <Alert t="profile" />
              <form onSubmit={saveProfile} className="pharmacy-settings-form">
                <div className="pharmacy-settings-grid">
                  <label className="pharmacy-settings-field"><span>{isBranch ? 'Branch name' : `${kindLabel} name *`}</span><input value={prof.name} disabled={isBranch} onChange={e => setProf({ ...prof, name: e.target.value })} required={!isBranch} /></label>
                  {!isBranch && <label className="pharmacy-settings-field"><span>Business registration no.</span><input value={prof.registrationNumber} onChange={e => setProf({ ...prof, registrationNumber: e.target.value })} /></label>}
                  {!isBranch && <label className="pharmacy-settings-field"><span>Main phone</span><input value={prof.contactPhone} onChange={e => setProf({ ...prof, contactPhone: e.target.value })} /></label>}
                  {!isBranch && <label className="pharmacy-settings-field"><span>Contact email</span><input type="email" value={prof.contactEmail} onChange={e => setProf({ ...prof, contactEmail: e.target.value })} /></label>}
                  {isBranch && <label className="pharmacy-settings-field"><span>Branch phone</span><input value={ops.phone} onChange={e => setOps({ ...ops, phone: e.target.value })} /></label>}
                  <label className="pharmacy-settings-field"><span>Website</span><input value={ops.website} placeholder="https://" onChange={e => setOps({ ...ops, website: e.target.value })} /></label>
                </div>

                <h3 className="pharmacy-settings-heading" style={{ fontSize: '0.92rem', marginTop: '1.25rem' }}>Licence & accreditation</h3>
                <div className="pharmacy-settings-grid">
                  <label className="pharmacy-settings-field"><span>Facility licence no. (e.g. HeFRA)</span><input value={ops.licenceNo} placeholder={isBranch && parentOps.licenceNo ? `Parent: ${parentOps.licenceNo}` : ''} onChange={e => setOps({ ...ops, licenceNo: e.target.value })} /></label>
                  <label className="pharmacy-settings-field"><span>Licence expiry</span><input type="date" value={ops.licenceExpiry} onChange={e => setOps({ ...ops, licenceExpiry: e.target.value })} /></label>
                  <label className="pharmacy-settings-field"><span>Accreditation</span><input value={ops.accreditation} placeholder={type === 'lab' ? 'e.g. ISO 15189, SLIPTA' : 'e.g. Nuclear Regulatory Authority permit'} onChange={e => setOps({ ...ops, accreditation: e.target.value })} /></label>
                  <label className="pharmacy-settings-field"><span>{type === 'lab' ? 'Lab manager / scientist in charge' : 'Lead radiologist'}</span><input value={ops.director} onChange={e => setOps({ ...ops, director: e.target.value })} /></label>
                  <label className="pharmacy-settings-field"><span>Professional reg. no.</span><input value={ops.directorRegNo} placeholder={type === 'lab' ? 'Allied Health Professions Council' : 'Medical & Dental Council'} onChange={e => setOps({ ...ops, directorRegNo: e.target.value })} /></label>
                </div>

                <h3 className="pharmacy-settings-heading" style={{ fontSize: '0.92rem', marginTop: '1.25rem' }}>Location</h3>
                <div className="pharmacy-settings-grid">
                  <label className="pharmacy-settings-field pharmacy-settings-field--full"><span>Address</span><input value={prof.address} onChange={e => setProf({ ...prof, address: e.target.value })} /></label>
                  <label className="pharmacy-settings-field pharmacy-settings-field--full">
                    <span>Location assist</span>
                    <button type="button" className="pharmacy-settings-btn pharmacy-settings-btn--secondary" disabled={locating}
                      onClick={() => detectAddress((loc) => {
                        setProf(x => ({ ...x, address: loc.address || x.address, country: loc.countryCode || x.country, city: loc.city || x.city, latitude: loc.latitude ?? x.latitude, longitude: loc.longitude ?? x.longitude }));
                        setOps(x => ({ ...x, area: loc.area || x.area, region: loc.region || x.region }));
                      })}>{locating ? 'Detecting…' : 'Use current location'}</button>
                    {locationMsg ? <small>{locationMsg}</small> : null}
                  </label>
                  <label className="pharmacy-settings-field"><span>City</span><input value={prof.city} onChange={e => setProf({ ...prof, city: e.target.value })} /></label>
                  <label className="pharmacy-settings-field"><span>Area / locality</span><input value={ops.area} onChange={e => setOps({ ...ops, area: e.target.value })} /></label>
                  <label className="pharmacy-settings-field"><span>Region</span><input value={ops.region} onChange={e => setOps({ ...ops, region: e.target.value })} /></label>
                  <label className="pharmacy-settings-field"><span>Country</span><input value={prof.country} onChange={e => setProf({ ...prof, country: e.target.value })} /></label>
                  <label className="pharmacy-settings-field"><span>Latitude</span><input type="number" step="any" value={prof.latitude} onChange={e => setProf({ ...prof, latitude: e.target.value })} /></label>
                  <label className="pharmacy-settings-field"><span>Longitude</span><input type="number" step="any" value={prof.longitude} onChange={e => setProf({ ...prof, longitude: e.target.value })} /></label>
                  <label className="pharmacy-settings-field pharmacy-settings-field--full"><span>Ghana digital address (optional)</span><input value={ops.ghanaDigitalAddress} onChange={e => setOps({ ...ops, ghanaDigitalAddress: e.target.value })} /></label>
                </div>
                <div className="pharmacy-settings-actions"><button type="submit" className="pharmacy-settings-btn pharmacy-settings-btn--primary" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button></div>
              </form>
            </section>
          </div>
        )}

        {tab === 'operations' && (
          <div className="pharmacy-settings-tab-panel" role="tabpanel">
            <form onSubmit={saveOps}>
              <section className="pharmacy-settings-section pharmacy-settings-section--flush">
                <h2 className="pharmacy-settings-heading">Opening hours</h2>
                <p className="pharmacy-settings-lead">When patients can walk in{type === 'scan' ? ' or be booked' : ' for sample collection'}.</p>
                <Alert t="operations" />
                <label className="pharmacy-settings-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <input type="checkbox" checked={ops.open24h} onChange={e => setOps({ ...ops, open24h: e.target.checked })} /><span style={{ margin: 0 }}>Open 24 hours, 7 days</span>
                </label>
                {!ops.open24h && (
                  <dl className="pharmacy-settings-kv">
                    {DAYS.map(([k, label]) => {
                      const d = ops.hours?.[k] || DEFAULT_HOURS[k];
                      return (
                        <div key={k}>
                          <dt>{label}</dt>
                          <dd style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.84rem' }}><input type="checkbox" checked={!d.closed} onChange={e => setDay(k, { closed: !e.target.checked })} /> Open</label>
                            {!d.closed && <><input type="time" value={d.open} onChange={e => setDay(k, { open: e.target.value })} /> – <input type="time" value={d.close} onChange={e => setDay(k, { close: e.target.value })} /></>}
                            {d.closed && <span className="pharmacy-settings-muted">Closed</span>}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                )}
              </section>

              <div className="pharmacy-settings-rule pharmacy-settings-rule--inset" />
              <section className="pharmacy-settings-section pharmacy-settings-section--flush">
                <h2 className="pharmacy-settings-heading">Services</h2>
                <p className="pharmacy-settings-lead">{type === 'lab' ? 'Departments this ' : 'Imaging available at this '}{isBranch ? 'branch' : 'centre'}. Prices and turnaround live in the Catalog.</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {SERVICES[type].map(sv => (
                    <button key={sv} type="button" className={`pharmacy-settings-chip ${ops.services.includes(sv) ? 'pharmacy-settings-tab--active' : ''}`} onClick={() => toggleIn('services', sv)}>{ops.services.includes(sv) ? '✓ ' : ''}{sv}</button>
                  ))}
                </div>
                <div className="pharmacy-settings-grid" style={{ marginTop: 12 }}>
                  <label className="pharmacy-settings-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={ops.walkIns} onChange={e => setOps({ ...ops, walkIns: e.target.checked })} /><span style={{ margin: 0 }}>Accept walk-ins</span></label>
                  <label className="pharmacy-settings-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={ops.emergency} onChange={e => setOps({ ...ops, emergency: e.target.checked })} /><span style={{ margin: 0 }}>Emergency / STAT service</span></label>
                  {type === 'scan' && <label className="pharmacy-settings-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={ops.appointmentsOnly} onChange={e => setOps({ ...ops, appointmentsOnly: e.target.checked })} /><span style={{ margin: 0 }}>Appointment required for CT / MRI</span></label>}
                  {type === 'lab' && <label className="pharmacy-settings-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={ops.homeCollection} onChange={e => setOps({ ...ops, homeCollection: e.target.checked })} /><span style={{ margin: 0 }}>Home sample collection</span></label>}
                  {type === 'lab' && ops.homeCollection && <label className="pharmacy-settings-field"><span>Home collection fee (GHS)</span><input type="number" min="0" step="0.01" value={ops.homeCollectionFee} onChange={e => setOps({ ...ops, homeCollectionFee: e.target.value })} /></label>}
                </div>
                <h3 className="pharmacy-settings-heading" style={{ fontSize: '0.88rem', marginTop: '1rem' }}>Payment accepted</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {PAYMENTS.map(pm => <button key={pm} type="button" className={`pharmacy-settings-chip ${ops.payments.includes(pm) ? 'pharmacy-settings-tab--active' : ''}`} onClick={() => toggleIn('payments', pm)}>{ops.payments.includes(pm) ? '✓ ' : ''}{pm}</button>)}
                </div>
              </section>

              <div className="pharmacy-settings-rule pharmacy-settings-rule--inset" />
              <section className="pharmacy-settings-section pharmacy-settings-section--flush">
                <h2 className="pharmacy-settings-heading">Results & critical values</h2>
                <p className="pharmacy-settings-lead">Results go to the ordering doctor, who shares them with the patient. Critical values also alert the doctor automatically — record who on your side follows up by phone.</p>
                <div className="pharmacy-settings-grid">
                  <label className="pharmacy-settings-field"><span>Critical-value contact (name)</span><input value={ops.criticalName} onChange={e => setOps({ ...ops, criticalName: e.target.value })} /></label>
                  <label className="pharmacy-settings-field"><span>Critical-value phone</span><input value={ops.criticalPhone} onChange={e => setOps({ ...ops, criticalPhone: e.target.value })} /></label>
                  <label className="pharmacy-settings-field pharmacy-settings-field--full"><span>Results enquiries email</span><input type="email" value={ops.resultsEmail} onChange={e => setOps({ ...ops, resultsEmail: e.target.value })} /></label>
                  <label className="pharmacy-settings-field pharmacy-settings-field--full"><span>Note for patients (what to bring, parking, etc.)</span><textarea rows={3} value={ops.patientNote} onChange={e => setOps({ ...ops, patientNote: e.target.value })} placeholder="Bring your National ID and the doctor's order code." /></label>
                </div>
                <div className="pharmacy-settings-actions"><button type="submit" className="pharmacy-settings-btn pharmacy-settings-btn--primary" disabled={saving}>{saving ? 'Saving…' : 'Save operations'}</button></div>
              </section>
            </form>
          </div>
        )}

        {tab === 'preferences' && (
          <div className="pharmacy-settings-tab-panel" role="tabpanel">
            <section className="pharmacy-settings-section pharmacy-settings-section--flush">
              <h2 className="pharmacy-settings-heading">Regional &amp; display</h2>
              <p className="pharmacy-settings-lead">Your timezone comes from this device. Turnaround clocks and reports follow it.</p>
              <Alert t="preferences" />
              <dl className="pharmacy-settings-kv pharmacy-settings-kv--prefs">
                <div><dt>Device timezone</dt><dd><code className="pharmacy-settings-code">{tz()}</code></dd></div>
                <div><dt>Stored on account</dt><dd>{data?.settings?.timezone ? <code className="pharmacy-settings-code">{data.settings.timezone}</code> : '—'}</dd></div>
                <div><dt>Currency</dt><dd>GHS (Ghana cedi)</dd></div>
                <div><dt>Browser locale</dt><dd className="pharmacy-settings-mono">{typeof navigator !== 'undefined' ? navigator.language : '—'}</dd></div>
              </dl>
              <div className="pharmacy-settings-actions pharmacy-settings-actions--prefs">
                <button type="button" className="pharmacy-settings-btn pharmacy-settings-btn--secondary" disabled={saving} onClick={() => save('preferences', { settings: { timezone: tz() } })}>Refresh timezone from this device</button>
              </div>
            </section>
          </div>
        )}

        {tab === 'security' && (
          <div className="pharmacy-settings-tab-panel" role="tabpanel">
            <section className="pharmacy-settings-section pharmacy-settings-section--flush">
              <h2 className="pharmacy-settings-heading">Password</h2>
              <p className="pharmacy-settings-lead">Use a strong password you do not reuse elsewhere. Staff should not share one login.</p>
              <Alert t="security" />
              <form onSubmit={changePassword} className="pharmacy-settings-form">
                <div className="pharmacy-settings-grid">
                  <label className="pharmacy-settings-field pharmacy-settings-field--full"><span>Current password</span><input type="password" autoComplete="current-password" value={pw.cur} onChange={e => setPw({ ...pw, cur: e.target.value })} /></label>
                  <label className="pharmacy-settings-field"><span>New password</span><input type="password" autoComplete="new-password" value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} /></label>
                  <label className="pharmacy-settings-field"><span>Confirm new password</span><input type="password" autoComplete="new-password" value={pw.confirm} onChange={e => setPw({ ...pw, confirm: e.target.value })} /></label>
                </div>
                <div className="pharmacy-settings-actions"><button type="submit" className="pharmacy-settings-btn pharmacy-settings-btn--secondary" disabled={saving || !pw.cur || !pw.next}>{saving ? 'Updating…' : 'Change password'}</button></div>
              </form>
            </section>
            <div className="pharmacy-settings-rule pharmacy-settings-rule--inset" />
            <section className="pharmacy-settings-section pharmacy-settings-section--flush">
              <h2 className="pharmacy-settings-heading">Forgot your password?</h2>
              <p className="pharmacy-settings-lead">Send a reset link to {auth.currentUser?.email || profile?.email || 'your login email'}.{isBranch ? ' To change the login email itself, ask your parent centre.' : ''}</p>
              <div className="pharmacy-settings-actions"><button type="button" className="pharmacy-settings-btn pharmacy-settings-btn--secondary" onClick={resetLink}>Email reset link</button></div>
            </section>
          </div>
        )}

        {tab === 'data' && (
          <div className="pharmacy-settings-tab-panel" role="tabpanel">
            <section className="pharmacy-settings-section pharmacy-settings-section--flush">
              <h2 className="pharmacy-settings-heading">Data &amp; session</h2>
              <p className="pharmacy-settings-lead">Export your profile and settings as JSON. Order and result exports are under Reports and Results. Sign out ends this browser session.</p>
              <div className="pharmacy-settings-actions-row">
                <button type="button" className="pharmacy-settings-btn pharmacy-settings-btn--secondary" onClick={exportJson}>Download settings JSON</button>
                <button type="button" className="pharmacy-settings-btn pharmacy-settings-btn--secondary" onClick={() => navigate('/dashboard/reports')}>Go to Reports</button>
                <button type="button" className="pharmacy-settings-btn pharmacy-settings-btn--danger-outline" onClick={logout}>Sign out</button>
              </div>
              <p className="pharmacy-settings-footnote"><a href="/terms" className="pharmacy-settings-link">Terms</a>{' · '}<a href="/privacy" className="pharmacy-settings-link">Privacy</a></p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
