import React, { useState, useEffect } from 'react';
import { db } from '../../Auth/firebaseConfig';
import { collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';

const TABS = ['Patients', 'Doctors', 'Therapists', 'Pharmacies'];

export default function AdminUserManagement() {
  const [tab, setTab] = useState('Patients');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [acting, setActing] = useState(null);

  useEffect(() => { loadTab(tab); }, [tab]);

  const loadTab = async (t) => {
    setLoading(true);
    setData([]);
    try {
      let rows = [];
      if (t === 'Patients') {
        const snap = await getDocs(collection(db, 'auth'));
        rows = snap.docs.map(d => ({ id: d.id, ...d.data(), _collection: 'auth' }));
      } else if (t === 'Doctors') {
        const snap = await getDocs(collection(db, 'doctors'));
        rows = snap.docs.map(d => ({ id: d.id, ...d.data(), _collection: 'doctors' }));
      } else if (t === 'Therapists') {
        const snap = await getDocs(collection(db, 'therapists'));
        rows = snap.docs.map(d => ({ id: d.id, ...d.data(), _collection: 'therapists' })).filter(r => r.role !== 'admin');
      } else if (t === 'Pharmacies') {
        const snap = await getDocs(collection(db, 'pharmacies'));
        rows = snap.docs.map(d => ({ id: d.id, ...d.data(), _collection: 'pharmacies' }));
      }
      setData(rows);
    } catch (e) {
      console.error('UserManagement load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const setStatus = async (row, status) => {
    setActing(row.id);
    try {
      await updateDoc(doc(db, row._collection, row.id), { status });
      setData(prev => prev.map(r => r.id === row.id ? { ...r, status } : r));
    } catch (e) {
      alert('Could not update status. Try again.');
    } finally {
      setActing(null);
    }
  };

  const filtered = data.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (r.name         || '').toLowerCase().includes(q) ||
           (r.email        || '').toLowerCase().includes(q) ||
           (r.pharmacyName || '').toLowerCase().includes(q) ||
           (r.username     || '').toLowerCase().includes(q);
  });

  const getName = (r) => r.name || r.pharmacyName || r.displayName || r.email || '—';
  const getEmail = (r) => r.email || '—';
  const getStatus = (r) => r.status || 'active';

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">User Management</h1>
        <p className="admin-page-sub">View, approve, suspend, or activate accounts</p>
      </div>

      <div className="admin-tabs">
        {TABS.map(t => (
          <button key={t} className={`admin-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div className="admin-search">
          <span>🔍</span>
          <input placeholder={`Search ${tab.toLowerCase()}…`} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="admin-table-card">
        {loading ? (
          <div className="admin-empty"><p>Loading…</p></div>
        ) : filtered.length === 0 ? (
          <div className="admin-empty"><p>No {tab.toLowerCase()} found.</p></div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                {tab === 'Doctors' && <th>Specialization</th>}
                {tab === 'Pharmacies' && <th>Country</th>}
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const status = getStatus(row);
                return (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{getName(row)}</td>
                    <td>{getEmail(row)}</td>
                    {tab === 'Doctors' && <td>{row.specialization || '—'}</td>}
                    {tab === 'Pharmacies' && <td>{row.country || '—'}</td>}
                    <td>
                      <span className={`badge ${
                        status === 'active'    ? 'badge-green'  :
                        status === 'suspended' ? 'badge-red'    :
                        status === 'pending'   ? 'badge-yellow' : 'badge-gray'
                      }`}>{status}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {status !== 'active' && (
                          <button className="btn btn-sm btn-success" disabled={acting === row.id}
                            onClick={() => setStatus(row, 'active')}>Activate</button>
                        )}
                        {status !== 'suspended' && (
                          <button className="btn btn-sm btn-danger" disabled={acting === row.id}
                            onClick={() => setStatus(row, 'suspended')}>Suspend</button>
                        )}
                        {tab === 'Pharmacies' && status === 'pending' && (
                          <button className="btn btn-sm btn-primary" disabled={acting === row.id}
                            onClick={() => setStatus(row, 'active')}>Approve</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
