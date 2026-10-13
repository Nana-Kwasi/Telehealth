import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../services/apiClient';

/**
 * Platform settings. Only settings the backend enforces are here, so each one
 * applies on web and mobile alike. The list, limits and wording come from the
 * server (/settings/schema), so this screen can never offer a setting that does
 * nothing.
 */
const CFG = '/api/v1/admin/system-config';

const SECTIONS = [
  { key: 'general', label: 'General', icon: '🌐', sub: 'Name, support contacts, maintenance and sign-ups.' },
  { key: 'appointments', label: 'Appointments', icon: '📅', sub: 'Limits and rules for every booking, web and mobile.' },
  { key: 'prescriptions', label: 'Prescriptions', icon: '💊', sub: 'NessaRx rules for prescribers, patients and pharmacies.' },
  { key: 'notifications', label: 'Notifications', icon: '🔔', sub: 'Email, SMS and phone alerts. Security messages always send.' },
  { key: 'security', label: 'Sign-in security', icon: '🔐', sub: 'How people sign in, for every app.' },
  { key: 'payments', label: 'Payments', icon: '💳', sub: 'Tax, NessaHub\'s share and the free first consultation.' },
  { key: 'dataRetention', label: 'Data & retention', icon: '🗄', sub: 'How long records are kept. Medical records: never under 7 years.' },
  { key: 'features', label: 'Features', icon: '🧩', sub: 'Switch whole features on or off for everyone.' },
];

const when = (v) => (v ? new Date(v).toLocaleString() : '');

function diff(beforeJson, afterJson, schema) {
  let before = {};
  let after = {};
  try { before = JSON.parse(beforeJson || '{}'); } catch { /* ignore */ }
  try { after = JSON.parse(afterJson || '{}'); } catch { /* ignore */ }
  const label = (k) => schema.find((f) => f.key === k)?.label || k;
  const show = (v) => (v === true ? 'on' : v === false ? 'off' : String(v));
  return Object.keys(after)
    .filter((k) => schema.some((f) => f.key === k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => `${label(k)}: ${before[k] === undefined ? '—' : show(before[k])} → ${show(after[k])}`);
}

export default function AdminSystemConfig() {
  const [schema, setSchema] = useState([]);
  const [facts, setFacts] = useState({});
  const [money, setMoney] = useState(null);
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [active, setActive] = useState('general');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, v, h] = await Promise.all([
        api(`${CFG}/settings/schema`),
        api(`${CFG}/settings`),
        api(`${CFG}/settings/history?limit=20`).catch(() => []),
      ]);
      setSchema(s?.fields || []);
      setFacts(s?.facts || {});
      setSaved(v || {});
      setDraft(JSON.parse(JSON.stringify(v || {})));
      setHistory(h || []);
      setLoadError('');
    } catch (e) {
      setLoadError(e?.message || 'Could not load the settings');
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (active === 'payments' && !money) api(`${CFG}/payments-summary?days=30`).then(setMoney).catch(() => setMoney({}));
  }, [active, money]);

  const fields = useMemo(() => schema.filter((f) => f.section === active), [schema, active]);
  const changed = useMemo(() => {
    if (!draft || !saved) return {};
    const out = {};
    fields.forEach((f) => {
      if (JSON.stringify(draft[active]?.[f.key]) !== JSON.stringify(saved[active]?.[f.key])) out[f.key] = draft[active]?.[f.key];
    });
    return out;
  }, [draft, saved, fields, active]);
  const dirty = Object.keys(changed).length > 0;

  const set = (key, value) => {
    setMsg(null);
    setDraft((d) => ({ ...d, [active]: { ...(d?.[active] || {}), [key]: value } }));
  };

  const save = async () => {
    // Maintenance locks everyone else out: say so before it happens.
    if (active === 'general' && changed.maintenanceMode === true
      && !window.confirm('Turn on maintenance mode? Everyone except super admins will be paused on web and mobile until you turn it off.')) return;
    if (active === 'security' && changed.adminIpWhitelist
      && !window.confirm('Only the listed networks will be able to use the admin dashboard, including for you. Continue?')) return;
    if (active === 'dataRetention' && Object.keys(changed).length
      && !window.confirm('Records older than these limits are permanently erased by the nightly clean-up. Continue?')) return;
    if (active === 'features' && Object.values(changed).some((v) => v === false)
      && !window.confirm('Switching a feature off stops it for everyone, on web and mobile, straight away. Continue?')) return;
    if (active === 'security' && changed.adminsRequireTwoStep === false
      && !window.confirm('Turn off two-step sign-in for super admins? A stolen password alone would then open the admin dashboard.')) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api(`${CFG}/settings/${active}`, { method: 'PATCH', body: changed });
      const next = { ...saved, [active]: r?.[active] || { ...saved[active], ...changed } };
      setSaved(next);
      setDraft(JSON.parse(JSON.stringify(next)));
      setMsg({ ok: true, text: 'Saved. It applies across NessaHub now.' });
      api(`${CFG}/settings/history?limit=20`).then(setHistory).catch(() => {});
    } catch (e) {
      setMsg({ ok: false, text: e?.message || 'Could not save' });
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setDraft(JSON.parse(JSON.stringify(saved))); setMsg(null); };

  if (loadError) {
    return (
      <div className="admin-page">
        <div className="admin-alert admin-alert-danger">{loadError} <button type="button" className="btn btn-ghost btn-sm" onClick={load}>Try again</button></div>
      </div>
    );
  }
  if (!draft) return <div className="admin-page"><div className="admin-empty"><p>Loading settings…</p></div></div>;

  const section = SECTIONS.find((s) => s.key === active);
  const maintenanceOn = !!saved?.general?.maintenanceMode;
  const signupsClosed = saved?.general?.newRegistrationsOpen === false;

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">System Config</h1>
          <p className="admin-page-sub">Platform-wide rules. Each one is enforced by the server, so it applies on web and mobile alike.</p>
        </div>
      </div>

      {maintenanceOn && <div className="admin-alert admin-alert-warn"><b>Maintenance mode is on.</b> Only super admins can use NessaHub right now.</div>}
      {signupsClosed && <div className="admin-alert admin-alert-info"><b>Sign-ups are paused.</b> New patients and clients cannot create accounts. Onboarding by admins still works.</div>}

      <div className="sc-layout">
        <nav className="admin-table-card sc-nav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button key={s.key} type="button" className={`sc-nav-item ${active === s.key ? 'active' : ''}`}
              onClick={() => { if (dirty && !window.confirm('Leave without saving your changes?')) return; reset(); setActive(s.key); }}>
              <span aria-hidden="true">{s.icon}</span> {s.label}
            </button>
          ))}
        </nav>

        <div>
          <section className="admin-table-card">
            <div className="admin-table-header">
              <div>
                <p className="admin-table-title">{section.label}</p>
                <p className="admin-page-sub" style={{ margin: '2px 0 0' }}>{section.sub}</p>
              </div>
              <div className="admin-table-actions">
                {dirty && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={reset}>Discard</button>}
                <button type="button" className="btn btn-primary btn-sm" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>
              </div>
            </div>
            <div style={{ padding: '0.25rem 1.25rem 1rem' }}>
              {msg && <div className={`admin-alert ${msg.ok ? 'admin-alert-success' : 'admin-alert-danger'}`} style={{ marginTop: '0.75rem' }}>{msg.text}</div>}
              {fields.map((f) => {
                const v = draft[active]?.[f.key];
                if (active === 'general' && f.key === 'maintenanceMessage' && !draft.general?.maintenanceMode) return null;
                if (f.type === 'toggle') {
                  return (
                    <div key={f.key} className="toggle-row">
                      <div className="toggle-info"><span className="toggle-label">{f.label}</span><span className="toggle-desc">{f.help}</span></div>
                      <label className="toggle-switch">
                        <input type="checkbox" checked={!!v} onChange={(e) => set(f.key, e.target.checked)} aria-label={f.label} />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  );
                }
                return (
                  <div key={f.key} className="toggle-row" style={{ alignItems: f.type === 'text' ? 'flex-start' : 'center' }}>
                    <div className="toggle-info" style={{ flex: 1 }}><span className="toggle-label">{f.label}</span><span className="toggle-desc">{f.help}</span></div>
                    {f.type === 'number' || f.type === 'decimal' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="number" value={v ?? ''} min={f.min ?? undefined} max={f.max ?? undefined} step={f.type === 'decimal' ? '0.1' : '1'} style={{ width: 110 }}
                          onChange={(e) => set(f.key, e.target.value === '' ? '' : Number(e.target.value))} aria-label={f.label} />
                        <span className="toggle-desc" style={{ whiteSpace: 'nowrap' }}>{f.min}–{f.max}</span>
                      </div>
                    ) : (
                      f.key === 'maintenanceMessage' || f.type === 'iplist' ? (
                        <textarea value={v ?? ''} maxLength={f.max ?? undefined} rows={2} style={{ width: 'min(100%, 340px)' }}
                          placeholder={f.type === 'iplist' ? 'e.g. 154.161.12.3, 41.66.0.0/16' : ''}
                          onChange={(e) => set(f.key, e.target.value)} aria-label={f.label} />
                      ) : (
                        <input type={f.type === 'email' ? 'email' : 'text'} value={v ?? ''} maxLength={f.max ?? undefined} style={{ width: 'min(100%, 300px)' }}
                          onChange={(e) => set(f.key, e.target.value)} aria-label={f.label} />
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {active === 'payments' && (
            <section className="admin-table-card">
              <div className="admin-table-header"><p className="admin-table-title">Last 30 days</p></div>
              <div style={{ padding: '0.25rem 1.25rem 1rem' }}>
                {!money ? <p className="toggle-desc">Loading…</p> : (<>
                  <div className="admin-info-row"><span className="admin-info-label">Collected (including tax)</span><span className="admin-info-value">GHS {Number(money.collected || 0).toFixed(2)}</span></div>
                  <div className="admin-info-row"><span className="admin-info-label">Tax collected</span><span className="admin-info-value">GHS {Number(money.tax || 0).toFixed(2)}</span></div>
                  <div className="admin-info-row"><span className="admin-info-label">NessaHub share</span><span className="admin-info-value">GHS {Number(money.nessaShare || 0).toFixed(2)}</span></div>
                  <div className="admin-info-row"><span className="admin-info-label">Owed to clinicians and providers</span><span className="admin-info-value">GHS {Number(money.owedToProviders || 0).toFixed(2)}</span></div>
                  <div className="admin-info-row"><span className="admin-info-label">Free first consultations</span><span className="admin-info-value">{money.freeCount || 0} (worth GHS {Number(money.freeValue || 0).toFixed(2)})</span></div>
                  {(money.byProvider || []).length > 0 && (
                    <table className="admin-table" style={{ marginTop: '0.75rem' }}>
                      <thead><tr><th>Provider</th><th>Payments</th><th>Owed</th><th>NessaHub share</th></tr></thead>
                      <tbody>{money.byProvider.map((r) => <tr key={r.providerId || r.provider}><td>{r.provider}</td><td>{r.payments}</td><td>GHS {Number(r.owed || 0).toFixed(2)}</td><td>GHS {Number(r.nessaShare || 0).toFixed(2)}</td></tr>)}</tbody>
                    </table>
                  )}
                </>)}
              </div>
            </section>
          )}

          {active === 'payments' && Object.keys(facts).length > 0 && (
            <section className="admin-table-card">
              <div className="admin-table-header"><div><p className="admin-table-title">Fixed by the services NessaHub uses</p>
                <p className="admin-page-sub" style={{ margin: '2px 0 0' }}>Not switches: changing these needs a new provider account and integration.</p></div></div>
              <div style={{ padding: '0.25rem 1.25rem 1rem' }}>
                {Object.entries(facts).map(([k, v]) => <div key={k} className="admin-info-row"><span className="admin-info-label">{k}</span><span className="admin-info-value">{v}</span></div>)}
              </div>
            </section>
          )}

          <section className="admin-table-card">
            <div className="admin-table-header"><p className="admin-table-title">Recent changes</p></div>
            {history.length ? (
              <div>
                {history.map((h, i) => {
                  const lines = diff(h.before, h.after, schema);
                  if (!lines.length) return null;
                  return (
                    <div key={i} className="admin-info-row" style={{ padding: '0.7rem 1.25rem', alignItems: 'flex-start' }}>
                      <div>
                        {lines.map((l) => <div key={l} style={{ fontSize: '0.85rem', color: 'var(--a-ink)' }}>{l}</div>)}
                      </div>
                      <div className="admin-info-label" style={{ textAlign: 'right' }}>{h.changedBy || h.changedByEmail || 'Unknown'}<br />{when(h.changedAt)}</div>
                    </div>
                  );
                })}
              </div>
            ) : <div className="admin-empty" style={{ padding: '1.5rem' }}><p>No changes yet.</p></div>}
          </section>
        </div>
      </div>
    </div>
  );
}
