import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/apiClient';
import * as HI from '@healthicons/react';
import EmptyState from './EmptyState';
import './Measures.css';
import './PsychRecord.css';

/*
 * The structured psychiatry record on a client's page:
 *  - RecordGapsBanner: what is missing (notes, MSE, treatment plan)
 *  - TimelinePanel: everything on the chart, newest first
 *  - MsePanel: mental status exams
 *  - DiagnosisPlanPanel: ICD-10 diagnoses and the versioned treatment plan
 *  - PrivateNotesPanel: psychotherapy notes only their author can read
 * Option lists, validation and access rules all live on the server.
 */

const base = (clientId) => `/api/v1/clinical-record/${clientId}`;
const fmt = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const fmtTime = (d) => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

function useLoad(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    api(path).then(setData).catch((e) => setError(e?.message || 'Could not load.'));
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return [data, error, load];
}

// ── Gaps ─────────────────────────────────────────────────────────────────────

export function RecordGapsBanner({ clientId, onOpen, refreshKey }) {
  const [data, , load] = useLoad(`${base(clientId)}/timeline`);
  useEffect(() => { if (refreshKey) load(); }, [refreshKey, load]);
  const g = data?.gaps;
  if (!g) return null;
  const items = [];
  if (g.sessionsWithoutNote > 0) items.push({ text: `${g.sessionsWithoutNote} past session${g.sessionsWithoutNote === 1 ? '' : 's'} with no note`, tab: 'timeline' });
  if (g.noMentalStatusExam) items.push({ text: 'No mental status exam on record', tab: 'mse' });
  if (g.noTreatmentPlan) items.push({ text: 'Diagnosed, but no treatment plan yet', tab: 'diagnosis' });
  if (items.length === 0) return null;
  return (
    <div className="pr-gaps" role="status">
      <strong>Missing from this chart:</strong>
      {items.map((i) => (
        <button key={i.tab} className="ms-link" onClick={() => onOpen && onOpen(i.tab)}>{i.text}</button>
      ))}
    </div>
  );
}

// ── Timeline ─────────────────────────────────────────────────────────────────

const KIND_LABEL = {
  session: 'Session', note: 'Note', prescription: 'Prescription', result: 'Lab / scan', measure: 'Questionnaire',
  mse: 'Mental status', diagnosis: 'Diagnosis', plan: 'Treatment plan',
};
const KINDS = ['all', ...Object.keys(KIND_LABEL)];

export function TimelinePanel({ clientId, onAddNote }) {
  const [data, error] = useLoad(`${base(clientId)}/timeline`);
  const [kind, setKind] = useState('all');
  if (!data) return <div className="ms-card">{error || 'Loading timeline…'}</div>;
  const items = data.items.filter((i) => kind === 'all' || i.kind === kind);
  return (
    <div className="ms-card">
      <div className="ms-head">
        <h3 className="ms-title">Timeline</h3>
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Show">
          {KINDS.map((k) => <option key={k} value={k}>{k === 'all' ? 'Everything' : KIND_LABEL[k]}</option>)}
        </select>
      </div>
      {items.length === 0 ? <EmptyState compact icon={HI.HealthDataSync} tone="sky" title="Nothing on the chart yet">Sessions, notes, results and plans will appear here in date order.</EmptyState> : (
        <ol className="pr-timeline">
          {items.map((i) => (
            <li key={`${i.kind}-${i.id}`} className={i.flag ? 'pr-flag' : ''}>
              <span className={`pr-kind pr-kind--${i.kind}`}>{KIND_LABEL[i.kind] || i.kind}</span>
              <div className="pr-body">
                <div className="pr-line"><strong>{i.title}</strong><span className="ms-muted">{fmtTime(i.at)}</span></div>
                {i.text ? <p>{i.text}</p> : null}
                {i.needsNote && onAddNote ? (
                  <button className="ms-link" onClick={onAddNote}>+ Progress note (none written for this session)</button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ── Mental status exam ───────────────────────────────────────────────────────

export function MsePanel({ clientId, onSaved }) {
  const [def] = useLoad('/api/v1/clinical-record/mse/definition');
  const [list, error, load] = useLoad(`${base(clientId)}/mse`);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(null);

  if (!def || !list) return <div className="ms-card">{error || 'Loading…'}</div>;
  return (
    <div className="ms-wrap">
      {open ? (
        <MseForm def={def} clientId={clientId} onCancel={() => setOpen(false)}
          onSaved={() => { setOpen(false); load(); onSaved && onSaved(); }} />
      ) : (
        <div className="ms-card">
          <div className="ms-head">
            <h3 className="ms-title">Mental status exams</h3>
            <button className="ms-btn" onClick={() => setOpen(true)}>New exam</button>
          </div>
          {list.length === 0 ? <EmptyState compact icon={HI.MentalHealthTherapy} tone="violet" title="No exam recorded yet" /> : (
            <ul className="ms-pending">
              {list.map((m) => (
                <li key={m.id}>
                  <span>
                    <span className={`pr-risk pr-risk--${m.risk_level}`}>{m.risk_level} risk</span>{' '}
                    {fmt(m.created_at)} · {m.clinician_name} · <span className="ms-muted">{m.summary}</span>
                  </span>
                  <button className="ms-link" onClick={() => setViewing(viewing?.id === m.id ? null : m)}>{viewing?.id === m.id ? 'Hide' : 'View'}</button>
                </li>
              ))}
            </ul>
          )}
          {viewing && <MseView def={def} exam={viewing} />}
        </div>
      )}
    </div>
  );
}

function MseView({ def, exam }) {
  return (
    <dl className="pr-mse-view">
      {def.domains.filter((d) => exam.findings?.[d.key]).map((d) => {
        const v = exam.findings[d.key];
        return (
          <React.Fragment key={d.key}>
            <dt>{d.label}</dt>
            <dd>{[...(v.selected || []), v.comment].filter(Boolean).join(' · ')}</dd>
          </React.Fragment>
        );
      })}
      <dt>Risk level</dt><dd>{exam.risk_level}</dd>
    </dl>
  );
}

function MseForm({ def, clientId, onCancel, onSaved }) {
  const [f, setF] = useState({});
  const [risk, setRisk] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = (d, opt) => setF((prev) => {
    const cur = prev[d.key]?.selected || [];
    const selected = d.many ? (cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt]) : (cur[0] === opt ? [] : [opt]);
    return { ...prev, [d.key]: { ...prev[d.key], selected } };
  });
  const comment = (d, text) => setF((prev) => ({ ...prev, [d.key]: { ...prev[d.key], comment: text } }));

  const save = async () => {
    setBusy(true); setError('');
    try {
      await api(`${base(clientId)}/mse`, { method: 'POST', body: { findings: f, riskLevel: risk } });
      onSaved();
    } catch (e) {
      setError(e?.message || 'Could not save.');
      setBusy(false);
    }
  };

  return (
    <div className="ms-card">
      <h3 className="ms-title">New mental status exam</h3>
      {def.domains.map((d) => (
        <fieldset key={d.key} className="pr-domain">
          <legend>{d.label}{d.required ? ' *' : ''}</legend>
          {d.options.length > 0 && (
            <div className="ms-options">
              {d.options.map((o) => {
                const on = (f[d.key]?.selected || []).includes(o);
                return (
                  <label key={o} className={on ? 'on' : ''}>
                    <input type={d.many ? 'checkbox' : 'radio'} checked={on} onChange={() => toggle(d, o)} name={d.key} />{o}
                  </label>
                );
              })}
            </div>
          )}
          <textarea rows={d.text ? 2 : 1} placeholder={d.text ? '' : 'Comment (optional)'} value={f[d.key]?.comment || ''}
            onChange={(e) => comment(d, e.target.value)} aria-label={`${d.label} comment`} />
        </fieldset>
      ))}
      <fieldset className="pr-domain">
        <legend>Overall risk level *</legend>
        <div className="ms-options">
          {def.riskLevels.map((r) => (
            <label key={r} className={risk === r ? 'on' : ''}>
              <input type="radio" name="risk" checked={risk === r} onChange={() => setRisk(r)} />{r}
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="ms-err">{error}</p>}
      <div className="ms-actions">
        <button className="ms-link" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="ms-btn" onClick={save} disabled={busy || !risk}>{busy ? 'Saving…' : 'Save exam'}</button>
      </div>
    </div>
  );
}

// ── Diagnosis and treatment plan ─────────────────────────────────────────────

export function DiagnosisPlanPanel({ clientId, onSaved }) {
  const [dx, dxError, loadDx] = useLoad(`${base(clientId)}/diagnoses`);
  const [plan, , loadPlan] = useLoad(`${base(clientId)}/treatment-plan`);
  const [form, setForm] = useState({ code: '', description: '', primary: false, onsetDate: '' });
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  const add = async () => {
    setError('');
    try {
      await api(`${base(clientId)}/diagnoses`, { method: 'POST', body: form });
      setForm({ code: '', description: '', primary: false, onsetDate: '' });
      loadDx(); onSaved && onSaved();
    } catch (e) { setError(e?.message || 'Could not add.'); }
  };
  const patch = async (id, body) => {
    setError('');
    try { await api(`/api/v1/clinical-record/diagnoses/${id}`, { method: 'PATCH', body }); loadDx(); }
    catch (e) { setError(e?.message || 'Could not change it.'); }
  };

  if (!dx) return <div className="ms-card">{dxError || 'Loading…'}</div>;
  const cur = plan?.current;
  return (
    <div className="ms-wrap">
      <div className="ms-card">
        <h3 className="ms-title">Diagnoses (ICD-10)</h3>
        {dx.length === 0 ? <EmptyState compact icon={HI.Stethoscope} tone="blue" title="No diagnosis recorded" /> : (
          <ul className="ms-pending">
            {dx.map((d) => (
              <li key={d.id} className={d.status !== 'active' ? 'pr-inactive' : ''}>
                <span>
                  <strong>{d.code}</strong> {d.description}
                  {d.is_primary ? <span className="pr-tag">Primary</span> : null}
                  {d.status !== 'active' ? <span className="pr-tag pr-tag--muted">{d.status.replace('_', ' ')}</span> : null}
                  <span className="ms-muted"> · {d.onset_date ? `since ${fmt(d.onset_date)}` : `added ${fmt(d.created_at)}`} · {d.clinician_name}</span>
                </span>
                <span>
                  {d.status === 'active' && !d.is_primary && <button className="ms-link" onClick={() => patch(d.id, { primary: true })}>Make primary</button>}
                  {d.status === 'active'
                    ? <><button className="ms-link" onClick={() => patch(d.id, { status: 'resolved' })}>Resolved</button>
                        <button className="ms-link" onClick={() => patch(d.id, { status: 'ruled_out' })}>Ruled out</button></>
                    : <button className="ms-link" onClick={() => patch(d.id, { status: 'active' })}>Reactivate</button>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="pr-dx-form">
          <input placeholder="Code, e.g. F33.1" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} aria-label="ICD-10 code" />
          <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} aria-label="Description" className="pr-grow" />
          <input type="date" value={form.onsetDate} onChange={(e) => setForm({ ...form, onsetDate: e.target.value })} aria-label="Onset date" />
          <label className="pr-check"><input type="checkbox" checked={form.primary} onChange={(e) => setForm({ ...form, primary: e.target.checked })} /> Primary</label>
          <button className="ms-btn" onClick={add} disabled={!form.code || !form.description}>Add</button>
        </div>
        <p className="ms-muted pr-hint">WHO ICD-10 codes, as NHIS uses them (one digit after the point). Check a code in the{' '}
          <a href="https://icd.who.int/browse10/2019/en" target="_blank" rel="noreferrer">WHO ICD-10 browser</a>.</p>
        {error && <p className="ms-err">{error}</p>}
      </div>

      {editing ? (
        <PlanForm clientId={clientId} current={cur} onCancel={() => setEditing(false)}
          onSaved={() => { setEditing(false); loadPlan(); onSaved && onSaved(); }} />
      ) : (
        <div className="ms-card">
          <div className="ms-head">
            <h3 className="ms-title">Treatment plan{cur ? ` · version ${cur.version}` : ''}</h3>
            <button className="ms-btn" onClick={() => setEditing(true)}>{cur ? 'Update plan' : 'Write plan'}</button>
          </div>
          {!cur ? <EmptyState compact icon={HI.PrescriptionDocument} tone="teal" title="No treatment plan yet" /> : (
            <>
              {cur.reviewDue && <p className="ms-err">The review date ({fmt(cur.review_date)}) has come. Review and update the plan.</p>}
              <p><strong>Presenting problem:</strong> {cur.presenting_problem}</p>
              <ol className="pr-goals">
                {(cur.goals || []).map((g, i) => (
                  <li key={i} className={g.status !== 'open' ? 'pr-inactive' : ''}>
                    <strong>{g.goal}</strong>{g.status !== 'open' ? <span className="pr-tag pr-tag--muted">{g.status}</span> : null}
                    {g.objectives ? <div><span className="ms-muted">Objectives:</span> {g.objectives}</div> : null}
                    {g.interventions ? <div><span className="ms-muted">Interventions:</span> {g.interventions}</div> : null}
                    {g.targetDate ? <div className="ms-muted">Target {fmt(g.targetDate)}</div> : null}
                  </li>
                ))}
              </ol>
              <p className="ms-muted">
                {cur.frequency ? `Sessions: ${cur.frequency} · ` : ''}{cur.review_date ? `Review ${fmt(cur.review_date)} · ` : ''}
                Saved {fmt(cur.created_at)} by {cur.clinician_name}
                {plan.versions.length > 1 ? ` · ${plan.versions.length - 1} earlier version${plan.versions.length > 2 ? 's' : ''} kept` : ''}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const emptyGoal = () => ({ goal: '', objectives: '', interventions: '', targetDate: '', status: 'open' });

function PlanForm({ clientId, current, onCancel, onSaved }) {
  const [problem, setProblem] = useState(current?.presenting_problem || '');
  const [goals, setGoals] = useState(current?.goals?.length ? current.goals.map((g) => ({ ...emptyGoal(), ...g, targetDate: g.targetDate || '' })) : [emptyGoal()]);
  const [frequency, setFrequency] = useState(current?.frequency || '');
  const [reviewDate, setReviewDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const setGoal = (i, k, v) => setGoals((gs) => gs.map((g, j) => (j === i ? { ...g, [k]: v } : g)));

  const save = async () => {
    setBusy(true); setError('');
    try {
      await api(`${base(clientId)}/treatment-plan`, { method: 'POST', body: { presentingProblem: problem, goals, frequency, reviewDate } });
      onSaved();
    } catch (e) { setError(e?.message || 'Could not save.'); setBusy(false); }
  };

  return (
    <div className="ms-card">
      <h3 className="ms-title">{current ? `Update treatment plan (saves version ${current.version + 1})` : 'Write treatment plan'}</h3>
      <label className="pr-label">Presenting problem
        <textarea rows={3} value={problem} onChange={(e) => setProblem(e.target.value)} />
      </label>
      {goals.map((g, i) => (
        <fieldset key={i} className="pr-domain">
          <legend>Goal {i + 1}</legend>
          <input placeholder="Goal" value={g.goal} onChange={(e) => setGoal(i, 'goal', e.target.value)} className="pr-full" />
          <input placeholder="Objectives (how progress will be measured)" value={g.objectives || ''} onChange={(e) => setGoal(i, 'objectives', e.target.value)} className="pr-full" />
          <input placeholder="Interventions" value={g.interventions || ''} onChange={(e) => setGoal(i, 'interventions', e.target.value)} className="pr-full" />
          <div className="pr-row">
            <label>Target <input type="date" value={g.targetDate || ''} onChange={(e) => setGoal(i, 'targetDate', e.target.value)} /></label>
            <select value={g.status} onChange={(e) => setGoal(i, 'status', e.target.value)} aria-label="Goal status">
              <option value="open">Open</option><option value="met">Met</option><option value="dropped">Dropped</option>
            </select>
            {goals.length > 1 && <button className="ms-link" onClick={() => setGoals((gs) => gs.filter((_, j) => j !== i))}>Remove</button>}
          </div>
        </fieldset>
      ))}
      <button className="ms-link" onClick={() => setGoals((gs) => [...gs, emptyGoal()])}>+ Add goal</button>
      <div className="pr-row">
        <label>Session frequency <input value={frequency} onChange={(e) => setFrequency(e.target.value)} placeholder="e.g. Weekly for 8 weeks" /></label>
        <label>Review date <input type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} /></label>
      </div>
      {error && <p className="ms-err">{error}</p>}
      <div className="ms-actions">
        <button className="ms-link" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="ms-btn" onClick={save} disabled={busy || !problem.trim()}>{busy ? 'Saving…' : 'Save plan'}</button>
      </div>
    </div>
  );
}

// ── Private notes ────────────────────────────────────────────────────────────

export function PrivateNotesPanel({ clientId }) {
  const [notes, error, load] = useLoad(`${base(clientId)}/private-notes`);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setBusy(true); setErr('');
    try {
      if (editing) await api(`/api/v1/clinical-record/private-notes/${editing}`, { method: 'PUT', body: { body: text } });
      else await api(`${base(clientId)}/private-notes`, { method: 'POST', body: { body: text } });
      setText(''); setEditing(null); load();
    } catch (e) { setErr(e?.message || 'Could not save.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="ms-card">
      <h3 className="ms-title">Private psychotherapy notes</h3>
      <p className="pr-private">Only you can read these. They are not part of the shared record: the client, other clinicians,
        the AI assistant, exports and transfers never see them. Keep clinical facts others need in your progress notes.</p>
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} className="pr-full" aria-label="Private note"
        placeholder="Your process notes, impressions, hypotheses…" />
      {err && <p className="ms-err">{err}</p>}
      <div className="ms-actions">
        {editing && <button className="ms-link" onClick={() => { setEditing(null); setText(''); }}>Cancel edit</button>}
        <button className="ms-btn" onClick={save} disabled={busy || !text.trim()}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add private note'}</button>
      </div>
      {!notes ? <p className="ms-muted">{error || 'Loading…'}</p> : notes.length === 0 ? null : (
        <ul className="pr-notes">
          {notes.map((n) => (
            <li key={n.id}>
              <div className="pr-line">
                <span className="ms-muted">{fmtTime(n.created_at)}{n.updated_at && n.updated_at !== n.created_at ? ' · edited' : ''}</span>
                <button className="ms-link" onClick={() => { setEditing(n.id); setText(n.body); }}>Edit</button>
              </div>
              <p>{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
