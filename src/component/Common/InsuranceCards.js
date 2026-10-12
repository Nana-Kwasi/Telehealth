import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/apiClient';
import Paged from './Paged';

/**
 * "My insurance" for patients and clients: add a card, and NessaHub checks it
 * with the insurer's own system straight away. Only verified cards can pay.
 */
const STATUS = {
  VERIFIED:  { label: 'Verified', bg: '#dcfce7', fg: '#166534' },
  PENDING:   { label: 'Checking…', bg: '#e0f2fe', fg: '#075985' },
  NOT_FOUND: { label: 'Not found', bg: '#fee2e2', fg: '#991b1b' },
  EXPIRED:   { label: 'Expired', bg: '#fef3c7', fg: '#92400e' },
  SUSPENDED: { label: 'Suspended', bg: '#fef3c7', fg: '#92400e' },
  ERROR:     { label: 'Needs attention', bg: '#fee2e2', fg: '#991b1b' },
};
const input = { width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.7rem', borderRadius: 10, border: '1.5px solid #cbd5e1', fontSize: '0.88rem' };

export default function InsuranceCards({ accent = '#2563eb', compact = false }) {
  const [cards, setCards] = useState([]);
  const [insurers, setInsurers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ insurerId: '', memberNo: '', memberName: '', dateOfBirth: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: '', err: '' });
  const [approvals, setApprovals] = useState([]);
  const [consent, setConsent] = useState({ text: '', version: '' });
  const [agreed, setAgreed] = useState(false);
  const [open, setOpen] = useState(null);           // { cardId, tab: 'balance'|'pharmacies' }
  const [balance, setBalance] = useState({});       // cardId -> benefits response
  const [places, setPlaces] = useState({ list: [], city: '', loading: false });
  const [claims, setClaims] = useState([]);

  const load = useCallback(async () => {
    try {
      const [c, i] = await Promise.all([api('/api/v1/insurance/me/cards'), api('/api/v1/insurance/insurers')]);
      setCards(Array.isArray(c) ? c : []); setInsurers(Array.isArray(i) ? i : []);
      api('/api/v1/insurance/me/preauth').then(p => setApprovals(Array.isArray(p) ? p : [])).catch(() => {});
      api('/api/v1/insurance/me/claims').then(p => setClaims(Array.isArray(p) ? p : [])).catch(() => {});
      api('/api/v1/insurance/consent-text').then(t => setConsent(t || {})).catch(() => {});
    } catch { /* shown as empty */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg({ ok: '', err: '' });
    try {
      if (!agreed) throw new Error('Please agree to share claim details with your insurer.');
      const card = await api('/api/v1/insurance/me/cards', { method: 'POST', body: { ...form, consent: true } });
      await load();
      if (card.status === 'VERIFIED') { setMsg({ ok: `✓ ${card.insurerName} confirmed your cover (${card.planName || 'plan'}).`, err: '' }); setAdding(false); setAgreed(false); setForm({ insurerId: '', memberNo: '', memberName: '', dateOfBirth: '' }); }
      else setMsg({ ok: '', err: card.statusReason || `${card.insurerName} could not confirm this card.` });
    } catch (e2) { setMsg({ ok: '', err: e2?.message || 'Could not add the card.' }); }
    finally { setBusy(false); }
  };
  const showBalance = async (cardId) => {
    setOpen(o => (o && o.cardId === cardId && o.tab === 'balance') ? null : { cardId, tab: 'balance' });
    if (balance[cardId]) return;
    try { const b = await api(`/api/v1/insurance/me/cards/${cardId}/benefits`); setBalance(m => ({ ...m, [cardId]: b })); }
    catch (e) { setBalance(m => ({ ...m, [cardId]: { available: false, note: e?.message || 'Balance unavailable' } })); }
  };
  const findPlaces = async (cardId, city = places.city) => {
    setOpen({ cardId, tab: 'pharmacies' });
    setPlaces(p => ({ ...p, loading: true }));
    try {
      const q = new URLSearchParams({ type: 'PHARMACY', ...(city ? { city } : {}) }).toString();
      const list = await api(`/api/v1/insurance/me/cards/${cardId}/providers?${q}`);
      setPlaces({ list: Array.isArray(list) ? list : [], city, loading: false });
    } catch { setPlaces({ list: [], city, loading: false }); }
  };
  const printReceipt = (c) => {
    const w = window.open('', '_blank', 'width=420,height=600');
    if (!w) return;
    const esc = (v) => String(v ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    w.document.write(`<html><head><title>Receipt ${esc(c.claimRef)}</title><style>body{font-family:system-ui,sans-serif;padding:24px;color:#0f172a}td{padding:6px 0}td:last-child{text-align:right;font-weight:700}hr{border:none;border-top:1px dashed #94a3b8}</style></head><body>
      <h2 style="margin:0">NessaHub</h2><div style="color:#64748b;font-size:13px">Insurance receipt</div><hr/>
      <table style="width:100%;font-size:14px"><tr><td>Reference</td><td>${esc(c.claimRef)}</td></tr><tr><td>Date</td><td>${esc(new Date(c.createdAt).toLocaleString())}</td></tr>
      <tr><td>Provider</td><td>${esc(c.providerName)}</td></tr><tr><td>Insurer</td><td>${esc(c.insurerName)}</td></tr><tr><td>Service</td><td>${esc(c.serviceType)}</td></tr></table><hr/>
      <table style="width:100%;font-size:14px"><tr><td>Total</td><td>GHS ${esc(Number(c.totalAmount || 0).toFixed(2))}</td></tr><tr><td>Insurer pays</td><td>GHS ${esc(Number(c.insurerAmount || 0).toFixed(2))}</td></tr>
      <tr><td>You paid</td><td>GHS ${esc(Number(c.patientAmount || 0).toFixed(2))}</td></tr><tr><td>Claim status</td><td>${esc(c.status)}</td></tr></table><hr/>
      <div style="font-size:12px;color:#64748b">Keep this for your records. Questions about cover go to your insurer.</div><script>window.print()</script></body></html>`);
    w.document.close();
  };

  const act = async (path, method = 'POST', body) => {
    setBusy(true);
    try { const list = await api(path, { method, ...(body ? { body } : {}) }); if (Array.isArray(list)) setCards(list); else await load(); }
    catch (e) { setMsg({ ok: '', err: e?.message || 'Something went wrong.' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="mp-card" style={{ marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>🛡️ My insurance cards</h3>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: '#64748b' }}>Checked live with your insurer. Use a verified card to pay at NessaHub pharmacies{compact ? '' : ' — you only pay your co-pay'}.</p>
        </div>
        {!adding && insurers.length > 0 && <button type="button" onClick={() => setAdding(true)} style={{ border: 'none', background: accent, color: '#fff', borderRadius: 10, padding: '0.5rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}>+ Add card</button>}
      </div>

      {msg.ok && <div style={{ marginTop: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 10, padding: '0.6rem 0.8rem', fontSize: '0.85rem' }}>{msg.ok}</div>}
      {msg.err && <div style={{ marginTop: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: '0.6rem 0.8rem', fontSize: '0.85rem' }}>{msg.err}</div>}

      {adding && (
        <form onSubmit={add} style={{ marginTop: 14, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>Insurer
            <select style={{ ...input, marginTop: 4 }} required value={form.insurerId} onChange={e => setForm({ ...form, insurerId: e.target.value })}>
              <option value="">Choose…</option>{insurers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
          <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>Card / member number
            <input style={{ ...input, marginTop: 4 }} required value={form.memberNo} onChange={e => setForm({ ...form, memberNo: e.target.value })} placeholder="As printed on your card" />
          </label>
          <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>Name on card (if different)
            <input style={{ ...input, marginTop: 4 }} value={form.memberName} onChange={e => setForm({ ...form, memberName: e.target.value })} />
          </label>
          <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>Date of birth
            <input style={{ ...input, marginTop: 4 }} type="date" value={form.dateOfBirth} onChange={e => setForm({ ...form, dateOfBirth: e.target.value })} />
          </label>
          <label style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, alignItems: 'flex-start', background: '#fff', border: `1.5px solid ${agreed ? accent : '#e2e8f0'}`, borderRadius: 10, padding: '0.7rem 0.8rem', fontSize: '0.8rem', color: '#334155', lineHeight: 1.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: 3, accentColor: accent }} />
            <span><b>I agree to share my claim details with my insurer.</b> {consent.text || 'When you use this card, NessaHub sends the insurer what they need to pay the claim: the service, medicines and amounts, the provider and the diagnosis code. You can withdraw this at any time; the card then cannot be used to pay.'}</span>
          </label>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setAdding(false)} style={{ border: '1.5px solid #cbd5e1', background: '#fff', borderRadius: 10, padding: '0.5rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={busy || !agreed} style={{ border: 'none', background: accent, color: '#fff', borderRadius: 10, padding: '0.5rem 0.9rem', fontWeight: 700, cursor: 'pointer', opacity: busy || !agreed ? 0.6 : 1 }}>{busy ? 'Checking with insurer…' : 'Add & verify'}</button>
          </div>
        </form>
      )}

      <div style={{ marginTop: 14, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {loading ? <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Loading…</p> : cards.length === 0 ? (
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>{insurers.length ? 'No cards yet.' : 'No insurers are connected to NessaHub yet.'}</p>
        ) : <Paged items={cards}>{(cards) => cards.map(c => {
          const st = STATUS[c.status] || STATUS.PENDING;
          return (
            <div key={c.id} style={{ borderRadius: 16, padding: '1rem', color: '#fff', background: c.status === 'VERIFIED' ? `linear-gradient(135deg, ${accent}, #0f172a)` : 'linear-gradient(135deg, #64748b, #334155)', position: 'relative', minHeight: 130 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <b style={{ fontSize: '0.95rem' }}>{c.insurerName}</b>
                <span style={{ background: st.bg, color: st.fg, borderRadius: 999, padding: '0.12rem 0.55rem', fontSize: '0.68rem', fontWeight: 800 }}>{st.label}</span>
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '1.05rem', letterSpacing: '0.08em', margin: '0.9rem 0 0.4rem' }}>{c.memberNo}</div>
              <div style={{ fontSize: '0.78rem', opacity: 0.9 }}>{c.memberName}{c.planName ? ` · ${c.planName}` : ''}{c.validUntil ? ` · until ${c.validUntil}` : ''}</div>
              {c.consentGiven === false && <div style={{ fontSize: '0.74rem', marginTop: 6, background: 'rgba(220,38,38,0.85)', borderRadius: 8, padding: '0.3rem 0.5rem' }}>Sharing withdrawn — this card cannot pay until you agree again.</div>}
              {c.status !== 'VERIFIED' && c.statusReason && <div style={{ fontSize: '0.74rem', marginTop: 6, background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '0.3rem 0.5rem' }}>{c.statusReason}</div>}
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                {c.isDefault ? <span style={{ fontSize: '0.7rem', fontWeight: 800, background: 'rgba(255,255,255,0.2)', borderRadius: 999, padding: '0.15rem 0.5rem' }}>Default</span>
                  : <button type="button" disabled={busy} onClick={() => act(`/api/v1/insurance/me/cards/${c.id}/default`)} style={chip}>Make default</button>}
                <button type="button" disabled={busy} onClick={() => act(`/api/v1/insurance/me/cards/${c.id}/recheck`)} style={chip}>Check again</button>
                {c.status === 'VERIFIED' && <button type="button" onClick={() => showBalance(c.id)} style={chip}>Balance</button>}
                {c.status === 'VERIFIED' && <button type="button" onClick={() => findPlaces(c.id)} style={chip}>Where to use</button>}
                {c.consentGiven === false
                  ? <button type="button" disabled={busy} onClick={() => act(`/api/v1/insurance/me/cards/${c.id}/consent`, 'POST', { give: true })} style={{ ...chip, background: '#fff', color: '#0f172a' }}>Agree to share</button>
                  : <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Stop sharing claim details with ${c.insurerName}? This card will not be able to pay until you agree again.`)) act(`/api/v1/insurance/me/cards/${c.id}/consent`, 'POST', { give: false }); }} style={chip}>Withdraw sharing</button>}
                <button type="button" disabled={busy} onClick={() => { if (window.confirm('Remove this card?')) act(`/api/v1/insurance/me/cards/${c.id}`, 'DELETE'); }} style={chip}>Remove</button>
              </div>
            </div>
          );
        })}</Paged>}
      </div>

      {open && (() => {
        const c = cards.find(x => x.id === open.cardId);
        if (!c) return null;
        if (open.tab === 'balance') {
          const b = balance[c.id];
          return (
            <div style={panel}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0, fontSize: '0.92rem' }}>Benefit balance · {c.insurerName}{c.planName ? ` ${c.planName}` : ''}</h4>
                <button type="button" onClick={() => setOpen(null)} style={closeBtn}>✕</button>
              </div>
              {!b ? <p style={muted}>Asking {c.insurerName}…</p> : !b.available ? <p style={muted}>{b.note}</p> : (
                <>
                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', marginTop: 10 }}>
                    {(b.benefits || []).map(x => {
                      const lim = Number(x.limit || 0), rem = Number(x.remaining || 0);
                      const pct = lim > 0 ? Math.max(0, Math.min(100, (rem / lim) * 100)) : 0;
                      return (
                        <div key={x.category} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.7rem 0.8rem', background: '#fff' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>{x.label}</div>
                          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: pct < 20 ? '#b91c1c' : accent, margin: '0.25rem 0' }}>GHS {rem.toLocaleString(undefined, { maximumFractionDigits: 2 })}<span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}> left of {lim.toLocaleString()}</span></div>
                          <div style={{ height: 6, background: '#f1f5f9', borderRadius: 99 }}><div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: pct < 20 ? '#ef4444' : accent }} /></div>
                          {x.copay && <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 6 }}>Co-pay: {x.copay}</div>}
                        </div>
                      );
                    })}
                  </div>
                  <p style={{ ...muted, marginTop: 10 }}>From {b.insurerName}'s own records{b.note ? ` — ${b.note}` : ''}. Your insurer has the final word on cover.</p>
                </>
              )}
            </div>
          );
        }
        return (
          <div style={panel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h4 style={{ margin: 0, fontSize: '0.92rem' }}>Pharmacies that accept {c.insurerName}</h4>
              <div style={{ display: 'flex', gap: 6 }}>
                <input style={{ ...input, width: 170 }} placeholder="Town or city" value={places.city} onChange={e => setPlaces(p => ({ ...p, city: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') findPlaces(c.id, places.city); }} />
                <button type="button" onClick={() => findPlaces(c.id, places.city)} style={{ border: 'none', background: accent, color: '#fff', borderRadius: 10, padding: '0 0.8rem', fontWeight: 700, cursor: 'pointer' }}>Search</button>
                <button type="button" onClick={() => setOpen(null)} style={closeBtn}>✕</button>
              </div>
            </div>
            {places.loading ? <p style={muted}>Searching…</p> : places.list.length === 0 ? <p style={muted}>No pharmacies found{places.city ? ` in ${places.city}` : ''}. Try another town.</p> : (
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', marginTop: 10 }}>
                {places.list.map((p, i) => (
                  <div key={p.ownerId || i} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.65rem 0.8rem', background: '#fff', fontSize: '0.82rem' }}>
                    <b style={{ color: '#0f172a' }}>{p.name}</b>
                    <div style={{ color: '#64748b' }}>{[p.address, p.city].filter(Boolean).join(', ') || '—'}</div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                      {p.phone && <a href={`tel:${p.phone}`} style={{ color: accent, fontWeight: 700, textDecoration: 'none' }}>📞 Call</a>}
                      {p.latitude && p.longitude && <a href={`https://maps.google.com/?q=${p.latitude},${p.longitude}`} target="_blank" rel="noreferrer" style={{ color: accent, fontWeight: 700, textDecoration: 'none' }}>📍 Directions</a>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {claims.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#0f172a' }}>Receipts & claims</h4>
          {claims.slice(0, 20).map(c => {
            const tone = { APPROVED: ['#dcfce7', '#166534'], PAID: ['#dcfce7', '#166534'], REJECTED: ['#fee2e2', '#991b1b'], SUBMITTED: ['#e0f2fe', '#075985'] }[c.status] || ['#f1f5f9', '#475569'];
            return (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '0.55rem 0', borderTop: '1px solid #f1f5f9', fontSize: '0.84rem', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <b>{c.providerName || c.serviceType}</b>
                  <div style={{ color: '#64748b', fontSize: '0.78rem' }}>{c.claimRef} · {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ''} · insurer GHS {Number(c.insurerAmount || 0).toFixed(2)} · you GHS {Number(c.patientAmount || 0).toFixed(2)}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ background: tone[0], color: tone[1], borderRadius: 999, padding: '0.15rem 0.6rem', fontSize: '0.72rem', fontWeight: 800 }}>{c.status}</span>
                  <button type="button" onClick={() => printReceipt(c)} style={{ border: '1.5px solid #cbd5e1', background: '#fff', borderRadius: 8, padding: '0.2rem 0.6rem', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}>Receipt</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {approvals.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#0f172a' }}>Approvals from your insurer</h4>
          <Paged items={approvals}>{(approvals) => approvals.map(a => {
            const tone = { APPROVED: ['#dcfce7', '#166534', 'Approved'], PARTIAL: ['#d9f99d', '#365314', 'Partly approved'], REJECTED: ['#fee2e2', '#991b1b', 'Not approved'],
              PENDING: ['#fef3c7', '#92400e', 'Waiting for insurer'], QUERIED: ['#ffedd5', '#9a3412', 'Insurer asked a question'], USED: ['#e0e7ff', '#3730a3', 'Used'],
              CANCELLED: ['#f1f5f9', '#475569', 'Cancelled'], EXPIRED: ['#f1f5f9', '#475569', 'Expired'] }[a.status] || ['#f1f5f9', '#475569', a.status];
            let what = ''; try { what = JSON.parse(a.itemsJson || '[]').map(i => i.description).join(', '); } catch { what = ''; }
            return (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '0.55rem 0', borderTop: '1px solid #f1f5f9', fontSize: '0.84rem' }}>
                <div><b>{what || a.serviceType}</b><div style={{ color: '#64748b', fontSize: '0.78rem' }}>{a.providerName} · {a.insurerName}{a.decisionReason ? ` — ${a.decisionReason}` : ''}</div></div>
                <span style={{ background: tone[0], color: tone[1], borderRadius: 999, padding: '0.15rem 0.6rem', fontSize: '0.72rem', fontWeight: 800, alignSelf: 'center', whiteSpace: 'nowrap' }}>{tone[2]}</span>
              </div>
            );
          })}</Paged>
        </div>
      )}
    </div>
  );
}

const chip = { border: '1px solid rgba(255,255,255,0.5)', background: 'transparent', color: '#fff', borderRadius: 999, padding: '0.15rem 0.6rem', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' };
const panel = { marginTop: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: '0.9rem 1rem' };
const muted = { color: '#64748b', fontSize: '0.8rem', margin: '0.5rem 0 0' };
const closeBtn = { border: '1px solid #cbd5e1', background: '#fff', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontWeight: 700 };
