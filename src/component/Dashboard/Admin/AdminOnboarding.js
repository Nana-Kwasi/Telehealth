import React, { useState } from 'react';
import { api } from '../../../services/apiClient';
import { money, when, PREAUTH, SEVERITY, Pill, Modal, Empty, useLoad } from '../Insurer/insurerUi';
import Paged from '../../Common/Paged';

/**
 * Super admin onboarding for the insurance network:
 *  · insurers come with their first ADMIN login (they add their own staff);
 *  · facilities come with their admin login (they add their own clinicians);
 *  · every facility clinician's licence is checked here before they can prescribe.
 */
const A = '/api/v1/insurance/admin';

function Credentials({ c, onClose }) {
  if (!c) return null;
  return (
    <div className="dx-alert" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e3a8a' }}>
      <div style={{ flex: 1 }}><strong>Login created: {c.email}</strong>
        <p>Temporary password: <code>{c.temporaryPassword}</code> — share it securely. They must change it on first sign-in.</p></div>
      <button type="button" className="dx-btn dx-btn--sm" onClick={onClose}>Done</button>
    </div>
  );
}

export function OnboardInsurerModal({ adapters, onClose, onDone }) {
  const [f, setF] = useState({ name: '', code: '', adapter: adapters?.[0]?.key || 'SANDBOX', baseUrl: '', supportPhone: '', credentialsText: '', claimsMode: 'NESSAHUB', adminName: '', adminEmail: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const creds = {}; (f.credentialsText || '').split('\n').forEach(l => { const i = l.indexOf('='); if (i > 0) creds[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
    try {
      const r = await api(`${A}/onboard-insurer`, { method: 'POST', body: { adminName: f.adminName, adminEmail: f.adminEmail,
        insurer: { name: f.name, code: f.code, adapter: f.adapter, baseUrl: f.baseUrl || null, supportPhone: f.supportPhone || null, credentials: Object.keys(creds).length ? creds : null, claimsMode: f.claimsMode } } });
      onDone(r.admin);
    } catch (e) { alert(e?.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Onboard an insurer" sub="Creates the insurer, its adapter connection and its first admin login." onClose={onClose}
      footer={<><button type="button" className="dx-btn" onClick={onClose}>Cancel</button><button type="button" className="dx-btn dx-btn--primary" disabled={busy || !f.name || !f.code || !f.adminEmail || !f.adminName} onClick={save}>{busy ? 'Creating…' : 'Create insurer'}</button></>}>
      <div className="dx-two">
        <div className="dx-field"><label>Insurer name</label><input className="dx-input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
        <div className="dx-field"><label>Short code</label><input className="dx-input" value={f.code} onChange={e => setF({ ...f, code: e.target.value })} placeholder="e.g. ACME" /></div>
        <div className="dx-field"><label>Adapter (their API)</label><select className="dx-select" value={f.adapter} onChange={e => setF({ ...f, adapter: e.target.value })}>{(adapters || []).map(a => <option key={a.key} value={a.key}>{a.label}</option>)}</select></div>
        <div className="dx-field"><label>Claims decided</label><select className="dx-select" value={f.claimsMode} onChange={e => setF({ ...f, claimsMode: e.target.value })}><option value="NESSAHUB">On their NessaHub dashboard</option><option value="API">In their own system (via adapter)</option></select></div>
        <div className="dx-field"><label>API base URL</label><input className="dx-input" value={f.baseUrl} onChange={e => setF({ ...f, baseUrl: e.target.value })} /></div>
        <div className="dx-field"><label>Support phone</label><input className="dx-input" value={f.supportPhone} onChange={e => setF({ ...f, supportPhone: e.target.value })} /></div>
      </div>
      <div className="dx-field"><label>API credentials (stored encrypted)</label><textarea rows={2} style={{ fontFamily: 'monospace' }} value={f.credentialsText} onChange={e => setF({ ...f, credentialsText: e.target.value })} placeholder={'clientId=...\nclientSecret=...'} /></div>
      <div className="dx-two">
        <div className="dx-field"><label>Their admin — full name</label><input className="dx-input" value={f.adminName} onChange={e => setF({ ...f, adminName: e.target.value })} /></div>
        <div className="dx-field"><label>Their admin — work email</label><input className="dx-input" type="email" value={f.adminEmail} onChange={e => setF({ ...f, adminEmail: e.target.value })} /></div>
      </div>
    </Modal>
  );
}

export function InsurerStaffModal({ insurer, onClose }) {
  const { data, reload } = useLoad(() => api(`${A}/insurers/${insurer.id}/staff`), [insurer.id]);
  const [f, setF] = useState({ name: '', email: '', staffRole: 'ADMIN' });
  const [creds, setCreds] = useState(null);
  const add = async () => { try { setCreds(await api(`${A}/insurers/${insurer.id}/staff`, { method: 'POST', body: f })); setF({ name: '', email: '', staffRole: 'ADMIN' }); reload(); } catch (e) { alert(e?.message); } };
  return (
    <Modal title={`${insurer.name} — logins`} onClose={onClose} width={720}>
      <Credentials c={creds} onClose={() => setCreds(null)} />
      <table className="dx-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
        <tbody>{(data || []).map(u => <tr key={u.userId}><td><b>{u.name}</b></td><td>{u.email}</td><td>{u.staffRole}</td><td>{u.active ? 'Active' : 'Disabled'}</td></tr>)}</tbody></table>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <input className="dx-input" placeholder="Full name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
        <input className="dx-input" placeholder="Email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
        <select className="dx-select" value={f.staffRole} onChange={e => setF({ ...f, staffRole: e.target.value })}>{['ADMIN', 'CLAIMS_OFFICER', 'MEDICAL_REVIEWER', 'NETWORK_MANAGER', 'FINANCE', 'CARE_MANAGER', 'VIEWER'].map(r => <option key={r}>{r}</option>)}</select>
        <button type="button" className="dx-btn dx-btn--primary" disabled={!f.name || !f.email} onClick={add}>Add login</button>
      </div>
    </Modal>
  );
}

export function AdminFacilities() {
  const { data, reload } = useLoad(() => api(`${A}/facilities`), []);
  const [form, setForm] = useState(null);
  const [creds, setCreds] = useState(null);
  const create = async () => { try { const r = await api(`${A}/facilities`, { method: 'POST', body: form }); setCreds(r.admin); setForm(null); reload(); } catch (e) { alert(e?.message); } };
  const status = async (f, s) => { try { await api(`${A}/facilities/${f.id}`, { method: 'PATCH', body: { status: s } }); reload(); } catch (e) { alert(e?.message); } };
  return (
    <>
      <div className="dx-card-head"><p className="dx-card-hint" style={{ margin: 0 }}>Clinics, hospitals, dental, optical and physio. The facility admin adds their own clinicians; you verify each licence under Licence checks.</p>
        <button type="button" className="dx-btn dx-btn--primary" onClick={() => setForm({ name: '', type: 'CLINIC', city: '', address: '', phone: '', registrationNumber: '', adminName: '', adminEmail: '' })}>+ Add facility</button></div>
      <Credentials c={creds} onClose={() => setCreds(null)} />
      <div className="dx-card"><table className="dx-table"><thead><tr><th>Facility</th><th>Type</th><th>City</th><th>Staff</th><th>Visits 30d</th><th>Insurer networks</th><th>Status</th><th /></tr></thead>
        <tbody>{(data || []).length ? <Paged items={data} table>{(data) => data.map(f => <tr key={f.id}><td><b>{f.name}</b><div className="dx-card-hint">{f.phone || ''}</div></td><td>{f.type}</td><td>{f.city || '—'}</td><td>{f.staff}</td><td>{f.visits30d}</td><td>{f.networks}</td>
          <td><span className="dx-pill" style={f.status === 'APPROVED' ? { background: '#dcfce7', color: '#166534' } : { background: '#fee2e2', color: '#991b1b' }}>{String(f.status).toLowerCase()}</span></td>
          <td>{f.status === 'APPROVED' ? <button type="button" className="dx-btn dx-btn--sm dx-btn--danger" onClick={() => status(f, 'REJECTED')}>Suspend</button> : <button type="button" className="dx-btn dx-btn--sm" onClick={() => status(f, 'APPROVED')}>Approve</button>}</td></tr>)}</Paged>
          : <tr><td colSpan={8}><Empty>No facilities yet.</Empty></td></tr>}</tbody></table></div>
      {form && (
        <Modal title="Add facility" sub="Creates the facility and its admin login." onClose={() => setForm(null)}
          footer={<><button type="button" className="dx-btn" onClick={() => setForm(null)}>Cancel</button><button type="button" className="dx-btn dx-btn--primary" disabled={!form.name || !form.adminEmail || !form.adminName} onClick={create}>Create</button></>}>
          <div className="dx-two">
            <div className="dx-field"><label>Name</label><input className="dx-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="dx-field"><label>Type</label><select className="dx-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{['CLINIC', 'HOSPITAL', 'DENTAL', 'OPTICAL', 'PHYSIO'].map(t => <option key={t}>{t}</option>)}</select></div>
            <div className="dx-field"><label>City</label><input className="dx-input" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
            <div className="dx-field"><label>Address</label><input className="dx-input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            <div className="dx-field"><label>Phone</label><input className="dx-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="dx-field"><label>Facility licence / registration no.</label><input className="dx-input" value={form.registrationNumber} onChange={e => setForm({ ...form, registrationNumber: e.target.value })} placeholder="e.g. HeFRA number" /></div>
            <div className="dx-field"><label>Admin — full name</label><input className="dx-input" value={form.adminName} onChange={e => setForm({ ...form, adminName: e.target.value })} /></div>
            <div className="dx-field"><label>Admin — email</label><input className="dx-input" value={form.adminEmail} onChange={e => setForm({ ...form, adminEmail: e.target.value })} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}

export function AdminVerifications() {
  const [status, setStatus] = useState('PENDING');
  const { data, reload } = useLoad(() => api(`${A}/verifications${status ? `?status=${status}` : ''}`), [status]);
  const decide = async (v, decision) => {
    let notes = null;
    if (decision === 'REJECTED') { notes = window.prompt('Why is this licence not accepted? (shown to the clinician)'); if (!notes) return; }
    try { await api(`${A}/verifications/${v.userId}`, { method: 'POST', body: { decision, notes } }); reload(); } catch (e) { alert(e?.message); }
  };
  return (
    <>
      <div className="dx-tabs">{[['PENDING', 'To check'], ['VERIFIED', 'Verified'], ['REJECTED', 'Rejected'], ['', 'All']].map(([k, l]) => <button key={k || 'all'} type="button" className={`dx-tab ${status === k ? 'on' : ''}`} onClick={() => setStatus(k)}>{l}</button>)}</div>
      <div className="dx-card"><div className="dx-table-wrap"><table className="dx-table">
        <thead><tr><th>Clinician</th><th>Role</th><th>Licensing body</th><th>Licence no.</th><th>Expiry</th><th>Facility</th><th>Document</th><th>Status</th><th /></tr></thead>
        <tbody>{(data || []).length ? <Paged items={data} table>{(data) => data.map(v => <tr key={v.userId}><td><b>{v.name}</b><div className="dx-card-hint">{v.email}</div></td><td>{v.role}</td><td>{v.licenceBody}</td><td style={{ fontFamily: 'monospace' }}>{v.licenceNo}</td>
          <td style={{ color: v.expiringSoon ? '#b91c1c' : undefined }}>{v.licenceExpiry || '—'}</td><td className="dx-card-hint">{v.facilities || '—'}</td><td>{v.documentUrl ? <a href={v.documentUrl} target="_blank" rel="noreferrer">Open</a> : '—'}</td>
          <td>{String(v.status).toLowerCase()}{v.notes ? <div className="dx-card-hint">{v.notes}</div> : null}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{v.status !== 'VERIFIED' && <button type="button" className="dx-btn dx-btn--sm dx-btn--primary" onClick={() => decide(v, 'VERIFIED')}>Verify</button>} {v.status !== 'REJECTED' && <button type="button" className="dx-btn dx-btn--sm dx-btn--danger" onClick={() => decide(v, 'REJECTED')}>Reject</button>}</td></tr>)}</Paged>
          : <tr><td colSpan={9}><Empty>Nothing to check.</Empty></td></tr>}</tbody>
      </table></div></div>
      <p className="dx-card-hint">Check the number with the licensing body's register (e.g. Medical & Dental Council, Pharmacy Council, Allied Health Professions Council) before verifying.</p>
    </>
  );
}

export function AdminNetworkFraud() {
  const { data } = useLoad(() => api(`${A}/fraud`), []);
  return (
    <div className="dx-card"><div className="dx-table-wrap"><table className="dx-table">
      <thead><tr><th>Severity</th><th>Signal</th><th>Who</th><th>Detail</th><th>Claim</th><th>Status</th><th>When</th></tr></thead>
      <tbody>{(data || []).length ? <Paged items={data} table>{(data) => data.map(f => <tr key={f.id}><td><Pill map={SEVERITY} k={f.severity} /></td><td><b>{f.ruleLabel}</b></td><td>{f.subjectName}</td><td style={{ maxWidth: 360 }}>{f.detail}</td><td style={{ fontFamily: 'monospace' }}>{f.claimRef || '—'}</td><td>{String(f.status).toLowerCase()}</td><td className="dx-card-hint">{when(f.createdAt)}</td></tr>)}</Paged>
        : <tr><td colSpan={7}><Empty>No signals across the network.</Empty></td></tr>}</tbody>
    </table></div></div>
  );
}

export function AdminAllPreauth() {
  const { data } = useLoad(() => api(`${A}/preauth`), []);
  return (
    <div className="dx-card"><div className="dx-table-wrap"><table className="dx-table">
      <thead><tr><th>Ref</th><th>Insurer</th><th>Patient</th><th>Provider</th><th>Service</th><th>Amount</th><th>Status</th><th>Created</th></tr></thead>
      <tbody>{(data || []).length ? <Paged items={data} table>{(data) => data.map(p => <tr key={p.id} className={p.overdue ? 'dx-urgent' : ''}><td style={{ fontFamily: 'monospace' }}>{p.ref}</td><td>{p.insurerName}</td><td>{p.patientName}</td><td>{p.providerName}</td><td>{p.serviceType}</td><td>{money(p.estimatedAmount)}</td><td><Pill map={PREAUTH} k={p.status} />{p.overdue ? <div className="dx-card-hint" style={{ color: '#b91c1c' }}>past SLA</div> : null}</td><td className="dx-card-hint">{when(p.createdAt)}</td></tr>)}</Paged>
        : <tr><td colSpan={8}><Empty>No requests.</Empty></td></tr>}</tbody>
    </table></div></div>
  );
}
