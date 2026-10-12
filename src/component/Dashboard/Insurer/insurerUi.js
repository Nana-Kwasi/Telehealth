import React from 'react';
import { api, API_BASE, getStoredToken } from '../../../services/apiClient';
import '../Diagnostic/diagnostics.css';

/** Shared pieces for the insurer dashboard (and the provider insurance screens). */
export const INS = '/api/v1/insurer';

export const money = (v) => `GHS ${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const when = (v) => (v ? new Date(v).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const day = (v) => (v ? new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export const CLAIM = {
  AWAITING_PATIENT: ['Awaiting patient', '#e0f2fe', '#075985'], CONFIRMED: ['Confirmed', '#dbeafe', '#1e40af'], SUBMITTED: ['To review', '#ede9fe', '#5b21b6'],
  APPROVED: ['Approved', '#dcfce7', '#166534'], PAID: ['Paid', '#bbf7d0', '#14532d'], QUERIED: ['Queried', '#fef3c7', '#92400e'],
  REJECTED: ['Rejected', '#fee2e2', '#991b1b'], FLAGGED: ['Flagged', '#fecaca', '#991b1b'],
};
export const PREAUTH = {
  PENDING: ['Pending', '#fef3c7', '#92400e'], QUERIED: ['Queried', '#ffedd5', '#9a3412'], APPROVED: ['Approved', '#dcfce7', '#166534'],
  PARTIAL: ['Partly approved', '#d9f99d', '#365314'], REJECTED: ['Rejected', '#fee2e2', '#991b1b'], CANCELLED: ['Cancelled', '#f1f5f9', '#475569'],
  EXPIRED: ['Expired', '#f1f5f9', '#475569'], USED: ['Used', '#e0e7ff', '#3730a3'],
};
export const SEVERITY = { HIGH: ['High', '#dc2626', '#fff'], MEDIUM: ['Medium', '#f59e0b', '#fff'], LOW: ['Low', '#e2e8f0', '#334155'] };
export const FLAG_LABEL = {
  PATIENT_DENIED_RECEIPT: 'Patient said not received', NO_PATIENT_CONFIRMATION: 'No patient reply', PARTIAL_COVER: 'Partly covered', ID_CHECK_ONLY: 'ID check only (no SMS code)',
};
export const flagsOf = (json) => { try { return JSON.parse(json || '[]'); } catch { return []; } };

export function Pill({ map, k }) {
  const m = map[k] || [k, '#f1f5f9', '#475569'];
  return <span className="dx-pill" style={{ background: m[1], color: m[2] }}>{m[0]}</span>;
}

export function Kpi({ label, value, sub, color, onClick }) {
  return (
    <div className={`dx-kpi ${onClick ? 'dx-kpi--click' : ''}`} style={{ '--kpi': color }} onClick={onClick} role={onClick ? 'button' : undefined}>
      <div className="dx-kpi-label">{label}</div><div className="dx-kpi-value">{value}</div>{sub ? <div className="dx-kpi-sub">{sub}</div> : null}
    </div>
  );
}

export function Modal({ title, sub, onClose, children, footer, width = 820 }) {
  return (
    <div className="dx-modal-bg" onClick={onClose}>
      <div className="dx-modal" style={{ maxWidth: width }} onClick={e => e.stopPropagation()}>
        <div className="dx-modal-head"><div><h3>{title}</h3>{sub ? <div className="dx-card-hint" style={{ marginTop: 3 }}>{sub}</div> : null}</div>
          <button type="button" className="dx-btn dx-btn--sm" onClick={onClose}>✕</button></div>
        <div className="dx-modal-body">{children}</div>
        {footer ? <div className="dx-modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Page({ title, sub, actions, children }) {
  return (
    <div className="pharmacy-page dx dx--ins">
      <div className="dx-hero"><div><h1>{title}</h1>{sub ? <p>{sub}</p> : null}</div>{actions ? <div className="dx-toolbar">{actions}</div> : null}</div>
      {children}
    </div>
  );
}

export function Empty({ children }) { return <p className="dx-empty">{children}</p>; }

/** Download a server CSV with the signed-in token. */
export async function downloadCsv(path, filename) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${getStoredToken()}` } });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useLoad(fn, deps) {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const load = React.useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await fn()); } catch (e) { setError(e?.message || 'Could not load.'); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  React.useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}

export const get = (p) => api(p);
export const post = (p, body) => api(p, { method: 'POST', body: body || {} });
export const patch = (p, body) => api(p, { method: 'PATCH', body: body || {} });
export const put = (p, body) => api(p, { method: 'PUT', body: body || {} });
