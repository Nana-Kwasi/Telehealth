import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../services/apiClient';
import '../../Common/CareTransfers.css';
import './AdminApplications.css';

/**
 * Provider applications from the application portal (onboard.nessahub.com).
 *
 * The super admin works each one through credentialing: initial review →
 * documents → verification with the issuing council → background checks →
 * interview or inspection → agreement → approved → account created. Every
 * stage change emails the applicant (with an optional message); internal notes
 * stay internal. Approval needs every required document verified, and the last
 * stage is reached by creating the account and recording it here.
 */
const ONBOARD_ROUTE = {
  DOCTOR: '/dashboard/onboard-doctor',
  THERAPIST: '/dashboard/onboard-therapist',
  PHARMACY: '/dashboard/create-pharmacy',
  LAB: '/dashboard/create-lab-scan',
  SCAN_CENTER: '/dashboard/create-lab-scan',
};

const DOC_STATUS = {
  PENDING: ['Waiting', '#94a3b8'],
  RECEIVED: ['Received', '#d97706'],
  VERIFIED: ['Verified', '#16a34a'],
  REJECTED: ['Rejected', '#dc2626'],
  NOT_APPLICABLE: ['Not needed', '#64748b'],
};

const CLOSED = ['ACCOUNT_CREATED', 'REJECTED', 'WITHDRAWN'];

const fmt = (v) => (v ? new Date(v).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
const fmtDay = (v) => (v ? new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const initials = (name) => String(name || '?').replace(/^(dr|prof|mr|mrs|ms|rev)\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

/** A soft badge in the stage's colour. */
function Chip({ stage, stages, size }) {
  const s = stages.find((x) => x.key === stage) || { label: stage, color: '#64748b' };
  return (
    <span className={`aa-chip${size ? ` ${size}` : ''}`} style={{ color: s.color, background: `${s.color}14`, borderColor: `${s.color}40` }}>
      <i style={{ background: s.color }} />{s.label}
    </span>
  );
}

function Progress({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="aa-progress" title={`${done} of ${total} verified`}>
      <div className="aa-progress-bar"><span style={{ width: `${pct}%` }} /></div>
      <span className="aa-progress-text">{done}/{total}</span>
    </div>
  );
}

export default function AdminApplications() {
  const { applicationId } = useParams();
  return applicationId ? <ApplicationDetail id={applicationId} /> : <ApplicationList />;
}

function ApplicationList() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [stage, setStage] = useState('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const qs = new URLSearchParams();
    if (stage) qs.set('stage', stage);
    if (type) qs.set('type', type);
    if (q.trim()) qs.set('q', q.trim());
    api(`/api/v1/admin/applications?${qs}`).then(setData).catch((e) => { setError(e.message); setData({ items: [], counts: {}, stages: [], types: {} }); });
  }, [stage, type, q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const stages = data?.stages || [];
  const counts = useMemo(() => data?.counts || {}, [data]);
  const count = (k) => Number(counts[k] || 0);
  const main = stages.slice(0, 9);
  const side = stages.slice(9);
  const open = useMemo(() => Object.entries(counts)
    .filter(([k]) => !CLOSED.includes(k))
    .reduce((n, [, v]) => n + Number(v), 0), [counts]);
  const toggle = (k) => setStage(stage === k ? '' : k);

  const tiles = [
    ['In progress', open, '', 'Open applications across every stage'],
    ['Waiting on documents', count('DOCUMENTS_REQUESTED'), 'DOCUMENTS_REQUESTED', 'Applicants asked to send documents'],
    ['Ready for an account', count('APPROVED'), 'APPROVED', 'Approved, account not created yet'],
    ['Onboarded', count('ACCOUNT_CREATED'), 'ACCOUNT_CREATED', 'Account created and live'],
  ];

  return (
    <div className="ct-page aa-page">
      <header className="aa-pagehead">
        <div>
          <h2>Provider applications</h2>
          <p>Doctors, therapists, pharmacies, laboratories and scan centres who applied on the application portal.</p>
        </div>
      </header>

      <div className="aa-stats">
        {tiles.map(([label, value, key, hint]) => (
          <button key={label} type="button" className={`aa-stat${key && stage === key ? ' is-on' : ''}`}
            onClick={() => (key ? toggle(key) : setStage(''))} title={hint}>
            <span className="aa-stat-label">{label}</span>
            <span className="aa-stat-value">{value}</span>
          </button>
        ))}
      </div>

      <section className="aa-card">
        <div className="aa-card-head">
          <h3>Pipeline</h3>
          {stage ? <button type="button" className="aa-link" onClick={() => setStage('')}>Show all stages</button> : <span className="aa-muted">Select a stage to filter</span>}
        </div>
        <div className="aa-pipeline" role="tablist" aria-label="Filter by stage">
          {main.map((s, i) => (
            <button key={s.key} type="button" role="tab" aria-selected={stage === s.key}
              className={`aa-pipe${stage === s.key ? ' is-on' : ''}`} onClick={() => toggle(s.key)}
              style={{ '--c': s.color }}>
              <span className="aa-pipe-bar" />
              <span className="aa-pipe-count">{count(s.key)}</span>
              <span className="aa-pipe-label"><b>{i + 1}</b>{s.label}</span>
            </button>
          ))}
        </div>
        {side.length ? (
          <div className="aa-side-states">
            <span className="aa-muted">Other states</span>
            {side.map((s) => (
              <button key={s.key} type="button" className={`aa-mini${stage === s.key ? ' is-on' : ''}`} style={{ '--c': s.color }} onClick={() => toggle(s.key)}>
                <i />{s.label}<b>{count(s.key)}</b>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="aa-card aa-flush">
        <div className="aa-toolbar">
          <label className="aa-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 2a8 8 0 016.3 12.9l5.4 5.4-1.4 1.4-5.4-5.4A8 8 0 1110 2zm0 2a6 6 0 100 12 6 6 0 000-12z" /></svg>
            <input placeholder="Search name, email, phone or code" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search applications" />
          </label>
          <select className="aa-select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Provider type">
            <option value="">All provider types</option>
            {Object.entries(data?.types || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span className="aa-muted aa-results">{data ? `${data.items.length} ${data.items.length === 1 ? 'application' : 'applications'}` : ''}</span>
        </div>

        {error ? <div className="ct-error aa-inset">{error}</div> : null}
        {!data ? <div className="aa-empty">Loading applications…</div> : data.items.length === 0 ? (
          <div className="aa-empty">
            <strong>No applications match.</strong>
            <span>Try another stage, type or search.</span>
          </div>
        ) : (
          <div className="aa-table-wrap">
            <table className="aa-table">
              <thead><tr><th>Applicant</th><th>Type</th><th>Reference</th><th>Stage</th><th>Documents</th><th>Applied</th><th aria-label="Open" /></tr></thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id} onClick={() => navigate(`/dashboard/applications/${a.id}`)} tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/dashboard/applications/${a.id}`)}>
                    <td>
                      <div className="aa-person">
                        <span className="aa-avatar">{initials(a.displayName)}</span>
                        <div><strong>{a.displayName}</strong><span>{a.email} · {a.phone}</span></div>
                      </div>
                    </td>
                    <td><span className="aa-type">{data.types[a.providerType] || a.providerType}</span></td>
                    <td className="aa-code">{a.code}</td>
                    <td><Chip stage={a.stage} stages={stages} /></td>
                    <td><Progress done={a.docsVerified} total={a.docsRequired} /></td>
                    <td className="aa-date">{fmtDay(a.createdAt)}</td>
                    <td className="aa-chevron" aria-hidden="true">›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ApplicationDetail({ id }) {
  const navigate = useNavigate();
  const [a, setA] = useState(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [toStage, setToStage] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [internal, setInternal] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    api(`/api/v1/admin/applications/${id}`).then((d) => { setA(d); setAccountEmail(d.email || ''); }).catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, done) => {
    setBusy(true); setError(''); setOk('');
    try { const d = await fn(); setA(d); setOk(done); return true; }
    catch (e) { setError(e.message || 'That did not work.'); return false; }
    finally { setBusy(false); }
  };

  const sections = useMemo(() => {
    if (!a) return [];
    const out = [];
    (a.fields || []).forEach((f) => {
      const v = a.details?.[f.key];
      if (v === undefined || v === null || String(v).trim() === '' || (Array.isArray(v) && !v.length)) return;
      const name = f.section || 'Details';
      let group = out.find((g) => g.name === name);
      if (!group) { group = { name, rows: [] }; out.push(group); }
      group.rows.push({ ...f, value: Array.isArray(v) ? v.join(', ') : String(v) });
    });
    return out;
  }, [a]);

  if (!a) return <div className="ct-page aa-page">{error ? <div className="ct-error">{error}</div> : <div className="aa-empty">Loading application…</div>}</div>;

  const stages = a.stages || [];
  const main = stages.slice(0, 9);
  const idx = main.findIndex((s) => s.key === a.stage);
  const closed = CLOSED.includes(a.stage);
  const choices = stages.filter((s) => !['ACCOUNT_CREATED', 'WITHDRAWN', a.stage].includes(s.key));
  const next = idx >= 0 && idx < 7 ? main[idx + 1] : null;
  const docs = a.documents || [];
  const required = docs.filter((d) => d.required);
  const verified = required.filter((d) => ['VERIFIED', 'NOT_APPLICABLE'].includes(d.status)).length;
  const docsLeft = required.length - verified;
  const long = (f) => f.type === 'textarea' || f.value.length > 60 || f.value.includes('\n');

  const copyCode = () => {
    navigator.clipboard?.writeText(a.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };

  return (
    <div className="ct-page aa-page">
      <button type="button" className="aa-back" onClick={() => navigate('/dashboard/applications')}>‹ All applications</button>

      <header className="aa-card aa-hero">
        <span className="aa-avatar lg">{initials(a.displayName)}</span>
        <div className="aa-hero-main">
          <div className="aa-hero-title">
            <h2>{a.displayName}</h2>
            <Chip stage={a.stage} stages={stages} size="lg" />
          </div>
          <div className="aa-hero-meta">
            <span>{a.providerTypeLabel}</span>
            <button type="button" className="aa-codebtn" onClick={copyCode} title="Copy reference code">{a.code}<em>{copied ? 'Copied' : 'Copy'}</em></button>
            <span>Applied {fmt(a.createdAt)}</span>
            <span>Documents by {a.submissionMethod === 'IN_PERSON' ? 'office visit' : 'email'}</span>
          </div>
        </div>
        <div className="aa-hero-actions">
          <a className="aa-btn" href={`mailto:${a.email}?subject=${encodeURIComponent(`Your NessaHub application ${a.code}`)}`}>Email</a>
          <a className="aa-btn" href={`tel:${a.phone}`}>Call</a>
        </div>
      </header>

      <ol className="aa-card aa-stepper" aria-label="Stages">
        {main.map((s, i) => {
          const state = idx === -1 ? 'todo' : i < idx ? 'done' : i === idx ? 'now' : 'todo';
          return (
            <li key={s.key} className={`aa-step ${state}`} style={{ '--c': s.color }} aria-current={state === 'now' ? 'step' : undefined}>
              <span className="aa-dot">{state === 'done' ? '✓' : i + 1}</span>
              <span className="aa-step-label">{s.label}</span>
            </li>
          );
        })}
      </ol>

      {error ? <div className="ct-error">{error}</div> : null}
      {ok ? <div className="ct-ok">{ok}</div> : null}

      <div className="aa-layout">
        <div className="aa-col">
          <section className="aa-card">
            <div className="aa-card-head">
              <div>
                <h3>Documents</h3>
                <p className="aa-muted">Mark each as received, then verified once checked against the original and with the issuing body.</p>
              </div>
              <div className="aa-docs-sum">
                <strong>{verified} of {required.length}</strong>
                <span>required verified</span>
                <Progress done={verified} total={required.length} />
              </div>
            </div>
            <ul className="aa-docs">
              {docs.map((d) => <DocRow key={d.id} d={d} disabled={busy || closed}
                onSave={(status, docNote) => act(() => api(`/api/v1/admin/applications/${id}/documents/${d.id}`, { method: 'PATCH', body: { status, note: docNote } }), 'Document updated.')} />)}
            </ul>
          </section>

          <section className="aa-card">
            <div className="aa-card-head"><h3>Application</h3></div>
            {sections.map((g) => (
              <div key={g.name} className="aa-group">
                <h4>{g.name}</h4>
                <dl className="aa-fields">
                  {g.rows.map((f) => (
                    <div key={f.key} className={long(f) ? 'wide' : ''}>
                      <dt>{f.label}</dt>
                      <dd>{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </section>

          <section className="aa-card">
            <div className="aa-card-head">
              <h3>Policies accepted</h3>
              <span className="aa-muted">From {a.submittedIp || 'an unknown address'}</span>
            </div>
            <ul className="aa-consents">
              {(a.consents || []).map((c) => (
                <li key={c.key}>
                  <span className="aa-tick" aria-hidden="true">✓</span>
                  <div><span>{c.text}</span><small>Version {c.version} · {fmt(c.acceptedAt)}</small></div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="aa-col aa-aside">
          <section className="aa-card">
            <div className="aa-card-head"><h3>Move the application</h3></div>
            {closed ? <p className="aa-muted">This application is closed ({a.stageLabel}).</p> : (
              <div className="aa-form">
                {next ? (
                  <button type="button" className={`aa-next${toStage === next.key ? ' is-on' : ''}`} onClick={() => setToStage(next.key)} style={{ '--c': next.color }}>
                    <span>Suggested next stage</span>
                    <strong>{next.label} →</strong>
                  </button>
                ) : null}
                <div className="ct-field">
                  <label htmlFor="aa-stage">New stage</label>
                  <select id="aa-stage" value={toStage} onChange={(e) => setToStage(e.target.value)}>
                    <option value="">Choose a stage…</option>
                    {choices.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                  {toStage === 'APPROVED' && docsLeft > 0 ? <small className="ct-field-error">{docsLeft} required document(s) not verified yet.</small> : null}
                </div>
                <div className="ct-field">
                  <label htmlFor="aa-msg">Message to the applicant <span className="aa-opt">{toStage === 'REJECTED' ? 'required' : 'optional · emailed'}</span></label>
                  <textarea id="aa-msg" value={message} onChange={(e) => setMessage(e.target.value)}
                    placeholder={toStage === 'DOCUMENTS_REQUESTED' ? 'e.g. Please email your current MDC licence and two reference letters.' : 'Shown in the email the applicant receives'} />
                </div>
                <div className="ct-field">
                  <label htmlFor="aa-note">Internal note <span className="aa-opt">not shown to the applicant</span></label>
                  <textarea id="aa-note" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <button type="button" className="aa-btn primary block" disabled={!toStage || busy}
                  onClick={async () => {
                    if (await act(() => api(`/api/v1/admin/applications/${id}/stage`, { method: 'POST', body: { stage: toStage, note, message } }),
                      'Stage changed. The applicant has been emailed.')) { setToStage(''); setNote(''); setMessage(''); }
                  }}>Update stage and email applicant</button>
              </div>
            )}
          </section>

          {a.stage === 'APPROVED' ? (
            <section className="aa-card aa-highlight">
              <div className="aa-card-head"><h3>Create the NessaHub account</h3></div>
              <p className="aa-muted">Open the onboarding form (pre-filled from this application), create the account, then record it here.</p>
              <div className="aa-form">
                <button type="button" className="aa-btn primary block"
                  onClick={() => navigate(ONBOARD_ROUTE[a.providerType] || '/dashboard', { state: { application: { id: a.id, code: a.code, type: a.providerType, email: a.email, phone: a.phone, details: a.details } } })}>
                  Open onboarding form
                </button>
                <div className="ct-field">
                  <label htmlFor="aa-acct">Email of the account you created</label>
                  <input id="aa-acct" value={accountEmail} onChange={(e) => setAccountEmail(e.target.value)} />
                </div>
                <button type="button" className="aa-btn block" disabled={busy || !accountEmail.trim()}
                  onClick={() => act(() => api(`/api/v1/admin/applications/${id}/account-created`, { method: 'POST', body: { email: accountEmail.trim() } }),
                    'Recorded. The applicant has been told their account is ready.')}>
                  Record account created
                </button>
              </div>
            </section>
          ) : null}

          <section className="aa-card">
            <div className="aa-card-head"><h3>History</h3></div>
            <div className="aa-composer">
              <textarea aria-label="Add an internal note" placeholder="Add an internal note…" value={internal} onChange={(e) => setInternal(e.target.value)} />
              <button type="button" className="aa-btn" disabled={busy || !internal.trim()}
                onClick={async () => { if (await act(() => api(`/api/v1/admin/applications/${id}/notes`, { method: 'POST', body: { note: internal } }), 'Note added.')) setInternal(''); }}>
                Add note
              </button>
            </div>
            <ul className="aa-timeline">
              {(a.events || []).map((e, i) => (
                <li key={i}>
                  <span className="aa-tl-dot" />
                  <div>
                    <div className="aa-tl-head">
                      {e.kind === 'STAGE' || e.kind === 'SUBMITTED' || e.kind === 'WITHDRAWN'
                        ? <Chip stage={e.to} stages={stages} size="sm" />
                        : <strong>{e.kind === 'NOTE' ? 'Internal note' : 'Document updated'}</strong>}
                      <time>{fmt(e.at)}</time>
                    </div>
                    {e.by ? <span className="aa-muted">by {e.by}</span> : null}
                    {e.message ? <div className="aa-msg"><b>To applicant</b>{e.message}</div> : null}
                    {e.note ? <div className="aa-note">{e.note}</div> : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function DocRow({ d, disabled, onSave }) {
  const [status, setStatus] = useState(d.status);
  const [note, setNote] = useState(d.note || '');
  useEffect(() => { setStatus(d.status); setNote(d.note || ''); }, [d.status, d.note]);
  const [label, color] = DOC_STATUS[d.status] || [d.status, '#64748b'];
  const changed = status !== d.status || (note || '') !== (d.note || '');
  return (
    <li className="aa-doc">
      <div className="aa-doc-head">
        <div>
          <span className="aa-doc-name">{d.label}</span>
          {d.required ? null : <span className="aa-opt">if applicable</span>}
        </div>
        <span className="aa-status" style={{ color, background: `${color}14`, borderColor: `${color}40` }}><i style={{ background: color }} />{label}</span>
      </div>
      <div className="aa-doc-edit">
        <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={disabled} aria-label={`Status of ${d.label}`}>
          {Object.entries(DOC_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} disabled={disabled}
          placeholder={status === 'REJECTED' ? 'Why (the applicant sees this)' : 'Note (optional)'} aria-label={`Note on ${d.label}`} />
        <button type="button" className={`aa-btn${changed ? ' primary' : ''}`} disabled={disabled || !changed} onClick={() => onSave(status, note)}>Save</button>
      </div>
      {d.updatedBy ? <p className="aa-doc-by">Updated by {d.updatedBy}, {fmt(d.updatedAt)}</p> : null}
    </li>
  );
}
