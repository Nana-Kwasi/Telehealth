import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { db, functions, httpsCallable } from '../../../services/firestoreShim';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from '../../../services/firestoreShim';
import useAddressAutofill from '../../../hooks/useAddressAutofill';

export default function PharmacyBranchDetail({ profile }) {
  const { branchId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const newCredsFromNav = location.state?.newCreds;
  const [showCredsBanner, setShowCredsBanner] = useState(!!newCredsFromNav);
  const [loading, setLoading] = useState(true);
  const [branch, setBranch] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [actioning, setActioning] = useState(false);
  const [pwReset, setPwReset] = useState({ busy: false, password: null });
  const [rxCount, setRxCount] = useState(null);
  const [branchRx, setBranchRx] = useState([]);
  const [branchEvents, setBranchEvents] = useState([]);
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofill();

  // Branches are keyed by the organization id, which equals the user id only for
  // self-registered pharmacies. Prefer the org id so admin-onboarded pharmacies
  // (user.id ≠ org.id) can still open and query their branches.
  const orgId = profile?.organizationId || profile?.id;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!branchId || !orgId) return;
      setLoading(true);
      setError('');
      try {
        const snap = await getDoc(doc(db, 'pharmacyBranches', branchId));
        if (!snap.exists()) {
          if (!cancelled) setError('Branch not found.');
          return;
        }
        const data = { id: snap.id, ...snap.data() };
        if (data.pharmacyId !== orgId) {
          if (!cancelled) setError('You do not have access to this branch.');
          return;
        }
        if (!cancelled) {
          setBranch(data);
          setForm({
            branchName: data.branchName || '',
            email: data.email || '',
            address: data.address || '',
            country: data.country || data.location?.country || '',
            city: data.city || data.location?.city || '',
            area: data.area || data.location?.area || '',
            region: data.region || data.location?.region || '',
            street: data.street || data.location?.street || '',
            ghanaDigitalAddress: data.ghanaDigitalAddress || '',
            latitude: data.latitude ?? data.location?.latitude ?? null,
            longitude: data.longitude ?? data.location?.longitude ?? null,
            contactNumber: data.contactNumber || '',
            status: data.status || 'active',
          });
        }
        const rxSnap = await getDocs(
          query(collection(db, 'doctorPrescriptions'), where('branchId', '==', branchId))
        );
        if (!cancelled) setRxCount(rxSnap.size);
      } catch (e) {
        console.error('Branch detail load error:', e);
        if (!cancelled) setError('Failed to load branch.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [branchId, orgId]);

  useEffect(() => {
    if (!branchId || !orgId) return undefined;
    const qRx = query(collection(db, 'doctorPrescriptions'), where('pharmacyId', '==', orgId));
    const qEvents = query(
      collection(db, 'pharmacyRxEvents'),
      where('pharmacyId', '==', orgId),
      where('branchId', '==', branchId),
      orderBy('createdAt', 'desc'),
    );
    const unsubRx = onSnapshot(qRx, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const list = all.filter(rx =>
        (rx.branchId || '') === branchId ||
        (rx.medications || []).some(m =>
          (m.transferFromBranchId || '') === branchId || (m.transferBranchId || '') === branchId || (m.transferRequestedByBranchId || '') === branchId
        )
      );
      list.sort((a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0));
      setBranchRx(list);
      setRxCount(list.length);
    }, () => {});
    const unsubEvents = onSnapshot(qEvents, snap => {
      setBranchEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return () => {
      unsubRx();
      unsubEvents();
    };
  }, [branchId, orgId]);

  // Roll up this branch's operational picture from the prescriptions touching it.
  const metrics = useMemo(() => {
    const m = { total: branchRx.length, delivered: 0, ready: 0, inProgress: 0, incoming: 0, transferredIn: 0, transferredOut: 0, medsTotal: 0 };
    for (const rx of branchRx) {
      const st = rx.pharmacyStatus || 'sent';
      if (st === 'delivered') m.delivered += 1;
      else if (st === 'ready') m.ready += 1;
      else if (st === 'sent') m.incoming += 1;
      else m.inProgress += 1;
      const meds = Array.isArray(rx.medications) ? rx.medications : [];
      m.medsTotal += meds.length;
      if (meds.some(d => (d.transferBranchId || '') === branchId)) m.transferredIn += 1;
      if (meds.some(d => (d.transferFromBranchId || '') === branchId || (d.transferRequestedByBranchId || '') === branchId)) m.transferredOut += 1;
    }
    return m;
  }, [branchRx, branchId]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form?.branchName?.trim() || !form?.email?.trim()) {
      setError('Branch name and email are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        branchName: form.branchName.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        country: (form.country || '').trim(),
        city: (form.city || '').trim(),
        area: (form.area || '').trim(),
        region: (form.region || '').trim(),
        street: (form.street || '').trim(),
        ghanaDigitalAddress: (form.ghanaDigitalAddress || '').trim(),
        latitude: Number.isFinite(Number(form.latitude)) ? Number(form.latitude) : null,
        longitude: Number.isFinite(Number(form.longitude)) ? Number(form.longitude) : null,
        location: {
          country: (form.country || '').trim(),
          city: (form.city || '').trim(),
          area: (form.area || '').trim(),
          region: (form.region || '').trim(),
          street: (form.street || '').trim(),
          latitude: Number.isFinite(Number(form.latitude)) ? Number(form.latitude) : null,
          longitude: Number.isFinite(Number(form.longitude)) ? Number(form.longitude) : null,
        },
        contactNumber: form.contactNumber.trim(),
        status: form.status || 'active',
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(db, 'pharmacyBranches', branchId), payload);
      setBranch(prev => ({ ...prev, ...payload }));
    } catch (e) {
      console.error('Save branch error:', e);
      setError('Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (next) => {
    if (!branch) return;
    setActioning(true);
    setError('');
    try {
      await updateDoc(doc(db, 'pharmacyBranches', branch.id), {
        status: next,
        updatedAt: serverTimestamp(),
      });
      setBranch(prev => ({ ...prev, status: next }));
      setForm(prev => ({ ...prev, status: next }));
    } catch (e) {
      setError('Failed to update status.');
    } finally {
      setActioning(false);
    }
  };

  const handleDelete = async () => {
    if (!branch) return;
    const linkedRx = await getDocs(
      query(collection(db, 'doctorPrescriptions'), where('branchId', '==', branch.id))
    );
    if (!linkedRx.empty) {
      setError(`Cannot delete: ${linkedRx.size} prescription(s) linked. Suspend instead.`);
      return;
    }
    if (!window.confirm(`Delete branch "${branch.branchName}"? This removes branch profile data only.`)) return;
    setActioning(true);
    setError('');
    try {
      await deleteDoc(doc(db, 'pharmacyBranches', branch.id));
      navigate('/dashboard/branches');
    } catch (e) {
      setError('Failed to delete branch.');
    } finally {
      setActioning(false);
    }
  };

  const resetBranchPassword = async () => {
    if (!branch) return;
    const ok = window.confirm(`Generate a new one-time password for "${branch.branchName}"? The branch operator must change it on next login.`);
    if (!ok) return;
    setPwReset({ busy: true, password: null });
    setError('');
    try {
      const fn = httpsCallable(functions, 'branchSetTemporaryPassword');
      const res = await fn({ branchId: branch.id });
      const password = res?.data?.temporaryPassword;
      if (!password) {
        setError('Could not generate a password. Please try again.');
        setPwReset({ busy: false, password: null });
        return;
      }
      setPwReset({ busy: false, password });
      setBranch(prev => ({ ...prev, mustChangePassword: true }));
    } catch (e) {
      console.error('Branch password reset error:', e);
      setError('Failed to reset branch password.');
      setPwReset({ busy: false, password: null });
    }
  };

  const toggleBranchMfaRequired = async () => {
    if (!branch) return;
    const next = branch.mfaRequired !== true;
    const ok = window.confirm(`${next ? 'Enable' : 'Disable'} MFA requirement for this branch operator?`);
    if (!ok) return;
    setActioning(true);
    setError('');
    try {
      await updateDoc(doc(db, 'pharmacyBranches', branch.id), {
        mfaRequired: next,
        updatedAt: serverTimestamp(),
      });
      setBranch(prev => ({ ...prev, mfaRequired: next }));
    } catch (e) {
      setError('Failed to update branch MFA requirement.');
    } finally {
      setActioning(false);
    }
  };

  if (loading) {
    return (
      <div className="pharmacy-page branch-admin-page">
        <div className="branch-admin-skeleton">
          <div className="branch-admin-skel-line branch-admin-skel-line--short" />
          <div className="branch-admin-skel-bar" />
          <div className="branch-admin-skel-sheet">
            <div className="branch-admin-skel-line" />
            <div className="branch-admin-skel-line branch-admin-skel-line--med" />
          </div>
        </div>
      </div>
    );
  }

  if (error && !branch) {
    return (
      <div className="pharmacy-page branch-admin-page">
        <button type="button" className="branch-admin-link-back" onClick={() => navigate('/dashboard/branches')}>
          ← Back to branches
        </button>
        <div className="branch-admin-banner branch-admin-banner--error">{error}</div>
      </div>
    );
  }

  const statusClass =
    branch.status === 'active' ? 'branch-admin-status branch-admin-status--on' :
    branch.status === 'suspended' ? 'branch-admin-status branch-admin-status--off' :
    'branch-admin-status branch-admin-status--neutral';

  const copyCreds = (c) => {
    const text = `Branch: ${c.branchName}\nUsername: ${c.username}\nPassword: ${c.tempPassword}\nEmail: ${c.email}`;
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div className="pharmacy-page branch-admin-page">
      {showCredsBanner && newCredsFromNav && (
        <div className="branch-admin-newcreds">
          <div className="branch-admin-newcreds-top">
            <strong>New branch — save operator credentials</strong>
            <button type="button" className="branch-admin-newcreds-close" onClick={() => setShowCredsBanner(false)} aria-label="Dismiss">×</button>
          </div>
          <div className="branch-admin-newcreds-grid">
            {[['Email', newCredsFromNav.email], ['Username', newCredsFromNav.username], ['Temporary password', newCredsFromNav.tempPassword]].map(([l, v]) => (
              <div key={l}>
                <div className="branch-admin-newcreds-l">{l}</div>
                <div className="branch-admin-newcreds-v">{v}</div>
              </div>
            ))}
          </div>
          <button type="button" className="branch-admin-btn branch-admin-btn--light" onClick={() => copyCreds(newCredsFromNav)}>Copy all</button>
        </div>
      )}

      <nav className="branch-admin-bc" aria-label="Breadcrumb">
        <button type="button" className="branch-admin-bc-link" onClick={() => navigate('/dashboard/branches')}>Manage branches</button>
        <span className="branch-admin-bc-sep" aria-hidden>/</span>
        <span className="branch-admin-bc-current">{branch.branchName}</span>
      </nav>

      <header className="branch-admin-toolbar">
        <div className="branch-admin-toolbar-main">
          <h1 className="branch-admin-title">{branch.branchName}</h1>
          <p className="branch-admin-meta">{profile?.pharmacyName} · Operator-facing branch record</p>
        </div>
        <div className="branch-admin-toolbar-actions">
          <span className={statusClass}>{branch.status || 'active'}</span>
          <button
            type="button"
            className="branch-admin-btn branch-admin-btn--quiet"
            disabled={actioning}
            onClick={toggleBranchMfaRequired}
          >
            {branch.mfaRequired ? 'Two-step sign-in: required' : 'Two-step sign-in: optional'}
          </button>
          <button
            type="button"
            className="branch-admin-btn branch-admin-btn--quiet"
            disabled={pwReset.busy}
            onClick={resetBranchPassword}
          >
            {pwReset.busy ? 'Resetting…' : 'Reset password'}
          </button>
          {branch.status !== 'suspended' ? (
            <button type="button" className="branch-admin-btn branch-admin-btn--warn" disabled={actioning} onClick={() => changeStatus('suspended')}>Suspend branch</button>
          ) : (
            <button type="button" className="branch-admin-btn branch-admin-btn--ok" disabled={actioning} onClick={() => changeStatus('active')}>Activate branch</button>
          )}
          <button type="button" className="branch-admin-btn branch-admin-btn--quiet" disabled={actioning} onClick={handleDelete}>Remove branch</button>
        </div>
      </header>

      {error && <div className="branch-admin-banner branch-admin-banner--error">{error}</div>}

      {pwReset.password && (
        <div className="branch-admin-newcreds">
          <div className="branch-admin-newcreds-top">
            <strong>One-time password — copy it now</strong>
            <button type="button" className="branch-admin-newcreds-close" onClick={() => setPwReset({ busy: false, password: null })} aria-label="Dismiss">×</button>
          </div>
          <div className="branch-admin-newcreds-grid">
            <div>
              <div className="branch-admin-newcreds-l">New temporary password for {branch.branchName}</div>
              <div className="branch-admin-newcreds-v">{pwReset.password}</div>
            </div>
          </div>
          <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0.25rem 0 0.5rem' }}>
            Share it with the branch operator securely. It is not shown again, and the operator must change it on next login.
          </p>
          <button
            type="button"
            className="branch-admin-btn branch-admin-btn--light"
            onClick={() => navigator.clipboard.writeText(pwReset.password).catch(() => {})}
          >
            Copy password
          </button>
        </div>
      )}

      <div className="branch-admin-sheet">
        <section className="branch-admin-block">
          <h2 className="branch-admin-h2">Operator access</h2>
          <p className="branch-admin-lead">How this branch signs in to NessaHub. Email matches the Firebase login for branch staff.</p>
          <div className="branch-admin-table-wrap">
            <table className="branch-admin-data-table">
              <tbody>
                <tr>
                  <th scope="row">Username</th>
                  <td className="branch-admin-mono">{branch.username || '—'}</td>
                </tr>
                <tr>
                  <th scope="row">Login email</th>
                  <td>{branch.email || '—'}</td>
                </tr>
                <tr>
                  <th scope="row">First-login password reset</th>
                  <td>
                    <span className={branch.mustChangePassword ? 'branch-admin-flag branch-admin-flag--bad' : 'branch-admin-flag branch-admin-flag--ok'}>
                      {branch.mustChangePassword ? 'Required' : 'Complete'}
                    </span>
                  </td>
                </tr>
                <tr>
                  <th scope="row">MFA requirement</th>
                  <td>
                    <span className={branch.mfaRequired ? 'branch-admin-flag branch-admin-flag--bad' : 'branch-admin-flag branch-admin-flag--ok'}>
                      {branch.mfaRequired ? 'Required' : 'Not required'}
                    </span>
                  </td>
                </tr>
                <tr>
                  <th scope="row">Prescriptions linked</th>
                  <td>{rxCount !== null ? rxCount : '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <div className="branch-admin-rule" />

        <section className="branch-admin-block">
          <h2 className="branch-admin-h2">Branch profile & directory</h2>
          <p className="branch-admin-lead">Contact and routing details shown internally and to prescribers where applicable.</p>
          <form onSubmit={handleSave} className="branch-admin-form">
            <div className="branch-admin-form-grid">
              <label className="branch-admin-label">
                Branch name *
                <input value={form.branchName} onChange={e => setForm(p => ({ ...p, branchName: e.target.value }))} required />
              </label>
              <label className="branch-admin-label">
                Branch email *
                <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required />
              </label>
              <label className="branch-admin-label branch-admin-label--full">
                Address / location code
                <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Street or Ghana Post GPS" />
              </label>
              <label className="branch-admin-label branch-admin-label--full">
                Location assist
                <button
                  type="button"
                  className="branch-admin-btn branch-admin-btn--ghost"
                  onClick={() => detectAddress((loc) => {
                    setForm(p => ({
                      ...p,
                      address: loc.address || p.address || '',
                      country: loc.countryCode || p.country || '',
                      city: loc.city || p.city || '',
                      area: loc.area || p.area || '',
                      region: loc.region || p.region || '',
                      street: loc.street || p.street || '',
                      latitude: loc.latitude ?? p.latitude ?? null,
                      longitude: loc.longitude ?? p.longitude ?? null,
                    }));
                  })}
                  disabled={locating}
                >
                  {locating ? 'Detecting...' : 'Use current location'}
                </button>
                {locationMsg ? <small>{locationMsg}</small> : null}
              </label>
              <label className="branch-admin-label">
                Country
                <input value={form.country || ''} onChange={e => setForm(p => ({ ...p, country: e.target.value }))} />
              </label>
              <label className="branch-admin-label">
                City
                <input value={form.city || ''} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
              </label>
              <label className="branch-admin-label">
                Area / locality
                <input value={form.area || ''} onChange={e => setForm(p => ({ ...p, area: e.target.value }))} />
              </label>
              <label className="branch-admin-label">
                Region / state
                <input value={form.region || ''} onChange={e => setForm(p => ({ ...p, region: e.target.value }))} />
              </label>
              <label className="branch-admin-label">
                Street
                <input value={form.street || ''} onChange={e => setForm(p => ({ ...p, street: e.target.value }))} />
              </label>
              <label className="branch-admin-label">
                Ghana digital address (optional)
                <input value={form.ghanaDigitalAddress || ''} onChange={e => setForm(p => ({ ...p, ghanaDigitalAddress: e.target.value }))} />
              </label>
              <label className="branch-admin-label">
                Latitude
                <input type="number" step="any" value={form.latitude ?? ''} onChange={e => setForm(p => ({ ...p, latitude: e.target.value }))} />
              </label>
              <label className="branch-admin-label">
                Longitude
                <input type="number" step="any" value={form.longitude ?? ''} onChange={e => setForm(p => ({ ...p, longitude: e.target.value }))} />
              </label>
              <label className="branch-admin-label">
                Contact phone
                <input value={form.contactNumber} onChange={e => setForm(p => ({ ...p, contactNumber: e.target.value }))} />
              </label>
              <label className="branch-admin-label">
                Account status
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
            </div>
            <div className="branch-admin-form-footer">
              <button type="submit" className="branch-admin-btn branch-admin-btn--primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save branch profile'}
              </button>
            </div>
          </form>
        </section>

        <div className="branch-admin-rule" />

        <section className="branch-admin-block">
          <h2 className="branch-admin-h2">Operations summary</h2>
          <p className="branch-admin-lead">At-a-glance totals for every prescription routed to, or transferred through, this branch.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
            {[
              ['Total prescriptions', metrics.total, '#1d4ed8'],
              ['Delivered', metrics.delivered, '#16a34a'],
              ['Ready', metrics.ready, '#0d9488'],
              ['In progress', metrics.inProgress, '#d97706'],
              ['Incoming', metrics.incoming, '#7c3aed'],
              ['Transferred in', metrics.transferredIn, '#0369a1'],
              ['Transferred out', metrics.transferredOut, '#be123c'],
              ['Medication lines', metrics.medsTotal, '#334155'],
            ].map(([label, val, color]) => (
              <div key={label} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.75rem 0.85rem', background: '#fff' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color }}>{val}</div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>{label}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="branch-admin-rule" />

        <section className="branch-admin-block">
          <h2 className="branch-admin-h2">Live branch operations</h2>
          <p className="branch-admin-lead">Everything this branch is currently processing: direct prescriptions, transfers, and fulfillment states.</p>
          <div className="branch-admin-table-wrap">
            <table className="branch-admin-data-table">
              <thead>
                <tr>
                  <th scope="col">Prescription</th>
                  <th scope="col">Patient</th>
                  <th scope="col">Pharmacy status</th>
                  <th scope="col">Drug statuses</th>
                  <th scope="col">Last update</th>
                </tr>
              </thead>
              <tbody>
                {branchRx.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ color: '#64748b' }}>No active or historical operations yet for this branch.</td>
                  </tr>
                ) : branchRx.slice(0, 80).map(rx => {
                  const meds = Array.isArray(rx.medications) ? rx.medications : [];
                  const statusMix = meds.reduce((acc, m) => {
                    const key = m.drugStatus || 'pending';
                    acc[key] = (acc[key] || 0) + 1;
                    return acc;
                  }, {});
                  const statusText = Object.entries(statusMix).map(([k, v]) => `${k} (${v})`).join(', ') || '—';
                  return (
                    <tr
                      key={rx.id}
                      style={{ cursor: 'pointer' }}
                      title="Open prescription operations"
                      onClick={() => navigate(`/dashboard/prescriptions/${rx.id}`)}
                    >
                      <td>{rx.prescriptionRef || rx.id.slice(0, 8)}</td>
                      <td>{rx.patientName || '—'}</td>
                      <td>{rx.pharmacyStatus || 'sent'}</td>
                      <td>{statusText}</td>
                      <td>{rx.updatedAt?.toDate?.()?.toLocaleString?.() || rx.createdAt?.toDate?.()?.toLocaleString?.() || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="branch-admin-rule" />

        <section className="branch-admin-block">
          <h2 className="branch-admin-h2">Branch activity trail</h2>
          <p className="branch-admin-lead">Append-only events for status transitions and actions performed by this branch team.</p>
          <div className="branch-admin-table-wrap">
            <table className="branch-admin-data-table">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Action</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Rx</th>
                  <th scope="col">Transition</th>
                </tr>
              </thead>
              <tbody>
                {branchEvents.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ color: '#64748b' }}>No branch events recorded yet.</td>
                  </tr>
                ) : branchEvents.slice(0, 120).map(evt => (
                  <tr key={evt.id}>
                    <td>{evt.createdAt?.toDate?.()?.toLocaleString?.() || '—'}</td>
                    <td>{evt.action || '—'}</td>
                    <td>{evt.actorName || 'Branch user'}</td>
                    <td>{evt.rxId ? evt.rxId.slice(0, 10) : '—'}</td>
                    <td>{[evt.fromStatus || '—', evt.toStatus || '—'].join(' -> ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
