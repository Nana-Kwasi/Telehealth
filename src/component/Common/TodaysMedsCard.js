import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pill, Check, X, Bell, ChevronRight } from 'lucide-react';
import { api } from '../../services/apiClient';

/**
 * Today's medication on the home dashboard — the same reminders and doses
 * My Care manages (/care/reminders, /care/doses), so a reminder set there shows
 * here straight away and a dose marked here is marked there.
 *
 * Renders nothing for someone with no reminders: a home card that only says
 * "nothing here" is noise. accent follows the dashboard (therapy / medical).
 */
const isToday = (iso) => {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};
const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const STATUS = {
  taken: { label: 'Taken', bg: '#dcfce7', fg: '#15803d' },
  missed: { label: 'Missed', bg: '#fee2e2', fg: '#b91c1c' },
  skipped: { label: 'Skipped', bg: '#f1f5f9', fg: '#475569' },
};

export default function TodaysMedsCard({ accent = '#2563eb' }) {
  const navigate = useNavigate();
  const [reminders, setReminders] = useState(null);
  const [doses, setDoses] = useState([]);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    const [r, d] = await Promise.all([
      api('/api/v1/care/reminders').catch(() => []),
      api('/api/v1/care/doses').catch(() => []),
    ]);
    setReminders((Array.isArray(r) ? r : []).filter((x) => x.active));
    setDoses((Array.isArray(d) ? d : []).filter((x) => isToday(x.due_at))
      .sort((a, b) => new Date(a.due_at) - new Date(b.due_at)));
  }, []);

  useEffect(() => {
    load();
    // The 15-minute job adds doses through the day; keep the card current.
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const mark = async (id, status) => {
    setBusy(id);
    try { await api(`/api/v1/care/doses/${id}`, { method: 'POST', body: { status } }); await load(); }
    catch { /* leave as is; My Care shows the error path */ }
    finally { setBusy(null); }
  };

  if (!reminders || reminders.length === 0) return null;

  const pending = doses.filter((d) => d.status === 'pending').length;

  return (
    <section style={S.card} aria-label="Today's medication">
      <div style={S.head}>
        <span style={{ ...S.badge, background: `${accent}18`, color: accent }}><Pill size={18} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={S.h3}>Today's medication</h3>
          <p style={S.sub}>
            {doses.length === 0 ? 'Nothing due today'
              : pending ? `${pending} dose${pending > 1 ? 's' : ''} to confirm`
                : 'All done for today'}
          </p>
        </div>
        <button type="button" style={{ ...S.link, color: accent }} onClick={() => navigate('/dashboard/my-care')}>
          My Care <ChevronRight size={15} />
        </button>
      </div>

      {doses.length ? doses.map((d) => {
        const done = STATUS[d.status];
        const upcoming = d.status === 'pending' && new Date(d.due_at) > new Date();
        return (
          <div key={d.id} style={S.row}>
            <span style={{ ...S.time, color: accent }}>{timeOf(d.due_at)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={S.med}>{d.medication}</strong>
              {d.dosage ? <span style={S.dose}>{d.dosage}</span> : null}
            </div>
            {done ? (
              <span style={{ ...S.pill, background: done.bg, color: done.fg }}>{done.label}</span>
            ) : upcoming ? (
              <span style={{ ...S.pill, background: '#f1f5f9', color: '#475569' }}><Bell size={12} /> Upcoming</span>
            ) : (
              <span style={{ display: 'flex', gap: 6 }}>
                <button type="button" disabled={busy === d.id} style={{ ...S.btn, background: accent, color: '#fff' }}
                  onClick={() => mark(d.id, 'taken')}><Check size={14} /> Taken</button>
                <button type="button" disabled={busy === d.id} style={{ ...S.btn, background: '#fff', color: '#b91c1c', border: '1px solid #fecaca' }}
                  onClick={() => mark(d.id, 'missed')}><X size={14} /> Missed</button>
              </span>
            )}
          </div>
        );
      }) : reminders.map((r) => (
        <div key={r.id} style={S.row}>
          <span style={{ ...S.time, color: accent }}>{(r.times_of_day || []).join(' · ')}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={S.med}>{r.medication}</strong>
            {r.dosage ? <span style={S.dose}>{r.dosage}</span> : null}
          </div>
        </div>
      ))}
    </section>
  );
}

const S = {
  card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1rem 1.1rem', boxShadow: '0 6px 20px rgba(15,23,42,0.05)', margin: '0 0 1.25rem' },
  head: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' },
  badge: { width: 38, height: 38, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  h3: { margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' },
  sub: { margin: 0, fontSize: '0.8rem', color: '#64748b' },
  link: { display: 'inline-flex', alignItems: 'center', gap: 2, border: 'none', background: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' },
  row: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap' },
  time: { fontWeight: 800, fontSize: '0.9rem', minWidth: 52 },
  med: { display: 'block', fontSize: '0.92rem', color: '#0f172a' },
  dose: { fontSize: '0.78rem', color: '#64748b' },
  pill: { display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 999, padding: '0.25rem 0.65rem', fontSize: '0.75rem', fontWeight: 700 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', borderRadius: 10, padding: '0.4rem 0.7rem', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' },
};
