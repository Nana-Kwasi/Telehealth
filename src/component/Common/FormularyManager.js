import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/apiClient';

/**
 * The pharmacist's formulary: medicines and interactions that every
 * prescription check runs against.
 *
 * Starter entries arrive as drafts. They are used for checks immediately but
 * every warning built on them is labelled "not yet reviewed" until approved
 * here. Editing an entry returns it to draft — an approval covers exactly the
 * content that was approved. Reference dosing is shown to doctors only as
 * written here; nothing generates it.
 */
const EMPTY_DRUG = { genericName: '', brandNames: '', drugClass: '', allergyTerms: '', crossReactiveTerms: '', referenceDosing: '', notes: '' };
const EMPTY_RULE = { subjectA: '', subjectB: '', severity: 'major', effect: '', advice: '' };

export default function FormularyManager() {
  const [data, setData] = useState({ drugs: [], interactions: [] });
  const [tab, setTab] = useState('drugs');
  const [filter, setFilter] = useState('');
  const [drug, setDrug] = useState(null);
  const [rule, setRule] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const d = await api('/api/v1/ai/prescriptions/formulary').catch(() => null);
    if (d) setData(d);
  }, []);
  useEffect(() => { load(); }, [load]);

  const review = async (kind, id, status) => {
    await api(`/api/v1/ai/prescriptions/formulary/${kind}/${id}/review`, { method: 'POST', body: { status } }).catch(() => null);
    load();
  };
  const saveDrug = async () => {
    try { const r = await api('/api/v1/ai/prescriptions/formulary/drugs', { method: 'POST', body: drug }); setMsg(r.message); setDrug(null); load(); }
    catch (e) { setMsg(e?.message || 'Could not save.'); }
  };
  const saveRule = async () => {
    try { const r = await api('/api/v1/ai/prescriptions/formulary/interactions', { method: 'POST', body: rule }); setMsg(r.message); setRule(null); load(); }
    catch (e) { setMsg(e?.message || 'Could not save.'); }
  };

  const q = filter.trim().toLowerCase();
  const drugs = data.drugs.filter((d) => !q || `${d.generic_name} ${d.brand_names} ${d.drug_class}`.toLowerCase().includes(q));
  const rules = data.interactions.filter((r) => !q || `${r.subject_a} ${r.subject_b} ${r.effect}`.toLowerCase().includes(q));
  const pending = data.drugs.filter((d) => d.status === 'draft').length + data.interactions.filter((r) => r.status === 'draft').length;

  return (
    <div style={S.page}>
      <h1 style={S.h1}>Formulary</h1>
      <p style={S.lead}>
        Every prescription check — interactions, duplicates, allergies — runs against this list. {pending} entr{pending === 1 ? 'y is' : 'ies are'} waiting
        for pharmacist review. Medicines not listed here are reported to doctors as “not checked”.
      </p>
      <div style={S.bar}>
        {['drugs', 'interactions'].map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} style={{ ...S.tab, ...(tab === t ? S.tabOn : null) }}>
            {t === 'drugs' ? `Medicines (${data.drugs.length})` : `Interactions (${data.interactions.length})`}
          </button>
        ))}
        <input style={{ ...S.input, maxWidth: 260 }} placeholder="Search" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button type="button" style={S.primary} onClick={() => (tab === 'drugs' ? setDrug({ ...EMPTY_DRUG }) : setRule({ ...EMPTY_RULE }))}>
          + Add {tab === 'drugs' ? 'medicine' : 'interaction'}
        </button>
      </div>
      {msg ? <p style={S.msg}>{msg}</p> : null}

      {drug ? (
        <div style={S.card}>
          <div style={S.grid}>
            {[['genericName', 'Generic name *'], ['brandNames', 'Brand names (comma-separated)'], ['drugClass', 'Class (e.g. NSAID)'],
              ['allergyTerms', 'Allergy words (e.g. penicillin)'], ['crossReactiveTerms', 'Cross-reactive allergy words']].map(([k, ph]) => (
              <input key={k} style={S.input} placeholder={ph} value={drug[k] || ''} onChange={(e) => setDrug({ ...drug, [k]: e.target.value })} />
            ))}
          </div>
          <textarea rows={3} style={{ ...S.input, width: '100%', marginTop: '0.5rem' }} placeholder="Reference dosing (shown to doctors exactly as written)"
            value={drug.referenceDosing || ''} onChange={(e) => setDrug({ ...drug, referenceDosing: e.target.value })} />
          <div style={S.row}><button type="button" style={S.primary} onClick={saveDrug}>Save as draft</button>
            <button type="button" style={S.ghost} onClick={() => setDrug(null)}>Cancel</button></div>
        </div>
      ) : null}
      {rule ? (
        <div style={S.card}>
          <div style={S.grid}>
            <input style={S.input} placeholder="Medicine A (generic, or class:NSAID)" value={rule.subjectA} onChange={(e) => setRule({ ...rule, subjectA: e.target.value })} />
            <input style={S.input} placeholder="Medicine B (generic, or class:…)" value={rule.subjectB} onChange={(e) => setRule({ ...rule, subjectB: e.target.value })} />
            <select style={S.input} value={rule.severity} onChange={(e) => setRule({ ...rule, severity: e.target.value })}>
              <option value="contraindicated">Contraindicated</option><option value="major">Major</option><option value="moderate">Moderate</option>
            </select>
          </div>
          <input style={{ ...S.input, width: '100%', marginTop: '0.5rem' }} placeholder="Effect *" value={rule.effect} onChange={(e) => setRule({ ...rule, effect: e.target.value })} />
          <input style={{ ...S.input, width: '100%', marginTop: '0.5rem' }} placeholder="Advice to the prescriber" value={rule.advice} onChange={(e) => setRule({ ...rule, advice: e.target.value })} />
          <div style={S.row}><button type="button" style={S.primary} onClick={saveRule}>Save as draft</button>
            <button type="button" style={S.ghost} onClick={() => setRule(null)}>Cancel</button></div>
        </div>
      ) : null}

      {tab === 'drugs' ? drugs.map((d) => (
        <div key={d.id} style={S.item}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div><b>{d.generic_name}</b> <span style={S.muted}>{d.drug_class}{d.brand_names ? ` · ${d.brand_names}` : ''}</span></div>
            <div style={S.muted}>Allergy words: {d.allergy_terms || '—'}{d.cross_reactive_terms ? ` · cross: ${d.cross_reactive_terms}` : ''}</div>
            <div style={S.muted}>Reference dosing: {d.reference_dosing || <i>not written yet</i>}</div>
          </div>
          <Status s={d.status} by={d.reviewed_by} />
          <button type="button" style={S.ghost} onClick={() => setDrug({ genericName: d.generic_name, brandNames: d.brand_names || '', drugClass: d.drug_class || '',
            allergyTerms: d.allergy_terms || '', crossReactiveTerms: d.cross_reactive_terms || '', referenceDosing: d.reference_dosing || '', notes: d.notes || '' })}>Edit</button>
          {d.status !== 'approved' ? <button type="button" style={S.primary} onClick={() => review('drugs', d.id, 'approved')}>Approve</button> : null}
          {d.status !== 'retired' ? <button type="button" style={S.ghost} onClick={() => review('drugs', d.id, 'retired')}>Retire</button> : null}
        </div>
      )) : rules.map((r) => (
        <div key={r.id} style={S.item}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div><b>{r.subject_a}</b> + <b>{r.subject_b}</b> · <span style={{ color: r.severity === 'moderate' ? '#7a5b06' : '#8f1d17', fontWeight: 700 }}>{r.severity}</span></div>
            <div style={S.muted}>{r.effect}{r.advice ? ` — ${r.advice}` : ''}</div>
          </div>
          <Status s={r.status} by={r.reviewed_by} />
          {r.status !== 'approved' ? <button type="button" style={S.primary} onClick={() => review('interactions', r.id, 'approved')}>Approve</button> : null}
          {r.status !== 'retired' ? <button type="button" style={S.ghost} onClick={() => review('interactions', r.id, 'retired')}>Retire</button> : null}
        </div>
      ))}
    </div>
  );
}

function Status({ s, by }) {
  const c = s === 'approved' ? '#12602f' : s === 'retired' ? '#64748b' : '#8a4b09';
  return <span style={{ fontSize: '0.75rem', fontWeight: 700, color: c, whiteSpace: 'nowrap' }}>
    {s === 'draft' ? 'Not reviewed' : s}{s === 'approved' && by ? ` · ${by}` : ''}</span>;
}

const S = {
  page: { padding: '1.5rem', maxWidth: 1200 },
  h1: { margin: 0, fontSize: '1.3rem', fontWeight: 800 },
  lead: { fontSize: '0.86rem', color: '#475569', lineHeight: 1.55 },
  bar: { display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', margin: '0.8rem 0' },
  tab: { padding: '0.4rem 0.8rem', borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' },
  tabOn: { background: '#0f172a', color: '#fff', borderColor: '#0f172a' },
  input: { padding: '0.45rem 0.65rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.84rem', fontFamily: 'inherit', boxSizing: 'border-box' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' },
  card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.9rem', marginBottom: '0.8rem' },
  item: { display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.6rem 0.8rem', marginBottom: '0.45rem', fontSize: '0.85rem' },
  muted: { fontSize: '0.78rem', color: '#64748b' },
  row: { display: 'flex', gap: '0.5rem', marginTop: '0.6rem' },
  primary: { padding: '0.4rem 0.8rem', borderRadius: 8, border: 'none', background: '#1e6bb8', color: '#fff', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' },
  ghost: { padding: '0.4rem 0.8rem', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' },
  msg: { fontSize: '0.84rem', color: '#166534' },
};
