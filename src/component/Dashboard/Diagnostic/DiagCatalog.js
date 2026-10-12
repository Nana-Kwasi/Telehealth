import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../../services/apiClient';
import { LAB_TEMPLATES, MODALITIES, parseParams, money, exportCsv, SPECIMENS } from './diagUi';
import './diagnostics.css';

/**
 * Test / scan catalog: what the centre offers, price, turnaround target,
 * specimen, patient preparation and (lab) reference ranges used when entering
 * results. The parent edits; branches read the same list.
 */
const OPS = '/api/v1/diagnostics/operations';

const STARTERS = {
  lab: [
    ['Full Blood Count (FBC)', 4, 'EDTA whole blood'], ['Fasting Blood Sugar (FBS)', 2, 'Fluoride plasma'], ['Random Blood Sugar (RBS)', 1, 'Fluoride plasma'],
    ['HbA1c', 24, 'EDTA whole blood'], ['Lipid Profile', 24, 'Serum'], ['Liver Function Test (LFT)', 24, 'Serum'], ['Kidney Function / Electrolytes', 24, 'Serum'],
    ['Thyroid (TSH)', 48, 'Serum'], ['Malaria RDT / Blood Film', 1, 'EDTA whole blood'], ['Typhoid IgM/IgG', 2, 'Serum'], ['Urinalysis', 2, 'Mid-stream urine'],
    ['HIV 1/2 Screening', 1, 'Serum'], ['Hepatitis B (HBsAg)', 1, 'Serum'], ['Pregnancy Test (hCG)', 1, 'Urine'], ['Sickling Test / Hb Genotype', 24, 'EDTA whole blood'],
  ],
  scan: [
    ['Chest X-ray (PA)', 24], ['Abdominal Ultrasound', 24], ['Pelvic Ultrasound', 24], ['Obstetric Ultrasound', 24], ['CT Head', 48], ['CT Abdomen & Pelvis (with contrast)', 48],
    ['MRI Brain', 72], ['MRI Lumbar Spine', 72], ['Mammogram', 72], ['Echocardiogram', 48], ['Doppler Ultrasound', 48],
  ],
};

const empty = { name: '', code: '', price: '', tatHours: '', specimenType: '', preparation: '', description: '', params: [] };

function ParamEditor({ params, onChange }) {
  const set = (i, patch) => onChange(params.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const numOrNull = (v) => (v === '' || v == null ? null : Number(v));
  return (
    <div>
      <div className="dx-table-wrap">
        <table className="dx-table dx-values">
          <thead><tr><th>Parameter</th><th>Type</th><th>Unit</th><th>Low</th><th>High</th><th>Critical low</th><th>Critical high</th><th /></tr></thead>
          <tbody>
            {params.map((p, i) => (
              <tr key={i}>
                <td><input value={p.name} onChange={e => set(i, { name: e.target.value })} /></td>
                <td><select value={p.kind} onChange={e => set(i, { kind: e.target.value })}><option value="num">Number</option><option value="qual">Choice</option><option value="text">Text</option></select></td>
                {p.kind === 'num' ? (<>
                  <td><input value={p.unit || ''} onChange={e => set(i, { unit: e.target.value })} /></td>
                  <td><input value={p.low ?? ''} onChange={e => set(i, { low: numOrNull(e.target.value) })} /></td>
                  <td><input value={p.high ?? ''} onChange={e => set(i, { high: numOrNull(e.target.value) })} /></td>
                  <td><input value={p.critLow ?? ''} onChange={e => set(i, { critLow: numOrNull(e.target.value) })} /></td>
                  <td><input value={p.critHigh ?? ''} onChange={e => set(i, { critHigh: numOrNull(e.target.value) })} /></td>
                </>) : p.kind === 'qual' ? (
                  <td colSpan={5}><input value={(p.options || []).join(', ')} placeholder="Choices, e.g. Negative, Positive (first = normal)"
                    onChange={e => { const options = e.target.value.split(',').map(s => s.trim()).filter(Boolean); set(i, { options, normal: options.slice(0, 1) }); }} /></td>
                ) : <td colSpan={5} className="dx-card-hint">Free text</td>}
                <td><button type="button" className="dx-btn dx-btn--sm dx-btn--danger" onClick={() => onChange(params.filter((_, j) => j !== i))}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="dx-btn dx-btn--sm" style={{ marginTop: 6 }} onClick={() => onChange([...params, { name: '', kind: 'num', unit: '', low: null, high: null }])}>+ Parameter</button>
    </div>
  );
}

export default function DiagCatalog({ type = 'lab', mode = 'parent' }) {
  const canEdit = mode === 'parent';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [edit, setEdit] = useState(null); // form state, with id when editing
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api(`${OPS}/catalog/mine?diagnosticType=${type}`); setItems(Array.isArray(r) ? r : []); }
    catch { setItems([]); }
    finally { setLoading(false); }
  }, [type]);
  useEffect(() => { load(); }, [load]);

  const openNew = (preset) => {
    const tpl = type === 'lab' && preset ? LAB_TEMPLATES.find(t => t.match.some(m => preset[0].toLowerCase().includes(m))) : null;
    const mod = type === 'scan' && preset ? MODALITIES.find(m => m.match.some(k => ` ${preset[0].toLowerCase()} `.includes(k))) : null;
    setErr('');
    setEdit({ ...empty, name: preset?.[0] || '', tatHours: preset?.[1] ?? '', specimenType: preset?.[2] || tpl?.specimen || '', preparation: mod?.prep || '', params: tpl ? tpl.params.map(p => ({ ...p })) : [] });
  };
  const openEdit = (it) => {
    setErr('');
    setEdit({ id: it.id, name: it.name, code: it.code || '', price: it.price ?? '', tatHours: it.tatHours ?? '', specimenType: it.specimenType || '', preparation: it.preparation || '', description: it.description || '', params: parseParams(it.parametersJson) || [], active: it.active });
  };
  const loadDefaults = () => {
    const tpl = LAB_TEMPLATES.find(t => t.match.some(m => edit.name.toLowerCase().includes(m)));
    if (!tpl) return setErr('No built-in template matches this name. Add parameters by hand.');
    setEdit(e => ({ ...e, params: tpl.params.map(p => ({ ...p })), specimenType: e.specimenType || tpl.specimen }));
  };

  const save = async () => {
    setBusy(true); setErr('');
    const body = {
      name: edit.name.trim(), code: edit.code.trim() || null, description: edit.description || null,
      price: edit.price === '' ? null : Number(edit.price), tatHours: edit.tatHours === '' ? null : Number(edit.tatHours),
      specimenType: edit.specimenType || null, preparation: edit.preparation || null,
      parametersJson: type === 'lab' ? JSON.stringify(edit.params.filter(p => String(p.name || '').trim())) : null,
    };
    try {
      if (edit.id) await api(`${OPS}/catalog/${edit.id}`, { method: 'PATCH', body });
      else await api(`${OPS}/catalog`, { method: 'POST', body: { ...body, diagnosticType: type } });
      setEdit(null); await load();
    } catch (e) { setErr(e?.message || 'Could not save.'); }
    finally { setBusy(false); }
  };
  const toggle = async (it) => { await api(`${OPS}/catalog/${it.id}`, { method: 'PATCH', body: { active: !it.active } }).catch(e => alert(e?.message)); load(); };

  const names = new Set(items.map(i => String(i.name).toLowerCase()));
  const shown = items.filter(i => (showInactive || i.active) && (!q || `${i.name} ${i.code}`.toLowerCase().includes(q.toLowerCase())));
  const starters = STARTERS[type].filter(s => !names.has(s[0].toLowerCase()));

  return (
    <div className={`pharmacy-page dx ${type === 'scan' ? 'dx--scan' : ''}`}>
      <div className="dx-hero">
        <div>
          <h1>{type === 'lab' ? 'Test catalog' : 'Scan catalog'}</h1>
          <p>{canEdit ? 'Prices, turnaround targets, preparation and reference ranges for every branch. Doctors’ orders are priced from this list.' : 'What your centre offers, set by head office. Ranges here drive the result flags.'}</p>
        </div>
        <div className="dx-toolbar">
          <button type="button" className="dx-btn" disabled={!items.length} onClick={() => exportCsv(`${type}-catalog.csv`, [
            { label: 'Code', value: 'code' }, { label: 'Name', value: 'name' }, { label: 'Price (GHS)', value: 'price' }, { label: 'TAT (h)', value: 'tatHours' },
            { label: 'Specimen', value: 'specimenType' }, { label: 'Active', value: i => (i.active ? 'yes' : 'no') }], items)}>⬇ Export</button>
          {canEdit && <button type="button" className="dx-btn dx-btn--primary" onClick={() => openNew(null)}>+ Add {type === 'lab' ? 'test' : 'scan'}</button>}
        </div>
      </div>

      {canEdit && starters.length > 0 && (
        <div className="dx-card" style={{ marginBottom: '0.8rem' }}>
          <div className="dx-card-head"><h2 className="dx-card-title">Quick add common {type === 'lab' ? 'tests' : 'scans'}</h2><span className="dx-card-hint">Pre-filled; set your price and save</span></div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{starters.map(s => <button key={s[0]} type="button" className="dx-tab" onClick={() => openNew(s)}>+ {s[0]}</button>)}</div>
        </div>
      )}

      <div className="dx-card">
        <div className="dx-card-head">
          <input className="dx-input" style={{ maxWidth: 320 }} placeholder="Search name or code" value={q} onChange={e => setQ(e.target.value)} />
          <label className="dx-card-hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Show inactive</label>
        </div>
        {loading ? <p className="dx-empty">Loading…</p> : shown.length === 0 ? (
          <p className="dx-empty">{items.length ? 'Nothing matches.' : canEdit ? 'Your catalog is empty. Use Quick add above to start.' : 'Head office has not published a catalog yet.'}</p>
        ) : (
          <div className="dx-table-wrap">
            <table className="dx-table">
              <thead><tr><th>Name</th><th>Code</th><th>Price</th><th>Turnaround</th>{type === 'lab' ? <th>Specimen</th> : <th>Preparation</th>}{type === 'lab' && <th>Ranges</th>}<th>Status</th>{canEdit && <th />}</tr></thead>
              <tbody>
                {shown.map(i => (
                  <tr key={i.id} className={canEdit ? 'dx-click' : undefined} onClick={canEdit ? () => openEdit(i) : undefined}>
                    <td><b>{i.name}</b>{i.description ? <div className="dx-card-hint">{i.description}</div> : null}</td>
                    <td style={{ fontFamily: 'monospace' }}>{i.code}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{i.price != null ? money(i.price) : <span className="dx-card-hint">Not set</span>}</td>
                    <td>{i.tatHours ? `${i.tatHours}h` : <span className="dx-card-hint">Default</span>}</td>
                    {type === 'lab' ? <td>{i.specimenType || '—'}</td> : <td className="dx-card-hint" style={{ maxWidth: 260 }}>{i.preparation || '—'}</td>}
                    {type === 'lab' && <td className="dx-card-hint">{(parseParams(i.parametersJson) || []).length || 'Default'}</td>}
                    <td><span className="dx-pill" style={i.active ? { background: '#dcfce7', color: '#166534' } : { background: '#f1f5f9', color: '#475569' }}>{i.active ? 'Active' : 'Inactive'}</span></td>
                    {canEdit && <td onClick={e => e.stopPropagation()}><button type="button" className="dx-btn dx-btn--sm" onClick={() => toggle(i)}>{i.active ? 'Deactivate' : 'Activate'}</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {edit && (
        <div className="dx-modal-bg" onClick={() => setEdit(null)}>
          <div className="dx-modal" style={{ maxWidth: 900 }} onClick={e => e.stopPropagation()}>
            <div className="dx-modal-head"><h3>{edit.id ? 'Edit' : 'Add'} {type === 'lab' ? 'test' : 'scan'}</h3><button type="button" className="dx-btn dx-btn--sm" onClick={() => setEdit(null)}>✕</button></div>
            <div className="dx-modal-body">
              <div className="dx-two">
                <div className="dx-field"><label>Name *</label><input className="dx-input" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></div>
                <div className="dx-field"><label>Code</label><input className="dx-input" value={edit.code} placeholder="Auto from name" onChange={e => setEdit({ ...edit, code: e.target.value })} /></div>
                <div className="dx-field"><label>Price (GHS)</label><input className="dx-input" type="number" min="0" step="0.01" value={edit.price} onChange={e => setEdit({ ...edit, price: e.target.value })} /></div>
                <div className="dx-field"><label>Turnaround target (hours)</label><input className="dx-input" type="number" min="1" value={edit.tatHours} onChange={e => setEdit({ ...edit, tatHours: e.target.value })} /></div>
                {type === 'lab' && <div className="dx-field"><label>Specimen</label><select className="dx-select" value={edit.specimenType} onChange={e => setEdit({ ...edit, specimenType: e.target.value })}><option value="">—</option>{[...new Set([edit.specimenType, ...SPECIMENS])].filter(Boolean).map(s => <option key={s}>{s}</option>)}</select></div>}
                <div className="dx-field"><label>Description</label><input className="dx-input" value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} /></div>
              </div>
              <div className="dx-field"><label>Patient preparation</label><textarea rows={2} value={edit.preparation} placeholder={type === 'lab' ? 'e.g. Fast for 8–12 hours; water allowed.' : 'e.g. Do not eat for 6 hours before.'} onChange={e => setEdit({ ...edit, preparation: e.target.value })} /></div>
              {type === 'lab' && (
                <div>
                  <div className="dx-card-head" style={{ marginBottom: 6 }}><h2 className="dx-card-title" style={{ fontSize: '0.86rem' }}>Result parameters & reference ranges</h2><button type="button" className="dx-btn dx-btn--sm" onClick={loadDefaults}>Load typical ranges</button></div>
                  <ParamEditor params={edit.params} onChange={(params) => setEdit({ ...edit, params })} />
                  <p className="dx-card-hint" style={{ marginBottom: 0 }}>Values outside Low–High are flagged; outside the critical limits the doctor gets an urgent alert. Check ranges against your analyser and population.</p>
                </div>
              )}
              {err && <p style={{ color: '#b91c1c', margin: 0 }}>{err}</p>}
            </div>
            <div className="dx-modal-foot"><button type="button" className="dx-btn" onClick={() => setEdit(null)}>Cancel</button><button type="button" className="dx-btn dx-btn--primary" disabled={busy || !edit.name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
