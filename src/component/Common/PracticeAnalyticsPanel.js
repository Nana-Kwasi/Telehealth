import React, { useState, useEffect } from 'react';
import { BarChart3, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { api } from '../../services/apiClient';

/**
 * Practice (or platform) figures, this period against the last.
 *
 * Every number is counted by the server in SQL. The paragraph is the only
 * model-written part, it is written over those same figures, and it is fetched
 * separately — so the figures render at SQL speed and a slow or absent model
 * costs the paragraph, never a number.
 *
 * Direction is shown in a neutral colour on purpose. "Up" is good for
 * consultations and bad for cancellations; colouring it green or red would be
 * the screen making a judgement the figures do not.
 *
 * A figure the server marks unavailable is shown as "Not recorded", never as 0:
 * no billing rows means nobody is recording payments, which is a different
 * claim from nobody paying.
 */
const PERIODS = [7, 30, 90];

export default function PracticeAnalyticsPanel({ scope = 'me' }) {
  const [days, setDays]         = useState(30);
  const [data, setData]         = useState(null);
  const [summary, setSummary]   = useState(null);
  const [writing, setWriting]   = useState(false);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    let cancelled = false;
    const base = `/api/v1/ops/analytics/${scope === 'platform' ? 'platform' : 'me'}?days=${days}`;
    setLoading(true);
    setSummary(null);
    (async () => {
      try {
        const d = await api(`${base}&narrative=false`);
        if (cancelled) return;
        setData(d?.ok ? d : null);
        if (!d?.ok) return;
        setWriting(true);
        const n = await api(`${base}&narrative=true`);
        if (!cancelled) setSummary(n?.summary || null);
      } catch {
        /* figures already shown stay; a first-load failure renders nothing */
      } finally {
        if (!cancelled) { setLoading(false); setWriting(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [scope, days]);

  if (loading && !data) return null;
  if (!data) return null;

  const metrics = data.metrics || [];
  const workload = data.providerWorkload || [];

  return (
    <section style={S.card} aria-label={scope === 'platform' ? 'Platform figures' : 'Practice figures'}>
      <header style={S.head}>
        <span style={S.icon}><BarChart3 size={17} /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={S.title}>{scope === 'platform' ? 'Platform figures' : 'Your practice'}</h2>
          <p style={S.sub}>Last {data.days} days, compared with the {data.days} days before.</p>
        </div>
        <div style={S.periods} role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setDays(p)}
              aria-pressed={days === p}
              style={{ ...S.period, ...(days === p ? S.periodOn : null) }}
            >
              {p}d
            </button>
          ))}
        </div>
      </header>

      <div style={{ ...S.grid, opacity: loading ? 0.55 : 1 }}>
        {metrics.map((m) => <Tile key={m.key} m={m} />)}
      </div>

      {summary ? (
        <div style={S.summary}>
          <p style={S.summaryText}>{summary}</p>
          <p style={S.summaryNote}>AI-written from the figures above. The figures are the record.</p>
        </div>
      ) : writing ? (
        <p style={S.summaryNote}>Writing a summary…</p>
      ) : null}

      {scope === 'platform' && workload.length > 0 ? (
        <div style={S.workload}>
          <h3 style={S.h3}>Busiest providers</h3>
          {workload.map((w, i) => (
            <div key={`${w.provider}-${i}`} style={S.wRow}>
              <span style={S.wName}>{w.provider || 'Unnamed'}</span>
              <span style={S.wRole}>{String(w.role || '').toLowerCase()}</span>
              <span style={S.wCount}>{w.appointments}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Tile({ m }) {
  if (!m.available) {
    return (
      <div style={S.tile} title={m.note || ''}>
        <span style={S.label}>{m.label}</span>
        <span style={S.missing}>Not recorded</span>
        {m.note ? <span style={S.prev}>{m.note}</span> : null}
      </div>
    );
  }
  const Arrow = m.direction === 'up' ? ArrowUp : m.direction === 'down' ? ArrowDown : Minus;
  return (
    <div style={S.tile}>
      <span style={S.label}>{m.label}</span>
      <span style={S.value}>{fmtNum(m.key, m.value)}</span>
      {m.previous != null ? (
        <span style={S.prev}>
          <Arrow size={11} style={{ verticalAlign: '-1px' }} /> from {fmtNum(m.key, m.previous)}
        </span>
      ) : null}
    </div>
  );
}

function fmtNum(key, n) {
  if (n == null) return '—';
  // The server sends revenue in the minor unit (pesewas) so a whole number keeps the fraction.
  if (key === 'revenue') {
    return (n / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return Number(n).toLocaleString();
}

const S = {
  card: {
    background: '#ffffff', border: '1px solid #e4e7ee', borderRadius: 18,
    padding: '1.1rem 1.2rem', marginBottom: '1rem',
  },
  head: { display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap' },
  icon: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36, flexShrink: 0, borderRadius: 11,
    background: '#eef0ff', color: '#3b3f8f',
  },
  title: { margin: 0, fontSize: '1rem', fontWeight: 800, color: '#15173a' },
  sub: { margin: '0.15rem 0 0', fontSize: '0.78rem', lineHeight: 1.5, color: '#565c6e' },

  periods: { display: 'flex', gap: '0.3rem' },
  period: {
    padding: '0.3rem 0.6rem', borderRadius: 999, border: '1px solid #d8dce6',
    background: '#ffffff', fontSize: '0.72rem', fontWeight: 650,
    color: '#565c6e', cursor: 'pointer', fontFamily: 'inherit',
  },
  periodOn: { background: '#15173a', borderColor: '#15173a', color: '#ffffff' },

  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: '0.6rem', transition: 'opacity 0.15s',
  },
  tile: {
    display: 'flex', flexDirection: 'column', gap: '0.15rem',
    padding: '0.7rem 0.8rem', borderRadius: 12, background: '#f7f8fa', border: '1px solid #e9ebf1',
  },
  label: { fontSize: '0.74rem', fontWeight: 650, color: '#565c6e' },
  value: { fontSize: '1.35rem', fontWeight: 800, color: '#15173a', fontVariantNumeric: 'tabular-nums' },
  missing: { fontSize: '0.92rem', fontWeight: 750, color: '#3d4257' },
  prev: { fontSize: '0.72rem', lineHeight: 1.45, color: '#565c6e', fontVariantNumeric: 'tabular-nums' },

  summary: { marginTop: '0.8rem', padding: '0.75rem 0.9rem', borderRadius: 12, background: '#f4f5fb' },
  summaryText: { margin: 0, fontSize: '0.84rem', lineHeight: 1.6, color: '#2c3040' },
  summaryNote: { margin: '0.4rem 0 0', fontSize: '0.72rem', color: '#565c6e' },

  workload: { marginTop: '0.9rem' },
  h3: { margin: '0 0 0.35rem', fontSize: '0.82rem', fontWeight: 800, color: '#15173a' },
  wRow: {
    display: 'flex', alignItems: 'center', gap: '0.6rem',
    padding: '0.4rem 0', borderTop: '1px solid #eef0f4',
  },
  wName: { flex: 1, minWidth: 0, fontSize: '0.82rem', fontWeight: 650, color: '#15173a' },
  wRole: { fontSize: '0.72rem', color: '#565c6e', textTransform: 'capitalize' },
  wCount: { fontSize: '0.82rem', fontWeight: 800, color: '#15173a', fontVariantNumeric: 'tabular-nums' },
};
