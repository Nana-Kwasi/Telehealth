import React, { useState, useRef } from 'react';
import { FileScan, Upload, AlertTriangle, CheckCircle2, ArrowRight, Loader } from 'lucide-react';
import { api, uploadFile } from '../../services/apiClient';
import Paged from './Paged';

/**
 * Upload a document; the assistant says what it is, copies what it says, and
 * proposes where it goes. A person files it.
 *
 * The name check is the part to read first. It is done by the server in code,
 * comparing the name printed on the document with the patient it is about to
 * be filed to — filing someone else's lab report into a record is the failure
 * this has to prevent. A mismatch needs a ticked confirmation to file.
 *
 * `patientId` is for clinicians filing to a patient they treat; patients
 * always file to themselves and pass nothing.
 */
export default function SmartDocumentUpload({ patientId = null, onFiled }) {
  const inputRef = useRef(null);
  const [stage, setStage]   = useState('idle');   // idle | reading | review | filing | done
  const [result, setResult] = useState(null);
  const [record, setRecord] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError]   = useState('');

  const pick = async (file) => {
    if (!file) return;
    setError(''); setResult(null); setConfirm(false); setStage('reading');
    try {
      const { fileId } = await uploadFile(file, { domain: 'healthRecords', withMeta: true });
      const res = await api('/api/v1/ai/document/classify', {
        method: 'POST', body: { fileId, patientId },
      });
      if (!res?.ok) { setError(res?.message || 'That document could not be read.'); setStage('idle'); return; }
      setResult(res);
      setRecord({ ...res.suggestedRecord, types: res.suggestedRecord.types || [] });
      setStage('review');
    } catch (e) {
      setError(e?.message || 'That document could not be read.');
      setStage('idle');
    }
  };

  const file = async () => {
    setStage('filing'); setError('');
    try {
      await api('/api/v1/ai/document/file', {
        method: 'POST',
        body: { classificationId: result.classificationId, ...record, confirmMismatch: confirm },
      });
      setStage('done');
      onFiled?.();
    } catch (e) {
      setError(e?.message || 'That could not be filed.');
      setStage('review');
    }
  };

  const reset = () => { setStage('idle'); setResult(null); setRecord(null); setError(''); };
  const mismatch = result?.nameCheck === 'mismatch';

  return (
    <section style={S.card} aria-label="Smart document upload">
      <header style={S.head}>
        <span style={S.icon}><FileScan size={17} /></span>
        <div style={{ minWidth: 0 }}>
          <h2 style={S.title}>Add a document</h2>
          <p style={S.sub}>
            Upload a lab report, prescription, referral, certificate, scan report or insurance
            document. It is read, sorted and filled in for you to check before it is filed.
          </p>
        </div>
      </header>

      <input ref={inputRef} type="file" accept="image/*,application/pdf" hidden
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />

      {stage === 'idle' ? (
        <button type="button" style={S.go} onClick={() => inputRef.current?.click()}>
          <Upload size={15} /> Choose a document
        </button>
      ) : null}
      {stage === 'reading' ? <p style={S.busy}><Loader size={14} /> Reading the document…</p> : null}
      {stage === 'done' ? (
        <div style={S.done}>
          <CheckCircle2 size={16} /> Filed to Health Records.
          <button type="button" style={S.link} onClick={reset}>Add another</button>
        </div>
      ) : null}
      {error ? <p style={S.error}>{error}</p> : null}

      {(stage === 'review' || stage === 'filing') && result ? (
        <div style={S.review}>
          <div style={S.typeRow}>
            <strong style={S.type}>{result.label}</strong>
            <span style={S.meta}>{result.confidence} confidence</span>
            {result.printed?.issuer ? <span style={S.meta}>· {result.printed.issuer}</span> : null}
          </div>

          <NameCheck check={result.nameCheck} printed={result.printed?.patientName} patient={result.patientName} />

          <Fields type={result.documentType} fields={result.fields} />
          {result.pagesNotRead ? (
            <p style={S.warn}>Only page 1 was read — {result.pagesNotRead} more page(s) were not.</p>
          ) : null}

          <div style={S.route}>
            <ArrowRight size={14} /> <b>Suggested for:</b> {result.route?.department}
            <span style={S.meta}> — {result.route?.why}</span>
          </div>

          <div style={S.grid}>
            <label style={S.label}>Record name
              <input style={S.input} value={record.name}
                onChange={(e) => setRecord({ ...record, name: e.target.value })} />
            </label>
            <label style={S.label}>Date
              <input type="date" style={S.input} value={record.date}
                onChange={(e) => setRecord({ ...record, date: e.target.value })} />
            </label>
          </div>
          <label style={S.label}>Notes (copied from the document — edit if needed)
            <textarea rows={3} style={S.input} value={record.notes}
              onChange={(e) => setRecord({ ...record, notes: e.target.value })} />
          </label>

          {mismatch ? (
            <label style={S.confirm}>
              <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
              I have checked — this document belongs to {result.patientName || 'this patient'}.
            </label>
          ) : null}

          <p style={S.meta}>{result.disclaimer}</p>
          <div style={S.actions}>
            <button type="button" style={{ ...S.go, ...(stage === 'filing' || (mismatch && !confirm) ? S.off : null) }}
              disabled={stage === 'filing' || (mismatch && !confirm)} onClick={file}>
              {stage === 'filing' ? 'Filing…' : 'File to Health Records'}
            </button>
            <button type="button" style={S.ghost} onClick={reset}>Discard</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function NameCheck({ check, printed, patient }) {
  if (check === 'match') {
    return <p style={{ ...S.check, ...S.ok }}><CheckCircle2 size={14} /> Name matches: {printed}</p>;
  }
  if (check === 'not_found') {
    return <p style={{ ...S.check, ...S.neutral }}>No patient name was found on the document — check it is {patient}'s.</p>;
  }
  return (
    <p style={{ ...S.check, ...(check === 'mismatch' ? S.bad : S.warnBox) }}>
      <AlertTriangle size={14} />
      {check === 'mismatch' ? 'Different name: ' : 'Name only partly matches: '}
      the document says “{printed}”, this record is {patient}.
    </p>
  );
}

/** The copied fields, laid out per document type. */
function Fields({ type, fields = {} }) {
  if (type === 'lab_report' && Array.isArray(fields.tests) && fields.tests.length) {
    return (
      <table style={S.table}>
        <thead><tr><th style={S.th}>Test</th><th style={S.th}>Result</th><th style={S.th}>Reference</th><th style={S.th}>Flag</th></tr></thead>
        <tbody>
          {fields.tests.map((t, i) => (
            <tr key={i}>
              <td style={S.td}>{t.name}</td>
              <td style={S.td}>{t.value} {t.unit}</td>
              <td style={S.td}>{t.referenceRange}</td>
              <td style={{ ...S.td, fontWeight: 700 }}>{t.flag}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (type === 'prescription' && Array.isArray(fields.medications)) {
    return (
      <ul style={S.list}>
        {fields.medications.map((m, i) => (
          <li key={i}>{[m.name, m.dose, m.frequency, m.duration].filter(Boolean).join(' · ')}</li>
        ))}
      </ul>
    );
  }
  const rows = Object.entries(fields).filter(([, v]) => typeof v === 'string' && v.trim());
  if (!rows.length) return null;
  return (
    <dl style={S.dl}>
      <Paged items={rows}>{(rows) => rows.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt style={S.dt}>{k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</dt>
          <dd style={S.dd}>{v}</dd>
        </React.Fragment>
      ))}</Paged>
    </dl>
  );
}

const S = {
  card: { background: '#fff', border: '1px solid #e4e7ee', borderRadius: 16, padding: '1rem 1.1rem', marginBottom: '1.25rem' },
  head: { display: 'flex', gap: '0.7rem', alignItems: 'flex-start', marginBottom: '0.7rem' },
  icon: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34,
    flexShrink: 0, borderRadius: 10, background: '#eef2ff', color: '#2a3ea8',
  },
  title: { margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#15173a' },
  sub: { margin: '0.15rem 0 0', fontSize: '0.78rem', lineHeight: 1.5, color: '#565c6e' },
  go: {
    display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem',
    borderRadius: 999, border: 'none', background: '#2b5ce6', color: '#fff',
    fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },
  ghost: {
    padding: '0.55rem 1rem', borderRadius: 999, border: '1px solid #d8dce6', background: '#fff',
    color: '#2c3040', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },
  off: { opacity: 0.5, cursor: 'not-allowed' },
  link: { marginLeft: '0.6rem', background: 'none', border: 'none', color: '#2b5ce6', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  busy: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.84rem', color: '#565c6e' },
  done: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.86rem', fontWeight: 700, color: '#12602f' },
  error: { margin: '0.5rem 0 0', fontSize: '0.82rem', color: '#8f1d17' },
  warn: { margin: '0.4rem 0 0', fontSize: '0.8rem', color: '#8a4b09' },

  review: { borderTop: '1px solid #eef0f4', paddingTop: '0.8rem', marginTop: '0.4rem' },
  typeRow: { display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' },
  type: { fontSize: '0.95rem', color: '#15173a' },
  meta: { fontSize: '0.76rem', color: '#565c6e' },
  check: { display: 'flex', alignItems: 'center', gap: '0.4rem', margin: '0.55rem 0', padding: '0.5rem 0.7rem', borderRadius: 10, fontSize: '0.82rem', fontWeight: 600 },
  ok: { background: '#e6f6ec', color: '#12602f' },
  neutral: { background: '#f4f5f8', color: '#3d4257' },
  warnBox: { background: '#fff4e5', color: '#8a4b09' },
  bad: { background: '#fdeceb', color: '#8f1d17', border: '1px solid #f3c7c3' },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', margin: '0.4rem 0' },
  th: { textAlign: 'left', padding: '0.35rem 0.4rem', borderBottom: '1px solid #e4e7ee', color: '#565c6e', fontWeight: 700 },
  td: { padding: '0.35rem 0.4rem', borderBottom: '1px solid #f1f2f6', color: '#2c3040' },
  list: { margin: '0.4rem 0', paddingLeft: '1.1rem', fontSize: '0.84rem', color: '#2c3040' },
  dl: { display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '0.25rem 0.8rem', margin: '0.4rem 0', fontSize: '0.83rem' },
  dt: { fontWeight: 700, color: '#565c6e' },
  dd: { margin: 0, color: '#2c3040' },

  route: { display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', margin: '0.6rem 0', fontSize: '0.82rem', color: '#2c3040' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem' },
  label: { display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.76rem', fontWeight: 700, color: '#3d4257', marginTop: '0.5rem' },
  input: {
    padding: '0.5rem 0.65rem', border: '1px solid #d8dce6', borderRadius: 9, fontSize: '0.85rem',
    fontFamily: 'inherit', color: '#2c3040', background: '#fff', fontWeight: 400,
  },
  confirm: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.7rem', fontSize: '0.82rem', fontWeight: 700, color: '#8f1d17' },
  actions: { display: 'flex', gap: '0.5rem', marginTop: '0.7rem', flexWrap: 'wrap' },
};
