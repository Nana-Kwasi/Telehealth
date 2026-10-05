import React, { useState, useEffect, useCallback } from 'react';
import { Search, Clock, FileText, Pill, FlaskConical, CalendarDays, Activity } from 'lucide-react';
import { api } from '../../services/apiClient';

/**
 * Search a record, and read it in order.
 *
 * Both halves come from the same server retrieval, so the timeline and a search
 * can never disagree about what is on file.
 *
 * The RECORDS are the answer; the summary sentence is a convenience. When the
 * narration fails the entries still render, and when nothing matches the screen
 * says so rather than showing a reassuring paragraph about an empty record.
 */
export default function RecordExplorer({ subjectId = null, title = 'Records' }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadTimeline = useCallback(async () => {
    try {
      const qs = subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : '';
      const res = await api(`/api/v1/ai/records/timeline${qs}`);
      setTimeline(res?.ok ? res : null);
    } catch {
      setTimeline(null);
    }
  }, [subjectId]);

  useEffect(() => { loadTimeline(); }, [loadTimeline]);

  const search = async (e) => {
    e?.preventDefault?.();
    if (!query.trim()) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const res = await api('/api/v1/ai/records/search', {
        method: 'POST',
        body: { subjectId, query },
      });
      if (!res?.ok) { setError(res?.message || 'That search could not be run.'); return; }
      setResult(res);
    } catch (err) {
      setError(err?.message || 'That search could not be run.');
    } finally {
      setBusy(false);
    }
  };

  const showing = result ? result.entries : null;

  return (
    <div style={S.page}>
      <header style={S.head}>
        <span style={S.icon}><Clock size={20} /></span>
        <div>
          <h1 style={S.h1}>{title}</h1>
          <p style={S.lead}>
            Everything on file, in order. Search it in your own words — the
            answer comes from the record, never from the assistant's memory.
          </p>
        </div>
      </header>

      <form style={S.searchRow} onSubmit={search}>
        <Search size={16} style={{ color: '#565c6e', flexShrink: 0 }} />
        <input
          style={S.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. everything about blood pressure"
        />
        <button type="submit" style={{ ...S.go, ...(busy || !query.trim() ? S.off : null) }}
          disabled={busy || !query.trim()}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error ? <p style={S.error}>{error}</p> : null}

      {result ? (
        <section style={S.card}>
          <h2 style={S.h2}>
            {result.matched ? `${result.matched} entr${result.matched === 1 ? 'y' : 'ies'} for “${result.query}”` : `Nothing for “${result.query}”`}
          </h2>
          {result.summary ? <p style={S.summary}>{result.summary}</p> : null}
          {(showing || []).map((e, i) => <Row key={i} entry={e} />)}
          {result.matched ? (
            <button type="button" style={S.clear} onClick={() => { setResult(null); setQuery(''); }}>
              Back to the full timeline
            </button>
          ) : null}
        </section>
      ) : null}

      {!result && timeline ? (
        timeline.total === 0 ? (
          <section style={S.card}><p style={S.empty}>Nothing on file yet.</p></section>
        ) : (
          <section style={S.card}>
            <h2 style={S.h2}>Timeline · {timeline.total} entries</h2>
            {timeline.days.map((d) => (
              <div key={d.date} style={S.day}>
                <div style={S.dayLabel}>{fmtDay(d.date)}</div>
                <div style={S.dayItems}>
                  {d.items.map((e, i) => <Row key={i} entry={e} />)}
                </div>
              </div>
            ))}
          </section>
        )
      ) : null}
    </div>
  );
}

function Row({ entry }) {
  const Icon = ICONS[entry.kind] || Activity;
  const tone = KINDS[entry.kind] || KINDS.event;
  return (
    <div style={S.row}>
      <span style={{ ...S.rowIcon, background: tone.bg, color: tone.text }}>
        <Icon size={13} />
      </span>
      <span style={S.rowBody}>
        <span style={S.rowTitle}>{entry.title}</span>
        {entry.text ? <span style={S.rowText}>{entry.text}</span> : null}
      </span>
    </div>
  );
}

const ICONS = {
  note: FileText, prescription: Pill, result: FlaskConical,
  appointment: CalendarDays, event: Activity,
};

/* Measured on each chip's own background. */
const KINDS = {
  note:         { bg: '#eef2ff', text: '#2a3ea8' },  /* 7.98:1 */
  prescription: { bg: '#e6f6ec', text: '#12602f' },  /* 6.85:1 */
  result:       { bg: '#fff4e5', text: '#8a4b09' },  /* 6.25:1 */
  appointment:  { bg: '#f1f3f8', text: '#3d4257' },  /* 9.0:1  */
  event:        { bg: '#f7f8fa', text: '#3d4257' },
};

function fmtDay(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso :
    d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

const S = {
  page: { padding: '1.5rem', maxWidth: 820, margin: '0 auto' },
  head: { display: 'flex', gap: '0.85rem', alignItems: 'flex-start', marginBottom: '1.1rem' },
  icon: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 44, height: 44, flexShrink: 0, borderRadius: 14,
    background: '#eef2ff', color: '#2a3ea8',
  },
  h1: { margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#15173a' },
  h2: { margin: '0 0 0.8rem', fontSize: '0.95rem', fontWeight: 800, color: '#15173a' },
  lead: { margin: '0.2rem 0 0', fontSize: '0.87rem', lineHeight: 1.55, color: '#565c6e' },

  searchRow: {
    display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem',
    background: '#ffffff', border: '1px solid #d8dce6', borderRadius: 12,
    padding: '0.55rem 0.8rem',
  },
  search: {
    flex: 1, border: 'none', outline: 'none', fontSize: '0.88rem',
    fontFamily: 'inherit', color: '#2c3040', background: 'transparent',
  },
  go: {
    padding: '0.45rem 0.9rem', borderRadius: 999, border: 'none',
    background: '#2b5ce6', color: '#ffffff', fontSize: '0.8rem',
    fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
  },
  off: { opacity: 0.5, cursor: 'not-allowed' },

  card: {
    background: '#ffffff', border: '1px solid #e4e7ee', borderRadius: 18,
    padding: '1.1rem 1.2rem', marginBottom: '1rem',
  },
  summary: {
    margin: '0 0 0.9rem', padding: '0.7rem 0.85rem', borderRadius: 12,
    background: '#f7f8fa', fontSize: '0.87rem', lineHeight: 1.6, color: '#2c3040',
  },

  day: { display: 'flex', gap: '0.9rem', marginBottom: '0.9rem' },
  dayLabel: {
    flexShrink: 0, width: 120, fontSize: '0.76rem', fontWeight: 700,
    color: '#565c6e', paddingTop: '0.35rem',
  },
  dayItems: { flex: 1, minWidth: 0, borderLeft: '2px solid #eef0f5', paddingLeft: '0.9rem' },

  row: { display: 'flex', gap: '0.6rem', alignItems: 'flex-start', marginBottom: '0.55rem' },
  rowIcon: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 26, height: 26, flexShrink: 0, borderRadius: 8,
  },
  rowBody: { display: 'flex', flexDirection: 'column', gap: '0.1rem', minWidth: 0 },
  rowTitle: { fontSize: '0.85rem', fontWeight: 700, color: '#15173a' },
  rowText: { fontSize: '0.8rem', lineHeight: 1.5, color: '#3d4257' },

  clear: {
    marginTop: '0.4rem', padding: '0.45rem 0.85rem', borderRadius: 999,
    border: '1px solid #d8dce6', background: '#ffffff', fontSize: '0.78rem',
    fontWeight: 650, color: '#2c3040', cursor: 'pointer', fontFamily: 'inherit',
  },
  error: { fontSize: '0.84rem', color: '#8f1d17', margin: '0 0 0.8rem' },
  empty: { margin: 0, fontSize: '0.87rem', color: '#565c6e' },
};
