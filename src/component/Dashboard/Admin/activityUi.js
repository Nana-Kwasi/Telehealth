import React from 'react';
import { API_BASE, getStoredToken } from '../../../services/apiClient';

/** Shared bits for the super admin's activity screens (user trail, platform activity). */

export const CATEGORIES = [
  ['', 'All'], ['security', 'Security'], ['account', 'Account'], ['care', 'Care'], ['prescriptions', 'Prescriptions'],
  ['diagnostics', 'Lab & scan'], ['pharmacy', 'Pharmacy'], ['records', 'Records & files'], ['insurance', 'Insurance'],
  ['payments', 'Payments'], ['messages', 'Messages'], ['calls', 'Calls'], ['ai', 'AI'], ['support', 'Support'],
  ['organisations', 'Organisations'], ['admin', 'Admin'], ['other', 'Other'],
];

export const CAT_COLOR = {
  security: '#dc2626', account: '#0ea5e9', care: '#16a34a', prescriptions: '#7c3aed', diagnostics: '#0891b2', pharmacy: '#0f766e',
  records: '#64748b', insurance: '#1d4ed8', payments: '#ca8a04', messages: '#db2777', calls: '#9333ea', ai: '#f59e0b',
  support: '#ea580c', organisations: '#475569', admin: '#111827', other: '#94a3b8',
};

export const when = (v) => (v ? new Date(v).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

export function device(ua) {
  if (!ua) return 'Unknown device';
  const u = String(ua);
  const os = /iPhone|iPad|iOS/i.test(u) ? 'iOS' : /Android/i.test(u) ? 'Android' : /Mac OS X|Macintosh/i.test(u) ? 'macOS' : /Windows/i.test(u) ? 'Windows' : /Linux/i.test(u) ? 'Linux' : '';
  const app = /okhttp|Expo|ReactNative|CFNetwork|Dalvik/i.test(u) ? 'NessaHub app' : /Edg\//.test(u) ? 'Edge' : /Chrome\//.test(u) ? 'Chrome' : /Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : '';
  return [app, os].filter(Boolean).join(' on ') || u.slice(0, 40);
}

export function Pill({ category }) {
  const c = CAT_COLOR[category] || CAT_COLOR.other;
  return <span style={{ color: c, background: `${c}14`, border: `1px solid ${c}33`, borderRadius: 999, padding: '0.1rem 0.55rem', fontSize: '0.7rem', fontWeight: 800, whiteSpace: 'nowrap' }}>{category || 'other'}</span>;
}

export function Outcome({ outcome }) {
  if (!outcome || outcome === 'OK') return <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '0.74rem' }}>OK</span>;
  return <span style={{ color: '#fff', background: outcome === 'DENIED' ? '#b45309' : '#dc2626', borderRadius: 6, padding: '0.05rem 0.4rem', fontWeight: 800, fontSize: '0.7rem' }}>{outcome}</span>;
}

export function Kpi({ label, value, color = '#0f172a', sub }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '0.85rem 1rem', minWidth: 0 }}>
      <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '1.45rem', fontWeight: 800, color, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value ?? '—'}</div>
      {sub ? <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{sub}</div> : null}
    </div>
  );
}

export function Card({ title, children, right }) {
  return (
    <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '1rem 1.1rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>{title}</h3>{right}
      </div>
      {children}
    </section>
  );
}

/** Download the filtered trail as CSV (the server builds it; the token goes in the header, never the URL). */
export async function downloadActivityCsv(params) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
  const res = await fetch(`${API_BASE}/api/v1/admin/activity/export?${qs}`, { headers: { Authorization: `Bearer ${getStoredToken()}` } });
  if (!res.ok) throw new Error('Could not build the report.');
  const blob = await res.blob();
  const name = (res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'nessahub-activity.csv';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const input = { padding: '0.45rem 0.6rem', border: '1.5px solid #cbd5e1', borderRadius: 9, fontSize: '0.82rem', background: '#fff' };
export const btn = { padding: '0.45rem 0.85rem', borderRadius: 9, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' };
