import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, X, Save, FlaskConical, Download } from 'lucide-react';
import { db, auth } from '../../Auth/firebaseConfig';
import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';

const TYPE_CFG = {
  lab:  { label: 'Lab Result',  emoji: '🧪', bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' },
  scan: { label: 'Scan Report', emoji: '🩻', bg: '#ede9fe', color: '#4c1d95', border: '#c4b5fd' },
};

const STATUS_META = {
  PENDING:     { bg: '#fef3c7', color: '#92400e' },
  IN_PROGRESS: { bg: '#dbeafe', color: '#1e40af' },
  COMPLETED:   { bg: '#dcfce7', color: '#14532d' },
};

function fmtDate(ts) {
  if (!ts?.seconds) return '—';
  return new Date(ts.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(ts) {
  if (!ts?.seconds) return '—';
  const d = new Date(ts.seconds * 1000);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export default function DoctorDiagnosticResults({ profile }) {
  const navigate = useNavigate();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewing, setViewing] = useState(null);
  const [doctorNote, setDoctorNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => { loadResults(); }, [profile]);

  const loadResults = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'diagnosticResults'), where('doctorId', '==', auth.currentUser?.uid))
      );
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.uploadedAt?.seconds || 0) - (a.uploadedAt?.seconds || 0));
      setResults(list);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const openResult = (r) => {
    setViewing(r);
    setDoctorNote(r.doctorNote || '');
  };

  const saveNote = async () => {
    if (!viewing) return;
    setSavingNote(true);
    try {
      await updateDoc(doc(db, 'diagnosticResults', viewing.id), {
        doctorNote: doctorNote.trim(),
        doctorNoteAt: serverTimestamp(),
      });
      setResults(prev => prev.map(r => r.id === viewing.id ? { ...r, doctorNote: doctorNote.trim() } : r));
      setViewing(prev => ({ ...prev, doctorNote: doctorNote.trim() }));
    } catch (e) { console.error(e); alert('Could not save note.'); }
    finally { setSavingNote(false); }
  };

  const filtered = results.filter(r => {
    if (typeFilter !== 'all' && r.type !== typeFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (r.patientName || '').toLowerCase().includes(q) ||
      (r.testType || '').toLowerCase().includes(q) ||
      (r.centerName || '').toLowerCase().includes(q) ||
      (r.resultRef || '').toLowerCase().includes(q);
  });

  return (
    <div className="doctor-page">
      <div className="doctor-page-header" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
        <div>
          <h1>Lab &amp; Scan Results</h1>
          <p>Review diagnostic results uploaded by labs and imaging centers for your patients</p>
        </div>
        <button type="button" className="doctor-btn doctor-btn-primary doctor-btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={() => navigate('/dashboard/diagnostic-order')}>
          <FlaskConical size={15} /> Order lab / scan
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {[
          { label: 'Total Results', count: results.length, color: '#1e6bb8', bg: '#eff6ff' },
          { label: 'Lab Results', count: results.filter(r => r.type === 'lab').length, color: '#065f46', bg: '#d1fae5' },
          { label: 'Scan Reports', count: results.filter(r => r.type === 'scan').length, color: '#4c1d95', bg: '#ede9fe' },
          { label: 'With Notes', count: results.filter(r => r.doctorNote).length, color: '#d97706', bg: '#fef3c7' },
        ].map(({ label, count, color, bg }) => (
          <div key={label} style={{ background: 'white', borderRadius: 12, padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem', flexShrink: 0 }}>
              {count}
            </div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', lineHeight: 1.3 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {['all', 'lab', 'scan'].map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            style={{
              padding: '0.4rem 1rem', borderRadius: 20, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', border: '1.5px solid', transition: 'all 0.15s',
              ...(typeFilter === t
                ? t === 'lab'
                  ? { background: '#d1fae5', color: '#065f46', borderColor: '#6ee7b7' }
                  : t === 'scan'
                    ? { background: '#ede9fe', color: '#4c1d95', borderColor: '#c4b5fd' }
                    : { background: '#1e6bb8', color: '#fff', borderColor: '#1e6bb8' }
                : { background: '#fff', color: '#64748b', borderColor: '#e2e8f0' }),
            }}>
            {t === 'all' ? 'All Results' : t === 'lab' ? '🧪 Lab' : '🩻 Scan'}
            <span style={{ marginLeft: '0.35rem', background: 'rgba(0,0,0,0.08)', borderRadius: 10, padding: '0 0.4rem', fontSize: '0.72rem' }}>
              {t === 'all' ? results.length : results.filter(r => r.type === t).length}
            </span>
          </button>
        ))}
        <div className="doctor-search" style={{ flex: 1, minWidth: 220 }}>
          <Search size={16} color="#94a3b8" />
          <input type="text" placeholder="Search by patient, test or center…"
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
      </div>

      <div className="doctor-card">
        {loading ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: '3rem' }}>Loading results…</p>
        ) : filtered.length === 0 ? (
          <div className="doctor-empty-state">
            <FileText size={40} />
            <h3>{searchQuery || typeFilter !== 'all' ? 'No results match your search' : 'No diagnostic results yet'}</h3>
            <p>Results appear here after you place an order and the lab or scan center uploads findings.</p>
            <button type="button" className="doctor-btn doctor-btn-outline doctor-btn-sm" style={{ marginTop: '1rem' }} onClick={() => navigate('/dashboard/diagnostic-order')}>
              <FlaskConical size={14} /> Place lab / scan order
            </button>
          </div>
        ) : (
          <table className="doctor-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Patient</th>
                <th>Test / Scan</th>
                <th>Center</th>
                <th>Result Ref</th>
                <th>Attachment</th>
                <th>Uploaded</th>
                <th>Status</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const cfg = TYPE_CFG[r.type] || TYPE_CFG.lab;
                const smt = STATUS_META[r.status] || STATUS_META.COMPLETED;
                return (
                  <tr key={r.id}>
                    <td>
                      <span style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, borderRadius: 20, padding: '0.2rem 0.6rem', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {cfg.emoji} {cfg.label}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, fontSize: '0.875rem' }}>{r.patientName || '—'}</td>
                    <td style={{ fontSize: '0.875rem', maxWidth: 160, wordBreak: 'break-word' }}>{r.testType || '—'}</td>
                    <td style={{ color: '#64748b', fontSize: '0.8rem' }}>{r.centerName || '—'}</td>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.8rem', color: '#1e6bb8' }}>{r.resultRef || '—'}</span>
                    </td>
                    <td>
                      {(r.fileUrl || r.resultFileUrl) ? (
                        <a
                          href={r.fileUrl || r.resultFileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="doctor-btn doctor-btn-outline doctor-btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                          download={r.fileName || true}
                        >
                          <Download size={14} /> {r.fileName ? 'Download' : 'File'}
                        </a>
                      ) : (
                        <span style={{ color: '#cbd5e1', fontSize: '0.72rem' }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDate(r.uploadedAt)}</td>
                    <td>
                      <span style={{ background: smt.bg, color: smt.color, padding: '0.2rem 0.6rem', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700 }}>
                        {r.status || 'COMPLETED'}
                      </span>
                    </td>
                    <td>
                      {r.doctorNote ? (
                        <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 20, padding: '0.2rem 0.55rem', fontSize: '0.7rem', fontWeight: 700 }}>
                          ✓ Note
                        </span>
                      ) : (
                        <span style={{ color: '#cbd5e1', fontSize: '0.72rem' }}>—</span>
                      )}
                    </td>
                    <td>
                      <button className="doctor-btn doctor-btn-primary doctor-btn-sm" onClick={() => openResult(r)}>
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Result detail modal */}
      {viewing && (() => {
        const cfg = TYPE_CFG[viewing.type] || TYPE_CFG.lab;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(3px)' }}>
            <div style={{ background: 'white', borderRadius: 20, maxWidth: 600, width: '100%', maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
              {/* Modal header */}
              <div style={{ background: cfg.bg, borderBottom: `1.5px solid ${cfg.border}`, padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                    <span style={{ fontSize: '1.3rem' }}>{cfg.emoji}</span>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: cfg.color }}>{cfg.label}</h3>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#475569', fontWeight: 600 }}>{viewing.testType}</p>
                  <p style={{ margin: '0.1rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>Patient: {viewing.patientName}</p>
                </div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '0.25rem', flexShrink: 0 }} onClick={() => setViewing(null)}>
                  <X size={20} />
                </button>
              </div>

              {/* Modal body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Meta grid */}
                {(viewing.fileUrl || viewing.resultFileUrl) && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    <a
                      href={viewing.fileUrl || viewing.resultFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="doctor-btn doctor-btn-primary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}
                      download={viewing.fileName || true}
                    >
                      <Download size={16} /> Download attachment{viewing.fileName ? ` (${viewing.fileName})` : ''}
                    </a>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                  {[
                    ['Center', viewing.centerName],
                    ['Result Reference', viewing.resultRef],
                    ['Uploaded', fmtDateTime(viewing.uploadedAt)],
                    ['File name', viewing.fileName],
                    ['Order ID', viewing.orderId],
                  ].filter(([, v]) => v).map(([label, val]) => (
                    <div key={label} style={{ background: '#f8fafc', borderRadius: 10, padding: '0.75rem' }}>
                      <p style={{ margin: '0 0 0.2rem', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
                      <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: '#0f172a', wordBreak: 'break-all' }}>{val}</p>
                    </div>
                  ))}
                </div>

                {/* Findings */}
                {viewing.findings && (
                  <div>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Findings / Summary</p>
                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '1rem', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', color: '#0f172a', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {viewing.findings}
                    </div>
                  </div>
                )}

                {/* Technician note */}
                {viewing.techNote && (
                  <div>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Technician Note</p>
                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '1rem', border: '1.5px solid #e2e8f0', fontSize: '0.875rem', color: '#475569', fontStyle: 'italic' }}>
                      {viewing.techNote}
                    </div>
                  </div>
                )}

                {/* Doctor clinical note */}
                <div>
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', fontWeight: 700, color: '#1e6bb8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Clinical Note</p>
                  <textarea
                    style={{ width: '100%', padding: '0.75rem', border: '1.5px solid #bfdbfe', borderRadius: 10, fontSize: '0.875rem', resize: 'vertical', minHeight: 90, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.5 }}
                    placeholder="Add your clinical interpretation or follow-up notes…"
                    value={doctorNote}
                    onChange={e => setDoctorNote(e.target.value)}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                    <button className="doctor-btn doctor-btn-primary doctor-btn-sm" onClick={saveNote} disabled={savingNote}>
                      <Save size={13} /> {savingNote ? 'Saving…' : 'Save Note'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
