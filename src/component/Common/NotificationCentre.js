import React, { useState, useEffect } from 'react';
import { api } from '../../services/apiClient';
import FeedbackPrompt from './FeedbackPrompt';

/**
 * A person's own notifications and delivery controls.
 *
 * The switches only ever govern OPTIONAL mail. Appointment confirmations,
 * password resets and other transactional messages are never gated by them —
 * turning off "marketing" must not stop someone finding out their appointment
 * moved. That separation is enforced in the backend; this screen says so
 * plainly rather than implying the switches cover everything.
 */

const CATEGORIES = [
  { key: 'all',          label: 'All' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'therapy',      label: 'Therapy' },
  { key: 'payments',     label: 'Payments' },
  { key: 'wellness',     label: 'Health & wellness' },
  { key: 'system',       label: 'System' },
];

/** Map an event type onto the tab it belongs under. */
function categoryOf(eventType) {
  const t = String(eventType || '');
  if (t.startsWith('appointment')) return 'appointments';
  if (t.startsWith('therapy') || t.startsWith('couple') || t.startsWith('message')) return 'therapy';
  if (t.startsWith('payment') || t.startsWith('billing')) return 'payments';
  if (t.includes('wellness')) return 'wellness';
  return 'system';
}

export default function NotificationCentre() {
  const [items, setItems]   = useState([]);
  const [prefs, setPrefs]   = useState(null);
  const [tab, setTab]       = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [saved, setSaved]   = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [list, p] = await Promise.all([
        api('/api/v1/notifications/mine').catch(() => []),
        api('/api/v1/notification-preferences').catch(() => null),
      ]);
      setItems(Array.isArray(list) ? list : (list?.items || []));
      setPrefs(p);
    } catch (e) {
      setError(e.message || 'Could not load your notifications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const togglePref = async (key) => {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);           // optimistic: the switch should feel immediate
    setSaved(''); setError('');
    try {
      setPrefs(await api('/api/v1/notification-preferences', { method: 'PUT', body: { [key]: next[key] } }));
      setSaved('Saved.');
    } catch (e) {
      setPrefs(prefs);        // put it back if the server refused
      setError(e.message || 'Could not save that preference.');
    }
  };

  const shown = tab === 'all' ? items : items.filter((n) => categoryOf(n.eventType || n.event_type) === tab);

  return (
    <div style={{ padding: '1.5rem', maxWidth: 900 }}>
      <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.35rem' }}>Notifications</h1>
      <p style={{ margin: '0 0 1.25rem', color: '#64748b', fontSize: '0.9rem' }}>
        Everything the platform has sent you, and how you would like to hear from us.
      </p>

      {error ? <Banner tone="error">{error}</Banner> : null}
      {saved ? <Banner tone="ok">{saved}</Banner> : null}

      {/* Surveys addressed to this person, shown where they already look. */}
      <FeedbackPrompt />

      {/* ── Delivery controls ── */}
      {prefs ? (
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.75rem' }}>How we contact you</div>
          <Toggle label="Email" desc="Receipts, reminders and updates by email."
            on={prefs.emailEnabled} onChange={() => togglePref('emailEnabled')} />
          {/* This governs the phone app, not the browser — the web dashboard is
              updated live over SSE and never asks to send browser notifications. */}
          <Toggle label="Push notifications" desc="Alerts on the NessaHub app on your phone."
            on={prefs.pushEnabled} onChange={() => togglePref('pushEnabled')} />
          <Toggle label="Wellness emails" desc="Tips and encouragement from your own care team."
            on={prefs.wellnessEnabled} onChange={() => togglePref('wellnessEnabled')} />
          <Toggle label="Marketing emails" desc="Offers and promotions. Off unless you turn it on."
            on={prefs.marketingEnabled} onChange={() => togglePref('marketingEnabled')} />
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.75rem',
                        borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
            Appointment confirmations, security alerts and other essential messages are always sent,
            whatever you choose here.
          </div>
        </div>
      ) : null}

      {/* ── History ── */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', margin: '1.5rem 0 1rem' }}>
        {CATEGORIES.map((c) => (
          <button key={c.key} onClick={() => setTab(c.key)}
            style={{
              border: 'none', cursor: 'pointer', borderRadius: 999, padding: '0.35rem 0.85rem',
              fontSize: '0.8rem', fontWeight: 600,
              background: tab === c.key ? '#1d4ed8' : '#f1f5f9',
              color: tab === c.key ? '#fff' : '#475569',
            }}>{c.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: '#64748b' }}>Loading…</div>
      ) : shown.length === 0 ? (
        <div style={{ ...card, color: '#64748b', textAlign: 'center' }}>
          Nothing here yet.
        </div>
      ) : shown.map((n) => (
        <div key={n.id} style={{ ...card, marginBottom: '0.6rem',
                                 borderLeft: n.readAt || n.read_at ? '3px solid #e2e8f0' : '3px solid #1d4ed8' }}>
          <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{n.title}</div>
          <div style={{ color: '#475569', fontSize: '0.85rem', marginTop: 3 }}>{n.body}</div>
          <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: 5 }}>
            {(n.createdAt || n.created_at) ? new Date(n.createdAt || n.created_at).toLocaleString() : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

function Toggle({ label, desc, on, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                    padding: '0.6rem 0', cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}>
      <input type="checkbox" checked={Boolean(on)} onChange={onChange} style={{ marginTop: 3 }} />
      <span>
        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{label}</span>
        <span style={{ display: 'block', color: '#64748b', fontSize: '0.78rem' }}>{desc}</span>
      </span>
    </label>
  );
}

function Banner({ tone, children }) {
  const ok = tone === 'ok';
  return (
    <div style={{
      background: ok ? '#f0fdf4' : '#fef2f2',
      border: `1px solid ${ok ? '#bbf7d0' : '#fecaca'}`,
      color: ok ? '#166534' : '#991b1b',
      padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.88rem',
    }}>{children}</div>
  );
}

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.25rem' };
