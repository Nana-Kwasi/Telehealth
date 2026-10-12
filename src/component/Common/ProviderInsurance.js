import React, { useEffect, useState } from 'react';
import { api } from '../../services/apiClient';
import { ref as storageRef, uploadBytes, getDownloadURL, storage } from '../../services/firestoreShim';
import { money, when, CLAIM, PREAUTH, FLAG_LABEL, flagsOf, Pill, Kpi, Modal, Page, Empty, useLoad } from '../Dashboard/Insurer/insurerUi';
import Paged from './Paged';

/**
 * Insurance screens every provider shares (pharmacy, branch, lab, scan, doctor,
 * facility): their claims with status, payments and insurer queries; their
 * pre-authorisation requests; and the "ask for approval" form.
 */
const I = '/api/v1/insurance';

export function ProviderClaims({ title = 'Insurance claims' }) {
  const [status, setStatus] = useState('');
  const { data, reload } = useLoad(() => api(`${I}/provider/claims${status ? `?status=${status}` : ''}`), [status]);
  const [open, setOpen] = useState(null);
  const rows = data || [];
  const sum = (st) => rows.filter(r => st.includes(r.status)).reduce((s, r) => s + Number(r.insurerAmount || 0), 0);
  return (
    <Page title={title} sub="Every claim billed to an insurer, with the member's confirmation, the insurer's decision and payment.">
      <div className="dx-today">
        <Kpi label="In progress" value={money(sum(['AWAITING_PATIENT', 'CONFIRMED', 'SUBMITTED']))} color="#7c3aed" onClick={() => setStatus('SUBMITTED')} />
        <Kpi label="Queried — answer needed" value={rows.filter(r => r.status === 'QUERIED').length} color="#f59e0b" onClick={() => setStatus('QUERIED')} />
        <Kpi label="Approved, awaiting payment" value={money(sum(['APPROVED']))} color="#0f766e" onClick={() => setStatus('APPROVED')} />
        <Kpi label="Paid" value={money(sum(['PAID']))} color="#16a34a" onClick={() => setStatus('PAID')} />
        <Kpi label="Rejected" value={rows.filter(r => r.status === 'REJECTED').length} color="#dc2626" onClick={() => setStatus('REJECTED')} />
      </div>
      <div className="dx-tabs">{[['', 'All'], ['AWAITING_PATIENT', 'Awaiting member'], ['SUBMITTED', 'With insurer'], ['QUERIED', 'Queried'], ['APPROVED', 'Approved'], ['PAID', 'Paid'], ['REJECTED', 'Rejected'], ['FLAGGED', 'Flagged']].map(([k, l]) => (
        <button key={k || 'all'} type="button" className={`dx-tab ${status === k ? 'on' : ''}`} onClick={() => setStatus(k)}>{l}</button>))}</div>
      <div className="dx-card"><div className="dx-table-wrap"><table className="dx-table">
        <thead><tr><th>Ref</th><th>Date</th><th>Insurer</th><th>Patient</th><th>Service</th><th>Insurer pays</th><th>Patient paid</th><th>Member</th><th>Status</th></tr></thead>
        <tbody>{rows.length ? <Paged items={rows} table>{(rows) => rows.map(r => (
          <tr key={r.id} className={`dx-click ${r.status === 'QUERIED' ? 'dx-urgent' : ''}`} onClick={() => setOpen(r.id)}>
            <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.claimRef}</td><td className="dx-card-hint">{when(r.createdAt)}</td><td>{r.insurerName}</td><td>{r.patientName || '—'}</td><td>{r.serviceType}</td>
            <td><b>{money(r.insurerAmount)}</b></td><td>{money(r.patientAmount)}</td>
            <td className="dx-card-hint">{r.patientConfirmation === 'YES' ? '✓ confirmed' : r.patientConfirmation === 'NO' ? '✗ denied' : r.patientConfirmation === 'NO_REPLY' ? 'no reply' : r.patientConfirmation === 'NOT_REQUIRED' ? '—' : 'waiting'}</td>
            <td><Pill map={CLAIM} k={r.status} /></td>
          </tr>))}</Paged> : <tr><td colSpan={9}><Empty>No insurance claims yet.</Empty></td></tr>}</tbody>
      </table></div></div>
      {open && <ProviderClaimDrawer id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </Page>
  );
}

function ProviderClaimDrawer({ id, onClose, onChanged }) {
  const { data: c, reload } = useLoad(() => api(`${I}/claims/${id}`), [id]);
  const [note, setNote] = useState('');
  const respond = async () => {
    try { await api(`${I}/provider/claims/${id}/respond`, { method: 'POST', body: { note } }); setNote(''); await reload(); onChanged(); } catch (e) { alert(e?.message); }
  };
  if (!c) return <Modal title="Claim" onClose={onClose}><Empty>Loading…</Empty></Modal>;
  return (
    <Modal title={<>Claim {c.claimRef} <Pill map={CLAIM} k={c.status} /></>} sub={`${c.insurerName} · ${when(c.createdAt)}`} onClose={onClose}
      footer={c.status === 'QUERIED' && <><input className="dx-input" style={{ flex: 1 }} placeholder="Your answer to the insurer" value={note} onChange={e => setNote(e.target.value)} /><button type="button" className="dx-btn dx-btn--primary" disabled={!note.trim()} onClick={respond}>Send answer</button></>}>
      {c.status === 'QUERIED' && <div className="dx-alert dx-alert--amber" style={{ marginBottom: 0 }}><div><strong>The insurer asks</strong><p>{c.decisionReason}</p></div></div>}
      {c.status === 'REJECTED' && <div className="dx-alert dx-alert--red" style={{ marginBottom: 0 }}><div><strong>Rejected</strong><p>{c.decisionReason}</p></div></div>}
      {flagsOf(c.flagsJson).length > 0 && <p className="dx-card-hint" style={{ margin: 0 }}>Notes: {flagsOf(c.flagsJson).map(f => FLAG_LABEL[f] || f).join(' · ')}</p>}
      <table className="dx-table"><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Covered</th><th>Note</th></tr></thead>
        <tbody>{(c.lines || []).map((l, i) => <tr key={i}><td><b>{l.description}</b></td><td>{Number(l.quantity)}</td><td>{money(l.unitPrice)}</td><td>{money(l.coveredAmount)}</td><td className="dx-card-hint">{l.note || ''}</td></tr>)}</tbody></table>
      <div>{(c.events || []).map((e, i) => <div key={i} style={{ fontSize: '0.8rem', borderLeft: '3px solid #0f766e', paddingLeft: 8, marginBottom: 6 }}><b>{e.eventType.replace(/_/g, ' ').toLowerCase()}</b>{e.detail ? ` — ${e.detail}` : ''}<div className="dx-card-hint">{when(e.createdAt)}</div></div>)}</div>
    </Modal>
  );
}

const items = (json) => { try { return JSON.parse(json || '[]'); } catch { return []; } };

/** Upload chosen files (lab results, scans, referral letters, photos) and return their links. */
export async function uploadAll(files, folder) {
  const urls = [];
  for (const f of files) {
    if (f.size > 15 * 1024 * 1024) throw new Error(`${f.name} is larger than 15 MB`);
    const r = storageRef(storage, `${folder}/${Date.now()}_${f.name.replace(/[^\w.-]+/g, '_')}`);
    await uploadBytes(r, f);
    urls.push(await getDownloadURL(r));
  }
  return urls.filter(Boolean);
}

const fileName = (u) => decodeURIComponent(String(u).split('?')[0].split('/').pop() || 'file').replace(/^[0-9a-f-]{36}-/, '').replace(/^\d+_/, '');

/** Links to supporting documents, used on provider and insurer screens. */
export function AttachmentLinks({ json, list }) {
  const urls = list || items(json);
  if (!urls.length) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {urls.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer" className="dx-btn dx-btn--sm" style={{ textDecoration: 'none' }}>📎 {fileName(u)}</a>)}
    </div>
  );
}

/** File picker with the chosen files listed; files are uploaded by the caller on submit. */
export function FilePick({ files, onChange, label = 'Supporting documents' }) {
  return (
    <div className="dx-field"><label>{label} <span className="dx-card-hint">(results, scans, referral letter, photos — PDF or image, up to 15 MB each)</span></label>
      <input type="file" multiple accept="application/pdf,image/*,.doc,.docx" onChange={e => { onChange([...files, ...Array.from(e.target.files || [])]); e.target.value = ''; }} />
      {files.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{files.map((f, i) => (
        <span key={i} className="dx-chip" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', background: '#f1f5f9', borderRadius: 999, padding: '0.15rem 0.6rem', fontSize: '0.76rem' }}>📎 {f.name}
          <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 800 }}>×</button></span>))}</div>}
    </div>
  );
}

export function ProviderPreauthList({ listPath = `${I}/preauth`, title = 'Pre-authorisations' }) {
  const { data, reload } = useLoad(() => api(listPath), [listPath]);
  const [reply, setReply] = useState({});
  const [replyFiles, setReplyFiles] = useState({});
  const [sending, setSending] = useState(null);
  const respond = async (p) => {
    setSending(p.id);
    try {
      const attachments = await uploadAll(replyFiles[p.id] || [], 'preauth');
      await api(`${I}/preauth/${p.id}/respond`, { method: 'POST', body: { note: reply[p.id], attachments } });
      setReply(r => ({ ...r, [p.id]: '' })); setReplyFiles(r => ({ ...r, [p.id]: [] })); reload();
    } catch (e) { alert(e?.message); } finally { setSending(null); }
  };
  const cancel = async (p) => { if (!window.confirm('Cancel this request?')) return; try { await api(`${I}/preauth/${p.id}/cancel`, { method: 'POST' }); reload(); } catch (e) { alert(e?.message); } };
  return (
    <Page title={title} sub="Approval requests you sent to insurers. An approval is used once, by the matching claim.">
      <div className="dx-card"><div className="dx-table-wrap"><table className="dx-table">
        <thead><tr><th>Ref</th><th>Patient</th><th>Insurer</th><th>Asked for</th><th>Amount</th><th>Status</th><th>Decision</th><th /></tr></thead>
        <tbody>{(data || []).length ? <Paged items={data} table>{(data) => data.map(p => (
          <tr key={p.id}><td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{p.ref}</td><td>{p.patientName}</td><td>{p.insurerName}</td><td className="dx-card-hint" style={{ maxWidth: 260 }}>{items(p.itemsJson).map(i => i.description).join(', ')}{items(p.attachmentsJson).length > 0 && <div style={{ marginTop: 4 }}><AttachmentLinks json={p.attachmentsJson} /></div>}</td>
            <td>{money(p.estimatedAmount)}{p.approvedAmount != null && p.status === 'PARTIAL' ? <div className="dx-card-hint">approved {money(p.approvedAmount)}</div> : null}</td><td><Pill map={PREAUTH} k={p.status} /></td>
            <td className="dx-card-hint" style={{ maxWidth: 260 }}>{p.decisionReason || (p.validUntil ? `valid until ${when(p.validUntil)}` : '')}</td>
            <td style={{ minWidth: 200 }}>
              {p.status === 'QUERIED' && <>
                <div style={{ display: 'flex', gap: 6 }}><input className="dx-input" placeholder="Your answer" value={reply[p.id] || ''} onChange={e => setReply(r => ({ ...r, [p.id]: e.target.value }))} /><button type="button" className="dx-btn dx-btn--sm dx-btn--primary" disabled={!reply[p.id] || sending === p.id} onClick={() => respond(p)}>{sending === p.id ? '…' : 'Send'}</button></div>
                <label className="dx-card-hint" style={{ display: 'block', marginTop: 4, cursor: 'pointer' }}>📎 {(replyFiles[p.id] || []).length ? `${replyFiles[p.id].length} file(s) attached` : 'Attach results / letter'}
                  <input type="file" multiple hidden accept="application/pdf,image/*,.doc,.docx" onChange={e => { const fs = Array.from(e.target.files || []); setReplyFiles(r => ({ ...r, [p.id]: [...(r[p.id] || []), ...fs] })); e.target.value = ''; }} /></label>
              </>}
              {['PENDING', 'QUERIED'].includes(p.status) && <button type="button" className="dx-btn dx-btn--sm" style={{ marginTop: 4 }} onClick={() => cancel(p)}>Cancel</button>}
            </td></tr>))}</Paged> : <tr><td colSpan={8}><Empty>No requests yet.</Empty></td></tr>}</tbody>
      </table></div></div>
    </Page>
  );
}

/**
 * Ask the insurer to approve before giving care. Opened from wherever the need
 * shows up (a blocked dispense, a restricted medicine, a CT order, a visit).
 */
export function PreauthRequestModal({ patientId, patientName, cards: givenCards, cardId: givenCard, serviceType, initialItems, sourceType, sourceId,
  diagnosisIcd, diagnosisText, createPath = `${I}/preauth`, onClose, onDone }) {
  const [cards, setCards] = useState(givenCards || null);
  const [form, setForm] = useState({
    cardId: givenCard || '', items: initialItems?.length ? initialItems : [{ description: '', code: '', quantity: 1, unitPrice: '' }],
    diagnosisIcd: diagnosisIcd || '', diagnosisText: diagnosisText || '', clinicalNotes: '',
  });
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState([]);
  useEffect(() => {
    if (cards || !patientId) return;
    api(`${I}/patients/${patientId}/cards`).then(c => { setCards(c); if (!form.cardId && c?.[0]) setForm(f => ({ ...f, cardId: c[0].id })); }).catch(() => setCards([]));
  }, [patientId]); // eslint-disable-line react-hooks/exhaustive-deps
  const setItem = (i, patch) => setForm(f => ({ ...f, items: f.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const submit = async () => {
    setBusy(true);
    try {
      const attachments = await uploadAll(files, 'preauth');
      const res = await api(createPath, { method: 'POST', body: {
        attachments, patientId, cardId: form.cardId, serviceType, sourceType, sourceId, diagnosisIcd: form.diagnosisIcd || null, diagnosisText: form.diagnosisText || null,
        clinicalNotes: form.clinicalNotes, items: form.items.filter(i => i.description.trim()).map(i => ({ ...i, quantity: Number(i.quantity) || 1, unitPrice: i.unitPrice === '' ? null : Number(i.unitPrice) })),
      } });
      onDone?.(res);
    } catch (e) { alert(e?.message || 'Could not send the request.'); } finally { setBusy(false); }
  };
  return (
    <Modal title="Ask the insurer for approval" sub={`${patientName || 'Patient'} · ${serviceType}`} onClose={onClose} width={760}
      footer={<><button type="button" className="dx-btn" onClick={onClose}>Cancel</button><button type="button" className="dx-btn dx-btn--primary" disabled={busy || !form.cardId || form.clinicalNotes.trim().length < 10} onClick={submit}>{busy ? 'Sending…' : 'Send request'}</button></>}>
      <div className="dx-field"><label>Insurance card</label>
        {cards == null ? <Empty>Loading cards…</Empty> : cards.length === 0 ? <p style={{ color: '#b91c1c', margin: 0 }}>This patient has no verified insurance card.</p> : (
          <select className="dx-select" value={form.cardId} onChange={e => setForm({ ...form, cardId: e.target.value })}>{cards.map(c => <option key={c.id} value={c.id}>{c.insurerName} · {c.planName || 'plan'} · {c.memberNo}</option>)}</select>)}</div>
      <div><div className="dx-kpi-label" style={{ marginBottom: 6 }}>What you are asking for</div>
        {form.items.map((it, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 110px', gap: 6, marginBottom: 6 }}>
            <input className="dx-input" placeholder="Medicine / service" value={it.description} onChange={e => setItem(i, { description: e.target.value })} />
            <input className="dx-input" placeholder="Code" value={it.code || ''} onChange={e => setItem(i, { code: e.target.value })} />
            <input className="dx-input" type="number" placeholder="Qty" value={it.quantity} onChange={e => setItem(i, { quantity: e.target.value })} />
            <input className="dx-input" type="number" placeholder="Unit GHS" value={it.unitPrice ?? ''} onChange={e => setItem(i, { unitPrice: e.target.value })} />
          </div>))}
        <button type="button" className="dx-btn dx-btn--sm" onClick={() => setForm(f => ({ ...f, items: [...f.items, { description: '', code: '', quantity: 1, unitPrice: '' }] }))}>+ Item</button></div>
      <div className="dx-two">
        <div className="dx-field"><label>Diagnosis (ICD-10)</label><input className="dx-input" value={form.diagnosisIcd} onChange={e => setForm({ ...form, diagnosisIcd: e.target.value })} placeholder="e.g. E78.5" /></div>
        <div className="dx-field"><label>Diagnosis (words)</label><input className="dx-input" value={form.diagnosisText} onChange={e => setForm({ ...form, diagnosisText: e.target.value })} /></div>
      </div>
      <div className="dx-field"><label>Clinical reason (required)</label><textarea rows={4} value={form.clinicalNotes} onChange={e => setForm({ ...form, clinicalNotes: e.target.value })} placeholder="Why it is needed, what was tried, relevant results." /></div>
      <FilePick files={files} onChange={setFiles} />
    </Modal>
  );
}

/** Doctor's licence: submit for NessaHub verification, see status. */
export function LicencePanel() {
  const { data, reload } = useLoad(() => api(`${I}/licence`), []);
  const [form, setForm] = useState(null);
  const save = async () => { try { await api(`${I}/licence`, { method: 'POST', body: form }); setForm(null); reload(); } catch (e) { alert(e?.message); } };
  const st = data?.status || 'NOT_SUBMITTED';
  const tone = st === 'VERIFIED' ? ['#f0fdf4', '#86efac', '#166534'] : st === 'REJECTED' ? ['#fef2f2', '#fecaca', '#991b1b'] : ['#fffbeb', '#fde68a', '#92400e'];
  return (
    <div style={{ background: tone[0], border: `1.5px solid ${tone[1]}`, borderRadius: 12, padding: '0.85rem 1rem', marginBottom: '1rem', color: tone[2] }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div><b>Professional licence: {st === 'NOT_SUBMITTED' ? 'not submitted' : st.toLowerCase()}</b>
          <div style={{ fontSize: '0.82rem' }}>{data?.licenceBody ? `${data.licenceBody} · ${data.licenceNo}${data.licenceExpiry ? ` · expires ${data.licenceExpiry}` : ''}` : 'Insurers only pay verified clinicians.'}{data?.notes ? ` — ${data.notes}` : ''}</div></div>
        <button type="button" className="dx-btn dx-btn--sm" onClick={() => setForm({ licenceBody: data?.licenceBody || 'Medical & Dental Council', licenceNo: data?.licenceNo || '', licenceExpiry: data?.licenceExpiry || '', documentUrl: data?.documentUrl || '' })}>{st === 'NOT_SUBMITTED' ? 'Submit licence' : 'Update'}</button>
      </div>
      {form && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginTop: 10 }}>
          <input className="dx-input" placeholder="Licensing body" value={form.licenceBody} onChange={e => setForm({ ...form, licenceBody: e.target.value })} />
          <input className="dx-input" placeholder="Licence number" value={form.licenceNo} onChange={e => setForm({ ...form, licenceNo: e.target.value })} />
          <input className="dx-input" type="date" value={form.licenceExpiry} onChange={e => setForm({ ...form, licenceExpiry: e.target.value })} />
          <input className="dx-input" placeholder="Link to licence document (optional)" value={form.documentUrl} onChange={e => setForm({ ...form, documentUrl: e.target.value })} />
          <button type="button" className="dx-btn dx-btn--primary" disabled={!form.licenceNo.trim()} onClick={save}>Send for verification</button>
        </div>
      )}
    </div>
  );
}
