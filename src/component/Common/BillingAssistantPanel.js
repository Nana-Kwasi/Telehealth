import React, { useState, useEffect, useCallback } from 'react';
import { Receipt, ShieldCheck, FileCheck2, Printer } from 'lucide-react';
import { api } from '../../services/apiClient';

/**
 * Invoices, insurance and claims, for the patient.
 *
 * Every status line is the server's fixed explanation of that status, not
 * generated text: someone reading "your claim was rejected" must be reading
 * exactly what the status means. Missing details and expired cover are shown
 * as a list of what to fix, never as a vague failure.
 */
const STATUS_TONE = {
  verified: '#12602f', paid: '#12602f', approved: '#12602f',
  pending_verification: '#8a4b09', submitted: '#8a4b09', draft: '#3d4257',
  incomplete: '#8f1d17', rejected: '#8f1d17', expired: '#8f1d17', none: '#3d4257',
};

export default function BillingAssistantPanel() {
  const [invoices, setInvoices] = useState([]);
  const [insurance, setInsurance] = useState(null);
  const [claims, setClaims] = useState([]);
  const [form, setForm] = useState(null);
  const [note, setNote] = useState('');
  const [claimNote, setClaimNote] = useState(null);

  const load = useCallback(async () => {
    const [i, ins, c] = await Promise.all([
      api('/api/v1/billing/assist/invoices').catch(() => []),
      api('/api/v1/billing/assist/insurance').catch(() => null),
      api('/api/v1/billing/assist/claims').catch(() => []),
    ]);
    setInvoices(Array.isArray(i) ? i : []);
    setInsurance(ins);
    setClaims(Array.isArray(c) ? c : []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const submitInsurance = async () => {
    setNote('');
    try {
      const res = await api('/api/v1/billing/assist/insurance', { method: 'POST', body: form });
      setNote([res.explanation, ...(res.missing || []).map((m) => `Missing: ${m}`), ...(res.warnings || [])].join(' '));
      if (res.status !== 'incomplete') setForm(null);
      load();
    } catch (e) { setNote(e?.message || 'That could not be submitted.'); }
  };

  const prepareClaim = async (billingRecordId) => {
    try {
      const res = await api('/api/v1/billing/assist/claims', { method: 'POST', body: { billingRecordId } });
      setClaimNote({ id: billingRecordId, text: res.explanation, missing: res.missing || [] });
      load();
    } catch (e) { setClaimNote({ id: billingRecordId, text: e?.message || 'The claim could not be prepared.', missing: [] }); }
  };

  const status = insurance?.status || 'none';

  return (
    <div style={S.wrap}>
      {/* ── Insurance ── */}
      <section style={S.card} aria-label="Insurance">
        <header style={S.head}>
          <span style={S.icon}><ShieldCheck size={17} /></span>
          <div style={{ flex: 1 }}>
            <h2 style={S.title}>Insurance</h2>
            <p style={{ ...S.status, color: STATUS_TONE[status] }}>
              {insurance?.provider ? `${insurance.provider} · ` : ''}{label(status)}
            </p>
            <p style={S.sub}>{insurance?.explanation}</p>
            {insurance?.decision_note ? <p style={S.sub}>Reason: {insurance.decision_note}</p> : null}
          </div>
          {!form ? (
            <button type="button" style={S.ghost} onClick={() => setForm({
              provider: insurance?.provider || '', policyNumber: insurance?.policy_number || '',
              planName: insurance?.plan_name || '', memberName: insurance?.member_name || '',
              validTo: insurance?.valid_to || '',
            })}>{status === 'none' ? 'Add insurance' : 'Update'}</button>
          ) : null}
        </header>
        {form ? (
          <div style={S.form}>
            {[['provider', 'Insurer (e.g. NHIS)'], ['policyNumber', 'Policy / membership number'],
              ['memberName', 'Member name on the card'], ['planName', 'Plan (optional)']].map(([k, ph]) => (
              <input key={k} style={S.input} placeholder={ph} value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            ))}
            <label style={S.small}>Valid until
              <input type="date" style={S.input} value={form.validTo || ''}
                onChange={(e) => setForm({ ...form, validTo: e.target.value })} />
            </label>
            <div style={S.row}>
              <button type="button" style={S.primary} onClick={submitInsurance}>Submit for verification</button>
              <button type="button" style={S.ghost} onClick={() => setForm(null)}>Cancel</button>
            </div>
          </div>
        ) : null}
        {note ? <p style={S.sub}>{note}</p> : null}
      </section>

      {/* ── Invoices ── */}
      <section style={S.card} aria-label="Invoices">
        <header style={S.head}>
          <span style={S.icon}><Receipt size={17} /></span>
          <div><h2 style={S.title}>Invoices</h2>
            <p style={S.sub}>One for every payment. Insured? Prepare a claim from an invoice.</p></div>
        </header>
        {invoices.length === 0 ? <p style={S.sub}>No invoices yet.</p> : invoices.map((inv) => (
          <div key={inv.id} style={S.line}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.strong}>{inv.invoice_number} · {money(inv.amount_cents, inv.currency)}</div>
              <div style={S.sub}>{clean(inv.description)} · {day(inv.created_at)} · {inv.status}</div>
              {claimNote?.id === inv.id ? (
                <div style={S.sub}>{claimNote.text}{claimNote.missing.map((m) => <div key={m}>• {m}</div>)}</div>
              ) : null}
            </div>
            <button type="button" style={S.ghost} onClick={() => printInvoice(inv)} title="Print or save as PDF">
              <Printer size={14} />
            </button>
            {!inv.claim_status ? (
              <button type="button" style={S.ghost} onClick={() => prepareClaim(inv.id)}>Claim</button>
            ) : <span style={{ ...S.badge, color: STATUS_TONE[inv.claim_status] }}>Claim {inv.claim_status}</span>}
          </div>
        ))}
      </section>

      {/* ── Claims ── */}
      {claims.length ? (
        <section style={S.card} aria-label="Claims">
          <header style={S.head}>
            <span style={S.icon}><FileCheck2 size={17} /></span>
            <div><h2 style={S.title}>Insurance claims</h2></div>
          </header>
          {claims.map((c) => (
            <div key={c.id} style={S.line}>
              <div style={{ flex: 1 }}>
                <div style={{ ...S.strong, color: STATUS_TONE[c.status] }}>
                  {c.invoice_number} · {label(c.status)}{c.provider ? ` · ${c.provider}` : ''}
                </div>
                <div style={S.sub}>{c.explanation}</div>
                {c.decision_note ? <div style={S.sub}>Reason: {c.decision_note}</div> : null}
                {parseList(c.missing_json).map((m) => <div key={m} style={S.sub}>• {m}</div>)}
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function label(s) {
  return ({ none: 'Not added', pending_verification: 'Waiting for verification', incomplete: 'Details missing' }[s])
    || (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
}
function money(minor, cur) { return `${cur || 'GHS'} ${(Number(minor || 0) / 100).toFixed(2)}`; }
function clean(d) { return String(d || '').replace(/\s*\[ref [^\]]+\]/, ''); }
function day(iso) { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(); }
function parseList(j) { try { const v = JSON.parse(j || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }

function printInvoice(inv) {
  const w = window.open('', '_blank', 'width=720,height=900');
  if (!w) return;
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  w.document.write(`<!doctype html><title>Invoice ${esc(inv.invoice_number)}</title>
    <body style="font:14px/1.6 system-ui,sans-serif;padding:48px;color:#111;max-width:640px">
    <h1 style="margin:0">NessaHub</h1><p style="color:#555;margin:0 0 24px">Invoice</p>
    <table style="width:100%;border-collapse:collapse">
      <tr><td>Invoice number</td><td style="text-align:right"><b>${esc(inv.invoice_number)}</b></td></tr>
      <tr><td>Date</td><td style="text-align:right">${esc(day(inv.created_at))}</td></tr>
      <tr><td>Billed to</td><td style="text-align:right">${esc(inv.billed_to)}</td></tr>
      <tr><td>Payment reference</td><td style="text-align:right">${esc(inv.provider_ref || '')}</td></tr>
    </table><hr style="margin:20px 0">
    <table style="width:100%"><tr><td>${esc(clean(inv.description))}</td>
      <td style="text-align:right"><b>${esc(money(inv.amount_cents, inv.currency))}</b></td></tr></table>
    <p style="margin-top:20px">Status: <b>${esc(inv.status)}</b></p></body>`);
  w.document.close(); w.focus(); w.print();
}

const S = {
  wrap: { padding: '1.25rem 1.5rem 0', maxWidth: 900 },
  card: { background: '#fff', border: '1px solid #e4e7ee', borderRadius: 16, padding: '1rem 1.1rem', marginBottom: '1rem' },
  head: { display: 'flex', gap: '0.7rem', alignItems: 'flex-start', marginBottom: '0.5rem' },
  icon: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, flexShrink: 0, borderRadius: 10, background: '#eef2ff', color: '#2a3ea8' },
  title: { margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#15173a' },
  status: { margin: '0.15rem 0 0', fontSize: '0.86rem', fontWeight: 700 },
  sub: { margin: '0.15rem 0 0', fontSize: '0.78rem', lineHeight: 1.5, color: '#565c6e' },
  small: { display: 'flex', flexDirection: 'column', fontSize: '0.74rem', fontWeight: 700, color: '#3d4257' },
  strong: { fontSize: '0.86rem', fontWeight: 700, color: '#15173a' },
  form: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem', marginTop: '0.5rem' },
  input: { padding: '0.5rem 0.65rem', border: '1px solid #d8dce6', borderRadius: 9, fontSize: '0.85rem', fontFamily: 'inherit' },
  row: { display: 'flex', gap: '0.5rem', alignItems: 'center' },
  line: { display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.55rem 0', borderTop: '1px solid #f1f2f6' },
  badge: { fontSize: '0.75rem', fontWeight: 700 },
  primary: { padding: '0.5rem 0.95rem', borderRadius: 999, border: 'none', background: '#2b5ce6', color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  ghost: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.75rem', borderRadius: 999, border: '1px solid #d8dce6', background: '#fff', color: '#2c3040', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
};
