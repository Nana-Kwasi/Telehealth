import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../services/apiClient';
import { ref, uploadBytes, getDownloadURL, storage } from '../../../services/firestoreShim';
import {
  STAGES, OPEN_STAGES, PRIORITY, stageOf, priorityOf, fmtDate, fmtDateTime, fmtHours, ageHours, targetHours, tatState,
  exportCsv, templateFor, flagFor, FLAG_META, rangeText, modalityFor, SPECIMENS, toDate,
} from './diagUi';
import { StagePill, PriorityPill } from './DiagOverview';
import './diagnostics.css';
import { PreauthRequestModal } from '../../Common/ProviderInsurance';
import Paged from '../../Common/Paged';

const OPS = '/api/v1/diagnostics/operations';

const EVENT_LABEL = {
  SAMPLE_COLLECTED: 'Sample collected', SCAN_SCHEDULED: 'Scan booked', ORDER_STARTED: 'Work started',
  ORDER_STATUS_UPDATED: 'Status updated', ORDER_COMPLETED: 'Result uploaded', ORDER_REJECTED: 'Order rejected',
  PRIORITY_CHANGED: 'Priority changed',
};
export const eventLabel = (e) => EVENT_LABEL[e?.eventType || e?.action] || String(e?.eventType || e?.action || 'Activity').replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());

function useCatalog(type) {
  const [items, setItems] = useState([]);
  useEffect(() => { api(`${OPS}/catalog/mine?diagnosticType=${type}`).then(r => setItems(Array.isArray(r) ? r : [])).catch(() => setItems([])); }, [type]);
  return useMemo(() => {
    const byId = new Map(items.map(i => [i.id, i]));
    const byName = new Map(items.map(i => [String(i.name || '').trim().toLowerCase(), i]));
    return { items, find: (o) => byId.get(o?.catalogItemId) || byName.get(String(o?.testType || '').trim().toLowerCase()) || null };
  }, [items]);
}

// ── modals ───────────────────────────────────────────────────────────────────

function Modal({ title, sub, onClose, children, footer, wide }) {
  return (
    <div className="dx-modal-bg" onClick={onClose}>
      <div className="dx-modal" style={wide ? { maxWidth: 920 } : undefined} onClick={e => e.stopPropagation()}>
        <div className="dx-modal-head">
          <div><h3>{title}</h3>{sub ? <div className="dx-card-hint" style={{ marginTop: 3 }}>{sub}</div> : null}</div>
          <button type="button" className="dx-btn dx-btn--sm" onClick={onClose}>✕</button>
        </div>
        <div className="dx-modal-body">{children}</div>
        {footer ? <div className="dx-modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

function CollectModal({ order, catalogItem, onClose, onDone }) {
  const tpl = templateFor(order.testType, catalogItem);
  const [specimen, setSpecimen] = useState(order.specimenType || tpl.specimen || SPECIMENS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true); setErr('');
    try { onDone(await api(`${OPS}/orders/${order.id}/workflow`, { method: 'POST', body: { action: 'COLLECT_SAMPLE', specimenType: specimen } })); }
    catch (e) { setErr(e?.message || 'Could not record the sample.'); setBusy(false); }
  };
  return (
    <Modal title="Collect sample" sub={`${order.patientName || 'Patient'} · ${order.testType || 'Test'}`} onClose={onClose}
      footer={<><button type="button" className="dx-btn" onClick={onClose}>Cancel</button><button type="button" className="dx-btn dx-btn--primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Sample collected'}</button></>}>
      <div className="dx-alert dx-alert--amber" style={{ marginBottom: 0 }}>
        <span>🪪</span><div><strong>Check identity first</strong><p>Match the National ID to <b>{order.patientName || 'the patient'}</b> before drawing the sample.</p></div>
      </div>
      <div className="dx-field">
        <label>Specimen</label>
        <select className="dx-select" value={specimen} onChange={e => setSpecimen(e.target.value)}>
          {[...new Set([specimen, ...SPECIMENS])].filter(Boolean).map(s => <option key={s}>{s}</option>)}
        </select>
      </div>
      <p className="dx-card-hint" style={{ margin: 0 }}>An accession number is issued for the tube label. The order moves to “Sample collected”.</p>
      {err && <p style={{ color: '#b91c1c', margin: 0 }}>{err}</p>}
    </Modal>
  );
}

function localInputValue(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function ScheduleModal({ order, catalogItem, onClose, onDone }) {
  const mod = modalityFor(order.testType);
  const start = new Date(Date.now() + 3600000); start.setMinutes(0, 0, 0);
  const [when, setWhen] = useState(localInputValue(toDate(order.scheduledAt) || start));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true); setErr('');
    try { onDone(await api(`${OPS}/orders/${order.id}/workflow`, { method: 'POST', body: { action: 'SCHEDULE', scheduledAt: new Date(when).toISOString() } })); }
    catch (e) { setErr(e?.message || 'Could not book the scan.'); setBusy(false); }
  };
  return (
    <Modal title={`Book ${mod.label.toLowerCase()} appointment`} sub={`${order.patientName || 'Patient'} · ${order.testType || 'Scan'}`} onClose={onClose}
      footer={<><button type="button" className="dx-btn" onClick={onClose}>Cancel</button><button type="button" className="dx-btn dx-btn--primary" disabled={busy || !when} onClick={save}>{busy ? 'Booking…' : 'Book & notify patient'}</button></>}>
      <div className="dx-field"><label>Date and time</label><input className="dx-input" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} /></div>
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.75rem 0.9rem' }}>
        <div style={{ fontWeight: 800, fontSize: '0.82rem', marginBottom: 4 }}>Patient preparation — {mod.label}</div>
        <div style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.5 }}>{catalogItem?.preparation || mod.prep}</div>
        <div className="dx-card-hint" style={{ marginTop: 6 }}>Tell the patient when you call. They also get an app notification to check the booking.</div>
      </div>
      {err && <p style={{ color: '#b91c1c', margin: 0 }}>{err}</p>}
    </Modal>
  );
}

function RejectModal({ order, onClose, onDone }) {
  const reasons = ['Patient did not attend', 'Sample haemolysed / clotted', 'Insufficient sample', 'Wrong or missing label', 'Test not offered at this branch', 'Equipment unavailable', 'Patient refused'];
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { onDone(await api(`${OPS}/orders/${order.id}/workflow`, { method: 'POST', body: { action: 'REJECT', reason } })); }
    catch (e) { alert(e?.message || 'Could not reject.'); setBusy(false); }
  };
  return (
    <Modal title="Reject order" sub={`${order.patientName || 'Patient'} · ${order.testType || ''}`} onClose={onClose}
      footer={<><button type="button" className="dx-btn" onClick={onClose}>Cancel</button><button type="button" className="dx-btn dx-btn--danger" disabled={busy || !reason.trim()} onClick={save}>Reject & tell doctor</button></>}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{reasons.map(r => <button key={r} type="button" className={`dx-tab ${reason === r ? 'on' : ''}`} onClick={() => setReason(r)}>{r}</button>)}</div>
      <div className="dx-field"><label>Reason (sent to the ordering doctor)</label><textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} /></div>
    </Modal>
  );
}

function ResultModal({ type, order, catalogItem, onClose, onDone }) {
  const tpl = useMemo(() => templateFor(order.testType, catalogItem), [order.testType, catalogItem]);
  const [rows, setRows] = useState(() => tpl.params.map(p => ({ ...p, value: '' })));
  const [findings, setFindings] = useState('');
  const [indication, setIndication] = useState(order.notes || '');
  const [technique, setTechnique] = useState('');
  const [impression, setImpression] = useState('');
  const [techNote, setTechNote] = useState('');
  const [file, setFile] = useState(null);
  const [criticalScan, setCriticalScan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const flagged = rows.map(r => ({ ...r, flag: flagFor(r, r.value) }));
  const anyCritical = type === 'lab' ? flagged.some(r => r.flag === 'LL' || r.flag === 'HH') : criticalScan;
  const anyValue = flagged.some(r => String(r.value || '').trim());
  const canSave = type === 'lab' ? (anyValue || file || findings.trim()) : (impression.trim() && (findings.trim() || file));

  const setRow = (i, patch) => setRows(prev => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setBusy(true); setErr('');
    try {
      let fileUrl = null;
      if (file) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const sref = ref(storage, `diagnostic-results/${order.id}/${Date.now()}_${safe}`);
        await uploadBytes(sref, file);
        fileUrl = await getDownloadURL(sref);
      }
      const values = type === 'lab'
        ? flagged.filter(r => String(r.value || '').trim()).map(r => ({ name: r.name, value: String(r.value).trim(), unit: r.unit || '', range: rangeText(r), flag: r.flag || '' }))
        : null;
      const scanFindings = [indication.trim() && `Clinical indication: ${indication.trim()}`, technique.trim() && `Technique: ${technique.trim()}`, findings.trim() && `Findings: ${findings.trim()}`].filter(Boolean).join('\n\n');
      const saved = await api(`${OPS}/orders/${order.id}/results`, { method: 'POST', body: {
        findings: type === 'lab' ? (findings.trim() || null) : scanFindings,
        conclusion: type === 'lab' ? null : impression.trim(),
        reportUrl: fileUrl,
        values,
        critical: anyCritical,
        techNote: techNote.trim() || null,
      } });
      api('/api/v1/patient-timeline', { method: 'POST', body: {
        patientId: order.patientId, type: type === 'lab' ? 'LAB_RESULT' : 'SCAN_RESULT',
        title: `${type === 'lab' ? 'Lab test' : 'Scan'} done: ${order.testType || 'Diagnostic test'}`,
        note: 'Your doctor will review the result and share it with you.', status: 'COMPLETED', relatedId: order.id,
      } }).catch(() => {});
      onDone(saved);
    } catch (e) { setErr(e?.message || 'Could not save the result.'); setBusy(false); }
  };

  return (
    <Modal wide title={type === 'lab' ? 'Enter lab result' : 'Write scan report'}
      sub={`${order.patientName || 'Patient'} · ${order.testType || ''}${order.accessionNo ? ` · ${order.accessionNo}` : ''}`}
      onClose={onClose}
      footer={<>
        <span className="dx-card-hint" style={{ marginRight: 'auto', alignSelf: 'center' }}>Goes to the ordering doctor only. The patient sees it after the doctor shares it.</span>
        <button type="button" className="dx-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="dx-btn dx-btn--primary" disabled={busy || !canSave} onClick={save}>{busy ? 'Saving…' : anyCritical ? 'Submit & alert doctor' : 'Submit result'}</button>
      </>}>
      {anyCritical && (
        <div className="dx-alert dx-alert--red" style={{ marginBottom: 0 }}>
          <span>🚨</span><div><strong>Critical {type === 'lab' ? 'value' : 'finding'}</strong><p>The doctor gets an urgent alert when you submit. Follow your critical-value call protocol as well.</p></div>
        </div>
      )}
      {type === 'lab' ? (
        <>
          <div className="dx-table-wrap">
            <table className="dx-table dx-values">
              <thead><tr><th style={{ width: '32%' }}>Parameter</th><th style={{ width: '22%' }}>Result</th><th>Unit</th><th>Reference</th><th>Flag</th></tr></thead>
              <tbody>
                {flagged.map((r, i) => (
                  <tr key={i}>
                    <td>{r.custom ? <input value={r.name} onChange={e => setRow(i, { name: e.target.value })} placeholder="Parameter" /> : <b style={{ fontSize: '0.82rem' }}>{r.name}</b>}</td>
                    <td>{r.kind === 'qual'
                      ? <select value={r.value} onChange={e => setRow(i, { value: e.target.value })}><option value="">—</option>{r.options.map(o => <option key={o}>{o}</option>)}</select>
                      : <input value={r.value} inputMode={r.kind === 'num' ? 'decimal' : undefined} onChange={e => setRow(i, { value: e.target.value })} />}</td>
                    <td className="dx-card-hint">{r.custom ? <input value={r.unit || ''} onChange={e => setRow(i, { unit: e.target.value })} /> : (r.unit || '')}</td>
                    <td className="dx-card-hint">{rangeText(r)}</td>
                    <td>{r.flag ? <span className="dx-flag" style={{ background: FLAG_META[r.flag].bg, color: FLAG_META[r.flag].fg }}>{FLAG_META[r.flag].label}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="dx-btn dx-btn--sm" onClick={() => setRows(prev => [...prev, { name: '', kind: 'text', value: '', custom: true }])}>+ Add parameter</button>
            <span className="dx-card-hint">{tpl.source === 'catalog' ? 'Ranges from your Test Catalog.' : tpl.source === 'default' ? 'Typical adult ranges — set your own in Test Catalog.' : 'No template for this test — type the result.'}</span>
          </div>
          <div className="dx-field"><label>Comment / interpretation (optional)</label><textarea rows={3} value={findings} onChange={e => setFindings(e.target.value)} /></div>
        </>
      ) : (
        <>
          <div className="dx-field"><label>Clinical indication</label><textarea rows={2} value={indication} onChange={e => setIndication(e.target.value)} /></div>
          <div className="dx-field"><label>Technique</label><textarea rows={2} value={technique} onChange={e => setTechnique(e.target.value)} placeholder={`e.g. ${modalityFor(order.testType).label} performed${modalityFor(order.testType).key === 'ct' ? ' with/without contrast' : ''}…`} /></div>
          <div className="dx-field"><label>Findings</label><textarea rows={6} value={findings} onChange={e => setFindings(e.target.value)} /></div>
          <div className="dx-field"><label>Impression <span style={{ color: '#b91c1c' }}>*</span></label><textarea rows={3} value={impression} onChange={e => setImpression(e.target.value)} placeholder="Summary for the doctor" /></div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.84rem', fontWeight: 700, color: '#991b1b' }}>
            <input type="checkbox" checked={criticalScan} onChange={e => setCriticalScan(e.target.checked)} /> Critical / urgent finding — alert the doctor now
          </label>
        </>
      )}
      <div className="dx-two">
        <div className="dx-field">
          <label>{type === 'lab' ? 'Report file (optional)' : 'Images / report file'}</label>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.dcm,application/pdf,image/*" onChange={e => setFile(e.target.files?.[0] || null)} />
          {file && <div className="dx-card-hint" style={{ color: '#065f46', fontWeight: 700 }}>{file.name}</div>}
        </div>
        <div className="dx-field"><label>Internal note (not for the patient)</label><textarea rows={2} value={techNote} onChange={e => setTechNote(e.target.value)} placeholder="Analyser, QC lot, repeat run…" /></div>
      </div>
      {err && <p style={{ color: '#b91c1c', margin: 0 }}>{err}</p>}
    </Modal>
  );
}

// ── worklist ─────────────────────────────────────────────────────────────────

export function useOrderActions(type, catalog, onChanged) {
  const [modal, setModal] = useState(null); // { kind, order }
  const workflow = async (order, body) => {
    try { onChanged(await api(`${OPS}/orders/${order.id}/workflow`, { method: 'POST', body })); }
    catch (e) { alert(e?.message || 'Could not update the order.'); }
  };
  const done = (saved) => { setModal(null); onChanged(saved); };
  const element = modal && (() => {
    const item = catalog.find(modal.order);
    if (modal.kind === 'collect') return <CollectModal order={modal.order} catalogItem={item} onClose={() => setModal(null)} onDone={done} />;
    if (modal.kind === 'schedule') return <ScheduleModal order={modal.order} catalogItem={item} onClose={() => setModal(null)} onDone={done} />;
    if (modal.kind === 'reject') return <RejectModal order={modal.order} onClose={() => setModal(null)} onDone={done} />;
    if (modal.kind === 'result') return <ResultModal type={type} order={modal.order} catalogItem={item} onClose={() => setModal(null)} onDone={done} />;
    return null;
  })();
  const buttons = (o, { compact } = {}) => {
    const st = stageOf(o.status);
    if (!OPEN_STAGES.includes(st)) return null;
    const sm = compact ? 'dx-btn dx-btn--sm' : 'dx-btn';
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
        {type === 'lab' && st === 'PENDING' && <button type="button" className={`${sm} dx-btn--primary`} onClick={() => setModal({ kind: 'collect', order: o })}>Collect sample</button>}
        {type === 'scan' && st === 'PENDING' && <button type="button" className={`${sm} dx-btn--primary`} onClick={() => setModal({ kind: 'schedule', order: o })}>Book</button>}
        {type === 'scan' && st === 'SCHEDULED' && <button type="button" className={sm} onClick={() => setModal({ kind: 'schedule', order: o })}>Reschedule</button>}
        {(st === 'SAMPLE_COLLECTED' || st === 'SCHEDULED' || (type === 'scan' && st === 'PENDING')) && <button type="button" className={sm} onClick={() => workflow(o, { action: 'START' })}>Start</button>}
        {(st === 'IN_PROGRESS' || st === 'SAMPLE_COLLECTED' || st === 'SCHEDULED') && <button type="button" className={`${sm} dx-btn--primary`} onClick={() => setModal({ kind: 'result', order: o })}>{type === 'lab' ? 'Enter result' : 'Write report'}</button>}
        <select className="dx-select" style={{ padding: '0.22rem 0.4rem', fontSize: '0.74rem' }} value={priorityOf(o.priority)} onChange={e => workflow(o, { action: 'PRIORITY', priority: e.target.value })} title="Priority">
          {Object.keys(PRIORITY).map(k => <option key={k} value={k}>{PRIORITY[k].label}</option>)}
        </select>
        <button type="button" className={`${sm} dx-btn--danger`} onClick={() => setModal({ kind: 'reject', order: o })}>Reject</button>
      </div>
    );
  };
  return { element, buttons };
}

const TABS = (type) => [
  ['open', 'Open'],
  ['PENDING', type === 'lab' ? 'To collect' : 'To book'],
  [type === 'lab' ? 'SAMPLE_COLLECTED' : 'SCHEDULED', type === 'lab' ? 'Collected' : 'Booked'],
  ['IN_PROGRESS', 'In progress'],
  ['overdue', 'Overdue'],
  ['urgent', 'Urgent / STAT'],
  ['COMPLETED', 'Completed'],
  ['REJECTED', 'Rejected'],
  ['all', 'All'],
];

export default function DiagWorklist({ type = 'lab', profile, mode = 'branch' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isParent = mode === 'parent';
  const catalog = useCatalog(type);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(location.state?.tab || 'open');
  const [q, setQ] = useState('');
  const [branch, setBranch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = isParent ? `${OPS}/orders` : `${OPS}/orders?branchId=${profile?.id}`;
      const list = await api(url).catch(() => []);
      setOrders((Array.isArray(list) ? list : []).filter(o => String(o.diagnosticType || o.centerType || type).toLowerCase().includes(type)));
    } finally { setLoading(false); }
  }, [isParent, profile?.id, type]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 45000); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (location.state?.tab) setTab(location.state.tab); }, [location.state?.tab]);

  const replace = (saved) => { if (saved?.id) setOrders(prev => prev.map(o => (o.id === saved.id ? { ...o, ...saved } : o))); else load(); };
  const actions = useOrderActions(type, catalog, (saved) => { replace(saved); load(); });

  const enriched = useMemo(() => orders.map(o => ({ ...o, tatHours: catalog.find(o)?.tatHours || null })), [orders, catalog]);
  const branches = useMemo(() => [...new Map(enriched.filter(o => o.branchId).map(o => [o.branchId, o.branchName || 'Branch'])).entries()], [enriched]);

  const inTab = (o, t) => {
    const st = stageOf(o.status);
    if (t === 'all') return true;
    if (t === 'open') return OPEN_STAGES.includes(st);
    if (t === 'overdue') return tatState(o, type) === 'late';
    if (t === 'urgent') return OPEN_STAGES.includes(st) && priorityOf(o.priority) !== 'ROUTINE';
    return st === t;
  };
  const base = enriched.filter(o => {
    if (branch && o.branchId !== branch) return false;
    const d = toDate(o.createdAt);
    if (from && d && d < new Date(`${from}T00:00:00`)) return false;
    if (to && d && d > new Date(`${to}T23:59:59`)) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [o.patientName, o.orderCode, o.orderId, o.accessionNo, o.testType, o.doctorName, o.branchName].some(v => String(v || '').toLowerCase().includes(s));
  });
  const shown = base.filter(o => inTab(o, tab)).sort((a, b) => {
    const openA = OPEN_STAGES.includes(stageOf(a.status)), openB = OPEN_STAGES.includes(stageOf(b.status));
    if (openA && openB) {
      const pr = PRIORITY[priorityOf(a.priority)].rank - PRIORITY[priorityOf(b.priority)].rank;
      if (pr) return pr;
      return ageHours(b) / targetHours(b, type) - ageHours(a) / targetHours(a, type);
    }
    return (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0);
  });

  const csv = () => exportCsv(`${type}-orders-${new Date().toISOString().slice(0, 10)}.csv`, [
    { label: 'Order', value: o => o.orderCode || o.id },
    { label: 'Accession', value: 'accessionNo' },
    { label: 'Created', value: o => toDate(o.createdAt)?.toISOString() || '' },
    { label: 'Branch', value: 'branchName' },
    { label: 'Patient', value: 'patientName' },
    { label: 'Doctor', value: 'doctorName' },
    { label: 'Test', value: 'testType' },
    { label: 'Priority', value: o => priorityOf(o.priority) },
    { label: 'Status', value: o => stageOf(o.status) },
    { label: 'Turnaround (h)', value: o => ageHours(o).toFixed(1) },
    { label: 'Price', value: 'price' },
    { label: 'Reject reason', value: 'rejectReason' },
  ], shown);

  return (
    <div className={`pharmacy-page dx ${type === 'scan' ? 'dx--scan' : ''}`}>
      <div className="dx-hero">
        <div>
          <h1>{isParent ? 'All orders' : `${type === 'lab' ? 'Lab' : 'Scan'} worklist`}</h1>
          <p>{isParent ? 'Every order across your branches. Filter, follow up and export.' : 'Urgent and late work first. Verify the patient’s National ID before every test.'}</p>
        </div>
        <div className="dx-toolbar">
          <button type="button" className="dx-btn" onClick={load}>↻ Refresh</button>
          <button type="button" className="dx-btn" onClick={csv} disabled={!shown.length}>⬇ Export CSV</button>
        </div>
      </div>

      <div className="dx-card" style={{ marginBottom: '0.8rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="dx-input" style={{ flex: '1 1 260px' }} value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Patient name as on National ID, order no., accession, test, doctor…" />
        {isParent && branches.length > 0 && (
          <select className="dx-select" value={branch} onChange={e => setBranch(e.target.value)}>
            <option value="">All branches</option>
            {branches.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
        <span className="dx-card-hint">From</span><input className="dx-input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
        <span className="dx-card-hint">to</span><input className="dx-input" type="date" value={to} onChange={e => setTo(e.target.value)} />
      </div>

      <div className="dx-tabs">
        {TABS(type).map(([k, label]) => (
          <button key={k} type="button" className={`dx-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{label}<b>{base.filter(o => inTab(o, k)).length}</b></button>
        ))}
      </div>

      <div className="dx-card">
        {loading && !orders.length ? <p className="dx-empty">Loading orders…</p> : shown.length === 0 ? (
          <p className="dx-empty">{q ? 'No orders match. Check the spelling against the National ID.' : 'Nothing here right now.'}</p>
        ) : (
          <div className="dx-table-wrap">
            <table className="dx-table">
              <thead><tr>
                <th>Patient</th><th>Test</th><th>Order</th>{isParent && <th>Branch</th>}<th>Status</th><th>Time</th>{type === 'scan' && <th>Booked for</th>}<th>Actions</th>
              </tr></thead>
              <tbody>
                <Paged items={shown} table>{(shown) => shown.map(o => {
                  const st = stageOf(o.status);
                  const ts = tatState(o, type);
                  return (
                    <tr key={o.id} className={`dx-click ${priorityOf(o.priority) !== 'ROUTINE' && OPEN_STAGES.includes(st) ? 'dx-urgent' : ''}`} onClick={() => navigate(`/dashboard/orders/${o.id}`)}>
                      <td><div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><PriorityPill priority={o.priority} /><b>{o.patientName || 'Patient'}</b></div><div className="dx-card-hint">Dr. {o.doctorName || '—'}</div></td>
                      <td>{o.testType || '—'}{o.specimenType ? <div className="dx-card-hint">{o.specimenType}</div> : null}</td>
                      <td><span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{o.orderCode || o.id.slice(0, 8)}</span>{o.accessionNo ? <div className="dx-card-hint" style={{ fontFamily: 'monospace' }}>{o.accessionNo}</div> : null}</td>
                      {isParent && <td>{o.branchName || '—'}</td>}
                      <td><StagePill status={st} />{st === 'REJECTED' && o.rejectReason ? <div className="dx-card-hint" title={o.rejectReason} style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.rejectReason}</div> : null}</td>
                      <td><span className={`dx-tat dx-tat--${ts}`} title={`Target ${fmtHours(targetHours(o, type))}`}>{fmtHours(ageHours(o))}{ts !== 'closed' ? ` / ${fmtHours(targetHours(o, type))}` : ''}</span><div className="dx-card-hint">{fmtDate(o.createdAt)}</div></td>
                      {type === 'scan' && <td className="dx-card-hint">{o.scheduledAt ? fmtDateTime(o.scheduledAt) : '—'}</td>}
                      <td>{actions.buttons(o, { compact: true })}</td>
                    </tr>
                  );
                })}</Paged>
              </tbody>
            </table>
          </div>
        )}
      </div>
      {actions.element}
    </div>
  );
}

// ── order detail ─────────────────────────────────────────────────────────────

function parseValues(json) { try { const v = JSON.parse(json || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }

export function ResultView({ r }) {
  const values = parseValues(r.valuesJson);
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.8rem 0.9rem', background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <b style={{ fontSize: '0.86rem' }}>Result · {fmtDateTime(r.createdAt)}</b>
        <span style={{ display: 'flex', gap: 6 }}>
          {r.critical && <span className="dx-pill" style={{ background: '#dc2626', color: '#fff' }}>CRITICAL</span>}
          {!r.critical && r.abnormal && <span className="dx-pill" style={{ background: '#ffedd5', color: '#9a3412' }}>Abnormal</span>}
          <span className="dx-pill" style={r.releasedToPatient ? { background: '#dcfce7', color: '#166534' } : { background: '#f1f5f9', color: '#475569' }}>{r.releasedToPatient ? 'Doctor shared with patient' : 'With doctor'}</span>
        </span>
      </div>
      {values.length > 0 && (
        <table className="dx-table" style={{ marginBottom: 8 }}>
          <thead><tr><th>Parameter</th><th>Result</th><th>Reference</th><th>Flag</th></tr></thead>
          <tbody>{values.map((v, i) => (
            <tr key={i}><td>{v.name}</td><td><b>{v.value}</b> {v.unit}</td><td className="dx-card-hint">{v.range}</td>
              <td>{v.flag && FLAG_META[v.flag] ? <span className="dx-flag" style={{ background: FLAG_META[v.flag].bg, color: FLAG_META[v.flag].fg }}>{FLAG_META[v.flag].label}</span> : null}</td></tr>
          ))}</tbody>
        </table>
      )}
      {r.findings && <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.84rem', color: '#0f172a', marginBottom: 6 }}>{r.findings}</div>}
      {r.conclusion && <div style={{ fontSize: '0.84rem' }}><b>Impression:</b> {r.conclusion}</div>}
      {r.techNote && <div className="dx-card-hint" style={{ marginTop: 6 }}>Internal note: {r.techNote}</div>}
      {r.reportUrl && <a className="dx-btn dx-btn--sm" style={{ marginTop: 8, textDecoration: 'none' }} href={r.reportUrl} target="_blank" rel="noopener noreferrer">📄 Open file</a>}
    </div>
  );
}

/** Bill the patient's insurer for this test (checked live; the patient confirms by SMS). */
function InsuranceBillCard({ order, type }) {
  const [info, setInfo] = useState(null);
  const [cardId, setCardId] = useState('');
  const [price, setPrice] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    api(`${OPS}/orders/${order.id}/insurance`).then(d => {
      setInfo(d);
      const usable = (d.cards || []).filter(c => c.status === 'VERIFIED' && c.inNetwork);
      if (usable[0]) setCardId(usable[0].id);
      if (d.price != null) setPrice(String(d.price));
    }).catch(() => setInfo({ cards: [] }));
  }, [order.id]);
  if (!info || (!(info.cards || []).some(c => c.status === 'VERIFIED')) ) return null;
  const usable = (info.cards || []).filter(c => c.status === 'VERIFIED' && c.inNetwork);
  const bill = async () => {
    setBusy(true); setError('');
    try { setResult(await api(`${OPS}/orders/${order.id}/bill-insurance`, { method: 'POST', body: { cardId, unitPrice: price === '' ? null : Number(price) } })); setInfo(i => ({ ...i, billed: true })); }
    catch (e) { setError(e?.message || 'Could not bill the insurer.'); } finally { setBusy(false); }
  };
  return (
    <div style={{ border: '1.5px solid #bfdbfe', background: '#eff6ff', borderRadius: 12, padding: '0.75rem 0.85rem', margin: '0.75rem 0' }}>
      <div className="dx-kpi-label" style={{ marginBottom: 6 }}>🛡️ Insurance</div>
      {info.billed && !result ? <p style={{ margin: 0, fontSize: '0.84rem' }}>Already billed to the insurer. See Insurance claims.</p> : result ? (
        <p style={{ margin: 0, fontSize: '0.84rem', color: '#166534' }}>✓ Billed to {result.insurerName}: insurer pays GHS {Number(result.coveredTotal).toFixed(2)}, patient GHS {Number(result.patientTotal).toFixed(2)}. The patient has been asked to confirm the test.</p>
      ) : usable.length === 0 ? (
        <p style={{ margin: 0, fontSize: '0.82rem', color: '#92400e' }}>The patient has {(info.cards || []).map(c => c.insurerName).join(', ')} cover, but this centre has no verified provider code for it (Settings → Insurance).</p>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          <select className="dx-select" value={cardId} onChange={e => setCardId(e.target.value)}>{usable.map(c => <option key={c.id} value={c.id}>{c.insurerName} · {c.planName || ''} · {c.memberNo}</option>)}</select>
          <input className="dx-input" type="number" placeholder="Price (GHS)" value={price} onChange={e => setPrice(e.target.value)} />
          <button type="button" className="dx-btn dx-btn--primary" disabled={busy || !cardId || price === ''} onClick={bill}>{busy ? 'Checking with insurer…' : 'Check cover & bill insurer'}</button>
          {error && <p style={{ margin: 0, color: '#b91c1c', fontSize: '0.8rem' }}>{error}</p>}
          {/pre-approval/i.test(error) && <button type="button" className="dx-btn" onClick={() => setAsk(true)}>Ask the insurer for approval</button>}
        </div>
      )}
      {ask && <PreauthRequestModal patientId={order.patientId} patientName={order.patientName} cards={usable.map(c => ({ id: c.id, insurerName: c.insurerName, planName: c.planName, memberNo: c.memberNo }))} cardId={cardId}
        serviceType={type === 'scan' ? 'SCAN' : 'LAB'} sourceType="DIAGNOSTIC_ORDER" sourceId={order.id} diagnosisText={order.notes}
        initialItems={[{ description: order.testType || 'Test', code: '', quantity: 1, unitPrice: price === '' ? '' : Number(price) }]}
        onClose={() => setAsk(false)} onDone={() => { setAsk(false); setError('Approval requested — bill again once the insurer approves.'); }} />}
    </div>
  );
}


export function DiagOrderDetail({ type = 'lab' }) {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const catalog = useCatalog(type);
  const [order, setOrder] = useState(null);
  const [events, setEvents] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const [o, ev, rs] = await Promise.all([
        api(`${OPS}/orders/${orderId}`),
        api(`${OPS}/events?orderId=${orderId}`).catch(() => []),
        api(`${OPS}/orders/${orderId}/results`).catch(() => []),
      ]);
      setOrder(o); setEvents(Array.isArray(ev) ? ev : []); setResults(Array.isArray(rs) ? rs : []);
    } catch { setOrder(null); }
    finally { setLoading(false); }
  }, [orderId]);
  useEffect(() => { load(); }, [load]);
  const actions = useOrderActions(type, catalog, () => load());

  if (loading) return <div className="pharmacy-page dx"><p className="dx-empty">Loading order…</p></div>;
  if (!order) return <div className="pharmacy-page dx"><p style={{ color: '#b91c1c' }}>Order not found or not with your centre.</p><button type="button" className="dx-btn" onClick={() => navigate('/dashboard/orders')}>← Back</button></div>;
  const st = stageOf(order.status);
  const o = { ...order, tatHours: catalog.find(order)?.tatHours || null };
  const ts = tatState(o, type);
  const steps = type === 'scan'
    ? [['Ordered', order.createdAt], ['Booked', order.scheduledAt], ['Started', order.startedAt], ['Reported', order.completedAt]]
    : [['Ordered', order.createdAt], ['Sample collected', order.sampleCollectedAt], ['Started', order.startedAt], ['Resulted', order.completedAt]];

  return (
    <div className={`pharmacy-page dx ${type === 'scan' ? 'dx--scan' : ''}`}>
      <button type="button" className="dx-btn dx-btn--sm" onClick={() => navigate('/dashboard/orders')}>← Worklist</button>
      <div className="dx-hero" style={{ marginTop: '0.75rem' }}>
        <div>
          <h1 style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{order.testType || 'Order'} <StagePill status={st} /> <PriorityPill priority={order.priority} /></h1>
          <p>{order.patientName || 'Patient'} · Dr. {order.doctorName || '—'} · {order.branchName || order.centerName || ''}</p>
        </div>
        {actions.buttons(order)}
      </div>

      <div className="dx-grid">
        <section className="dx-card dx-span-8">
          <div className="dx-card-head"><h2 className="dx-card-title">Progress</h2>{ts !== 'closed' && <span className={`dx-tat dx-tat--${ts}`}>{fmtHours(ageHours(o))} of {fmtHours(targetHours(o, type))} target</span>}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {steps.map(([label, at], i) => (
              <div key={label} style={{ borderTop: `4px solid ${at ? 'var(--dx-accent)' : '#e2e8f0'}`, paddingTop: 8 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: at ? '#0f172a' : '#94a3b8' }}>{i + 1}. {label}</div>
                <div className="dx-card-hint">{at ? fmtDateTime(at) : '—'}</div>
              </div>
            ))}
          </div>
          {st === 'REJECTED' && <div className="dx-alert dx-alert--red" style={{ marginTop: 12, marginBottom: 0 }}><div><strong>Rejected</strong><p>{order.rejectReason || 'No reason recorded.'}</p></div></div>}
          <div style={{ marginTop: '1rem', display: 'grid', gap: 8 }}>
            {results.length ? <Paged items={results}>{(results) => results.map(r => <ResultView key={r.id} r={r} />)}</Paged> : <p className="dx-empty">No result yet.</p>}
          </div>
        </section>
        <section className="dx-card dx-span-4">
          <div className="dx-card-head"><h2 className="dx-card-title">Details</h2></div>
          {[
            ['Order no.', order.orderCode || order.id.slice(0, 8)], ['Accession', order.accessionNo], ['Specimen', order.specimenType],
            ['Booked for', order.scheduledAt && fmtDateTime(order.scheduledAt)], ['Price', order.price != null ? `GHS ${Number(order.price).toFixed(2)}` : null],
            ['Doctor’s note', order.notes],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k} style={{ marginBottom: 8 }}><div className="dx-kpi-label">{k}</div><div style={{ fontSize: '0.86rem', fontWeight: 600, whiteSpace: 'pre-wrap' }}>{v}</div></div>
          ))}
          <InsuranceBillCard order={order} type={type} />
          <div className="dx-card-head" style={{ marginTop: '1rem' }}><h2 className="dx-card-title">Activity</h2></div>
          {events.length ? (
            <ul className="dx-list"><Paged items={events}>{(events) => events.map(e => (
              <li key={e.id} style={{ fontSize: '0.8rem', borderLeft: '3px solid var(--dx-accent)', paddingLeft: 8 }}>
                <b>{eventLabel(e)}</b>{e.fromStatus || e.toStatus ? <span className="dx-card-hint"> · {(STAGES[e.fromStatus]?.short || e.fromStatus || '—')} → {(STAGES[e.toStatus]?.short || e.toStatus || '—')}</span> : null}
                {e.notes && <div className="dx-card-hint">{e.notes}</div>}
                <div className="dx-card-hint">{fmtDateTime(e.createdAt)}</div>
              </li>
            ))}</Paged></ul>
          ) : <p className="dx-empty">No activity yet.</p>}
        </section>
      </div>
      {actions.element}
    </div>
  );
}
