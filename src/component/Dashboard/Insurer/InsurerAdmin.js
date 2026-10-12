import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, PieChart, Pie, Cell } from 'recharts';
import { INS, money, when, Kpi, Modal, Page, Empty, useLoad, get, post, patch, downloadCsv } from './insurerUi';
import Paged from '../../Common/Paged';

const canDo = (me, roles) => me?.staffRole === 'ADMIN' || roles.includes(me?.staffRole);
const COLORS = ['#1d4ed8', '#0f766e', '#7c3aed', '#f59e0b', '#dc2626', '#0ea5e9', '#16a34a', '#64748b'];

// ── Finance ──────────────────────────────────────────────────────────────────

export function InsFinance({ me }) {
  const pay = useLoad(() => get(`${INS}/finance/payables`), []);
  const runs = useLoad(() => get(`${INS}/finance/runs`), []);
  const [sel, setSel] = useState({});
  const [open, setOpen] = useState(null);
  const can = canDo(me, ['FINANCE']);
  const chosen = Object.keys(sel).filter(k => sel[k]);
  const total = (pay.data || []).reduce((s, p) => s + Number(p.amount), 0);
  const create = async () => {
    try { const r = await post(`${INS}/finance/runs`, { providerOwnerIds: chosen.length ? chosen : null }); setSel({}); pay.reload(); runs.reload(); setOpen(r.id); } catch (e) { alert(e?.message); }
  };
  return (
    <Page title="Finance" sub="Approved claims owed to providers. Group them into a payment run, pay through your bank, then mark it paid — providers get remittance advice automatically."
      actions={<>
        <button type="button" className="dx-btn" onClick={() => downloadCsv(`${INS}/export/claims.csv?status=APPROVED`, 'approved-claims.csv').catch(e => alert(e.message))}>⬇ Approved claims CSV</button>
        {can && (pay.data || []).length > 0 && <button type="button" className="dx-btn dx-btn--primary" onClick={create}>Create payment run{chosen.length ? ` (${chosen.length})` : ' (all)'}</button>}
      </>}>
      <div className="dx-today">
        <Kpi label="Owed to providers" value={money(total)} color="#0f766e" sub={`${(pay.data || []).length} providers`} />
        <Kpi label="Draft runs" value={(runs.data || []).filter(r => r.status === 'DRAFT').length} color="#f59e0b" />
        <Kpi label="Paid (all time)" value={money((runs.data || []).filter(r => r.status === 'PAID').reduce((s, r) => s + Number(r.totalAmount), 0))} color="#16a34a" />
      </div>
      <div className="dx-grid">
        <section className="dx-card dx-span-6">
          <div className="dx-card-head"><h2 className="dx-card-title">Owed by provider</h2></div>
          <table className="dx-table"><thead><tr>{can && <th />}<th>Provider</th><th>Claims</th><th>Amount</th><th>Oldest approval</th></tr></thead>
            <tbody>{(pay.data || []).length ? pay.data.map(p => <tr key={p.ownerId}>{can && <td><input type="checkbox" checked={!!sel[p.ownerId]} onChange={e => setSel(s => ({ ...s, [p.ownerId]: e.target.checked }))} /></td>}
              <td><b>{p.providerName}</b><div className="dx-card-hint">{p.providerCode}</div></td><td>{p.claims}</td><td><b>{money(p.amount)}</b></td><td className="dx-card-hint">{when(p.oldestApproval)}</td></tr>)
              : <tr><td colSpan={5}><Empty>Nothing owed right now.</Empty></td></tr>}</tbody></table>
        </section>
        <section className="dx-card dx-span-6">
          <div className="dx-card-head"><h2 className="dx-card-title">Payment runs</h2></div>
          <table className="dx-table"><thead><tr><th>Run</th><th>Providers</th><th>Claims</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>{(runs.data || []).length ? runs.data.map(r => <tr key={r.id} className="dx-click" onClick={() => setOpen(r.id)}><td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.ref}</td><td>{r.providerCount}</td><td>{r.claimCount}</td><td>{money(r.totalAmount)}</td>
              <td><span className="dx-pill" style={r.status === 'PAID' ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>{r.status.toLowerCase()}</span>{r.paymentReference ? <div className="dx-card-hint">{r.paymentReference}</div> : null}</td></tr>)
              : <tr><td colSpan={5}><Empty>No runs yet.</Empty></td></tr>}</tbody></table>
        </section>
      </div>
      {open && <RunDrawer id={open} can={can} onClose={() => setOpen(null)} onChanged={() => { runs.reload(); pay.reload(); }} />}
    </Page>
  );
}

function RunDrawer({ id, can, onClose, onChanged }) {
  const { data: r, reload } = useLoad(() => get(`${INS}/finance/runs/${id}`), [id]);
  const [ref, setRef] = useState('');
  const paid = async () => { try { await post(`${INS}/finance/runs/${id}/paid`, { paymentReference: ref }); await reload(); onChanged(); } catch (e) { alert(e?.message); } };
  if (!r) return <Modal title="Payment run" onClose={onClose}><Empty>Loading…</Empty></Modal>;
  return (
    <Modal title={`Payment run ${r.ref}`} sub={`${r.status.toLowerCase()} · ${money(r.totalAmount)} · ${r.claimCount} claims`} onClose={onClose}
      footer={<>
        <button type="button" className="dx-btn" style={{ marginRight: 'auto' }} onClick={() => downloadCsv(`${INS}/export/claims.csv?runId=${id}`, `${r.ref}.csv`).catch(e => alert(e.message))}>⬇ Remittance CSV</button>
        {can && r.status === 'DRAFT' && <><input className="dx-input" placeholder="Bank / payment reference" value={ref} onChange={e => setRef(e.target.value)} /><button type="button" className="dx-btn dx-btn--primary" disabled={!ref.trim()} onClick={paid}>Mark paid & notify providers</button></>}
      </>}>
      <table className="dx-table"><thead><tr><th>Provider</th><th>Code</th><th>Claims</th><th>Amount</th></tr></thead>
        <tbody>{(r.providers || []).map(p => <tr key={p.ownerId}><td><b>{p.providerName}</b></td><td>{p.providerCode}</td><td>{p.claims}</td><td>{money(p.amount)}</td></tr>)}</tbody></table>
    </Modal>
  );
}

// ── Reports ──────────────────────────────────────────────────────────────────

export function InsReports() {
  const [days, setDays] = useState(90);
  const { data: r } = useLoad(() => get(`${INS}/reports?days=${days}`), [days]);
  return (
    <Page title="Reports" sub="Utilisation and cost, from your claims on NessaHub."
      actions={<><div className="dx-seg">{[30, 90, 180, 365].map(n => <button key={n} type="button" className={days === n ? 'on' : ''} onClick={() => setDays(n)}>{n}d</button>)}</div>
        <button type="button" className="dx-btn" onClick={() => downloadCsv(`${INS}/export/claims.csv`, 'claims.csv').catch(e => alert(e.message))}>⬇ All claims CSV</button>
        <button type="button" className="dx-btn" onClick={() => window.print()}>🖨 Print</button></>}>
      {!r ? <Empty>Loading…</Empty> : (
        <>
          <div className="dx-today">
            <Kpi label="Spend" value={money(r.spend)} color="#1d4ed8" sub={`last ${r.days} days`} />
            <Kpi label="Cost / member / month" value={r.costPerMemberPerMonth == null ? '—' : money(r.costPerMemberPerMonth)} color="#7c3aed" sub={`${r.members} members`} />
            <Kpi label="Prevented" value={money(r.prevented)} color="#16a34a" sub="Blocked at the counter" />
            <Kpi label="Approved" value={r.decisions?.approved || 0} color="#0f766e" sub={`${r.decisions?.auto || 0} automatically`} />
            <Kpi label="Rejected" value={r.decisions?.rejected || 0} color="#dc2626" />
            <Kpi label="Queried" value={r.decisions?.queried || 0} color="#f59e0b" />
          </div>
          <div className="dx-grid">
            <section className="dx-card dx-span-8"><div className="dx-card-head"><h2 className="dx-card-title">Spend by month</h2></div>
              <div style={{ height: 240 }}><ResponsiveContainer><BarChart data={(r.byMonth || []).map(m => ({ ...m, amount: Number(m.amount), copay: Number(m.copay) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="amount" name="Insurer paid" stackId="a" fill="#1d4ed8" /><Bar dataKey="copay" name="Member co-pay" stackId="a" fill="#93c5fd" /></BarChart></ResponsiveContainer></div></section>
            <section className="dx-card dx-span-4"><div className="dx-card-head"><h2 className="dx-card-title">By service</h2></div>
              <div style={{ height: 240 }}><ResponsiveContainer><PieChart><Pie data={(r.byService || []).map(s => ({ name: s.serviceType, value: Number(s.amount) }))} dataKey="value" nameKey="name" outerRadius={90} label>
                {(r.byService || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div></section>
            <section className="dx-card dx-span-6"><div className="dx-card-head"><h2 className="dx-card-title">Top medicines by cost</h2></div>
              <table className="dx-table"><tbody>{(r.topMedicines || []).map(m => <tr key={m.name}><td><b>{m.name}</b></td><td>{Number(m.quantity)} units</td><td>{money(m.amount)}</td></tr>)}</tbody></table></section>
            <section className="dx-card dx-span-6"><div className="dx-card-head"><h2 className="dx-card-title">Top diagnoses (ICD-10)</h2></div>
              {(r.topDiagnoses || []).length ? <table className="dx-table"><tbody>{r.topDiagnoses.map(d => <tr key={d.code}><td><b>{d.code}</b></td><td>{d.claims} claims</td><td>{money(d.amount)}</td></tr>)}</tbody></table> : <Empty>No coded claims yet.</Empty>}</section>
            <section className="dx-card dx-span-6"><div className="dx-card-head"><h2 className="dx-card-title">Employer groups</h2></div>
              <table className="dx-table"><tbody>{(r.byGroup || []).map(g => <tr key={g.groupName}><td><b>{g.groupName}</b></td><td>{g.members} members</td><td>{money(g.spendYtd)} YTD</td></tr>)}</tbody></table></section>
            <section className="dx-card dx-span-6"><div className="dx-card-head"><h2 className="dx-card-title">By provider type</h2></div>
              <table className="dx-table"><tbody>{(r.byProviderType || []).map(p => <tr key={p.type}><td><b>{p.type}</b></td><td>{p.claims} claims</td><td>{money(p.amount)}</td></tr>)}</tbody></table></section>
          </div>
        </>
      )}
    </Page>
  );
}

// ── Notices ──────────────────────────────────────────────────────────────────

export function InsNotices({ me }) {
  const { data, reload } = useLoad(() => get(`${INS}/notices`), []);
  const [form, setForm] = useState({ audience: 'PROVIDERS', title: '', body: '', viaSms: false });
  const can = canDo(me, ['NETWORK_MANAGER', 'CARE_MANAGER']);
  const send = async () => {
    if (!window.confirm(`Send to all your ${form.audience.toLowerCase()} on NessaHub?`)) return;
    try { const r = await post(`${INS}/notices`, form); alert(`Sent to ${r.sent}`); setForm({ ...form, title: '', body: '' }); reload(); } catch (e) { alert(e?.message); }
  };
  return (
    <Page title="Notices" sub="Tell your network or members about tariff changes, new rules, holiday hours, health campaigns.">
      {can && (
        <div className="dx-card" style={{ marginBottom: 12, display: 'grid', gap: 10 }}>
          <div className="dx-two">
            <div className="dx-field"><label>Send to</label><select className="dx-select" value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })}><option value="PROVIDERS">All network providers</option><option value="MEMBERS">All members</option></select></div>
            <div className="dx-field"><label>Title</label><input className="dx-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
          </div>
          <div className="dx-field"><label>Message</label><textarea rows={3} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 6, fontSize: '0.84rem' }}><input type="checkbox" checked={form.viaSms} onChange={e => setForm({ ...form, viaSms: e.target.checked })} /> Also send by SMS</label>
            <button type="button" className="dx-btn dx-btn--primary" disabled={!form.title.trim() || !form.body.trim()} onClick={send}>Send notice</button>
          </div>
        </div>
      )}
      <div className="dx-card"><table className="dx-table"><thead><tr><th>When</th><th>To</th><th>Title</th><th>Message</th><th>Reached</th></tr></thead>
        <tbody>{(data || []).length ? <Paged items={data} table>{(data) => data.map(n => <tr key={n.id}><td className="dx-card-hint">{when(n.createdAt)}</td><td>{n.audience.toLowerCase()}{n.viaSms ? ' + SMS' : ''}</td><td><b>{n.title}</b></td><td className="dx-card-hint" style={{ maxWidth: 380 }}>{n.body}</td><td>{n.sentCount}</td></tr>)}</Paged>
          : <tr><td colSpan={5}><Empty>No notices sent.</Empty></td></tr>}</tbody></table></div>
    </Page>
  );
}

// ── Integration ──────────────────────────────────────────────────────────────

export function InsIntegration() {
  const { data } = useLoad(() => get(`${INS}/integration`), []);
  return (
    <Page title="Integration" sub="How NessaHub talks to your system: card checks, cover checks and claims go through your adapter.">
      {!data ? <Empty>Loading…</Empty> : (
        <>
          <div className="dx-today">
            <Kpi label="Adapter" value={data.adapter} color="#1d4ed8" />
            <Kpi label="Calls (24h)" value={data.last24h?.calls || 0} color="#0f766e" />
            <Kpi label="Errors (24h)" value={data.last24h?.errors || 0} color="#dc2626" />
            <Kpi label="Avg response" value={data.last24h?.avgLatencyMs == null ? '—' : `${data.last24h.avgLatencyMs} ms`} color="#7c3aed" sub={data.last24h?.maxLatencyMs ? `max ${data.last24h.maxLatencyMs} ms` : undefined} />
          </div>
          <div className="dx-card"><div className="dx-card-head"><h2 className="dx-card-title">Recent errors</h2></div>
            {(data.recentErrors || []).length ? <table className="dx-table"><tbody>{data.recentErrors.map((e, i) => <tr key={i}><td className="dx-card-hint">{when(e.createdAt)}</td><td>{e.purpose}</td><td>{e.reason}</td></tr>)}</tbody></table> : <Empty>No errors. 👍</Empty>}</div>
          <div className="dx-card" style={{ marginTop: 12 }}><div className="dx-card-head"><h2 className="dx-card-title">Exports</h2></div>
            <button type="button" className="dx-btn" onClick={() => downloadCsv(`${INS}/export/claims.csv`, 'claims.csv').catch(e => alert(e.message))}>⬇ All claims (CSV for your system)</button></div>
        </>
      )}
    </Page>
  );
}

// ── Staff & settings ─────────────────────────────────────────────────────────

const ROLES = ['ADMIN', 'CLAIMS_OFFICER', 'MEDICAL_REVIEWER', 'NETWORK_MANAGER', 'FINANCE', 'CARE_MANAGER', 'VIEWER'];

export function InsStaff({ me }) {
  const { data, setData } = useLoad(() => get(`${INS}/staff`), []);
  const [form, setForm] = useState(null);
  const [created, setCreated] = useState(null);
  const isAdmin = me?.staffRole === 'ADMIN';
  const add = async () => { try { const r = await post(`${INS}/staff`, form); setCreated(r); setForm(null); setData(await get(`${INS}/staff`)); } catch (e) { alert(e?.message); } };
  const update = async (u, body) => { try { setData(await patch(`${INS}/staff/${u.userId}`, body)); } catch (e) { alert(e?.message); } };
  return (
    <Page title="Staff & roles" sub="Each person gets their own login and only the tools their role needs."
      actions={isAdmin && <button type="button" className="dx-btn dx-btn--primary" onClick={() => setForm({ fullName: '', email: '', staffRole: 'CLAIMS_OFFICER' })}>+ Add staff</button>}>
      {created && <div className="dx-alert" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e3a8a' }}><div><strong>Login created for {created.email}</strong><p>Temporary password: <code>{created.temporaryPassword}</code> — share it securely; they must change it on first sign-in.</p></div><button type="button" className="dx-btn dx-btn--sm" onClick={() => setCreated(null)}>Done</button></div>}
      <div className="dx-card"><table className="dx-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
        <tbody>{(data || []).map(u => <tr key={u.userId}><td><b>{u.name}</b></td><td>{u.email}</td>
          <td>{isAdmin ? <select className="dx-select" value={u.staffRole} onChange={e => update(u, { staffRole: e.target.value })}>{ROLES.map(r => <option key={r}>{r}</option>)}</select> : u.staffRole}</td>
          <td>{isAdmin ? <button type="button" className="dx-btn dx-btn--sm" onClick={() => update(u, { active: !u.active })}>{u.active ? 'Disable' : 'Enable'}</button> : (u.active ? 'Active' : 'Disabled')}</td></tr>)}</tbody></table></div>
      <div className="dx-card" style={{ marginTop: 12 }}><div className="dx-card-head"><h2 className="dx-card-title">What each role can do</h2></div>
        <table className="dx-table"><tbody>
          <tr><td><b>ADMIN</b></td><td>Everything, including staff and settings</td></tr>
          <tr><td><b>CLAIMS_OFFICER</b></td><td>Review, approve, query and reject claims; fraud flags and cases</td></tr>
          <tr><td><b>MEDICAL_REVIEWER</b></td><td>Pre-authorisation decisions, clinical claim review, price lists</td></tr>
          <tr><td><b>NETWORK_MANAGER</b></td><td>Provider network, invitations, price lists, notices</td></tr>
          <tr><td><b>FINANCE</b></td><td>Payment runs, mark paid, exports</td></tr>
          <tr><td><b>CARE_MANAGER</b></td><td>Chronic members, refill reminders, member notices</td></tr>
          <tr><td><b>VIEWER</b></td><td>Read-only</td></tr>
        </tbody></table></div>
      {form && (
        <Modal title="Add staff" onClose={() => setForm(null)} width={560} footer={<><button type="button" className="dx-btn" onClick={() => setForm(null)}>Cancel</button><button type="button" className="dx-btn dx-btn--primary" onClick={add}>Create login</button></>}>
          <div className="dx-field"><label>Full name</label><input className="dx-input" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} /></div>
          <div className="dx-field"><label>Work email</label><input className="dx-input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          <div className="dx-field"><label>Role</label><select className="dx-select" value={form.staffRole} onChange={e => setForm({ ...form, staffRole: e.target.value })}>{ROLES.map(r => <option key={r}>{r}</option>)}</select></div>
        </Modal>
      )}
    </Page>
  );
}

export function InsSettings({ me }) {
  const { data, setData } = useLoad(() => get(`${INS}/settings`), []);
  const [msg, setMsg] = useState('');
  const isAdmin = me?.staffRole === 'ADMIN';
  if (!data) return <Page title="Settings"><Empty>Loading…</Empty></Page>;
  const save = async () => {
    try {
      setData(await patch(`${INS}/settings`, { claimsMode: data.claimsMode, autoApproveLimit: data.autoApproveLimit === '' || data.autoApproveLimit == null ? 0 : Number(data.autoApproveLimit),
        preauthSlaHours: Number(data.preauthSlaHours), confirmationRequired: !!data.confirmationRequired, supportPhone: data.supportPhone, supportEmail: data.supportEmail, requireTwoFactor: !!data.requireTwoFactor }));
      setMsg('Saved.'); setTimeout(() => setMsg(''), 2500);
    } catch (e) { alert(e?.message); }
  };
  return (
    <Page title="Settings" sub={`${data.name} (${data.code}) · adapter ${data.adapter}`}>
      <div className="dx-card" style={{ display: 'grid', gap: 12, maxWidth: 760 }}>
        <div className="dx-field"><label>Where claims are decided</label>
          <select className="dx-select" disabled={!isAdmin} value={data.claimsMode} onChange={e => setData({ ...data, claimsMode: e.target.value })}>
            <option value="NESSAHUB">On this dashboard (your team reviews here)</option><option value="API">In our own system (NessaHub sends them through the adapter)</option></select></div>
        <div className="dx-two">
          <div className="dx-field"><label>Auto-approve clean claims up to (GHS, 0 = off)</label><input className="dx-input" type="number" disabled={!isAdmin} value={data.autoApproveLimit ?? ''} onChange={e => setData({ ...data, autoApproveLimit: e.target.value })} /></div>
          <div className="dx-field"><label>Pre-authorisation deadline (hours)</label><input className="dx-input" type="number" disabled={!isAdmin} value={data.preauthSlaHours} onChange={e => setData({ ...data, preauthSlaHours: e.target.value })} /></div>
          <div className="dx-field"><label>Support phone (shown to members)</label><input className="dx-input" disabled={!isAdmin} value={data.supportPhone || ''} onChange={e => setData({ ...data, supportPhone: e.target.value })} /></div>
          <div className="dx-field"><label>Support email</label><input className="dx-input" disabled={!isAdmin} value={data.supportEmail || ''} onChange={e => setData({ ...data, supportEmail: e.target.value })} /></div>
        </div>
        <label style={{ display: 'flex', gap: 8, fontSize: '0.86rem' }}><input type="checkbox" disabled={!isAdmin} checked={!!data.confirmationRequired} onChange={e => setData({ ...data, confirmationRequired: e.target.checked })} /> Require the member to confirm they received each service (recommended — stops phantom billing)</label>
        <label style={{ display: 'flex', gap: 8, fontSize: '0.86rem' }}><input type="checkbox" disabled={!isAdmin} checked={!!data.requireTwoFactor} onChange={e => setData({ ...data, requireTwoFactor: e.target.checked })} /> Two-step sign-in for all staff: a code is emailed at every login (recommended — your staff see members' health and claims data)</label>
        {isAdmin && <div><button type="button" className="dx-btn dx-btn--primary" onClick={save}>Save settings</button> {msg && <span className="dx-card-hint">{msg}</span>}</div>}
      </div>
    </Page>
  );
}

// ── Audit log ────────────────────────────────────────────────────────────────

const AUDIT_GROUPS = [['', 'Everything'], ['CLAIM', 'Claims'], ['PREAUTH', 'Pre-auth'], ['FRAUD', 'Fraud'], ['NETWORK', 'Network'], ['FORMULARY', 'Medicine list'], ['TARIFF', 'Tariffs'],
  ['PAYMENT', 'Payments'], ['STAFF', 'Staff'], ['SETTINGS', 'Settings'], ['NOTICE', 'Notices'], ['CARE', 'Care']];
const AUDIT_TONE = { CLAIM: '#1d4ed8', PREAUTH: '#7c3aed', FRAUD: '#dc2626', NETWORK: '#0f766e', FORMULARY: '#0ea5e9', TARIFF: '#0ea5e9', PAYMENT: '#16a34a', STAFF: '#f59e0b', SETTINGS: '#f59e0b', NOTICE: '#64748b', CARE: '#db2777' };

function saveCsv(name, list) {
  if (!list.length) return;
  const cols = Object.keys(list[0]);
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const blob = new Blob([[cols.join(','), ...list.map(r => cols.map(c => cell(r[c])).join(','))].join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

export function InsAudit({ me }) {
  const [group, setGroup] = useState('');
  const [actor, setActor] = useState('');
  const [q, setQ] = useState('');
  const { data: staff } = useLoad(() => get(`${INS}/staff`), []);
  const { data } = useLoad(() => get(`${INS}/audit?${new URLSearchParams({ ...(group ? { action: group } : {}), ...(actor ? { actorId: actor } : {}) })}`), [group, actor]);
  if (me && me.staffRole !== 'ADMIN') return <Page title="Audit log"><Empty>Only insurer admins can see the audit log.</Empty></Page>;
  const rows = (data || []).filter(r => !q || `${r.action} ${r.targetId || ''} ${r.detail || ''} ${r.actorName || ''}`.toLowerCase().includes(q.toLowerCase()));
  const today = rows.filter(r => new Date(r.createdAt).toDateString() === new Date().toDateString()).length;
  const decisions = rows.filter(r => /^(CLAIM|PREAUTH)_/.test(r.action)).length;
  const sensitive = rows.filter(r => /^(STAFF|SETTINGS|PAYMENT_RUN_PAID|NETWORK_SUSPENDED|FORMULARY_IMPORT)/.test(r.action)).length;
  const people = new Set(rows.map(r => r.actorEmail)).size;
  return (
    <Page title="Audit log" sub="Every decision and change made on this dashboard, by whom and when. Entries cannot be edited or deleted."
      actions={<button type="button" className="dx-btn" onClick={() => saveCsv('insurer-audit.csv', rows.map(r => ({ when: r.createdAt, who: r.actorName, email: r.actorEmail, role: r.actorRole, action: r.action, target: r.targetType, ref: r.targetId, detail: r.detail })))}>⬇ Export CSV</button>}>
      <div className="dx-today">
        <Kpi label="Entries shown" value={rows.length} color="#1d4ed8" />
        <Kpi label="Today" value={today} color="#0f766e" />
        <Kpi label="Claim & pre-auth decisions" value={decisions} color="#7c3aed" />
        <Kpi label="Sensitive changes" value={sensitive} color="#dc2626" sub="staff, settings, payments, suspensions" />
        <Kpi label="People" value={people} color="#64748b" />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <div className="dx-tabs" style={{ marginBottom: 0 }}>{AUDIT_GROUPS.map(([k, l]) => <button key={k || 'all'} type="button" className={`dx-tab ${group === k ? 'on' : ''}`} onClick={() => setGroup(k)}>{l}</button>)}</div>
        <select className="dx-select" style={{ width: 200 }} value={actor} onChange={e => setActor(e.target.value)}><option value="">All staff</option>{(staff || []).map(u => <option key={u.userId} value={u.userId}>{u.name}</option>)}</select>
        <input className="dx-input" style={{ width: 220 }} placeholder="Search ref, detail…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="dx-card"><div className="dx-table-wrap"><table className="dx-table">
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Reference</th><th>Detail</th></tr></thead>
        <tbody>{rows.length ? <Paged items={rows} table>{(rows) => rows.map(r => {
          const g = r.action.split('_')[0];
          return (
            <tr key={r.id}>
              <td className="dx-card-hint" style={{ whiteSpace: 'nowrap' }}>{when(r.createdAt)}</td>
              <td><b>{r.actorName || '—'}</b><div className="dx-card-hint">{(r.actorRole || '').replace('_', ' ').toLowerCase()}</div></td>
              <td><span style={{ color: AUDIT_TONE[g] || '#334155', background: `${AUDIT_TONE[g] || '#334155'}14`, borderRadius: 999, padding: '0.15rem 0.6rem', fontSize: '0.74rem', fontWeight: 800, whiteSpace: 'nowrap' }}>{r.action.replace(/_/g, ' ').toLowerCase()}</span></td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{r.targetId ? String(r.targetId).slice(0, 18) : '—'}</td>
              <td className="dx-card-hint" style={{ maxWidth: 380 }}>{r.detail || ''}</td>
            </tr>);
        })}</Paged> : <tr><td colSpan={5}><Empty>No entries yet.</Empty></td></tr>}</tbody>
      </table></div></div>
    </Page>
  );
}
