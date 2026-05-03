import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../Auth/firebaseConfig';
import { collection, getDocs } from 'firebase/firestore';

const TABS = [
  { key: 'Medical Patients', col: 'auth',       icon: '🤒', roleLabel: 'Medical Patient' },
  { key: 'Clients',          col: 'clients',    icon: '🧘', roleLabel: 'Therapy Client'  },
  { key: 'Doctors',      col: 'doctors',        icon: '🩺', roleLabel: 'Doctor'          },
  { key: 'Therapists',   col: 'therapists',     icon: '🧠', roleLabel: 'Therapist'       },
  { key: 'Pharmacies',   col: 'pharmacies',     icon: '💊', roleLabel: 'Pharmacy'        },
  { key: 'Labs',         col: 'labs',           icon: '🧪', roleLabel: 'Lab Center'      },
  { key: 'Scan Centers', col: 'scanCenters',    icon: '🩻', roleLabel: 'Imaging Center'  },
];

export default function AdminUserManagement() {
  const navigate = useNavigate();
  const [tab, setTab]           = useState('Medical Patients');
  const [data, setData]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [counts, setCounts]     = useState({});

  useEffect(() => { loadAllCounts(); }, []);
  useEffect(() => { loadTab(tab); setSearch(''); setStatusFilter(''); }, [tab]);

  const loadAllCounts = async () => {
    try {
      const results = await Promise.all(TABS.map(t => getDocs(collection(db, t.col))));
      const c = {};
      TABS.forEach((t, i) => { c[t.key] = results[i].size; });
      setCounts(c);
    } catch {}
  };

  const loadTab = async (t) => {
    setLoading(true); setData([]);
    const tabCfg = TABS.find(x => x.key === t);
    if (!tabCfg) return;
    try {
      const snap = await getDocs(collection(db, tabCfg.col));
      const PROVIDER_ROLES = new Set(['doctor','therapist','admin','pharmacy','lab','scan','branch_user','pharmacist']);
      let rows = snap.docs.map(d => ({ id: d.id, ...d.data(), _col: tabCfg.col, _roleLabel: tabCfg.roleLabel }));
      // Medical Patients tab: auth collection minus any provider accounts
      if (t === 'Medical Patients') rows = rows.filter(r => !PROVIDER_ROLES.has(r.role));
      rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setData(rows);
    } catch (e) {
      console.error('UserManagement load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const getName    = r => r.name || r.pharmacyName || r.labName || r.scanCenterName || r.centerName || r.displayName || r.email || '—';
  const getEmail   = r => r.email || '—';
  const getPhone   = r => r.phone || r.phoneNumber || '—';
  const getStatus  = r => r.status || 'active';
  const getJoined  = r => r.createdAt?.seconds
    ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : (typeof r.createdAt === 'string' ? r.createdAt.slice(0, 10) : '—');

  const statusBadge = (s) => {
    const cls = s === 'active' ? 'badge-green' : s === 'suspended' ? 'badge-red' : s === 'pending' ? 'badge-yellow' : 'badge-gray';
    return <span className={`badge ${cls}`}>{s}</span>;
  };

  const filtered = data.filter(r => {
    if (statusFilter && getStatus(r) !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [getName(r), getEmail(r), getPhone(r), r.specialization, r.specialties?.join?.(','),
      r.licenseNumber, r.country, r.city]
      .some(v => (v || '').toLowerCase().includes(q));
  });

  const statusCounts = {};
  data.forEach(r => { const s = getStatus(r); statusCounts[s] = (statusCounts[s] || 0) + 1; });

  const tabCfg = TABS.find(x => x.key === tab);

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">User Management</h1>
          <p className="admin-page-sub">Click any user to view full profile and apply super admin actions</p>
        </div>
        <button className="btn btn-primary" onClick={() => { loadAllCounts(); loadTab(tab); }}>↻ Refresh</button>
      </div>

      {/* Entity tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: '0.45rem 0.9rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600,
              fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
              background: tab === t.key ? '#1d4ed8' : '#f1f5f9',
              color: tab === t.key ? '#fff' : '#475569', transition: 'all 0.15s',
            }}>
            {t.icon} {t.key}
            <span style={{
              background: tab === t.key ? 'rgba(255,255,255,0.25)' : '#e2e8f0',
              color: tab === t.key ? '#fff' : '#64748b',
              borderRadius: 20, padding: '1px 7px', fontSize: '0.7rem', fontWeight: 800,
            }}>{counts[t.key] ?? '…'}</span>
          </button>
        ))}
      </div>

      {/* Status filter pills */}
      {Object.keys(statusCounts).length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {Object.entries(statusCounts).map(([s, n]) => (
            <button key={s} onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
              style={{
                padding: '0.25rem 0.8rem', borderRadius: 20, fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${s === 'active' ? '#16a34a' : s === 'suspended' ? '#dc2626' : s === 'pending' ? '#d97706' : '#94a3b8'}`,
                background: statusFilter === s ? (s === 'active' ? '#16a34a' : s === 'suspended' ? '#dc2626' : s === 'pending' ? '#d97706' : '#94a3b8') : '#fff',
                color: statusFilter === s ? '#fff' : (s === 'active' ? '#16a34a' : s === 'suspended' ? '#dc2626' : s === 'pending' ? '#d97706' : '#94a3b8'),
              }}>
              {s.charAt(0).toUpperCase() + s.slice(1)}: {n}
            </button>
          ))}
          {statusFilter && (
            <button onClick={() => setStatusFilter('')}
              style={{ padding: '0.25rem 0.7rem', borderRadius: 20, border: '1.5px solid #e2e8f0', background: 'transparent', color: '#94a3b8', fontSize: '0.76rem', cursor: 'pointer' }}>
              ✕ Clear
            </button>
          )}
        </div>
      )}

      {/* Search + count */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div className="admin-search">
          <span>🔍</span>
          <input placeholder={`Search ${tab.toLowerCase()}…`} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{filtered.length} of {data.length} record{data.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="admin-table-card">
        {loading ? (
          <div className="admin-empty"><p>Loading {tab.toLowerCase()}…</p></div>
        ) : filtered.length === 0 ? (
          <div className="admin-empty">
            <p>No {tab.toLowerCase()} found.</p>
            {data.length === 0 && !loading && (
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '4px 0 0' }}>
                No records exist in the {tabCfg?.col} collection yet.
              </p>
            )}
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name / ID</th>
                <th>Email</th>
                <th>Phone</th>
                {(tab === 'Doctors' || tab === 'Therapists') && <th>Specialization</th>}
                {(tab === 'Pharmacies' || tab === 'Labs' || tab === 'Scan Centers') && <th>Location</th>}
                {tab === 'Medical Patients' && <th>National ID</th>}
                <th>Joined</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => (
                <tr key={row.id} style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/dashboard/users/${row._col}/${row.id}`)}>
                  <td style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{idx + 1}</td>
                  <td>
                    <div style={{ fontWeight: 700, color: '#1d4ed8', fontSize: '0.85rem', textDecoration: 'underline' }}>{getName(row)}</div>
                    {row.licenseNumber && <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Lic: {row.licenseNumber}</div>}
                    {row.role && <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{row.role}</div>}
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>{getEmail(row)}</td>
                  <td style={{ fontSize: '0.82rem' }}>{getPhone(row)}</td>
                  {(tab === 'Doctors' || tab === 'Therapists') && (
                    <td style={{ fontSize: '0.8rem' }}>{row.specialization || (Array.isArray(row.specialties) ? row.specialties[0] : row.specialties) || '—'}</td>
                  )}
                  {(tab === 'Pharmacies' || tab === 'Labs' || tab === 'Scan Centers') && (
                    <td style={{ fontSize: '0.8rem' }}>{row.city || row.location?.city || '—'}, {row.country || row.location?.country || '—'}</td>
                  )}
                  {tab === 'Medical Patients' && (
                    <td style={{ fontSize: '0.8rem' }}>{row.nationalId || row.ghanaCard || '—'}</td>
                  )}
                  <td style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{getJoined(row)}</td>
                  <td onClick={e => e.stopPropagation()}>{statusBadge(getStatus(row))}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn btn-primary btn-sm" style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem' }}
                      onClick={() => navigate(`/dashboard/users/${row._col}/${row.id}`)}>
                      View →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
