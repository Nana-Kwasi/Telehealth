import React, { useState, useEffect } from 'react';
import { db, doc, getDoc } from '../../../services/firestoreShim';
import { collection, getDocs } from '../../../services/firestoreShim';
import RxFullDetails from '../Pharmacy/RxFullDetails';

const normalizePrescription = async (raw = {}) => {
  const medications = Array.isArray(raw.medications) && raw.medications.length > 0
    ? raw.medications
    : (raw.medication ? [{
        name: raw.medication,
        strength: raw.strength || '',
        dosage: raw.dosage || '',
        frequency: raw.frequency || '',
        duration: raw.duration || '',
        durationUnit: raw.durationUnit || '',
        direction: raw.direction || '',
        drugForm: raw.drugForm || '',
        route: raw.route || '',
      }] : []);

  let patientName = raw.patientName || 'Patient';
  if ((!raw.patientName || raw.patientName === 'Patient') && raw.patientId) {
    try {
      const snap = await getDoc(doc(db, 'auth', raw.patientId));
      if (snap.exists()) {
        const data = snap.data();
        patientName = data?.name || data?.displayName || data?.fullName || patientName;
      }
    } catch (_) {}
  }

  let doctorName = raw.doctorName || 'Doctor';
  if ((!raw.doctorName || raw.doctorName === 'Doctor') && raw.doctorId) {
    try {
      const snap = await getDoc(doc(db, 'doctors', raw.doctorId));
      if (snap.exists()) {
        const data = snap.data();
        doctorName = data?.name || data?.fullName || data?.displayName || doctorName;
      }
    } catch (_) {}
  }

  return {
    ...raw,
    medications,
    patientName,
    doctorName,
    status: raw.status || 'active',
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
  };
};

export default function AdminPrescriptionMonitor() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDoctor, setFilterDoctor] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFlagged, setFilterFlagged] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const snap = await getDocs(collection(db, 'doctorPrescriptions'));
      const list = await Promise.all(
        snap.docs.map(async d => normalizePrescription({ id: d.id, ...d.data() }))
      );
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setPrescriptions(list);
    } catch (e) {
      console.error('Prescription monitor load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const doctors = [...new Set(prescriptions.map(p => p.doctorName).filter(Boolean))];

  const filtered = prescriptions.filter(p => {
    if (search && !(
      (p.patientName || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.doctorName  || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.diagnosis   || '').toLowerCase().includes(search.toLowerCase())
    )) return false;
    if (filterDoctor && p.doctorName !== filterDoctor) return false;
    if (filterStatus && p.status !== filterStatus) return false;
    if (filterFlagged && !(p.warnings?.length > 0)) return false;
    return true;
  });

  const flagCount = prescriptions.filter(p => p.warnings?.length > 0).length;

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Prescription Monitoring</h1>
        <p className="admin-page-sub">Review all prescriptions across the platform. Flag duplicates or risky prescriptions.</p>
      </div>

      {flagCount > 0 && (
        <div className="admin-alert admin-alert-danger" style={{ marginBottom: '1.25rem' }}>
          {flagCount} prescription{flagCount > 1 ? 's' : ''} flagged with safety warnings
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem', alignItems: 'center' }}>
        <div className="admin-search" style={{ maxWidth: 260 }}>
          <span>🔍</span>
          <input placeholder="Search patient, doctor, diagnosis…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={filterDoctor} onChange={e => setFilterDoctor(e.target.value)}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.85rem', background: '#fff', color: '#0f172a' }}>
          <option value="">All Doctors</option>
          {doctors.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.85rem', background: '#fff', color: '#0f172a' }}>
          <option value="">All Statuses</option>
          {['active', 'completed', 'cancelled', 'expired'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: '#ef4444', cursor: 'pointer' }}>
          <input type="checkbox" checked={filterFlagged} onChange={e => setFilterFlagged(e.target.checked)} />
          Flagged only
        </label>
        <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: 'auto' }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="admin-table-card">
        {loading ? (
          <div className="admin-empty"><p>Loading prescriptions…</p></div>
        ) : filtered.length === 0 ? (
          <div className="admin-empty"><p>No prescriptions match your filters.</p></div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Doctor</th>
                <th>Diagnosis</th>
                <th>Date</th>
                <th>Medications</th>
                <th>Status</th>
                <th>Flags</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(rx => (
                <tr key={rx.id}>
                  <td style={{ fontWeight: 600 }}>{rx.patientName || '—'}</td>
                  <td>{rx.doctorName || '—'}</td>
                  <td>{rx.diagnosis || '—'}</td>
                  <td>{rx.date || '—'}</td>
                  <td>{(rx.medications || []).length} drug{(rx.medications || []).length !== 1 ? 's' : ''}</td>
                  <td>
                    <span className={`badge ${
                      rx.status === 'active'    ? 'badge-green'  :
                      rx.status === 'cancelled' ? 'badge-red'    :
                      rx.status === 'expired'   ? 'badge-gray'   : 'badge-blue'
                    }`}>{rx.status || 'active'}</span>
                  </td>
                  <td>
                    {rx.warnings?.length > 0 ? (
                      <span className="badge badge-red">{rx.warnings.length}</span>
                    ) : (
                      <span className="badge badge-green">Clear</span>
                    )}
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => setSelected(rx)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="admin-modal-overlay" onClick={() => setSelected(null)}>
          <div className="admin-modal admin-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">Prescription Detail</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>Close</button>
            </div>
            <RxFullDetails rx={selected} />
          </div>
        </div>
      )}
    </div>
  );
}
