import React, { useEffect, useState } from 'react';
import { Routes, Route, useLocation, useNavigate, useParams } from 'react-router-dom';
import { signOut } from '../../../services/authShim';
import { auth } from '../../../services/firestoreShim';
import { api } from '../../../services/apiClient';
import ForcedPasswordChangeOverlay from '../../Common/ForcedPasswordChangeOverlay';
import InsuranceNetworks from '../../Common/InsuranceNetworks';
import { ProviderClaims, ProviderPreauthList, PreauthRequestModal, AttachmentLinks, uploadAll } from '../../Common/ProviderInsurance';
import { money, when, Kpi, Modal, Page, Empty, useLoad } from '../Insurer/insurerUi';
import '../Pharmacy/PharmacyDashboard.css';
import RoleAssistant from '../../Common/RoleAssistant';
import Paged from '../../Common/Paged';

/**
 * Facility dashboard — clinic, hospital, dental, optical, physio. The insurance
 * side of a physical visit: check the member in (card checked live + SMS code to
 * their phone), record what was done, and bill the insurer with proof.
 */
const F = '/api/v1/facility';
const TYPE_ICON = { CLINIC: '🏥', HOSPITAL: '🏨', DENTAL: '🦷', OPTICAL: '👓', PHYSIO: '🦵' };
const VISIT_TYPES = { CLINIC: ['OUTPATIENT', 'MATERNITY'], HOSPITAL: ['OUTPATIENT', 'ADMISSION', 'MATERNITY'], DENTAL: ['DENTAL'], OPTICAL: ['OPTICAL'], PHYSIO: ['PHYSIO'] };
const STATUS = { CHECKED_IN: ['Checked in', '#e0f2fe', '#075985'], IN_PROGRESS: ['In progress', '#dbeafe', '#1e40af'], COMPLETED: ['Completed', '#dcfce7', '#166534'], CANCELLED: ['Cancelled', '#f1f5f9', '#475569'] };
const pill = (m, k) => { const v = m[k] || [k, '#f1f5f9', '#475569']; return <span className="dx-pill" style={{ background: v[1], color: v[2] }}>{v[0]}</span>; };

function Overview({ facility }) {
  const navigate = useNavigate();
  const { data: o } = useLoad(() => api(`${F}/overview`), []);
  if (!o) return <Page title="Overview"><Empty>Loading…</Empty></Page>;
  return (
    <Page title={`${TYPE_ICON[facility?.type] || '🏥'} ${o.facility?.name}`} sub="Today at your facility, and where your insurance money is."
      actions={<button type="button" className="dx-btn dx-btn--primary" onClick={() => navigate('/dashboard/check-in')}>+ Check in a patient</button>}>
      <div className="dx-today">
        <Kpi label="Visits today" value={o.today?.visits || 0} color="#1d4ed8" sub={`${o.today?.insured || 0} insured`} onClick={() => navigate('/dashboard/visits')} />
        <Kpi label="Open visits" value={o.today?.open || 0} color="#f59e0b" onClick={() => navigate('/dashboard/visits')} />
        <Kpi label="Claims in progress" value={o.claims?.pending || 0} color="#7c3aed" onClick={() => navigate('/dashboard/claims')} />
        <Kpi label="Queried by insurers" value={o.claims?.queried || 0} color="#dc2626" onClick={() => navigate('/dashboard/claims')} />
        <Kpi label="Approved, unpaid" value={money(o.claims?.approved_unpaid)} color="#0f766e" />
        <Kpi label="Paid (30 days)" value={money(o.claims?.paid30d)} color="#16a34a" />
        <Kpi label="Pre-auth open" value={o.preauth?.open || 0} color="#f59e0b" sub={`${o.preauth?.queried || 0} queried`} onClick={() => navigate('/dashboard/preauth')} />
        <Kpi label="Staff awaiting licence check" value={o.staffPending || 0} color="#64748b" onClick={() => navigate('/dashboard/staff')} />
      </div>
    </Page>
  );
}

function CheckIn({ facility }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [patient, setPatient] = useState(null);
  const [walkIn, setWalkIn] = useState(null);
  const [insurers, setInsurers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({ cardId: '', insurerId: '', memberNo: '', visitType: (VISIT_TYPES[facility?.type] || ['OUTPATIENT'])[0], complaint: '', attendingId: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api('/api/v1/insurance/insurers').then(setInsurers).catch(() => {});
    api(`${F}/staff`).then(s => setStaff((s || []).filter(x => x.active && x.staffRole !== 'FRONT_DESK' && x.staffRole !== 'ADMIN'))).catch(() => {});
  }, []);
  const search = async () => { try { setFound(await api(`${F}/patients?q=${encodeURIComponent(q)}`)); } catch (e) { alert(e?.message); } };
  const cardsOf = (p) => { try { return JSON.parse(p?.cardsJson || '[]') || []; } catch { return []; } };
  const pick = (p) => { setPatient(p); const v = cardsOf(p).find(c => c.status === 'VERIFIED'); setForm(f => ({ ...f, cardId: v?.cardId || '' })); };
  const createWalkIn = async () => {
    try { const p = await api(`${F}/patients`, { method: 'POST', body: walkIn }); setWalkIn(null); pick({ id: p.id, name: p.name, phone: p.phoneE164, cardsJson: '[]' }); } catch (e) { alert(e?.message); }
  };
  const go = async () => {
    setBusy(true);
    try {
      const v = await api(`${F}/visits`, { method: 'POST', body: { patientId: patient.id, cardId: form.cardId || null, insurerId: form.cardId ? null : form.insurerId || null,
        insurerMemberNo: form.cardId ? null : form.memberNo || null, visitType: form.visitType, complaint: form.complaint, attendingId: form.attendingId || null } });
      navigate(`/dashboard/visits/${v.id}`, { state: { otp: v } });
    } catch (e) { alert(e?.message); } finally { setBusy(false); }
  };
  return (
    <Page title="Check in" sub="Find the patient, check their insurance card with the insurer, and send a code to their phone to confirm it is really them.">
      <div className="dx-split">
        <div className="dx-card">
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="dx-input" style={{ flex: 1 }} placeholder="Phone, insurance card number or name" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} />
            <button type="button" className="dx-btn dx-btn--primary" onClick={search}>Find</button>
            <button type="button" className="dx-btn" onClick={() => setWalkIn({ fullName: '', phone: '', dateOfBirth: '' })}>+ New patient</button>
          </div>
          <ul className="dx-list" style={{ marginTop: 10 }}>{found.map(p => (
            <li key={p.id} className="dx-row" onClick={() => pick(p)} style={patient?.id === p.id ? { borderColor: '#1d4ed8', background: '#eff6ff' } : undefined}>
              <div className="dx-row-main"><div className="dx-row-title">{p.name}</div><div className="dx-row-meta">{p.phoneE164 || p.phone || ''}{p.phoneVerified ? ' · ✓ phone verified' : ''} · {cardsOf(p).map(c => `${c.insurerName} (${c.status.toLowerCase()})`).join(', ') || 'no insurance on file'}</div></div>
            </li>))}{q && !found.length && <Empty>Search to find the patient, or add them.</Empty>}</ul>
        </div>
        <div className="dx-card">
          {!patient ? <Empty>Choose a patient first.</Empty> : (
            <div style={{ display: 'grid', gap: 10 }}>
              <div><div className="dx-kpi-label">Patient</div><b>{patient.name}</b></div>
              <div className="dx-field"><label>Pays with</label>
                <select className="dx-select" value={form.cardId || (form.insurerId ? 'NEW' : '')} onChange={e => setForm({ ...form, cardId: e.target.value === 'NEW' || e.target.value === '' ? '' : e.target.value, insurerId: e.target.value === 'NEW' ? (insurers[0]?.id || '') : '' })}>
                  <option value="">Self-pay</option>
                  {cardsOf(patient).filter(c => c.status === 'VERIFIED').map(c => <option key={c.cardId} value={c.cardId}>{c.insurerName} · {c.planName || ''} · {c.memberNo}</option>)}
                  <option value="NEW">Insurance card (enter number)</option>
                </select></div>
              {!form.cardId && form.insurerId && (
                <div className="dx-two">
                  <div className="dx-field"><label>Insurer</label><select className="dx-select" value={form.insurerId} onChange={e => setForm({ ...form, insurerId: e.target.value })}>{insurers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
                  <div className="dx-field"><label>Card number</label><input className="dx-input" value={form.memberNo} onChange={e => setForm({ ...form, memberNo: e.target.value })} /></div>
                </div>)}
              <div className="dx-two">
                <div className="dx-field"><label>Visit</label><select className="dx-select" value={form.visitType} onChange={e => setForm({ ...form, visitType: e.target.value })}>{(VISIT_TYPES[facility?.type] || ['OUTPATIENT']).map(t => <option key={t}>{t}</option>)}</select></div>
                <div className="dx-field"><label>Seen by</label><select className="dx-select" value={form.attendingId} onChange={e => setForm({ ...form, attendingId: e.target.value })}><option value="">—</option>{staff.map(s => <option key={s.userId} value={s.userId}>{s.name} ({s.staffRole.toLowerCase()})</option>)}</select></div>
              </div>
              <div className="dx-field"><label>Reason for visit</label><input className="dx-input" value={form.complaint} onChange={e => setForm({ ...form, complaint: e.target.value })} /></div>
              <button type="button" className="dx-btn dx-btn--primary" disabled={busy} onClick={go}>{busy ? 'Checking with insurer…' : 'Check in'}</button>
            </div>
          )}
        </div>
      </div>
      {walkIn && (
        <Modal title="New patient" sub="They can claim their NessaHub account later with this phone number." onClose={() => setWalkIn(null)} width={520}
          footer={<><button type="button" className="dx-btn" onClick={() => setWalkIn(null)}>Cancel</button><button type="button" className="dx-btn dx-btn--primary" onClick={createWalkIn}>Add patient</button></>}>
          <div className="dx-field"><label>Full name (as on ID)</label><input className="dx-input" value={walkIn.fullName} onChange={e => setWalkIn({ ...walkIn, fullName: e.target.value })} /></div>
          <div className="dx-field"><label>Phone</label><input className="dx-input" value={walkIn.phone} onChange={e => setWalkIn({ ...walkIn, phone: e.target.value })} /></div>
        </Modal>
      )}
    </Page>
  );
}

function Visits() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const { data } = useLoad(() => api(`${F}/visits?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}) })}`), [status, q]);
  return (
    <Page title="Visits" actions={<button type="button" className="dx-btn dx-btn--primary" onClick={() => navigate('/dashboard/check-in')}>+ Check in</button>}>
      <div className="dx-tabs">{[['', 'All'], ['CHECKED_IN', 'Checked in'], ['IN_PROGRESS', 'In progress'], ['COMPLETED', 'Completed']].map(([k, l]) => <button key={k || 'all'} type="button" className={`dx-tab ${status === k ? 'on' : ''}`} onClick={() => setStatus(k)}>{l}</button>)}
        <input className="dx-input" style={{ marginLeft: 'auto', minWidth: 220 }} placeholder="Patient or visit ref" value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="dx-card"><div className="dx-table-wrap"><table className="dx-table">
        <thead><tr><th>Ref</th><th>When</th><th>Patient</th><th>Visit</th><th>Payer</th><th>Member check</th><th>Total</th><th>Status</th><th>Claim</th></tr></thead>
        <tbody>{(data || []).length ? <Paged items={data} table>{(data) => data.map(v => (
          <tr key={v.id} className="dx-click" onClick={() => navigate(`/dashboard/visits/${v.id}`)}><td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{v.ref}</td><td className="dx-card-hint">{when(v.createdAt)}</td><td><b>{v.patientName}</b><div className="dx-card-hint">{v.attendingName || ''}</div></td>
            <td>{v.visitType}</td><td>{v.payer === 'INSURANCE' ? v.insurerName : 'Self-pay'}</td><td>{v.payer === 'INSURANCE' ? (v.memberVerified ? '✓' : <span style={{ color: '#b45309' }}>pending</span>) : '—'}</td><td>{money(v.total)}</td><td>{pill(STATUS, v.status)}</td><td className="dx-card-hint">{v.claimRef ? `${v.claimRef} · ${String(v.claimStatus).toLowerCase()}` : ''}</td></tr>
        ))}</Paged> : <tr><td colSpan={9}><Empty>No visits.</Empty></td></tr>}</tbody>
      </table></div></div>
    </Page>
  );
}

const TEETH = [[18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28], [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]];
const TOOTH_STATES = ['', 'caries', 'filled', 'extracted', 'crown', 'root canal'];
const TOOTH_COLOR = { caries: '#f59e0b', filled: '#3b82f6', extracted: '#94a3b8', crown: '#a855f7', 'root canal': '#ef4444' };

function Specialty({ type, spec, onChange, locked }) {
  const set = (k, v) => onChange({ ...spec, [k]: v });
  if (type === 'DENTAL') {
    const chart = spec.toothChart || {};
    return (<div><div className="dx-kpi-label" style={{ marginBottom: 6 }}>Tooth chart (FDI) — click to cycle</div>
      {TEETH.map((row, r) => <div key={r} style={{ display: 'grid', gridTemplateColumns: 'repeat(16, 1fr)', gap: 3, marginBottom: 4 }}>{row.map(t => {
        const st = chart[t] || '';
        return <button key={t} type="button" disabled={locked} title={st || 'healthy'} onClick={() => set('toothChart', { ...chart, [t]: TOOTH_STATES[(TOOTH_STATES.indexOf(st) + 1) % TOOTH_STATES.length] })}
          style={{ padding: '0.35rem 0', borderRadius: 6, border: '1.5px solid #e2e8f0', background: TOOTH_COLOR[st] || '#fff', color: st ? '#fff' : '#334155', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer' }}>{t}</button>;
      })}</div>)}
      <div className="dx-card-hint">{Object.entries(TOOTH_COLOR).map(([k, c]) => <span key={k} style={{ marginRight: 10 }}><span style={{ display: 'inline-block', width: 10, height: 10, background: c, borderRadius: 2 }} /> {k}</span>)}</div></div>);
  }
  if (type === 'OPTICAL') {
    const rx = spec.refraction || {};
    const cell = (eye, k) => <input className="dx-input" disabled={locked} style={{ width: '100%' }} value={rx[eye]?.[k] || ''} onChange={e => set('refraction', { ...rx, [eye]: { ...(rx[eye] || {}), [k]: e.target.value } })} />;
    return (<div><div className="dx-kpi-label" style={{ marginBottom: 6 }}>Eye test</div>
      <table className="dx-table"><thead><tr><th /><th>Sphere</th><th>Cylinder</th><th>Axis</th><th>Add</th><th>VA</th></tr></thead>
        <tbody>{[['OD', 'Right (OD)'], ['OS', 'Left (OS)']].map(([e, l]) => <tr key={e}><td><b>{l}</b></td>{['sph', 'cyl', 'axis', 'add', 'va'].map(k => <td key={k}>{cell(e, k)}</td>)}</tr>)}</tbody></table>
      <div className="dx-two"><div className="dx-field"><label>Lens type</label><input className="dx-input" disabled={locked} value={spec.lensType || ''} onChange={e => set('lensType', e.target.value)} placeholder="Single vision / bifocal / progressive" /></div>
        <div className="dx-field"><label>Frame</label><input className="dx-input" disabled={locked} value={spec.frame || ''} onChange={e => set('frame', e.target.value)} /></div></div></div>);
  }
  if (type === 'PHYSIO') {
    return (<div className="dx-two">
      <div className="dx-field"><label>Session number</label><input className="dx-input" type="number" disabled={locked} value={spec.session || ''} onChange={e => set('session', e.target.value)} /></div>
      <div className="dx-field"><label>Sessions in plan</label><input className="dx-input" type="number" disabled={locked} value={spec.sessionsPlanned || ''} onChange={e => set('sessionsPlanned', e.target.value)} /></div>
      <div className="dx-field" style={{ gridColumn: '1 / -1' }}><label>Treatment plan / progress</label><textarea rows={2} disabled={locked} value={spec.plan || ''} onChange={e => set('plan', e.target.value)} /></div>
    </div>);
  }
  if (type === 'ADMISSION' || type === 'MATERNITY') {
    return (<div className="dx-two">
      <div className="dx-field"><label>Ward / bed</label><input className="dx-input" disabled={locked} value={spec.ward || ''} onChange={e => set('ward', e.target.value)} /></div>
      <div className="dx-field"><label>Admitting doctor's note</label><input className="dx-input" disabled={locked} value={spec.admissionNote || ''} onChange={e => set('admissionNote', e.target.value)} /></div>
      {type === 'MATERNITY' && <div className="dx-field"><label>Delivery</label><select className="dx-select" disabled={locked} value={spec.delivery || ''} onChange={e => set('delivery', e.target.value)}><option value="">—</option><option>Antenatal visit</option><option>Normal delivery</option><option>Caesarean section</option><option>Postnatal visit</option></select></div>}
    </div>);
  }
  const v = spec.vitals || {};
  return (<div><div className="dx-kpi-label" style={{ marginBottom: 6 }}>Vitals</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6 }}>
    {[['bp', 'BP'], ['pulse', 'Pulse'], ['temp', 'Temp °C'], ['weight', 'Weight kg'], ['spo2', 'SpO₂ %']].map(([k, l]) => <div key={k} className="dx-field"><label>{l}</label><input className="dx-input" disabled={locked} value={v[k] || ''} onChange={e => set('vitals', { ...v, [k]: e.target.value })} /></div>)}</div></div>);
}

function VisitWorkspace() {
  const { visitId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: v, setData, reload } = useLoad(() => api(`${F}/visits/${visitId}`), [visitId]);
  const { data: services } = useLoad(() => api(`${F}/services`), []);
  const [otpInfo, setOtpInfo] = useState(location.state?.otp || null);
  const [code, setCode] = useState('');
  const [idCheck, setIdCheck] = useState({ idType: 'Ghana Card', idLast4: '' });
  const [item, setItem] = useState({ serviceId: '', description: '', unitPrice: '', quantity: 1, tooth: '' });
  const [draft, setDraft] = useState(null);
  const [cover, setCover] = useState(null);
  const [preauth, setPreauth] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (v && !draft) setDraft({ complaint: v.complaint || '', diagnosisIcd: v.diagnosisIcd || '', diagnosisText: v.diagnosisText || '', notes: v.notes || '', specialty: v.specialty || {} }); }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!v || !draft) return <Page title="Visit"><Empty>Loading…</Empty></Page>;
  const locked = ['COMPLETED', 'CANCELLED'].includes(v.status);
  const call = async (fn) => { setBusy(true); try { const r = await fn(); if (r && r.id) setData(r); return r; } catch (e) { alert(e?.message); return null; } finally { setBusy(false); } };
  const saveDraft = () => call(() => api(`${F}/visits/${visitId}`, { method: 'PATCH', body: { ...draft } }));
  const addItem = () => call(async () => { const r = await api(`${F}/visits/${visitId}/items`, { method: 'POST', body: { serviceId: item.serviceId || null, description: item.description || null, unitPrice: item.unitPrice === '' ? null : Number(item.unitPrice), quantity: Number(item.quantity) || 1, tooth: item.tooth || null } }); setItem({ serviceId: '', description: '', unitPrice: '', quantity: 1, tooth: '' }); setCover(null); return r; });
  const attach = async (fileList) => {
    const fs = Array.from(fileList || []);
    if (!fs.length) return;
    await call(async () => {
      const urls = await uploadAll(fs, 'facility-visits');
      return api(`${F}/visits/${visitId}`, { method: 'PATCH', body: { ...draft, attachments: [...(v.attachments || []), ...urls] } });
    });
  };
  const removeItem = (id) => call(async () => { setCover(null); return api(`${F}/visits/${visitId}/items/${id}`, { method: 'DELETE' }); });
  const checkCover = async () => { await saveDraft(); try { setCover(await api(`${F}/visits/${visitId}/cover`)); } catch (e) { alert(e?.message); } };
  const complete = async () => { await saveDraft(); const r = await call(() => api(`${F}/visits/${visitId}/complete`, { method: 'POST' })); if (r) reload(); };
  const insured = v.payer === 'INSURANCE';
  return (
    <Page title={<>{v.patientName} {pill(STATUS, v.status)}</>} sub={`${v.ref} · ${v.visitType} · ${insured ? v.insurerName : 'Self-pay'} · checked in ${when(v.createdAt)}`}
      actions={<button type="button" className="dx-btn" onClick={() => navigate('/dashboard/visits')}>← Visits</button>}>
      {insured && !v.memberVerified && !locked && (
        <div className="dx-alert dx-alert--amber">
          <span style={{ fontSize: '1.4rem' }}>🔐</span>
          <div style={{ flex: 1 }}><strong>Confirm it is the member</strong>
            <p>{otpInfo?.otpSent ? `A code was sent to ${otpInfo.phone}. Ask the patient for it.` : (otpInfo?.otpNote || 'Send a code to the member’s phone, or record an ID check.')}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              <input className="dx-input" style={{ width: 120, letterSpacing: '0.2em' }} placeholder="6-digit code" value={code} onChange={e => setCode(e.target.value)} />
              <button type="button" className="dx-btn dx-btn--primary" disabled={busy || code.length < 6} onClick={() => call(() => api(`${F}/visits/${visitId}/verify`, { method: 'POST', body: { code } }))}>Confirm code</button>
              <button type="button" className="dx-btn" disabled={busy} onClick={async () => setOtpInfo(await api(`${F}/visits/${visitId}/otp`, { method: 'POST' }).catch(e => ({ otpNote: e.message })))}>{otpInfo?.otpSent ? 'Resend' : 'Send code'}</button>
              <span className="dx-card-hint" style={{ alignSelf: 'center' }}>or ID check:</span>
              <select className="dx-select" value={idCheck.idType} onChange={e => setIdCheck({ ...idCheck, idType: e.target.value })}><option>Ghana Card</option><option>Passport</option><option>Driver's licence</option><option>Voter ID</option></select>
              <input className="dx-input" style={{ width: 110 }} placeholder="Last 4 digits" value={idCheck.idLast4} onChange={e => setIdCheck({ ...idCheck, idLast4: e.target.value })} />
              <button type="button" className="dx-btn" disabled={busy || idCheck.idLast4.length < 3} onClick={() => call(() => api(`${F}/visits/${visitId}/id-check`, { method: 'POST', body: idCheck }))}>Record ID check</button>
            </div></div>
        </div>
      )}
      <div className="dx-split">
        <div style={{ display: 'grid', gap: 12 }}>
          <section className="dx-card" style={{ display: 'grid', gap: 10 }}>
            <div className="dx-field"><label>Reason for visit</label><input className="dx-input" disabled={locked} value={draft.complaint} onChange={e => setDraft({ ...draft, complaint: e.target.value })} /></div>
            <div className="dx-two">
              <div className="dx-field"><label>Diagnosis (ICD-10){insured ? ' *' : ''}</label><input className="dx-input" disabled={locked} value={draft.diagnosisIcd} onChange={e => setDraft({ ...draft, diagnosisIcd: e.target.value })} placeholder="e.g. K04.7" /></div>
              <div className="dx-field"><label>Diagnosis (words)</label><input className="dx-input" disabled={locked} value={draft.diagnosisText} onChange={e => setDraft({ ...draft, diagnosisText: e.target.value })} /></div>
            </div>
            <Specialty type={v.visitType} spec={draft.specialty} locked={locked} onChange={(specialty) => setDraft({ ...draft, specialty })} />
            <div className="dx-field"><label>Notes</label><textarea rows={2} disabled={locked} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></div>
            {!locked && <div><button type="button" className="dx-btn" disabled={busy} onClick={saveDraft}>Save</button></div>}
          </section>
          <section className="dx-card">
            <div className="dx-card-head"><h2 className="dx-card-title">Services given</h2></div>
            <table className="dx-table"><thead><tr><th>Service</th><th>Code</th>{v.visitType === 'DENTAL' && <th>Tooth</th>}<th>Qty</th><th>Unit</th><th>Amount</th>{!locked && <th />}</tr></thead>
              <tbody>{(v.items || []).map(i => <tr key={i.id}><td><b>{i.description}</b></td><td className="dx-card-hint">{i.code || ''}</td>{v.visitType === 'DENTAL' && <td>{i.tooth || ''}</td>}<td>{Number(i.quantity)}</td><td>{money(i.unitPrice)}</td><td>{money(i.amount)}</td>{!locked && <td><button type="button" className="dx-btn dx-btn--sm" onClick={() => removeItem(i.id)}>✕</button></td>}</tr>)}
                {!(v.items || []).length && <tr><td colSpan={7}><Empty>Nothing added yet.</Empty></td></tr>}</tbody></table>
            {!locked && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                <select className="dx-select" value={item.serviceId} onChange={e => setItem({ ...item, serviceId: e.target.value })}><option value="">Other (type below)…</option>{(services || []).filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name} · {money(s.price)}</option>)}</select>
                {!item.serviceId && <><input className="dx-input" placeholder="Description" value={item.description} onChange={e => setItem({ ...item, description: e.target.value })} /><input className="dx-input" style={{ width: 100 }} type="number" placeholder="Price" value={item.unitPrice} onChange={e => setItem({ ...item, unitPrice: e.target.value })} /></>}
                <input className="dx-input" style={{ width: 70 }} type="number" value={item.quantity} onChange={e => setItem({ ...item, quantity: e.target.value })} />
                {v.visitType === 'DENTAL' && <input className="dx-input" style={{ width: 80 }} placeholder="Tooth" value={item.tooth} onChange={e => setItem({ ...item, tooth: e.target.value })} />}
                <button type="button" className="dx-btn dx-btn--primary" disabled={busy || (!item.serviceId && (!item.description || item.unitPrice === ''))} onClick={addItem}>Add</button>
              </div>)}
          </section>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          <section className="dx-card">
            <div className="dx-card-head"><h2 className="dx-card-title">{insured ? 'Insurance' : 'Payment'}</h2></div>
            <div className="dx-kpi-value" style={{ fontSize: '1.4rem' }}>{money((v.items || []).reduce((s, i) => s + Number(i.amount), 0))}</div>
            {insured ? (<>
              <p className="dx-card-hint">{v.insurerName} · member {v.memberVerified ? '✓ confirmed' : 'not yet confirmed'}</p>
              {cover && <div style={{ borderRadius: 10, padding: '0.6rem 0.75rem', margin: '8px 0', background: ['COVERED', 'PARTIAL'].includes(cover.outcome) ? '#f0fdf4' : '#fef2f2', border: '1px solid #e2e8f0', fontSize: '0.84rem' }}>
                <b>{cover.outcome === 'COVERED' ? 'Covered' : cover.outcome === 'PARTIAL' ? 'Partly covered' : 'Not covered'}</b>{cover.reason ? ` — ${cover.reason}` : ''}
                <div>Insurer pays <b>{money(cover.coveredTotal)}</b> · patient pays <b>{money(cover.patientTotal)}</b></div>
                {(cover.lines || []).filter(l => l.reason).map(l => <div key={l.medIndex} className="dx-card-hint">⚠ {l.name}: {l.reason}</div>)}</div>}
              {!locked && <div style={{ display: 'grid', gap: 6 }}>
                <button type="button" className="dx-btn" disabled={busy || !(v.items || []).length} onClick={checkCover}>Check cover</button>
                <button type="button" className="dx-btn" onClick={() => setPreauth(true)}>Ask insurer for approval</button>
                <button type="button" className="dx-btn dx-btn--primary" disabled={busy || !(v.items || []).length} onClick={complete}>Complete & bill insurer</button>
              </div>}
            </>) : !locked && <button type="button" className="dx-btn dx-btn--primary" disabled={busy || !(v.items || []).length} onClick={complete}>Complete visit</button>}
            {locked && v.claimRef && <p className="dx-card-hint">Claim {v.claimRef} · {String(v.claimStatus).toLowerCase()} — the patient has been asked to confirm the visit.</p>}
          </section>
          <section className="dx-card">
            <div className="dx-card-head"><h2 className="dx-card-title">Documents</h2></div>
            <p className="dx-card-hint" style={{ marginTop: 0 }}>Results, X-rays, referral letters, discharge summary, signed consent. {insured ? 'Sent to the insurer with the claim.' : ''}</p>
            {(v.attachments || []).length ? <AttachmentLinks list={v.attachments} /> : <Empty>No documents yet.</Empty>}
            {!locked && <label className="dx-btn" style={{ marginTop: 8, display: 'inline-block', cursor: busy ? 'wait' : 'pointer' }}>{busy ? 'Uploading…' : '📎 Add documents'}
              <input type="file" multiple hidden accept="application/pdf,image/*,.doc,.docx" disabled={busy} onChange={e => { attach(e.target.files); e.target.value = ''; }} /></label>}
          </section>
        </div>
      </div>
      {preauth && <PreauthRequestModal patientId={v.patientId} patientName={v.patientName} cards={[{ id: v.cardId, insurerName: v.insurerName, memberNo: '', planName: '' }]} cardId={v.cardId}
        serviceType={{ OUTPATIENT: 'CONSULT', ADMISSION: 'HOSPITAL', MATERNITY: 'HOSPITAL' }[v.visitType] || v.visitType} sourceType="VISIT" sourceId={v.id}
        initialItems={(v.items || []).map(i => ({ description: i.description, code: i.code || '', quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) }))}
        diagnosisIcd={draft.diagnosisIcd} diagnosisText={draft.diagnosisText} createPath={`${F}/preauth`} onClose={() => setPreauth(false)} onDone={() => { setPreauth(false); alert('Request sent. You will be notified of the decision.'); }} />}
    </Page>
  );
}

function Services() {
  const { data, setData } = useLoad(() => api(`${F}/services`), []);
  const [edit, setEdit] = useState(null);
  const save = async () => { try { setData(await api(`${F}/services`, { method: 'PUT', body: { ...edit, price: Number(edit.price) } })); setEdit(null); } catch (e) { alert(e?.message); } };
  return (
    <Page title="Services & prices" sub="Your price list. Use the insurer's service codes where you have them, so tariffs match."
      actions={<button type="button" className="dx-btn dx-btn--primary" onClick={() => setEdit({ serviceType: '', code: '', name: '', price: '', requiresPreauth: false, active: true })}>+ Service</button>}>
      <div className="dx-card"><table className="dx-table"><thead><tr><th>Type</th><th>Code</th><th>Service</th><th>Price</th><th>Pre-approval</th><th>Active</th></tr></thead>
        <tbody>{(data || []).length ? <Paged items={data} table>{(data) => data.map(s => <tr key={s.id} className="dx-click" onClick={() => setEdit({ ...s })}><td>{s.serviceType}</td><td style={{ fontFamily: 'monospace' }}>{s.code}</td><td><b>{s.name}</b></td><td>{money(s.price)}</td><td>{s.requiresPreauth ? 'Yes' : '—'}</td><td>{s.active ? '✓' : '—'}</td></tr>)}</Paged>
          : <tr><td colSpan={6}><Empty>Add the services you charge for.</Empty></td></tr>}</tbody></table></div>
      {edit && (
        <Modal title={edit.id ? 'Edit service' : 'Add service'} onClose={() => setEdit(null)} width={560} footer={<><button type="button" className="dx-btn" onClick={() => setEdit(null)}>Cancel</button><button type="button" className="dx-btn dx-btn--primary" onClick={save}>Save</button></>}>
          <div className="dx-two">
            <div className="dx-field"><label>Type</label><select className="dx-select" value={edit.serviceType} onChange={e => setEdit({ ...edit, serviceType: e.target.value })}><option value="">Default for facility</option>{['CONSULT', 'DENTAL', 'OPTICAL', 'PHYSIO', 'HOSPITAL', 'LAB', 'SCAN'].map(t => <option key={t}>{t}</option>)}</select></div>
            <div className="dx-field"><label>Code</label><input className="dx-input" value={edit.code} onChange={e => setEdit({ ...edit, code: e.target.value })} /></div>
            <div className="dx-field"><label>Name</label><input className="dx-input" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></div>
            <div className="dx-field"><label>Price (GHS)</label><input className="dx-input" type="number" value={edit.price} onChange={e => setEdit({ ...edit, price: e.target.value })} /></div>
          </div>
          <label style={{ display: 'flex', gap: 6, fontSize: '0.84rem' }}><input type="checkbox" checked={!!edit.requiresPreauth} onChange={e => setEdit({ ...edit, requiresPreauth: e.target.checked })} /> Usually needs insurer pre-approval</label>
          <label style={{ display: 'flex', gap: 6, fontSize: '0.84rem' }}><input type="checkbox" checked={edit.active !== false} onChange={e => setEdit({ ...edit, active: e.target.checked })} /> Active</label>
        </Modal>
      )}
    </Page>
  );
}

function Staff({ facility }) {
  const { data, setData } = useLoad(() => api(`${F}/staff`), []);
  const [form, setForm] = useState(null);
  const [created, setCreated] = useState(null);
  const isAdmin = ['OWNER', 'ADMIN'].includes(facility?.staffRole);
  const add = async () => { try { const r = await api(`${F}/staff`, { method: 'POST', body: form }); setCreated(r); setForm(null); setData(await api(`${F}/staff`)); } catch (e) { alert(e?.message); } };
  const toggle = async (s) => { try { setData(await api(`${F}/staff/${s.id}`, { method: 'PATCH', body: { active: !s.active } })); } catch (e) { alert(e?.message); } };
  const clinical = (r) => ['DOCTOR', 'DENTIST', 'OPTOMETRIST', 'PHYSIOTHERAPIST', 'NURSE'].includes(r);
  return (
    <Page title="Staff" sub="Add your clinicians and front desk. NessaHub verifies each clinician's licence before they can prescribe or be billed for."
      actions={isAdmin && <button type="button" className="dx-btn dx-btn--primary" onClick={() => setForm({ fullName: '', email: '', phone: '', staffRole: 'DOCTOR', title: '', licenceBody: 'Medical & Dental Council', licenceNo: '', licenceExpiry: '' })}>+ Add staff</button>}>
      {created && <div className="dx-alert" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e3a8a' }}><div><strong>{created.email}</strong><p>{created.temporaryPassword ? <>Temporary password: <code>{created.temporaryPassword}</code> — they must change it on first sign-in. </> : 'Existing account linked. '}{created.verification === 'PENDING' ? 'Licence sent to NessaHub for verification.' : ''}</p></div><button type="button" className="dx-btn dx-btn--sm" onClick={() => setCreated(null)}>Done</button></div>}
      <div className="dx-card"><table className="dx-table"><thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Licence</th><th>Verification</th><th>Status</th></tr></thead>
        <tbody>{(data || []).map(s => <tr key={s.id}><td><b>{s.name}</b><div className="dx-card-hint">{s.title || ''}</div></td><td>{s.staffRole}</td><td>{s.email}</td><td className="dx-card-hint">{s.licenceNo ? `${s.licenceBody} · ${s.licenceNo}` : '—'}</td>
          <td><span className="dx-pill" style={s.verification === 'VERIFIED' ? { background: '#dcfce7', color: '#166534' } : s.verification === 'REJECTED' ? { background: '#fee2e2', color: '#991b1b' } : s.verification === 'PENDING' ? { background: '#fef3c7', color: '#92400e' } : { background: '#f1f5f9', color: '#475569' }}>{s.verification.toLowerCase().replace('_', ' ')}</span>{s.verificationNotes ? <div className="dx-card-hint">{s.verificationNotes}</div> : null}</td>
          <td>{isAdmin ? <button type="button" className="dx-btn dx-btn--sm" onClick={() => toggle(s)}>{s.active ? 'Disable' : 'Enable'}</button> : (s.active ? 'Active' : 'Disabled')}</td></tr>)}</tbody></table></div>
      {form && (
        <Modal title="Add staff" onClose={() => setForm(null)} width={640} footer={<><button type="button" className="dx-btn" onClick={() => setForm(null)}>Cancel</button><button type="button" className="dx-btn dx-btn--primary" onClick={add}>Create</button></>}>
          <div className="dx-two">
            <div className="dx-field"><label>Full name</label><input className="dx-input" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} /></div>
            <div className="dx-field"><label>Role</label><select className="dx-select" value={form.staffRole} onChange={e => setForm({ ...form, staffRole: e.target.value })}>{['DOCTOR', 'DENTIST', 'OPTOMETRIST', 'PHYSIOTHERAPIST', 'NURSE', 'FRONT_DESK', 'ADMIN'].map(r => <option key={r}>{r}</option>)}</select></div>
            <div className="dx-field"><label>Email (their login)</label><input className="dx-input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div className="dx-field"><label>Phone</label><input className="dx-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="dx-field"><label>Title</label><input className="dx-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Medical officer" /></div>
            {clinical(form.staffRole) && <>
              <div className="dx-field"><label>Licensing body</label><input className="dx-input" value={form.licenceBody} onChange={e => setForm({ ...form, licenceBody: e.target.value })} /></div>
              <div className="dx-field"><label>Licence number</label><input className="dx-input" value={form.licenceNo} onChange={e => setForm({ ...form, licenceNo: e.target.value })} /></div>
              <div className="dx-field"><label>Licence expiry</label><input className="dx-input" type="date" value={form.licenceExpiry} onChange={e => setForm({ ...form, licenceExpiry: e.target.value })} /></div>
            </>}
          </div>
        </Modal>
      )}
    </Page>
  );
}

export default function FacilityDashboard({ profile }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [facility, setFacility] = useState(null);
  useEffect(() => { api(`${F}/overview`).then(o => setFacility(o.facility)).catch(() => setFacility({ error: true })); }, []);
  const nav = [['/dashboard', 'Overview', '📊'], ['/dashboard/check-in', 'Check in', '🪪'], ['/dashboard/visits', 'Visits', '📋'], ['/dashboard/preauth', 'Pre-authorisation', '✅'],
    ['/dashboard/claims', 'Insurance claims', '🧾'], ['/dashboard/services', 'Services & prices', '🏷️'], ['/dashboard/staff', 'Staff', '🧑‍⚕️'], ['/dashboard/insurance', 'Insurance networks', '🛡️']];
  const isActive = (p) => (p === '/dashboard' ? location.pathname === '/dashboard' : location.pathname.startsWith(p));
  const logout = async () => { try { await signOut(auth); navigate('/'); } catch (_) {} };
  if (facility?.error) return <div style={{ padding: '3rem', textAlign: 'center' }}><h2>This account is not linked to a facility.</h2><button type="button" onClick={logout}>Log out</button></div>;
  return (
    <div className="pharmacy-dashboard">
      <aside className="pharmacy-sidebar">
        <div className="pharmacy-sidebar-header">
          <div className="pharmacy-logo"><span>{TYPE_ICON[facility?.type] || '🏥'}</span><h2>NessaHub</h2><span className="pharmacy-logo-badge">{facility?.type ? facility.type.charAt(0) + facility.type.slice(1).toLowerCase() : 'Facility'}</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="pharmacy-avatar">{(facility?.name || profile?.facilityName || 'F')[0].toUpperCase()}</div>
            <div><p className="pharmacy-user-name">{facility?.name || profile?.facilityName || 'Facility'}</p><p className="pharmacy-user-role">{profile?.fullName || ''} · {(facility?.staffRole || '').toLowerCase().replace('_', ' ')}</p></div>
          </div>
        </div>
        <nav className="pharmacy-nav"><div className="pharmacy-nav-section"><h3>Navigation</h3><ul className="pharmacy-nav-list">
          {nav.map(([p, l, i]) => <li key={p}><button type="button" className={`pharmacy-nav-item ${isActive(p) ? 'active' : ''}`} onClick={() => navigate(p)}><span>{i}</span><span>{l}</span></button></li>)}
        </ul></div></nav>
        <div className="pharmacy-sidebar-footer"><button type="button" className="pharmacy-logout-btn" onClick={logout}>🚪 Logout</button></div>
      </aside>
      <main className="pharmacy-main">
        <RoleAssistant kind="facility" accent="#0f766e" />
        <ForcedPasswordChangeOverlay profile={profile} firestoreCollection="auth" />
        <Routes>
          <Route path="/" element={<Overview facility={facility} />} />
          <Route path="/check-in" element={<CheckIn facility={facility} />} />
          <Route path="/visits/:visitId" element={<VisitWorkspace />} />
          <Route path="/visits" element={<Visits />} />
          <Route path="/preauth" element={<ProviderPreauthList listPath={`${F}/preauth`} />} />
          <Route path="/claims" element={<ProviderClaims />} />
          <Route path="/services" element={<Services />} />
          <Route path="/staff" element={<Staff facility={facility} />} />
          <Route path="/insurance" element={<div className="pharmacy-page"><InsuranceNetworks accent="#1d4ed8" /></div>} />
        </Routes>
      </main>
    </div>
  );
}
