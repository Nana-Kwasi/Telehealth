import React, { useCallback, useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ResponsiveContainer,
} from 'recharts';
import { api } from '../../services/apiClient';
import * as HI from '@healthicons/react';
import EmptyState from './EmptyState';
import './Measures.css';

/*
 * Scored measures (PHQ-9, GAD-7).
 *  - MeasuresPanel: the clinician's Measures tab on a client's page.
 *  - MyQuestionnaires: the client's "questionnaires to fill in" card.
 * Wording, scoring and severity bands all come from the server.
 */

const BAND_COLOURS = {
  minimal: '#dcfce7', mild: '#fef9c3', moderate: '#fde68a', moderately_severe: '#fed7aa', severe: '#fecaca',
};
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const signed = (n) => (n == null ? '—' : n > 0 ? `+${n}` : String(n));

function changeText(n, meaningful) {
  if (n == null) return 'First score';
  if (n === 0) return 'No change';
  const dir = n < 0 ? 'better' : 'worse';
  return `${signed(n)} (${Math.abs(n) >= meaningful ? `meaningfully ${dir}` : `slightly ${dir}`})`;
}

// ── Clinician ────────────────────────────────────────────────────────────────

export function MeasuresPanel({ clientId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [measure, setMeasure] = useState('PHQ9');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState('');

  const load = useCallback(() => {
    api(`/api/v1/measures/clients/${clientId}`).then(setData).catch((e) => setError(e?.message || 'Could not load measures.'));
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    setBusy(true); setError(''); setSent('');
    try {
      await api('/api/v1/measures/requests', {
        method: 'POST', body: { clientId, measure, repeatEveryDays: repeat ? Number(repeat) : null },
      });
      setSent('Sent. The client has been notified.');
      load();
    } catch (e) {
      setError(e?.message || 'Could not send.');
    } finally {
      setBusy(false);
    }
  };

  const stop = async (id) => {
    try { await api(`/api/v1/measures/requests/${id}`, { method: 'DELETE' }); load(); }
    catch (e) { setError(e?.message || 'Could not stop it.'); }
  };

  if (!data) return <div className="ms-card">{error || 'Loading measures…'}</div>;
  const defs = Object.fromEntries(data.measures.map((m) => [m.code, m]));

  return (
    <div className="ms-wrap">
      <div className="ms-card">
        <h3 className="ms-title">Send a questionnaire</h3>
        <div className="ms-send">
          <select value={measure} onChange={(e) => setMeasure(e.target.value)} aria-label="Questionnaire">
            {data.measures.map((m) => <option key={m.code} value={m.code}>{m.name} ({m.purpose})</option>)}
          </select>
          <select value={repeat} onChange={(e) => setRepeat(e.target.value)} aria-label="Repeat">
            <option value="">Once</option>
            <option value="7">Every week</option>
            <option value="14">Every 2 weeks</option>
            <option value="28">Every 4 weeks</option>
          </select>
          <button className="ms-btn" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
        </div>
        {sent && <p className="ms-ok">{sent}</p>}
        {error && <p className="ms-err">{error}</p>}
        {data.pending.length > 0 && (
          <ul className="ms-pending">
            {data.pending.map((p) => (
              <li key={p.id}>
                <span>
                  <strong>{defs[p.measure]?.name}</strong>
                  {new Date(p.available_from) > new Date() ? ` · next due ${fmtDate(p.available_from)}` : ' · waiting for the client'}
                  {p.repeat_every_days ? ` · repeats every ${p.repeat_every_days} days` : ''}
                </span>
                <button className="ms-link" onClick={() => stop(p.id)}>Stop</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data.measures.map((m) => (
        <MeasureHistory key={m.code} def={m} rows={data.results[m.code] || []} />
      ))}
    </div>
  );
}

function MeasureHistory({ def, rows }) {
  const last = rows[rows.length - 1];
  const points = rows.map((r) => ({ date: fmtDate(r.completed_at), score: r.score }));
  return (
    <div className="ms-card">
      <div className="ms-head">
        <h3 className="ms-title">{def.name} · {def.purpose}</h3>
        {last && <span className={`ms-band ms-band--${last.severity}`}>{last.score}/{def.maxScore} · {last.severityLabel}</span>}
      </div>
      {rows.length === 0 ? (
        <EmptyState compact icon={HI.Psychology} tone="violet" title="No results yet">Send a PHQ-9 or GAD-7 to see scores over time here.</EmptyState>
      ) : (
        <>
          <div className="ms-stats">
            <div><span>Since first</span><strong>{changeText(last.changeFromBaseline, def.meaningfulChange)}</strong></div>
            <div><span>Since last</span><strong>{changeText(last.changeFromLast, def.meaningfulChange)}</strong></div>
            <div><span>Completed</span><strong>{rows.length}</strong></div>
          </div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                {def.bands.map((b) => (
                  <ReferenceArea key={b.key} y1={b.from} y2={b.to + 1 > def.maxScore ? def.maxScore : b.to + 1}
                    fill={BAND_COLOURS[b.key]} fillOpacity={0.55} ifOverflow="hidden" />
                ))}
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, def.maxScore]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="ms-legend">
            {def.bands.map((b) => <span key={b.key}><i style={{ background: BAND_COLOURS[b.key] }} />{b.label} {b.from}–{b.to}</span>)}
          </p>
          <table className="ms-table">
            <thead><tr><th>Date</th><th>Score</th><th>Severity</th><th>Change</th></tr></thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.completed_at)}</td>
                  <td>{r.score}</td>
                  <td>{r.severityLabel}{r.safety_flag ? <span className="ms-flag"> · self-harm item answered</span> : null}</td>
                  <td>{signed(r.changeFromLast)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ── Client ───────────────────────────────────────────────────────────────────

export function MyQuestionnaires() {
  const [due, setDue] = useState([]);
  const [open, setOpen] = useState(null);
  const [done, setDone] = useState(null);

  const load = useCallback(() => {
    api('/api/v1/measures/mine').then((d) => setDue(d.due || [])).catch(() => setDue([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (done) {
    return (
      <div className="ms-card ms-client">
        <p className="ms-ok">Thank you. Your answers have been sent to your clinician.</p>
        {done.crisisMessage && <p className="ms-crisis" role="alert">{done.crisisMessage}</p>}
        <button className="ms-link" onClick={() => { setDone(null); load(); }}>Close</button>
      </div>
    );
  }
  if (open) return <Questionnaire req={open} onCancel={() => setOpen(null)} onDone={(r) => { setOpen(null); setDone(r); }} />;
  if (due.length === 0) return null;

  return (
    <div className="ms-card ms-client">
      <h3 className="ms-title">Questionnaires to fill in</h3>
      <ul className="ms-pending">
        {due.map((q) => (
          <li key={q.id}>
            <span>
              <strong>{q.definition.name}</strong> from {q.clinician_name || 'your clinician'} · about 2 minutes
            </span>
            <button className="ms-btn" onClick={() => setOpen(q)}>Start</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Questionnaire({ req, onCancel, onDone }) {
  const def = req.definition;
  const [answers, setAnswers] = useState(() => def.items.map(() => null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const complete = answers.every((a) => a != null);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      onDone(await api(`/api/v1/measures/requests/${req.id}/submit`, { method: 'POST', body: { answers } }));
    } catch (e) {
      setError(e?.message || 'Could not send your answers.');
      setBusy(false);
    }
  };

  return (
    <div className="ms-card ms-client">
      <h3 className="ms-title">{def.name}</h3>
      <p className="ms-stem">{def.stem}</p>
      <ol className="ms-items">
        {def.items.map((item, i) => (
          <li key={i}>
            <p>{item}</p>
            <div className="ms-options" role="radiogroup" aria-label={item}>
              {def.scale.map((label, v) => (
                <label key={v} className={answers[i] === v ? 'on' : ''}>
                  <input type="radio" name={`q${i}`} checked={answers[i] === v}
                    onChange={() => setAnswers((a) => a.map((x, j) => (j === i ? v : x)))} />
                  {label}
                </label>
              ))}
            </div>
          </li>
        ))}
      </ol>
      {error && <p className="ms-err">{error}</p>}
      <div className="ms-actions">
        <button className="ms-link" onClick={onCancel} disabled={busy}>Later</button>
        <button className="ms-btn" onClick={submit} disabled={!complete || busy}>{busy ? 'Sending…' : 'Send answers'}</button>
      </div>
    </div>
  );
}
