import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/apiClient';
import Paged from './Paged';

/**
 * Settings → Insurance for any provider (pharmacy, branch, lab, scan centre,
 * clinician). Enter the provider code the insurer gave you; NessaHub checks it
 * with the insurer's own system. No one at NessaHub approves it — the insurer's
 * records decide. A branch also bills under its parent's verified code.
 */
const STATUS = {
  VERIFIED: { label: 'Verified', bg: '#dcfce7', fg: '#166534' },
  PENDING:  { label: 'Insurer unreachable — try again', bg: '#fef3c7', fg: '#92400e' },
  REJECTED: { label: 'Not recognised', bg: '#fee2e2', fg: '#991b1b' },
};
const input = { padding: '0.5rem 0.65rem', borderRadius: 10, border: '1.5px solid #cbd5e1', fontSize: '0.86rem' };

export default function InsuranceNetworks({ accent = '#0f766e' }) {
  const [data, setData] = useState(null);
  const [insurers, setInsurers] = useState([]);
  const [form, setForm] = useState({ insurerId: '', providerCode: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: '', err: '' });

  const load = useCallback(async () => {
    try {
      const [d, i] = await Promise.all([api('/api/v1/insurance/provider/codes'), api('/api/v1/insurance/insurers')]);
      setData(d); setInsurers(Array.isArray(i) ? i : []);
    } catch (e) { setMsg({ ok: '', err: e?.message || 'Could not load insurance networks.' }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg({ ok: '', err: '' });
    try {
      const codes = await api('/api/v1/insurance/provider/codes', { method: 'POST', body: form });
      setData(d => ({ ...d, codes }));
      const row = codes.find(c => c.insurerId === form.insurerId);
      if (row?.status === 'VERIFIED') { setMsg({ ok: `✓ ${row.insurerName} confirmed your provider code. You can now bill them.`, err: '' }); setForm({ insurerId: '', providerCode: '' }); }
      else setMsg({ ok: '', err: row?.statusReason || 'The insurer did not recognise this code.' });
    } catch (e2) { setMsg({ ok: '', err: e2?.message || 'Could not save.' }); }
    finally { setBusy(false); }
  };
  const remove = async (id) => {
    if (!window.confirm('Remove this insurer? You will no longer be able to bill them.')) return;
    try { const codes = await api(`/api/v1/insurance/provider/codes/${id}`, { method: 'DELETE' }); setData(d => ({ ...d, codes })); } catch (e) { setMsg({ ok: '', err: e?.message }); }
  };

  const codes = data?.codes || [];
  const inherited = (data?.inherited || []).filter(i => i.status === 'VERIFIED' && !codes.some(c => c.insurerId === i.insurerId));
  return (
    <section>
      <h2 className="pharmacy-settings-heading">Insurance networks</h2>
      <p className="pharmacy-settings-lead">Enter the provider code each insurer gave you. NessaHub checks it with the insurer, then you can bill that insurer for its members — with coverage checked before anything is handed over.</p>
      {msg.ok && <div className="pharmacy-settings-alert pharmacy-settings-alert--ok">{msg.ok}</div>}
      {msg.err && <div className="pharmacy-settings-alert pharmacy-settings-alert--err">{msg.err}</div>}

      {insurers.length === 0 ? (
        <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 12, padding: '0.85rem 1rem', margin: '0.75rem 0', fontSize: '0.84rem', color: '#475569', lineHeight: 1.55 }}>
          <strong style={{ color: '#0f172a' }}>No insurance company has joined NessaHub yet.</strong><br />
          As soon as one joins, it appears in the list below. Choose it, type the provider code that insurer gave you, and
          press <em>Add &amp; verify</em>. Until then you can still serve patients who pay themselves.
        </div>
      ) : null}
      <form onSubmit={save} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', margin: '0.75rem 0 1rem', opacity: insurers.length ? 1 : 0.55 }}>
        <label style={{ display: 'grid', gap: 4, fontSize: '0.78rem', fontWeight: 700 }}>Insurer
          <select style={input} required disabled={!insurers.length} value={form.insurerId} onChange={e => setForm({ ...form, insurerId: e.target.value })}>
            <option value="">{insurers.length ? 'Choose…' : 'No insurers yet'}</option>{insurers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: '0.78rem', fontWeight: 700 }}>Your provider code
          <input style={input} required disabled={!insurers.length} value={form.providerCode} onChange={e => setForm({ ...form, providerCode: e.target.value })} placeholder="e.g. PH-0042" />
        </label>
        <button type="submit" disabled={busy || !insurers.length} style={{ border: 'none', background: accent, color: '#fff', borderRadius: 10, padding: '0.55rem 1rem', fontWeight: 700, cursor: insurers.length ? 'pointer' : 'not-allowed', opacity: busy ? 0.6 : 1 }}>{busy ? 'Checking…' : 'Add & verify'}</button>
      </form>

      <dl className="pharmacy-settings-kv">
        <Paged items={codes}>{(codes) => codes.map(c => {
          const st = STATUS[c.status] || STATUS.PENDING;
          return (
            <div key={c.id}>
              <dt>{c.insurerName}</dt>
              <dd style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <code className="pharmacy-settings-code">{c.providerCode}</code>
                <span style={{ background: st.bg, color: st.fg, borderRadius: 999, padding: '0.12rem 0.55rem', fontSize: '0.72rem', fontWeight: 800 }}>{st.label}</span>
                {c.status !== 'VERIFIED' && c.statusReason ? <small style={{ color: '#64748b' }}>{c.statusReason}</small> : null}
                <button type="button" className="pharmacy-settings-mini" onClick={() => remove(c.id)}>Remove</button>
              </dd>
            </div>
          );
        })}</Paged>
        <Paged items={inherited}>{(inherited) => inherited.map(c => (
          <div key={`inh-${c.id}`}>
            <dt>{c.insurerName}</dt>
            <dd><code className="pharmacy-settings-code">{c.providerCode}</code> <span style={{ fontSize: '0.75rem', color: '#64748b' }}>via your head office</span></dd>
          </div>
        ))}</Paged>
        {codes.length === 0 && inherited.length === 0 && insurers.length > 0 && <p className="pharmacy-settings-muted">No insurers yet.</p>}
      </dl>
    </section>
  );
}
