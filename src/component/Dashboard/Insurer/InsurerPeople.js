import React, { useState } from 'react';
import { INS, money, when, day, CLAIM, PREAUTH, SEVERITY, Pill, Kpi, Modal, Page, Empty, useLoad, get, post, patch, put } from './insurerUi';
import Paged from '../../Common/Paged';

const canDo = (me, roles) => me?.staffRole === 'ADMIN' || roles.includes(me?.staffRole);
const risk = (n) => <span className="dx-pill" style={n >= 60 ? { background: '#dc2626', color: '#fff' } : n >= 30 ? { background: '#fef3c7', color: '#92400e' } : { background: '#dcfce7', color: '#166534' }}>{n}</span>;

// ── Members ──────────────────────────────────────────────────────────────────

export function InsMembers() {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [open, setOpen] = useState(null);
  const members = useLoad(() => get(`${INS}/members?${new URLSearchParams({ ...(q ? { q } : {}), ...(group ? { group } : {}) })}`), [q, group]);
  const groups = useLoad(() => get(`${INS}/groups`), []);
  return (
    <Page title="Members" sub="Your members who have linked their card on NessaHub (verified with your system).">
      <div className="dx-today">
        {(groups.data || []).slice(0, 6).map(g => <Kpi key={g.groupName} label={g.groupName} value={g.members} color="#1d4ed8" sub={`${money(g.spendYtd)} this year · ${g.claims30d} claims/30d`} onClick={() => setGroup(g.groupName === 'Individual' ? '' : g.groupName)} />)}
      </div>
      <div className="dx-card" style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="dx-input" style={{ flex: 1, minWidth: 240 }} placeholder="Search name or member number" value={q} onChange={e => setQ(e.target.value)} />
        <select className="dx-select" value={group} onChange={e => setGroup(e.target.value)}><option value="">All groups</option>{(groups.data || []).filter(g => g.groupName !== 'Individual').map(g => <option key={g.groupName}>{g.groupName}</option>)}</select>
      </div>
      <div className="dx-card"><div className="dx-table-wrap"><table className="dx-table">
        <thead><tr><th>Member</th><th>Number</th><th>Plan</th><th>Group</th><th>Status</th><th>Claims</th><th>Spend YTD</th><th>Last claim</th><th>Risk</th></tr></thead>
        <tbody>{(members.data || []).length ? members.data.map(m => (
          <tr key={m.cardId} className="dx-click" onClick={() => setOpen(m.cardId)}><td><b>{m.name}</b><div className="dx-card-hint">{m.relationship ? m.relationship.toLowerCase() : ''}</div></td>
            <td style={{ fontFamily: 'monospace' }}>{m.memberNo}</td><td>{m.planName || '—'}</td><td>{m.groupName || '—'}</td><td>{m.status.toLowerCase()}</td><td>{m.claims}</td><td>{money(m.spendYtd)}</td><td className="dx-card-hint">{when(m.lastClaimAt)}</td><td>{risk(m.riskScore)}</td></tr>
        )) : <tr><td colSpan={9}><Empty>No members yet.</Empty></td></tr>}</tbody>
      </table></div></div>
      {open && <MemberDrawer id={open} onClose={() => setOpen(null)} />}
    </Page>
  );
}

function MemberDrawer({ id, onClose }) {
  const { data: m } = useLoad(() => get(`${INS}/members/${id}`), [id]);
  if (!m) return <Modal title="Member" onClose={onClose}><Empty>Loading…</Empty></Modal>;
  return (
    <Modal title={m.name} sub={`${m.memberNo} · ${m.planName || ''} · ${m.groupName || 'Individual'}`} onClose={onClose} width={900}>
      <div className="dx-today" style={{ marginBottom: 0 }}>
        <Kpi label="Spend this year" value={money(m.spendYtd)} color="#1d4ed8" /><Kpi label="Claims" value={m.claims} color="#64748b" /><Kpi label="Risk score" value={m.riskScore} color="#dc2626" />
        {(m.spendByService || []).map(s => <Kpi key={s.serviceType} label={s.serviceType} value={money(s.amount)} color="#0f766e" sub={`${s.claims} claims`} />)}
      </div>
      {(m.flags || []).length > 0 && <div className="dx-alert dx-alert--red" style={{ marginBottom: 0 }}><div><strong>Signals</strong><p>{m.flags.map(f => f.detail).join(' · ')}</p></div></div>}
      <div className="dx-kpi-label">Claims</div>
      <table className="dx-table"><thead><tr><th>Ref</th><th>Date</th><th>Provider</th><th>Service</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>{(m.claimsList || []).map(c => <tr key={c.id}><td style={{ fontFamily: 'monospace' }}>{c.claimRef}</td><td className="dx-card-hint">{when(c.createdAt)}</td><td>{c.providerName}</td><td>{c.serviceType}</td><td>{money(c.insurerAmount)}</td><td><Pill map={CLAIM} k={c.status} /></td></tr>)}</tbody></table>
      <div className="dx-kpi-label">Pre-authorisations</div>
      {(m.preauths || []).length ? <table className="dx-table"><tbody>{m.preauths.map(p => <tr key={p.id}><td style={{ fontFamily: 'monospace' }}>{p.ref}</td><td>{p.serviceType}</td><td>{money(p.estimatedAmount)}</td><td><Pill map={PREAUTH} k={p.status} /></td><td className="dx-card-hint">{when(p.createdAt)}</td></tr>)}</tbody></table> : <Empty>None.</Empty>}
    </Modal>
  );
}

// ── Provider network ─────────────────────────────────────────────────────────

export function InsNetwork({ me }) {
  const [tab, setTab] = useState('providers');
  const [q, setQ] = useState('');
  const net = useLoad(() => get(`${INS}/network`), []);
  const inv = useLoad(() => get(`${INS}/network/invites`), []);
  const [invite, setInvite] = useState(null);
  const can = canDo(me, ['NETWORK_MANAGER']);
  const suspend = async (r) => {
    const reason = window.prompt(`Suspend ${r.providerName} from your network? Reason (shown to the provider):`);
    if (!reason) return;
    try { await patch(`${INS}/network/${r.id}`, { networkStatus: 'SUSPENDED', reason }); net.reload(); } catch (e) { alert(e?.message); }
  };
  const reinstate = async (r) => { try { await patch(`${INS}/network/${r.id}`, { networkStatus: 'ACTIVE' }); net.reload(); } catch (e) { alert(e?.message); } };
  const tier = async (r, t) => { try { await patch(`${INS}/network/${r.id}`, { tier: t }); net.reload(); } catch (e) { alert(e?.message); } };
  const sendInvite = async () => { try { await post(`${INS}/network/invites`, invite); setInvite(null); inv.reload(); } catch (e) { alert(e?.message); } };
  const rows = (net.data || []).filter(r => !q || `${r.providerName} ${r.providerCode} ${r.city || ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Page title="Provider network" sub="Providers verified with your provider codes. You decide who stays in — suspend anyone instantly."
      actions={can && <button type="button" className="dx-btn dx-btn--primary" onClick={() => setInvite({ providerName: '', providerType: 'PHARMACY', email: '', phone: '', providerCode: '' })}>+ Invite provider</button>}>
      <div className="dx-tabs">
        <button type="button" className={`dx-tab ${tab === 'providers' ? 'on' : ''}`} onClick={() => setTab('providers')}>Providers<b>{(net.data || []).length}</b></button>
        <button type="button" className={`dx-tab ${tab === 'invites' ? 'on' : ''}`} onClick={() => setTab('invites')}>Invitations<b>{(inv.data || []).length}</b></button>
        {tab === 'providers' && <input className="dx-input" style={{ marginLeft: 'auto', minWidth: 240 }} placeholder="Search provider, code, city" value={q} onChange={e => setQ(e.target.value)} />}
      </div>
      {tab === 'providers' ? (
        <div className="dx-card"><div className="dx-table-wrap"><table className="dx-table">
          <thead><tr><th>Provider</th><th>Type</th><th>Code</th><th>Tier</th><th>Claims 30d</th><th>Value 30d</th><th>Blocked 30d</th><th>Denied by members</th><th>Risk</th><th>Network</th>{can && <th />}</tr></thead>
          <tbody>{rows.length ? <Paged items={rows} table>{(rows) => rows.map(r => (
            <tr key={r.id}><td><b>{r.providerName || '—'}</b><div className="dx-card-hint">{r.city || ''} · {String(r.ownerKind).toLowerCase()}</div></td><td>{r.providerType}</td><td style={{ fontFamily: 'monospace' }}>{r.providerCode}</td>
              <td>{can ? <select className="dx-select" style={{ padding: '0.2rem 0.4rem', fontSize: '0.76rem' }} value={r.tier || ''} onChange={e => tier(r, e.target.value)}><option value="">—</option><option>GOLD</option><option>SILVER</option><option>BRONZE</option></select> : (r.tier || '—')}</td>
              <td>{r.claims30d}</td><td>{money(r.amount30d)}</td><td>{r.blocked30d}</td><td style={{ color: r.denied ? '#b91c1c' : undefined, fontWeight: r.denied ? 800 : 400 }}>{r.denied}</td><td>{risk(r.riskScore)}</td>
              <td><span className="dx-pill" style={r.networkStatus === 'ACTIVE' && r.status === 'VERIFIED' ? { background: '#dcfce7', color: '#166534' } : { background: '#fee2e2', color: '#991b1b' }}>{r.status !== 'VERIFIED' ? r.status.toLowerCase() : r.networkStatus.toLowerCase()}</span>
                {r.networkReason ? <div className="dx-card-hint">{r.networkReason}</div> : null}</td>
              {can && <td>{r.networkStatus === 'ACTIVE' ? <button type="button" className="dx-btn dx-btn--sm dx-btn--danger" onClick={() => suspend(r)}>Suspend</button> : <button type="button" className="dx-btn dx-btn--sm" onClick={() => reinstate(r)}>Reinstate</button>}</td>}
            </tr>))}</Paged> : <tr><td colSpan={11}><Empty>No providers yet. Invite the providers you already work with.</Empty></td></tr>}</tbody>
        </table></div></div>
      ) : (
        <div className="dx-card"><div className="dx-table-wrap"><table className="dx-table">
          <thead><tr><th>Provider</th><th>Type</th><th>Contact</th><th>Code</th><th>Status</th><th>Sent</th></tr></thead>
          <tbody>{(inv.data || []).length ? inv.data.map(i => <tr key={i.id}><td><b>{i.providerName}</b></td><td>{i.providerType}</td><td className="dx-card-hint">{[i.email, i.phone].filter(Boolean).join(' · ')}</td><td style={{ fontFamily: 'monospace' }}>{i.providerCode || '—'}</td>
            <td><span className="dx-pill" style={i.status === 'JOINED' ? { background: '#dcfce7', color: '#166534' } : { background: '#e0f2fe', color: '#075985' }}>{i.status.toLowerCase()}</span></td><td className="dx-card-hint">{day(i.createdAt)}</td></tr>)
            : <tr><td colSpan={6}><Empty>No invitations yet.</Empty></td></tr>}</tbody>
        </table></div></div>
      )}
      {invite && (
        <Modal title="Invite a provider" sub="They get an SMS to register on NessaHub and enter your provider code." onClose={() => setInvite(null)} width={620}
          footer={<><button type="button" className="dx-btn" onClick={() => setInvite(null)}>Cancel</button><button type="button" className="dx-btn dx-btn--primary" onClick={sendInvite}>Send invitation</button></>}>
          <div className="dx-two">
            <div className="dx-field"><label>Provider name</label><input className="dx-input" value={invite.providerName} onChange={e => setInvite({ ...invite, providerName: e.target.value })} /></div>
            <div className="dx-field"><label>Type</label><select className="dx-select" value={invite.providerType} onChange={e => setInvite({ ...invite, providerType: e.target.value })}>{['PHARMACY', 'LAB', 'SCAN', 'CLINIC', 'HOSPITAL', 'DENTAL', 'OPTICAL', 'PHYSIO', 'DOCTOR'].map(t => <option key={t}>{t}</option>)}</select></div>
            <div className="dx-field"><label>Phone</label><input className="dx-input" value={invite.phone} onChange={e => setInvite({ ...invite, phone: e.target.value })} /></div>
            <div className="dx-field"><label>Email</label><input className="dx-input" value={invite.email} onChange={e => setInvite({ ...invite, email: e.target.value })} /></div>
            <div className="dx-field"><label>Their provider code with you</label><input className="dx-input" value={invite.providerCode} onChange={e => setInvite({ ...invite, providerCode: e.target.value })} /></div>
          </div>
        </Modal>
      )}
    </Page>
  );
}

// ── Price lists: medicines & services ────────────────────────────────────────

const TIER = { PREFERRED: ['Preferred', '#dcfce7', '#166534'], COVERED: ['Covered', '#dbeafe', '#1e40af'], RESTRICTED: ['Restricted', '#fef3c7', '#92400e'], EXCLUDED: ['Excluded', '#fee2e2', '#991b1b'] };

export function InsPriceLists({ me }) {
  const [tab, setTab] = useState('drugs');
  const [q, setQ] = useState('');
  const drugs = useLoad(() => get(`${INS}/formulary`), []);
  const services = useLoad(() => get(`${INS}/tariffs`), []);
  const [edit, setEdit] = useState(null);
  const [svc, setSvc] = useState(null);
  const [csv, setCsv] = useState(null);
  const can = canDo(me, ['MEDICAL_REVIEWER', 'NETWORK_MANAGER']);
  const saveDrug = async () => { try { drugs.setData(await put(`${INS}/formulary`, { ...edit, tariffPrice: edit.tariffPrice === '' ? null : Number(edit.tariffPrice), maxQtyPerMonth: edit.maxQtyPerMonth === '' || edit.maxQtyPerMonth == null ? null : Number(edit.maxQtyPerMonth) })); setEdit(null); } catch (e) { alert(e?.message); } };
  const saveSvc = async () => { try { services.setData(await put(`${INS}/tariffs`, { ...svc, tariffPrice: Number(svc.tariffPrice) })); setSvc(null); } catch (e) { alert(e?.message); } };
  const importCsv = async () => { try { const r = await post(`${INS}/formulary/import`, { csv }); alert(`Added ${r.added}, updated ${r.updated}${r.errors.length ? `\n${r.errors.slice(0, 5).join('\n')}` : ''}`); setCsv(null); drugs.reload(); } catch (e) { alert(e?.message); } };
  const shown = (drugs.data || []).filter(d => !q || `${d.drugName} ${d.genericName || ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Page title="Price lists" sub="Your medicine list and service tariffs. Enforced at every counter: excluded items blocked, restricted ones need your approval, nothing paid above tariff."
      actions={can && (tab === 'drugs'
        ? <><button type="button" className="dx-btn" onClick={() => setCsv('drug_name,generic_name,strength,form,tariff_price,tier,requires_preauth,max_qty_per_month\n')}>⬆ Import CSV</button>
          <button type="button" className="dx-btn dx-btn--primary" onClick={() => setEdit({ drugName: '', genericName: '', strength: '', form: '', tariffPrice: '', tier: 'COVERED', requiresPreauth: false, maxQtyPerMonth: '', active: true })}>+ Medicine</button></>
        : <button type="button" className="dx-btn dx-btn--primary" onClick={() => setSvc({ serviceType: 'CONSULT', code: '', description: '', tariffPrice: '', requiresPreauth: false, active: true })}>+ Service</button>)}>
      <div className="dx-tabs">
        <button type="button" className={`dx-tab ${tab === 'drugs' ? 'on' : ''}`} onClick={() => setTab('drugs')}>Medicines<b>{(drugs.data || []).length}</b></button>
        <button type="button" className={`dx-tab ${tab === 'services' ? 'on' : ''}`} onClick={() => setTab('services')}>Services<b>{(services.data || []).length}</b></button>
        {tab === 'drugs' && <input className="dx-input" style={{ marginLeft: 'auto', minWidth: 240 }} placeholder="Search medicine or generic" value={q} onChange={e => setQ(e.target.value)} />}
      </div>
      {tab === 'drugs' ? (
        <div className="dx-card"><div className="dx-table-wrap"><table className="dx-table">
          <thead><tr><th>Medicine</th><th>Generic</th><th>Strength</th><th>Tariff / unit</th><th>Tier</th><th>Pre-approval</th><th>Max / month</th><th>Active</th></tr></thead>
          <tbody>{shown.length ? <Paged items={shown} table>{(shown) => shown.map(d => (
            <tr key={d.id} className={can ? 'dx-click' : ''} onClick={() => can && setEdit({ ...d, tariffPrice: d.tariffPrice ?? '', maxQtyPerMonth: d.maxQtyPerMonth ?? '' })}>
              <td><b>{d.drugName}</b><div className="dx-card-hint">{d.form || ''}</div></td><td>{d.genericName || <span className="dx-card-hint">unmapped</span>}</td><td>{d.strength || '—'}</td><td>{d.tariffPrice != null ? money(d.tariffPrice) : '—'}</td>
              <td><Pill map={TIER} k={d.tier} /></td><td>{d.requiresPreauth ? 'Yes' : '—'}</td><td>{d.maxQtyPerMonth != null ? Number(d.maxQtyPerMonth) : '—'}</td><td>{d.active ? '✓' : '—'}</td></tr>
          ))}</Paged> : <tr><td colSpan={8}><Empty>No medicines yet. Import your list as CSV.</Empty></td></tr>}</tbody>
        </table></div></div>
      ) : (
        <div className="dx-card"><div className="dx-table-wrap"><table className="dx-table">
          <thead><tr><th>Type</th><th>Code</th><th>Service</th><th>Tariff</th><th>Pre-approval</th><th>Active</th></tr></thead>
          <tbody>{(services.data || []).length ? services.data.map(s => (
            <tr key={s.id} className={can ? 'dx-click' : ''} onClick={() => can && setSvc({ ...s })}><td>{s.serviceType}</td><td style={{ fontFamily: 'monospace' }}>{s.code}</td><td><b>{s.description}</b></td><td>{money(s.tariffPrice)}</td><td>{s.requiresPreauth ? 'Yes' : '—'}</td><td>{s.active ? '✓' : '—'}</td></tr>
          )) : <tr><td colSpan={6}><Empty>No service tariffs yet (consultations, dental, optical, physio, admissions, lab, scans).</Empty></td></tr>}</tbody>
        </table></div></div>
      )}
      {edit && (
        <Modal title={edit.id ? 'Edit medicine' : 'Add medicine'} onClose={() => setEdit(null)} width={680}
          footer={<><button type="button" className="dx-btn" onClick={() => setEdit(null)}>Cancel</button><button type="button" className="dx-btn dx-btn--primary" onClick={saveDrug}>Save</button></>}>
          <div className="dx-two">
            <div className="dx-field"><label>Medicine (as sold)</label><input className="dx-input" value={edit.drugName} onChange={e => setEdit({ ...edit, drugName: e.target.value })} /></div>
            <div className="dx-field"><label>Generic (blank = auto from NessaHub formulary)</label><input className="dx-input" value={edit.genericName || ''} onChange={e => setEdit({ ...edit, genericName: e.target.value })} /></div>
            <div className="dx-field"><label>Strength</label><input className="dx-input" value={edit.strength || ''} onChange={e => setEdit({ ...edit, strength: e.target.value })} /></div>
            <div className="dx-field"><label>Form</label><input className="dx-input" value={edit.form || ''} onChange={e => setEdit({ ...edit, form: e.target.value })} /></div>
            <div className="dx-field"><label>Tariff per unit (GHS)</label><input className="dx-input" type="number" step="0.01" value={edit.tariffPrice} onChange={e => setEdit({ ...edit, tariffPrice: e.target.value })} /></div>
            <div className="dx-field"><label>Tier</label><select className="dx-select" value={edit.tier} onChange={e => setEdit({ ...edit, tier: e.target.value })}>{Object.keys(TIER).map(t => <option key={t}>{t}</option>)}</select></div>
            <div className="dx-field"><label>Max quantity per month</label><input className="dx-input" type="number" value={edit.maxQtyPerMonth} onChange={e => setEdit({ ...edit, maxQtyPerMonth: e.target.value })} /></div>
            <div className="dx-field"><label>&nbsp;</label><label style={{ display: 'flex', gap: 6, fontSize: '0.84rem' }}><input type="checkbox" checked={!!edit.requiresPreauth} onChange={e => setEdit({ ...edit, requiresPreauth: e.target.checked })} /> Needs pre-approval</label>
              <label style={{ display: 'flex', gap: 6, fontSize: '0.84rem' }}><input type="checkbox" checked={edit.active !== false} onChange={e => setEdit({ ...edit, active: e.target.checked })} /> Active</label></div>
          </div>
        </Modal>
      )}
      {svc && (
        <Modal title={svc.id ? 'Edit service tariff' : 'Add service tariff'} onClose={() => setSvc(null)} width={620}
          footer={<><button type="button" className="dx-btn" onClick={() => setSvc(null)}>Cancel</button><button type="button" className="dx-btn dx-btn--primary" onClick={saveSvc}>Save</button></>}>
          <div className="dx-two">
            <div className="dx-field"><label>Type</label><select className="dx-select" value={svc.serviceType} onChange={e => setSvc({ ...svc, serviceType: e.target.value })}>{['CONSULT', 'DENTAL', 'OPTICAL', 'PHYSIO', 'HOSPITAL', 'LAB', 'SCAN'].map(t => <option key={t}>{t}</option>)}</select></div>
            <div className="dx-field"><label>Code</label><input className="dx-input" value={svc.code} onChange={e => setSvc({ ...svc, code: e.target.value })} placeholder="Must match the provider's service code" /></div>
            <div className="dx-field"><label>Description</label><input className="dx-input" value={svc.description} onChange={e => setSvc({ ...svc, description: e.target.value })} /></div>
            <div className="dx-field"><label>Tariff (GHS)</label><input className="dx-input" type="number" step="0.01" value={svc.tariffPrice} onChange={e => setSvc({ ...svc, tariffPrice: e.target.value })} /></div>
            <label style={{ display: 'flex', gap: 6, fontSize: '0.84rem' }}><input type="checkbox" checked={!!svc.requiresPreauth} onChange={e => setSvc({ ...svc, requiresPreauth: e.target.checked })} /> Needs pre-approval</label>
            <label style={{ display: 'flex', gap: 6, fontSize: '0.84rem' }}><input type="checkbox" checked={svc.active !== false} onChange={e => setSvc({ ...svc, active: e.target.checked })} /> Active</label>
          </div>
        </Modal>
      )}
      {csv !== null && (
        <Modal title="Import medicines (CSV)" sub="Paste rows or choose a file. Same name + strength updates the existing row." onClose={() => setCsv(null)} width={760}
          footer={<><button type="button" className="dx-btn" onClick={() => setCsv(null)}>Cancel</button><button type="button" className="dx-btn dx-btn--primary" onClick={importCsv}>Import</button></>}>
          <input type="file" accept=".csv,text/csv" onChange={async e => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} />
          <textarea rows={12} value={csv} onChange={e => setCsv(e.target.value)} style={{ fontFamily: 'monospace', width: '100%', boxSizing: 'border-box' }} />
          <p className="dx-card-hint" style={{ margin: 0 }}>tier: PREFERRED / COVERED / RESTRICTED / EXCLUDED · requires_preauth: yes/no</p>
        </Modal>
      )}
    </Page>
  );
}

// ── Care management ──────────────────────────────────────────────────────────

const CARE = { LAPSED: ['Lapsed', '#fee2e2', '#991b1b'], DUE: ['Refill due', '#fef3c7', '#92400e'], ON_TRACK: ['On track', '#dcfce7', '#166534'] };

export function InsCare({ me }) {
  const [filter, setFilter] = useState('LAPSED');
  const { data } = useLoad(() => get(`${INS}/care/chronic`), []);
  const [sent, setSent] = useState({});
  const can = canDo(me, ['CARE_MANAGER', 'MEDICAL_REVIEWER']);
  const remind = async (r) => {
    try { const res = await post(`${INS}/care/remind`, { patientId: r.patientId, medicine: r.medicine }); setSent(s => ({ ...s, [`${r.patientId}${r.medicine}`]: res.sms ? 'SMS + app' : 'App' })); } catch (e) { alert(e?.message); }
  };
  const rows = (data || []).filter(r => !filter || r.status === filter);
  const count = (s) => (data || []).filter(r => r.status === s).length;
  return (
    <Page title="Care management" sub="Members on long-term medicines (blood pressure, diabetes, mental health…) and whether they refill on time. A lapsed refill today is a hospital admission tomorrow.">
      <div className="dx-today">
        <Kpi label="Lapsed" value={count('LAPSED')} color="#dc2626" sub="Over 15 days late" onClick={() => setFilter('LAPSED')} />
        <Kpi label="Refill due" value={count('DUE')} color="#f59e0b" onClick={() => setFilter('DUE')} />
        <Kpi label="On track" value={count('ON_TRACK')} color="#16a34a" onClick={() => setFilter('ON_TRACK')} />
        <Kpi label="Chronic members" value={new Set((data || []).map(r => r.patientId)).size} color="#1d4ed8" onClick={() => setFilter('')} />
      </div>
      <div className="dx-card"><div className="dx-table-wrap"><table className="dx-table">
        <thead><tr><th>Member</th><th>Medicine</th><th>Class</th><th>Last fill</th><th>Days since</th><th>Fills</th><th>Status</th>{can && <th />}</tr></thead>
        <tbody>{rows.length ? <Paged items={rows} table>{(rows) => rows.map(r => {
          const key = `${r.patientId}${r.medicine}`;
          return (
            <tr key={key}><td><b>{r.name}</b></td><td>{r.medicine}</td><td className="dx-card-hint">{r.drugClass}</td><td className="dx-card-hint">{day(r.lastFill)}</td><td>{r.daysSinceFill} <span className="dx-card-hint">/ {r.expectedSupplyDays}</span></td><td>{r.fills}</td><td><Pill map={CARE} k={r.status} /></td>
              {can && <td>{sent[key] ? <span className="dx-card-hint">✓ Reminded ({sent[key]})</span> : r.status !== 'ON_TRACK' && <button type="button" className="dx-btn dx-btn--sm" onClick={() => remind(r)}>Send reminder</button>}</td>}</tr>
          );
        })}</Paged> : <tr><td colSpan={8}><Empty>No members in this group.</Empty></td></tr>}</tbody>
      </table></div></div>
      <p className="dx-card-hint">NessaHub also sends automatic refill reminders a few days before a chronic medicine runs out.</p>
    </Page>
  );
}

export { SEVERITY };
