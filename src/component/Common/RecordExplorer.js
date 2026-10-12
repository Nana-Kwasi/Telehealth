import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Clock, FileText, Pill, FlaskConical, CalendarDays, Activity } from 'lucide-react';
import { api } from '../../services/apiClient';
import './RecordExplorer.css';

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
const SUGGESTED = ['blood pressure', 'my last prescription', 'lab results', 'allergies'];
const FILTERS = [
  ['all', 'All'], ['note', 'Notes'], ['prescription', 'Prescriptions'],
  ['result', 'Results'], ['appointment', 'Appointments'],
];

export default function RecordExplorer({ subjectId = null, title = 'Records' }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [timeline, setTimeline] = useState(undefined); // undefined = loading, null = unavailable
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [kind, setKind] = useState('all');

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

  const search = async (e, text) => {
    e?.preventDefault?.();
    const q = (text ?? query).trim();
    if (!q) return;
    if (text) setQuery(text);
    setBusy(true); setError(''); setResult(null);
    try {
      const res = await api('/api/v1/ai/records/search', {
        method: 'POST',
        body: { subjectId, query: q },
      });
      if (!res?.ok) { setError(res?.message || 'That search could not be run.'); return; }
      setResult(res);
    } catch (err) {
      setError(err?.message || 'That search could not be run.');
    } finally {
      setBusy(false);
    }
  };

  // Counts per kind, for the header and the filter chips.
  const counts = useMemo(() => {
    const c = { all: 0 };
    (timeline?.days || []).forEach((d) => d.items.forEach((e) => {
      c.all += 1;
      c[e.kind] = (c[e.kind] || 0) + 1;
    }));
    return c;
  }, [timeline]);

  const days = useMemo(() => (timeline?.days || [])
    .map((d) => ({ ...d, items: kind === 'all' ? d.items : d.items.filter((e) => e.kind === kind) }))
    .filter((d) => d.items.length), [timeline, kind]);

  return (
    <div className="rx-page">
      <header className="rx-hero">
        <div className="rx-hero-top">
          <span className="rx-hero-icon"><Clock size={22} /></span>
          <div>
            <h1>{title}</h1>
            <p>
              Everything on file, in order. Search it in your own words — the answer comes
              from the record, never from the assistant's memory.
            </p>
          </div>
        </div>
        {timeline ? (
          <div className="rx-stats">
            {[['note', 'Notes'], ['prescription', 'Prescriptions'], ['result', 'Results'], ['appointment', 'Appointments']].map(([k, label]) => {
              const Icon = ICONS[k];
              return (
                <div key={k} className="rx-stat">
                  <Icon size={16} />
                  <strong>{counts[k] || 0}</strong>
                  <span>{label}</span>
                </div>
              );
            })}
          </div>
        ) : null}
      </header>

      <form className="rx-search" onSubmit={search}>
        <Search size={18} className="rx-search-icon" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your record, e.g. everything about blood pressure"
          aria-label="Search your record"
        />
        <button type="submit" disabled={busy || !query.trim()}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </form>
      {!result ? (
        <div className="rx-suggest">
          <span>Try:</span>
          {SUGGESTED.map((t) => (
            <button key={t} type="button" onClick={() => search(null, t)} disabled={busy}>{t}</button>
          ))}
        </div>
      ) : null}

      {error ? <p className="rx-error">{error}</p> : null}

      {result ? (
        <section className="rx-card">
          <div className="rx-card-head">
            <h2>
              {result.matched ? `${result.matched} entr${result.matched === 1 ? 'y' : 'ies'} for “${result.query}”` : `Nothing for “${result.query}”`}
            </h2>
            <button type="button" className="rx-clear" onClick={() => { setResult(null); setQuery(''); }}>
              Back to the full timeline
            </button>
          </div>
          {result.summary ? <p className="rx-summary">{result.summary}</p> : null}
          <div className="rx-entries">
            {(result.entries || []).map((e, i) => <Row key={i} entry={e} />)}
          </div>
        </section>
      ) : null}

      {!result && timeline === undefined ? (
        <section className="rx-card">
          {[0, 1, 2].map((i) => <div key={i} className="rx-skeleton" />)}
        </section>
      ) : null}

      {!result && timeline === null ? (
        <section className="rx-card rx-empty">
          <span><FileText size={26} /></span>
          <strong>Your record could not be loaded</strong>
          <p>Please try again in a moment.</p>
        </section>
      ) : null}

      {!result && timeline ? (
        timeline.total === 0 ? (
          <section className="rx-card rx-empty">
            <span><FileText size={26} /></span>
            <strong>Nothing on file yet</strong>
            <p>Notes, prescriptions, results and appointments will appear here as your care goes on.</p>
          </section>
        ) : (
          <section className="rx-card">
            <div className="rx-card-head">
              <h2>Timeline <span className="rx-count">{timeline.total}</span></h2>
              <div className="rx-filters" role="tablist" aria-label="Filter by type">
                {FILTERS.map(([k, label]) => (
                  <button key={k} type="button" role="tab" aria-selected={kind === k}
                    className={kind === k ? 'on' : ''} onClick={() => setKind(k)}
                    disabled={k !== 'all' && !counts[k]}>
                    {label}{counts[k] ? <em>{counts[k]}</em> : null}
                  </button>
                ))}
              </div>
            </div>
            <div className="rx-timeline">
              {days.map((d) => {
                const dt = new Date(d.date);
                const valid = !Number.isNaN(dt.getTime());
                return (
                  <div key={d.date} className="rx-day">
                    <div className="rx-day-date" title={fmtDay(d.date)}>
                      {valid ? (
                        <>
                          <em>{dt.toLocaleDateString(undefined, { month: 'short' })}</em>
                          <strong>{dt.getDate()}</strong>
                          <small>{dt.getFullYear()}</small>
                        </>
                      ) : <small>{d.date}</small>}
                    </div>
                    <div className="rx-day-items">
                      {d.items.map((e, i) => <Row key={i} entry={e} />)}
                    </div>
                  </div>
                );
              })}
            </div>
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
    <div className="rx-row">
      <span className="rx-row-icon" style={{ background: tone.bg, color: tone.text }}>
        <Icon size={15} />
      </span>
      <span className="rx-row-body">
        <span className="rx-row-kind" style={{ color: tone.text }}>{LABELS[entry.kind] || 'Event'}</span>
        <span className="rx-row-title">{entry.title}</span>
        {entry.text ? <span className="rx-row-text">{entry.text}</span> : null}
      </span>
    </div>
  );
}

const LABELS = { note: 'Note', prescription: 'Prescription', result: 'Result', appointment: 'Appointment', event: 'Event' };

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
