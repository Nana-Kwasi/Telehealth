import React, { useState, useEffect } from 'react';
import { db } from '../../../services/firestoreShim';
import { collection, getDocs, doc, updateDoc, serverTimestamp } from '../../../services/firestoreShim';

export default function AdminAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter]     = useState('');
  const [sourceFilter, setSourceFilter] = useState(''); // 'doctor' | 'therapy'
  const [selected, setSelected]         = useState(null);
  const [acting, setActing]             = useState(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load users, appointments, and therapy sessions in parallel
      const [authSnap, clientSnap, drSnap, thSnap, hcSnap] = await Promise.all([
        getDocs(collection(db, 'auth')),
        getDocs(collection(db, 'clients')),
        getDocs(collection(db, 'doctorAppointments')),
        getDocs(collection(db, 'scheduledCalls')),
        getDocs(collection(db, 'homeCareBookings')),
      ]);

      // Build name lookup maps so we can resolve "Patient" → real name
      const authMap = {};
      authSnap.docs.forEach(d => {
        const data = d.data();
        authMap[d.id] = data.name || data.displayName || data.email || null;
        if (data.uid) authMap[data.uid] = authMap[d.id];
      });
      const clientMap = {};
      clientSnap.docs.forEach(d => {
        const data = d.data();
        clientMap[d.id] = data.name || data.displayName || data.email || null;
        if (data.uid) clientMap[data.uid] = clientMap[d.id];
      });

      const resolveName = (raw, id) => {
        // If stored name is a real name (not a generic fallback), use it
        const GENERIC = ['patient', 'client', 'user', '—', '', null, undefined];
        if (!GENERIC.includes((raw || '').toLowerCase().trim())) return raw;
        // Otherwise look up from our maps
        if (!id) return raw || 'Unknown';
        return authMap[id] || clientMap[id] || raw || `ID: ${id.slice(-6)}`;
      };

      const drList = drSnap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id, ...data, _source: 'doctor',
          _patientDisplay: resolveName(data.clientName || data.patientName, data.clientId || data.patientId),
          _doctorDisplay:  data.doctorName || '—',
        };
      });

      const thList = thSnap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id, ...data, _source: 'therapy',
          _patientDisplay: resolveName(data.clientName || data.patientName, data.clientId || data.patientId),
          _doctorDisplay:  data.therapistName || '—',
        };
      });

      const hcList = hcSnap.docs.map((d) => {
        const data = d.data();
        const st = (data.status || 'pending').toLowerCase();
        return {
          id: d.id,
          ...data,
          _source: 'homecare',
          status: st,
          _patientDisplay: resolveName(data.patientName, data.patientId),
          _doctorDisplay: data.nurseName || '—',
        };
      });

      const all = [...drList, ...thList, ...hcList];
      all.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setAppointments(all);
    } catch (e) {
      console.error('Appointments load error:', e);
    } finally { setLoading(false); }
  };

  const setStatus = async (appt, status) => {
    if (appt._source === 'homecare') return;
    setActing(appt.id);
    const colName = appt._source === 'therapy' ? 'scheduledCalls' : 'doctorAppointments';
    try {
      await updateDoc(doc(db, colName, appt.id), { status, updatedAt: serverTimestamp() });
      setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, status } : a));
      if (selected?.id === appt.id) setSelected(s => ({ ...s, status }));
    } catch { alert('Could not update appointment.'); }
    finally { setActing(null); }
  };

  const statuses = [...new Set(appointments.map(a => a.status).filter(Boolean))];
  const types    = [...new Set(appointments.map(a => a.type || a.sessionType || a.appointmentType).filter(Boolean))];

  const filtered = appointments.filter(a => {
    if (sourceFilter && a._source !== sourceFilter) return false;
    if (statusFilter && a.status !== statusFilter) return false;
    if (typeFilter && (a.type || a.sessionType || a.appointmentType) !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return [a._patientDisplay, a._doctorDisplay, a.reason, a.chiefComplaint, a.type, a.sessionType, a.clientId, a.patientId, a.address, a.bookingType, a.careType]
        .some(v => (v || '').toLowerCase().includes(q));
    }
    return true;
  });

  const stats = {
    total:     appointments.length,
    doctor:    appointments.filter(a => a._source === 'doctor').length,
    therapy:   appointments.filter(a => a._source === 'therapy').length,
    homecare:  appointments.filter(a => a._source === 'homecare').length,
    upcoming:  appointments.filter((a) => {
      if (a._source === 'homecare') {
        return ['pending', 'accepted', 'en_route', 'arrived', 'in_progress', 'ongoing'].includes((a.status || '').toLowerCase());
      }
      return ['upcoming', 'confirmed', 'pending', 'scheduled'].includes((a.status || '').toLowerCase());
    }).length,
    completed: appointments.filter((a) => (a.status || '').toLowerCase() === 'completed').length,
    cancelled: appointments.filter((a) => {
      const s = (a.status || '').toLowerCase();
      if (a._source === 'homecare') return s === 'cancelled' || s === 'declined';
      return s === 'cancelled' || s === 'no-show';
    }).length,
  };

  const fmtDate = ts => ts?.seconds
    ? new Date(ts.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : (typeof ts === 'string' ? ts : '—');
  const fmtFull = ts => ts?.seconds
    ? new Date(ts.seconds * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : (typeof ts === 'string' ? ts : '—');

  const statusBadge = (s) => {
    const cls =
      ['completed'].includes(s)       ? 'badge-green'  :
      ['cancelled', 'no-show'].includes(s) ? 'badge-red' :
      ['upcoming', 'confirmed'].includes(s) ? 'badge-yellow' :
      ['pending'].includes(s)          ? 'badge-orange' : 'badge-gray';
    return <span className={`badge ${cls}`}>{s || 'scheduled'}</span>;
  };

  // Build all raw fields for the modal
  const SKIP_RAW = ['_source', '_patientDisplay', '_doctorDisplay'];

  const typeBadge = (appt) => {
    if (appt._source === 'therapy') return { cls: 'badge-purple', label: 'Therapy' };
    if (appt._source === 'homecare') return { cls: 'badge-green', label: 'Home care' };
    return { cls: 'badge-blue', label: 'Doctor' };
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Appointment Monitor</h1>
          <p className="admin-page-sub">Doctor appointments, therapy sessions, and home care bookings</p>
        </div>
        <button className="btn btn-primary" onClick={loadData}>Refresh</button>
      </div>

      {/* Stats */}
      <div className="admin-stats-grid" style={{ marginBottom: '1.5rem' }}>
        {[
          { label: 'Total',          val: stats.total,     color: '#2f5e40', bg: '#e9f3ec', icon: '📅' },
          { label: 'Doctor Appts',   val: stats.doctor,    color: '#059669', bg: '#f0fdf4', icon: '🩺' },
          { label: 'Therapy Sessions', val: stats.therapy, color: '#7c3aed', bg: '#faf5ff', icon: '🧠' },
          { label: 'Home care',      val: stats.homecare,  color: '#0d9488', bg: '#f0fdfa', icon: '🏠' },
          { label: 'Upcoming',       val: stats.upcoming,  color: '#d97706', bg: '#fffbeb', icon: '⏰' },
          { label: 'Completed',      val: stats.completed, color: '#16a34a', bg: '#f0fdf4', icon: '✅' },
          { label: 'Cancelled',      val: stats.cancelled, color: '#dc2626', bg: '#fef2f2', icon: '❌' },
        ].map(s => (
          <div key={s.label} className="admin-stat-card">
            <div className="admin-stat-icon" style={{ background: s.bg }}>{s.icon}</div>
            <div>
              <div className="admin-stat-value" style={{ color: s.color }}>{s.val}</div>
              <div className="admin-stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem', alignItems: 'center' }}>
        <div className="admin-search" style={{ maxWidth: 300 }}>
          <span>🔍</span>
          <input placeholder="Search patient, doctor, reason…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Source filter */}
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {[['', 'All'], ['doctor', '🩺 Doctor'], ['therapy', '🧠 Therapy'], ['homecare', '🏠 Home care']].map(([val, label]) => (
            <button key={val} onClick={() => setSourceFilter(val)}
              style={{
                padding: '0.45rem 0.8rem', borderRadius: 8, border: '1.5px solid',
                borderColor: sourceFilter === val ? '#3f7a55' : '#e2e8f0',
                background: sourceFilter === val ? '#e9f3ec' : '#fff',
                color: sourceFilter === val ? '#3f7a55' : '#64748b',
                fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
              }}>
              {label}
            </button>
          ))}
        </div>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.85rem', background: '#fff', color: '#0f172a' }}>
          <option value="">All Statuses</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {types.length > 0 && (
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.85rem', background: '#fff', color: '#0f172a' }}>
            <option value="">All Types</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}

        <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: 'auto' }}>
          {filtered.length} of {appointments.length} result{appointments.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="admin-table-card">
        {loading ? (
          <div className="admin-empty"><p>Loading appointments…</p></div>
        ) : filtered.length === 0 ? (
          <div className="admin-empty"><p>No appointments match your filters.</p></div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Patient / Client</th>
                <th>Provider</th>
                <th>Date / Time</th>
                <th>Visit Type</th>
                <th>Reason</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(appt => (
                <tr key={`${appt._source}-${appt.id}`}>
                  <td>
                    <span className={`badge ${typeBadge(appt).cls}`}>
                      {typeBadge(appt).label}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{appt._patientDisplay}</td>
                  <td style={{ fontSize: '0.82rem' }}>
                    {appt._source === 'therapy'
                      ? (appt.therapistName || appt._doctorDisplay || '—')
                      : appt._source === 'homecare'
                        ? (appt.nurseName || appt._doctorDisplay || '—')
                        : (appt.doctorName ? `Dr. ${appt.doctorName}` : '—')}
                  </td>
                  <td style={{ fontSize: '0.8rem' }}>
                    <div>{appt.date || appt.startDate || fmtDate(appt.scheduledAt || appt.appointmentDate || appt.createdAt)}</div>
                    {appt.time && <div style={{ color: '#64748b' }}>{appt.time}</div>}
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>{appt.type || appt.sessionType || appt.appointmentType || appt.bookingType || appt.careType || '—'}</td>
                  <td style={{ fontSize: '0.8rem', maxWidth: 160 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {appt.reason || appt.chiefComplaint || appt.specialNotes || appt.notes || '—'}
                    </div>
                  </td>
                  <td>{statusBadge(appt.status)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setSelected(appt)}>View</button>
                      {appt._source !== 'homecare' && ['upcoming', 'pending', 'confirmed', 'scheduled'].includes(appt.status) && (
                        <button className="btn btn-sm" disabled={acting === appt.id}
                          style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '0.72rem' }}
                          onClick={() => setStatus(appt, 'cancelled')}>Cancel</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Full Detail Modal */}
      {selected && (
        <div className="admin-modal-overlay" onClick={() => setSelected(null)}>
          <div className="admin-modal admin-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">
                {selected._source === 'therapy'
                  ? '🧠 Therapy Session — Full Detail'
                  : selected._source === 'homecare'
                    ? '🏠 Home Care Booking — Full Detail'
                    : '🩺 Doctor Appointment — Full Detail'}
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>✕</button>
            </div>

            {selected._source === 'homecare' ? (
            <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {[
                ['Patient', selected._patientDisplay],
                ['Nurse', selected.nurseName || '—'],
                ['Patient ID', selected.patientId || '—'],
                ['Nurse ID', selected.nurseId || '—'],
                ['Booking type', selected.bookingType || (selected.isEmergency ? 'emergency' : '—')],
                ['Care type', selected.careType || '—'],
                ['Duration', selected.durationType || '—'],
                ['Status', selected.status || '—'],
                ['Start date', selected.startDate || '—'],
                ['End date', selected.endDate || '—'],
                ['Address', selected.address || '—'],
                ['Reference fee', selected.referenceFeeAmount != null ? String(selected.referenceFeeAmount) : '—'],
                ['Record ID', selected.id],
                ['Created', fmtFull(selected.createdAt)],
                ['Updated', fmtFull(selected.updatedAt)],
              ].map(([label, val]) => (
                <div key={label} className="admin-info-row">
                  <span className="admin-info-label">{label}</span>
                  <span className="admin-info-value" style={{ fontFamily: label.includes('ID') ? 'monospace' : undefined, fontSize: label.includes('ID') ? '0.72rem' : undefined }}>
                    {val || '—'}
                  </span>
                </div>
              ))}
            </div>
            {selected.specialNotes ? (
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: '0.85rem', marginBottom: '1rem', fontSize: '0.82rem' }}>
                <b>Care notes:</b> {selected.specialNotes}
              </div>
            ) : null}
            <details style={{ marginBottom: '1rem' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, color: '#64748b', marginBottom: '0.5rem' }}>
                Show all raw fields
              </summary>
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: '0.85rem', marginTop: '0.5rem' }}>
                {Object.entries(selected)
                  .filter(([k]) => !SKIP_RAW.includes(k))
                  .map(([k, v]) => {
                    const display = typeof v === 'object' && v !== null
                      ? (v.seconds ? fmtFull(v) : JSON.stringify(v))
                      : String(v ?? '—');
                    return (
                      <div key={k} style={{ display: 'flex', gap: '0.75rem', padding: '0.3rem 0', borderBottom: '1px solid #e2e8f0', fontSize: '0.78rem' }}>
                        <span style={{ minWidth: 160, fontWeight: 700, color: '#64748b', fontFamily: 'monospace' }}>{k}</span>
                        <span style={{ color: '#0f172a', wordBreak: 'break-word' }}>{display}</span>
                      </div>
                    );
                  })}
              </div>
            </details>
            <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>Close</button>
            </div>
            </>
            ) : (
            <>
            {/* Core fields - always shown */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {[
                ['Patient / Client',   selected._patientDisplay],
                ['Provider',           selected._source === 'therapy' ? (selected.therapistName || '—') : (selected.doctorName ? `Dr. ${selected.doctorName}` : '—')],
                ['Date',               selected.date || fmtDate(selected.scheduledAt || selected.appointmentDate)],
                ['Time',               selected.time || fmtFull(selected.scheduledAt) || '—'],
                ['Visit Type',         selected.type || selected.sessionType || selected.appointmentType || '—'],
                ['Mode',               selected.mode || selected.visitType || selected.consultationMode || '—'],
                ['Status',             selected.status || 'scheduled'],
                ['Source',             selected._source === 'therapy' ? 'Therapy (scheduledCalls)' : 'Doctor (doctorAppointments)'],
                ['Reason / Complaint', selected.reason || selected.chiefComplaint || '—'],
                ['Client ID',          selected.clientId || selected.patientId || '—'],
                ['Doctor / Therapist ID', selected.doctorId || selected.therapistId || '—'],
                ['Record ID',          selected.id],
                ['Created At',         fmtFull(selected.createdAt)],
                ['Updated At',         fmtFull(selected.updatedAt || selected.statusUpdatedAt)],
              ].map(([label, val]) => (
                <div key={label} className="admin-info-row">
                  <span className="admin-info-label">{label}</span>
                  <span className="admin-info-value" style={{ fontFamily: label.includes('ID') ? 'monospace' : undefined, fontSize: label.includes('ID') ? '0.72rem' : undefined }}>
                    {val || '—'}
                  </span>
                </div>
              ))}
            </div>

            {/* Notes / additional */}
            {(selected.notes || selected.doctorNotes || selected.sessionNotes) && (
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: '0.85rem', marginBottom: '1rem', fontSize: '0.82rem' }}>
                <b>Notes:</b> {selected.notes || selected.doctorNotes || selected.sessionNotes}
              </div>
            )}

            {/* Vital signs if present */}
            {selected.vitalSigns && Object.keys(selected.vitalSigns).length > 0 && (
              <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '0.85rem', marginBottom: '1rem', fontSize: '0.82rem' }}>
                <b>Vital Signs:</b>
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                  {Object.entries(selected.vitalSigns).map(([k, v]) => (
                    <span key={k} style={{ background: '#dcfce7', padding: '2px 8px', borderRadius: 6, color: '#065f46' }}>{k}: {v}</span>
                  ))}
                </div>
              </div>
            )}

            {/* ALL raw fields */}
            <details style={{ marginBottom: '1rem' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, color: '#64748b', marginBottom: '0.5rem' }}>
                Show All Raw Fields
              </summary>
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: '0.85rem', marginTop: '0.5rem' }}>
                {Object.entries(selected)
                  .filter(([k]) => !SKIP_RAW.includes(k))
                  .map(([k, v]) => {
                    const display = typeof v === 'object' && v !== null
                      ? (v.seconds ? fmtFull(v) : JSON.stringify(v))
                      : String(v ?? '—');
                    return (
                      <div key={k} style={{ display: 'flex', gap: '0.75rem', padding: '0.3rem 0', borderBottom: '1px solid #e2e8f0', fontSize: '0.78rem' }}>
                        <span style={{ minWidth: 160, fontWeight: 700, color: '#64748b', fontFamily: 'monospace' }}>{k}</span>
                        <span style={{ color: '#0f172a', wordBreak: 'break-word' }}>{display}</span>
                      </div>
                    );
                  })}
              </div>
            </details>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
              {['upcoming', 'pending', 'confirmed', 'scheduled'].includes(selected.status) && (
                <button className="btn btn-danger btn-sm" disabled={acting === selected.id}
                  onClick={() => setStatus(selected, 'cancelled')}>Cancel Appointment</button>
              )}
              {selected.status === 'cancelled' && (
                <button className="btn btn-success btn-sm" disabled={acting === selected.id}
                  onClick={() => setStatus(selected, 'upcoming')}>Restore</button>
              )}
              {selected.status !== 'completed' && (
                <button className="btn btn-sm" style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}
                  disabled={acting === selected.id}
                  onClick={() => setStatus(selected, 'completed')}>Mark Completed</button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>Close</button>
            </div>
            </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
