import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api, uploadFile, API_BASE } from '../../services/apiClient';
import { usePlatformFeatures, featureOn } from './platformFeatures';
import { NESSA_HUB_POLICY_LINKS } from '../../utils/nessaHubPolicies';
import * as HI from '@healthicons/react';
import EmptyState, { IconBubble } from './EmptyState';
import './Measures.css';
import './PsychRecord.css';
import './Journal.css';

/*
 * My Journal (patients and clients).
 *  Free writing with mood, area, tags, photos and measurements; daily prompts
 *  from guided programmes; mood and measurement charts; calendar; "on this day";
 *  a daily reminder; print or save as PDF. Private unless an entry is shared
 *  with the care team. SharedJournalPanel is the clinician's read-only view.
 */

export const AREAS = [['health', 'Health'], ['fitness', 'Fitness'], ['beauty', 'Beauty'], ['longevity', 'Longevity'], ['mind', 'Mind'], ['other', 'Other']];
export const MOODS = [[1, '😞', 'Very low'], [2, '🙁', 'Low'], [3, '😐', 'Okay'], [4, '🙂', 'Good'], [5, '😄', 'Great']];
export const MEASURES = [
  ['weightKg', 'Weight', 'kg'], ['steps', 'Steps', ''], ['sleepHours', 'Sleep', 'hours'], ['waterLitres', 'Water', 'litres'],
  ['systolic', 'Blood pressure (top)', 'mmHg'], ['diastolic', 'Blood pressure (bottom)', 'mmHg'], ['glucose', 'Blood sugar', 'mmol/L'],
];
const areaLabel = (a) => (AREAS.find(([k]) => k === a) || [a, a])[1];
const moodOf = (m) => MOODS.find(([v]) => v === m);
const fmtDay = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '');
const abs = (url) => (url && url.startsWith('/') ? `${API_BASE}${url}` : url);
const todayStr = () => new Date().toLocaleDateString('en-CA');

/** Very small formatter: **bold**, "- " bullets and "- [ ]" / "- [x]" checklists. Text only, never HTML. */
export function JournalText({ text }) {
  const lines = (text || '').split('\n');
  const bold = (s, k) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') && part.length > 4
    ? <strong key={`${k}-${i}`}>{part.slice(2, -2)}</strong> : <React.Fragment key={`${k}-${i}`}>{part}</React.Fragment>));
  return (
    <div className="jr-text">
      {lines.map((l, i) => {
        const check = /^\s*- \[( |x)\] (.*)$/i.exec(l);
        if (check) return <div key={i} className="jr-check"><span aria-hidden>{check[1].toLowerCase() === 'x' ? '☑' : '☐'}</span> {bold(check[2], i)}</div>;
        const bullet = /^\s*- (.*)$/.exec(l);
        if (bullet) return <div key={i} className="jr-bullet">• {bold(bullet[1], i)}</div>;
        return l.trim() ? <p key={i}>{bold(l, i)}</p> : <br key={i} />;
      })}
    </div>
  );
}

export default function Journal() {
  const navigate = useNavigate();
  const canWrite = featureOn(usePlatformFeatures(), 'journal');
  const [entries, setEntries] = useState(null);
  const [overview, setOverview] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [settings, setSettings] = useState(null);
  const [editing, setEditing] = useState(null);
  const [view, setView] = useState('list');
  const [q, setQ] = useState('');
  const [area, setArea] = useState('');
  const [alert, setAlert] = useState(null);
  const [error, setError] = useState('');

  const loadEntries = useCallback(() => {
    const p = new URLSearchParams({ limit: '300' });
    if (q.trim()) p.set('q', q.trim());
    if (area) p.set('area', area);
    api(`/api/v1/journal/entries?${p}`).then((l) => setEntries(Array.isArray(l) ? l : [])).catch((e) => { setEntries([]); setError(e?.message || 'Could not load your journal.'); });
  }, [q, area]);
  const loadOverview = useCallback(() => { api('/api/v1/journal/overview').then(setOverview).catch(() => {}); }, []);
  useEffect(() => { loadEntries(); }, [loadEntries]);
  useEffect(() => {
    loadOverview();
    api('/api/v1/journal/programs').then((l) => setPrograms(Array.isArray(l) ? l : [])).catch(() => {});
    api('/api/v1/journal/settings').then(setSettings).catch(() => {});
  }, [loadOverview]);

  const saved = (r) => {
    setEditing(null);
    setAlert(r?.crisisMessage ? { kind: 'crisis', text: r.crisisMessage, told: r.careTeamTold } : r?.emergencyNote ? { kind: 'note', text: r.emergencyNote } : null);
    loadEntries(); loadOverview();
  };
  const remove = async (id) => {
    try { await api(`/api/v1/journal/entries/${id}`, { method: 'DELETE' }); loadEntries(); loadOverview(); }
    catch (e) { setError(e?.message || 'Could not delete.'); }
  };
  const shareToCommunity = (e) => {
    try { sessionStorage.setItem('community-draft', [e.title, e.body].filter(Boolean).join('\n\n').slice(0, 4000)); } catch (_) { /* storage blocked */ }
    navigate('/dashboard/community');
  };
  const program = async (code, join) => {
    try { setPrograms(await api(`/api/v1/journal/programs/${code}/${join ? 'join' : 'leave'}`, { method: 'POST', body: {} })); loadOverview(); }
    catch (e) { setError(e?.message || 'Could not do that.'); }
  };

  if (editing) {
    return (
      <div className="ms-wrap jr-wrap">
        <EntryEditor initial={editing} onCancel={() => setEditing(null)} onSaved={saved} />
      </div>
    );
  }

  return (
    <div className="ms-wrap jr-wrap">
      <div className="jr-head">
        <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'center' }}>
          <IconBubble icon={HI.MentalHealth} tone="violet" size={30} />
          <div>
          <h2 style={{ margin: 0 }}>My Journal</h2>
          <p className="ms-muted" style={{ margin: '0.2rem 0 0' }}>Your private record of how you are doing. Only you can see it, unless you share an entry with your care team. <a href={NESSA_HUB_POLICY_LINKS.journal} target="_blank" rel="noreferrer">How your journal is kept private</a></p>
          </div>
        </div>
        <div className="jr-head-actions no-print">
          {canWrite && <button className="ms-btn" onClick={() => setEditing({ entry_date: todayStr(), area: 'health' })}>New entry</button>}
          <button className="ms-link" onClick={() => window.print()}>Print or save as PDF</button>
        </div>
      </div>

      {alert && (
        <div className={alert.kind === 'crisis' ? 'jr-crisis' : 'pr-gaps'} role="alert" style={{ display: 'block' }}>
          <strong>{alert.kind === 'crisis' ? 'You do not have to go through this alone.' : 'Saved.'}</strong> {alert.text}
          {alert.kind === 'crisis' && (alert.told ? ' Because you shared this entry, your care team has been told.' : ' This entry is private, so no one else was told. You can share it with your care team if you would like them to know.')}
          <button className="ms-link" onClick={() => setAlert(null)} style={{ marginLeft: 8 }}>Close</button>
        </div>
      )}
      {error && <p className="ms-err">{error}</p>}
      {!canWrite && <div className="pr-gaps" style={{ display: 'block' }}>Writing new entries is switched off on NessaHub at the moment. You can still read, search and print everything you wrote.</div>}

      {overview && (
        <div className="tp-stats jr-stats">
          <div className="ms-card jr-stat"><span className="ms-muted">Days in a row</span><strong>{overview.streakDays}</strong></div>
          <div className="ms-card jr-stat"><span className="ms-muted">Entries this month</span><strong>{overview.entriesThisMonth}</strong></div>
          <div className="ms-card jr-stat"><span className="ms-muted">Average mood, last 30 days</span>
            <strong>{overview.mood.length ? (overview.mood.reduce((a, m) => a + Number(m.mood), 0) / overview.mood.length).toFixed(1) : '—'}</strong>
          </div>
        </div>
      )}

      {canWrite && overview && overview.prompts.length > 0 && (
        <div className="ms-card no-print">
          <h3 className="ms-title">Today's prompts</h3>
          {overview.prompts.map((p) => (
            <div key={p.programCode} className="jr-prompt">
              <div>
                <span className="ms-muted">{p.programTitle} · day {p.day} of {p.days}</span>
                <p style={{ margin: '0.2rem 0' }}>{p.prompt}</p>
              </div>
              {p.done ? <span className="ms-ok" style={{ margin: 0 }}>Done</span> : (
                <button className="ms-btn" onClick={() => setEditing({ entry_date: todayStr(), area: p.area, program_code: p.programCode, program_day: p.day, prompt: p.prompt })}>Write</button>
              )}
            </div>
          ))}
        </div>
      )}

      {overview && overview.onThisDay.length > 0 && (
        <div className="ms-card">
          <h3 className="ms-title">On this day</h3>
          {overview.onThisDay.map((e) => (
            <p key={e.id} style={{ margin: '0.3rem 0' }}>
              <span className="ms-muted">{e.when} · </span>{e.title ? <strong>{e.title}: </strong> : null}{e.preview}{e.preview && e.preview.length >= 240 ? '…' : ''}
            </p>
          ))}
        </div>
      )}

      {overview && <Charts overview={overview} />}

      <div className="ms-card">
        <div className="jr-toolbar no-print">
          <input placeholder="Search your journal" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
            <option value="">All areas</option>
            {AREAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <div className="jr-seg" role="tablist">
            <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>List</button>
            <button role="tab" aria-selected={view === 'calendar'} className={view === 'calendar' ? 'on' : ''} onClick={() => setView('calendar')}>Calendar</button>
          </div>
        </div>
        {entries === null ? <p className="ms-muted">Loading…</p>
          : view === 'calendar' ? <CalendarView entries={entries} onOpen={(e) => canWrite && setEditing(e)} onNew={(d) => canWrite && setEditing({ entry_date: d, area: 'health' })} />
          : entries.length === 0 ? <EmptyState icon={HI.MentalHealth} tone="violet" title={q || area ? 'Nothing matches' : 'Your journal is empty'}
              action={canWrite && !q && !area ? <button className="ms-btn" onClick={() => setEditing({ entry_date: todayStr(), area: 'health' })}>Write your first entry</button> : null}>
              {q || area ? 'Try another word or area.' : 'Start with how today went: a few lines, a mood, a photo or your steps.'}
            </EmptyState>
          : entries.map((e) => (
            <EntryCard key={e.id} entry={e} readOnly={!canWrite} onEdit={() => setEditing(e)} onDelete={() => remove(e.id)} onShare={() => shareToCommunity(e)} />
          ))}
      </div>

      {canWrite && <div className="ms-card no-print">
        <h3 className="ms-title">Guided programmes</h3>
        <p className="ms-muted pr-hint">A prompt a day for a week. Start one whenever you like.</p>
        <ul className="ms-pending">
          {programs.map((p) => (
            <li key={p.code}>
              <span><strong>{p.title}</strong><span className="ms-muted"> · {areaLabel(p.area)} · {p.summary}{p.status === 'finished' ? ' · finished' : ''}</span></span>
              {p.status === 'active'
                ? <button className="ms-link" onClick={() => program(p.code, false)}>Stop</button>
                : <button className="ms-btn" onClick={() => program(p.code, true)}>{p.status ? 'Start again' : 'Start'}</button>}
            </li>
          ))}
        </ul>
      </div>}

      {canWrite && settings && <ReminderSetting settings={settings} onChange={setSettings} />}
    </div>
  );
}

function Charts({ overview }) {
  const available = MEASURES.filter(([k]) => overview.measures.some((m) => m[k] !== undefined));
  const [measure, setMeasure] = useState('');
  const key = measure || (available[0] && available[0][0]) || '';
  const data = overview.measures.filter((m) => m[key] !== undefined).map((m) => ({ date: m.date.slice(5), value: Number(m[key]) }));
  if (overview.mood.length === 0 && available.length === 0) return null;
  return (
    <div className="ms-card">
      {overview.mood.length > 0 && <>
        <h3 className="ms-title">Mood, last 30 days</h3>
        <div style={{ width: '100%', height: 180 }}>
          <ResponsiveContainer>
            <LineChart data={overview.mood.map((m) => ({ date: m.date.slice(5), mood: Number(m.mood) }))} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`${v} (${(moodOf(Math.round(v)) || [])[2] || ''})`, 'Mood']} />
              <Line type="monotone" dataKey="mood" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </>}
      {available.length > 0 && <>
        <div className="jr-chart-head">
          <h3 className="ms-title" style={{ margin: 0 }}>Measurements, last 6 months</h3>
          <select value={key} onChange={(e) => setMeasure(e.target.value)} aria-label="Measurement">
            {available.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div style={{ width: '100%', height: 180 }}>
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
              <Tooltip formatter={(v) => [`${v} ${(MEASURES.find(([k]) => k === key) || [])[2] || ''}`, (MEASURES.find(([k]) => k === key) || [])[1]]} />
              <Line type="monotone" dataKey="value" stroke="#0d9488" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </>}
    </div>
  );
}

function CalendarView({ entries, onOpen, onNew }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const byDay = useMemo(() => {
    const m = {};
    entries.forEach((e) => { (m[e.entry_date] = m[e.entry_date] || []).push(e); });
    return m;
  }, [entries]);
  const first = (month.getDay() + 6) % 7; // Monday first
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const iso = (d) => new Date(month.getFullYear(), month.getMonth(), d).toLocaleDateString('en-CA');
  const today = todayStr();
  return (
    <div>
      <div className="jr-chart-head">
        <button className="ms-link" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">‹</button>
        <strong>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
        <button className="ms-link" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">›</button>
      </div>
      <div className="jr-cal">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="jr-cal-h">{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`b${i}`} />;
          const key = iso(d);
          const list = byDay[key] || [];
          const mood = list.find((e) => e.mood);
          return (
            <button key={key} className={`jr-cal-d ${list.length ? 'has' : ''} ${key === today ? 'today' : ''}`} disabled={key > today}
              onClick={() => (list.length ? onOpen(list[0]) : onNew(key))} aria-label={`${fmtDay(key)}: ${list.length} entries`}>
              <span>{d}</span>
              {mood ? <span aria-hidden>{moodOf(mood.mood)[1]}</span> : list.length ? <span className="jr-dot" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EntryCard({ entry, readOnly, onEdit, onDelete, onShare }) {
  const [confirm, setConfirm] = useState(false);
  const mood = moodOf(entry.mood);
  const m = entry.measures || {};
  return (
    <article className="jr-entry">
      <header>
        <span className="ms-muted">{fmtDay(entry.entry_date)} · {areaLabel(entry.area)}{mood ? ` · ${mood[1]} ${mood[2]}` : ''}{entry.shared_with_care ? ' · shared with my care team' : ''}</span>
        {!readOnly && <span className="no-print">
          <button className="ms-link" onClick={onEdit}>Edit</button>
          <button className="ms-link" onClick={onShare}>Post to a group</button>
          {confirm ? <><button className="ms-link" style={{ color: '#b91c1c' }} onClick={onDelete}>Yes, delete</button><button className="ms-link" onClick={() => setConfirm(false)}>Keep</button></>
            : <button className="ms-link" onClick={() => setConfirm(true)}>Delete</button>}
        </span>}
      </header>
      {entry.title && <h4 style={{ margin: '0.3rem 0' }}>{entry.title}</h4>}
      <JournalText text={entry.body} />
      {Object.keys(m).length > 0 && (
        <p className="jr-measures">{MEASURES.filter(([k]) => m[k] !== undefined).map(([k, l, u]) => `${l} ${m[k]}${u ? ` ${u}` : ''}`).join(' · ')}</p>
      )}
      {entry.photos?.length > 0 && <div className="jr-photos">{entry.photos.map((p) => <img key={p.id} src={abs(p.url)} alt="" />)}</div>}
      {entry.tags?.length > 0 && <p className="ms-muted" style={{ margin: '0.3rem 0 0', fontSize: '0.8rem' }}>{entry.tags.map((t) => `#${t}`).join(' ')}</p>}
    </article>
  );
}

function EntryEditor({ initial, onCancel, onSaved }) {
  const [date, setDate] = useState(initial.entry_date || todayStr());
  const [title, setTitle] = useState(initial.title || '');
  const [body, setBody] = useState(initial.body || '');
  const [mood, setMood] = useState(initial.mood || null);
  const [area, setArea] = useState(initial.area || 'health');
  const [tags, setTags] = useState((initial.tags || []).join(', '));
  const [photos, setPhotos] = useState(initial.photos || []);
  const [measures, setMeasures] = useState(() => {
    const m = {};
    Object.entries(initial.measures || {}).forEach(([k, v]) => { m[k] = String(v); });
    return m;
  });
  const [showMeasures, setShowMeasures] = useState(Object.keys(initial.measures || {}).length > 0);
  const [shared, setShared] = useState(!!initial.shared_with_care);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef(null);

  const wrap = (before, after = '', linePrefix = false) => {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart, e = el.selectionEnd;
    const sel = body.slice(s, e);
    let next;
    if (linePrefix) {
      const start = body.lastIndexOf('\n', s - 1) + 1;
      next = body.slice(0, start) + before + body.slice(start);
    } else {
      next = body.slice(0, s) + before + (sel || 'text') + after + body.slice(e);
    }
    setBody(next);
    setTimeout(() => el.focus(), 0);
  };

  const addPhotos = async (files) => {
    const list = Array.from(files || []).filter((f) => f.type.startsWith('image/')).slice(0, 6 - photos.length);
    if (!list.length) return;
    setUploading(true); setError('');
    try {
      for (const f of list) {
        if (f.size > 8 * 1024 * 1024) { setError('Each photo must be under 8 MB.'); continue; }
        const r = await uploadFile(f, { domain: 'journal', withMeta: true });
        if (r?.fileId) setPhotos((p) => [...p, { id: r.fileId, url: r.url }]);
      }
    } catch (e) { setError(e?.message || 'A photo could not be uploaded.'); }
    finally { setUploading(false); }
  };

  const save = async () => {
    setBusy(true); setError('');
    const body2 = {
      entryDate: date, title, body, mood, area,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      photoIds: photos.map((p) => p.id),
      measures: Object.fromEntries(Object.entries(measures).filter(([, v]) => String(v).trim() !== '')),
      programCode: initial.program_code || null, programDay: initial.program_day || null,
      sharedWithCare: shared,
    };
    try {
      const r = await api(initial.id ? `/api/v1/journal/entries/${initial.id}` : '/api/v1/journal/entries', { method: initial.id ? 'PUT' : 'POST', body: body2 });
      onSaved(r);
    } catch (e) { setError(e?.message || 'Could not save.'); setBusy(false); }
  };

  return (
    <div className="ms-card">
      <h3 className="ms-title">{initial.id ? 'Edit entry' : 'New entry'}</h3>
      {initial.prompt && <p className="jr-prompt-q">{initial.prompt}</p>}
      <div className="pr-row">
        <label>Date <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} /></label>
        <div className="jr-chips" role="radiogroup" aria-label="Area">
          {AREAS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={area === k} className={area === k ? 'on' : ''} onClick={() => setArea(k)}>{l}</button>)}
        </div>
      </div>
      <div className="jr-moods" role="radiogroup" aria-label="Mood">
        <span className="ms-muted">How do you feel?</span>
        {MOODS.map(([v, e, l]) => (
          <button key={v} type="button" role="radio" aria-checked={mood === v} title={l} className={mood === v ? 'on' : ''} onClick={() => setMood(mood === v ? null : v)}>
            <span aria-hidden>{e}</span><small>{l}</small>
          </button>
        ))}
      </div>
      <label className="pr-label">Title (optional)<input className="pr-full" value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} /></label>
      <div className="jr-format" aria-label="Formatting">
        <button type="button" onClick={() => wrap('**', '**')}><strong>B</strong></button>
        <button type="button" onClick={() => wrap('- ', '', true)}>• List</button>
        <button type="button" onClick={() => wrap('- [ ] ', '', true)}>☐ Checklist</button>
      </div>
      <textarea ref={ref} className="pr-full jr-body" rows={10} value={body} maxLength={20000} onChange={(e) => setBody(e.target.value)}
        placeholder="Write freely: how you feel, what you did, what you noticed, what you want to remember." aria-label="Entry" />
      {body.trim() && <details className="jr-preview"><summary>Preview</summary><JournalText text={body} /></details>}

      <div className="jr-photos">
        {photos.map((p) => (
          <span key={p.id} className="jr-photo">
            <img src={abs(p.url)} alt="" />
            <button type="button" aria-label="Remove photo" onClick={() => setPhotos(photos.filter((x) => x.id !== p.id))}>×</button>
          </span>
        ))}
        {photos.length < 6 && (
          <label className="jr-add-photo">{uploading ? 'Uploading…' : '+ Photo'}
            <input type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(e.target.files)} disabled={uploading} />
          </label>
        )}
      </div>

      <button type="button" className="ms-link" onClick={() => setShowMeasures(!showMeasures)}>{showMeasures ? 'Hide measurements' : '+ Add measurements (weight, steps, sleep…)'}</button>
      {showMeasures && (
        <div className="jr-measure-grid">
          {MEASURES.map(([k, l, u]) => (
            <label key={k}>{l}{u ? ` (${u})` : ''}
              <input inputMode="decimal" value={measures[k] || ''} onChange={(e) => setMeasures({ ...measures, [k]: e.target.value })} />
            </label>
          ))}
        </div>
      )}

      <label className="pr-label">Tags, separated by commas (optional)<input className="pr-full" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="walking, skincare" /></label>
      <label className="pr-check" style={{ display: 'flex', margin: '0.75rem 0' }}>
        <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
        Share this entry with my care team (the doctors and therapists treating me)
      </label>
      {error && <p className="ms-err">{error}</p>}
      <div className="ms-actions">
        <button className="ms-link" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="ms-btn" onClick={save} disabled={busy || uploading}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

function ReminderSetting({ settings, onChange }) {
  const [msg, setMsg] = useState('');
  const save = async (patch) => {
    const next = { ...settings, ...patch };
    onChange(next); setMsg('');
    try { onChange(await api('/api/v1/journal/settings', { method: 'PUT', body: next })); setMsg('Saved.'); }
    catch (e) { setMsg(e?.message || 'Could not save.'); }
  };
  const hours = Array.from({ length: 17 }, (_, i) => i + 6);
  return (
    <div className="ms-card no-print">
      <h3 className="ms-title">Daily reminder</h3>
      <label className="pr-check">
        <input type="checkbox" checked={!!settings.reminderOn} onChange={(e) => save({ reminderOn: e.target.checked })} />
        Remind me to write, if I have not written that day, at
        <select value={settings.reminderHour} onChange={(e) => save({ reminderHour: Number(e.target.value) })} style={{ marginLeft: 6 }} disabled={!settings.reminderOn}>
          {hours.map((h) => <option key={h} value={h}>{`${((h + 11) % 12) + 1}:00 ${h < 12 ? 'am' : 'pm'}`}</option>)}
        </select>
      </label>
      {msg && <p className={msg === 'Saved.' ? 'ms-ok' : 'ms-err'}>{msg}</p>}
    </div>
  );
}

/** For a clinician: the entries this person chose to share. */
export function SharedJournalPanel({ clientId }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api(`/api/v1/journal/clients/${clientId}`).then((l) => setList(Array.isArray(l) ? l : [])).catch((e) => { setList([]); setError(e?.message || 'Could not load.'); });
  }, [clientId]);
  return (
    <div className="ms-card">
      <h3 className="ms-title">Journal entries shared with you</h3>
      <p className="ms-muted pr-hint">Their journal is private. You only see entries they chose to share with their care team.</p>
      {error && <p className="ms-err">{error}</p>}
      {list === null ? <p className="ms-muted">Loading…</p> : list.length === 0 ? <EmptyState compact icon={HI.HealthDataSecurity} tone="teal" title="Nothing shared yet">Entries appear here only when they choose to share them.</EmptyState> : list.map((e) => {
        const mood = moodOf(e.mood);
        const m = e.measures || {};
        return (
          <article key={e.id} className={`jr-entry ${e.safety_flag ? 'jr-flag' : ''}`}>
            <header><span className="ms-muted">{fmtDay(e.entry_date)} · {areaLabel(e.area)}{mood ? ` · mood ${e.mood}/5 ${mood[1]}` : ''}{e.safety_flag ? ' · safety concern' : ''}</span></header>
            {e.title && <h4 style={{ margin: '0.3rem 0' }}>{e.title}</h4>}
            <JournalText text={e.body} />
            {Object.keys(m).length > 0 && <p className="jr-measures">{MEASURES.filter(([k]) => m[k] !== undefined).map(([k, l, u]) => `${l} ${m[k]}${u ? ` ${u}` : ''}`).join(' · ')}</p>}
            {e.photos?.length > 0 && <div className="jr-photos">{e.photos.map((p) => <img key={p.id} src={abs(p.url)} alt="" />)}</div>}
          </article>
        );
      })}
    </div>
  );
}
