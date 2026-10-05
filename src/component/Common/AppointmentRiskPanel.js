import React, { useState, useEffect, useCallback } from 'react';
import { CalendarClock, Check } from 'lucide-react';
import { api } from '../../services/apiClient';

/**
 * Upcoming appointments worth chasing, and why.
 *
 * Deliberately NOT presented as a prediction. The server computes this from a
 * transparent rule over booking and attendance behaviour — no trained model and
 * no personal characteristics — and every row carries its reasons so a clinic
 * can read them and disagree.
 *
 * The reasons are shown always, not behind a tooltip. A flag nobody can
 * interrogate is a flag nobody can push back on.
 */
export default function AppointmentRiskPanel() {
  const [rows, setRows] = useState([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api('/api/v1/ops/appointments/risk?days=14');
      setRows(res?.appointments || []);
      setNote(res?.note || '');
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markMissed = async (id) => {
    setMarking(id);
    try {
      await api('/api/v1/ops/appointments/no-show', { method: 'POST', body: { appointmentId: id } });
      load();
    } catch { /* the row simply stays */ } finally { setMarking(''); }
  };

  if (loading) return null;

  // Only the ones worth acting on. A list that includes every low-risk booking
  // is a list of the calendar, which the clinician already has.
  const worthChasing = rows.filter((r) => r.band !== 'low');
  if (worthChasing.length === 0) return null;

  return (
    <section style={S.card}>
      <header style={S.head}>
        <span style={S.icon}><CalendarClock size={17} /></span>
        <div style={{ minWidth: 0 }}>
          <h2 style={S.title}>Worth a reminder</h2>
          <p style={S.sub}>{note}</p>
        </div>
      </header>

      {worthChasing.map((r) => {
        const tone = TONES[r.band] || TONES.medium;
        return (
          <div key={r.appointmentId} style={{ ...S.row, borderColor: tone.border, background: tone.bg }}>
            <div style={S.rowTop}>
              <span style={{ ...S.band, color: tone.text }}>{r.band === 'high' ? 'Higher risk' : 'Some risk'}</span>
              <span style={S.who}>{r.patientName}</span>
              <span style={S.when}>{fmt(r.scheduledAt)}</span>
            </div>
            <ul style={S.reasons}>
              {(r.reasons || []).map((why, i) => <li key={i} style={S.reason}>{why}</li>)}
            </ul>
            <div style={S.actionRow}>
              <span style={S.action}>{r.suggestedAction}</span>
              <button
                type="button"
                style={{ ...S.mark, ...(marking === r.appointmentId ? S.off : null) }}
                onClick={() => markMissed(r.appointmentId)}
                disabled={marking === r.appointmentId}
                title="Only for appointments that have already passed"
              >
                <Check size={12} /> Mark as missed
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function fmt(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' :
    d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const TONES = {
  high:   { bg: '#fff4e5', border: '#f6e2bd', text: '#8a4b09' },  /* 6.25:1 */
  medium: { bg: '#f7f8fa', border: '#e9ebf1', text: '#3d4257' },  /* 9.1:1  */
};

const S = {
  card: {
    background: '#ffffff', border: '1px solid #e4e7ee', borderRadius: 18,
    padding: '1.1rem 1.2rem', marginBottom: '1rem',
  },
  head: { display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.5rem' },
  icon: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36, flexShrink: 0, borderRadius: 11,
    background: '#fff4e5', color: '#8a4b09',
  },
  title: { margin: 0, fontSize: '1rem', fontWeight: 800, color: '#15173a' },
  sub: { margin: '0.15rem 0 0', fontSize: '0.78rem', lineHeight: 1.5, color: '#565c6e' },

  row: { padding: '0.75rem 0.9rem', marginTop: '0.5rem', border: '1px solid', borderRadius: 12 },
  rowTop: { display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' },
  band: { fontSize: '0.74rem', fontWeight: 800 },
  who: { fontSize: '0.86rem', fontWeight: 750, color: '#15173a' },
  when: { fontSize: '0.78rem', color: '#565c6e' },

  reasons: { margin: '0.4rem 0 0', padding: '0 0 0 1.1rem' },
  reason: { fontSize: '0.79rem', lineHeight: 1.6, color: '#2c3040' },

  actionRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: '0.6rem', marginTop: '0.5rem', flexWrap: 'wrap',
  },
  action: { fontSize: '0.79rem', fontWeight: 700, color: '#2c3040' },
  mark: {
    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
    padding: '0.35rem 0.6rem', borderRadius: 999, border: '1px solid #d8dce6',
    background: '#ffffff', fontSize: '0.72rem', fontWeight: 650,
    color: '#565c6e', cursor: 'pointer', fontFamily: 'inherit',
  },
  off: { opacity: 0.5, cursor: 'not-allowed' },
};
