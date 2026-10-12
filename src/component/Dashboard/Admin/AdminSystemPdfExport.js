import React, { useState, useCallback } from 'react';
import { collection, getDocs } from '../../../services/firestoreShim';
import { db } from '../../../services/firestoreShim';
import { downloadNessaHubSystemPdf } from '../../../utils/nessahubOperationalPdf';
import { toMillis, parseRangeBounds } from '../../../utils/pharmacyReportMetrics';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function inCreatedRange(docData, startMs, endMs) {
  const t = toMillis(docData.createdAt);
  return t >= startMs && t <= endMs;
}

export default function AdminSystemPdfExport() {
  const [dateFrom, setDateFrom] = useState(() => daysAgoISO(30));
  const [dateTo, setDateTo] = useState(() => todayISO());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [lastSummary, setLastSummary] = useState(null);

  const runExport = useCallback(async () => {
    setErr('');
    if (!dateFrom || !dateTo || new Date(dateFrom) > new Date(dateTo)) {
      setErr('Choose a valid date range.');
      return;
    }
    const { startMs, endMs } = parseRangeBounds(dateFrom, dateTo);
    setBusy(true);
    try {
      const [
        authSnap, doctorsSnap, therapistsSnap, pharmSnap, branchesSnap,
        rxSnap, apptSnap, therapySnap, hcNursesSnap, hcBookingsSnap, labsSnap, scansSnap, diagSnap, eventsSnap,
      ] = await Promise.all([
        getDocs(collection(db, 'auth')),
        getDocs(collection(db, 'doctors')),
        getDocs(collection(db, 'therapists')),
        getDocs(collection(db, 'pharmacies')),
        getDocs(collection(db, 'pharmacyBranches')),
        getDocs(collection(db, 'doctorPrescriptions')),
        getDocs(collection(db, 'doctorAppointments')),
        getDocs(collection(db, 'scheduledCalls')),
        getDocs(collection(db, 'homeCareNurses')),
        getDocs(collection(db, 'homeCareBookings')),
        getDocs(collection(db, 'labs')),
        getDocs(collection(db, 'scanCenters')),
        getDocs(collection(db, 'diagnosticOrders')),
        getDocs(collection(db, 'pharmacyRxEvents')),
      ]);

      const allRx = rxSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const rxIn = allRx.filter(r => inCreatedRange(r, startMs, endMs));
      const appts = apptSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => inCreatedRange(a, startMs, endMs));
      const therapyCalls = therapySnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => {
        let t = toMillis(c.createdAt);
        if (!t) t = toMillis(c.scheduledTime);
        return t >= startMs && t <= endMs;
      });
      const hcBookings = hcBookingsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((b) => inCreatedRange(b, startMs, endMs));
      const diag = diagSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => inCreatedRange(o, startMs, endMs));
      const events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => inCreatedRange(e, startMs, endMs));

      const pharmDocs = pharmSnap.docs.map(d => d.data());
      const roleCounts = {};
      authSnap.docs.forEach(d => {
        const r = (d.data().role || 'unknown').toLowerCase();
        roleCounts[r] = (roleCounts[r] || 0) + 1;
      });

      const rxDocStatus = {};
      rxIn.forEach(r => {
        const s = (r.status || 'active').toLowerCase();
        rxDocStatus[s] = (rxDocStatus[s] || 0) + 1;
      });
      const rxPharmStatus = {};
      rxIn.filter(r => r.pharmacyId).forEach(r => {
        const s = (r.pharmacyStatus || 'sent').toLowerCase();
        rxPharmStatus[s] = (rxPharmStatus[s] || 0) + 1;
      });

      const apptBy = { upcoming: 0, completed: 0, cancelled: 0, 'no-show': 0, other: 0 };
      [...appts, ...therapyCalls].forEach((a) => {
        const s = (a.status || 'upcoming').toLowerCase();
        if (s in apptBy) apptBy[s] += 1;
        else apptBy.other += 1;
      });

      const hcBy = { pending: 0, active: 0, completed: 0, cancelled: 0, other: 0 };
      const hcActive = new Set(['accepted', 'en_route', 'arrived', 'in_progress', 'ongoing']);
      hcBookings.forEach((b) => {
        const s = (b.status || 'pending').toLowerCase();
        if (s === 'pending') hcBy.pending += 1;
        else if (s === 'completed') hcBy.completed += 1;
        else if (s === 'cancelled' || s === 'declined') hcBy.cancelled += 1;
        else if (hcActive.has(s)) hcBy.active += 1;
        else hcBy.other += 1;
      });

      const diagBy = { lab: 0, scan: 0, other: 0 };
      diag.forEach(o => {
        const t = (o.centerType || 'lab').toLowerCase();
        if (t === 'lab') diagBy.lab += 1;
        else if (t === 'scan') diagBy.scan += 1;
        else diagBy.other += 1;
      });

      const sections = [
        {
          heading: 'Platform directory (all time)',
          rows: [
            ['Patient / auth records (auth collection)', String(authSnap.size)],
            ['Doctors', String(doctorsSnap.size)],
            ['Therapists', String(therapistsSnap.size)],
            ['Home care nurses', String(hcNursesSnap.size)],
            ['Therapy sessions (all time)', String(therapySnap.size)],
            ['Home care bookings (all time)', String(hcBookingsSnap.size)],
            ['Parent pharmacies', String(pharmSnap.size)],
            ['Pharmacy branches', String(branchesSnap.size)],
            ['Labs', String(labsSnap.size)],
            ['Scan centers', String(scansSnap.size)],
            ['Doctor prescriptions (all time, total docs)', String(rxSnap.size)],
          ],
        },
        {
          heading: 'Auth records by role (all time)',
          rows: Object.entries(roleCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, String(v)]),
        },
        {
          heading: `Prescriptions created in period (${rxIn.length})`,
          rows: [
            ['Total in range', String(rxIn.length)],
            ['Routed to pharmacy (has pharmacyId)', String(rxIn.filter(r => r.pharmacyId).length)],
            ...Object.entries(rxDocStatus).sort((a, b) => b[1] - a[1]).map(([k, v]) => [`Doctor workflow status: ${k}`, String(v)]),
          ],
        },
        {
          heading: 'E-pharmacy status (in period, routed only)',
          rows: Object.keys(rxPharmStatus).length
            ? Object.entries(rxPharmStatus).sort((a, b) => b[1] - a[1]).map(([k, v]) => [`pharmacyStatus ${k}`, String(v)])
            : [['No routed Rx in range', '0']],
        },
        {
          heading: `Doctor + therapy appointments in period (${appts.length + therapyCalls.length})`,
          rows: [
            ['Doctor rows in range', String(appts.length)],
            ['Therapy sessions in range', String(therapyCalls.length)],
            ...Object.entries(apptBy).map(([k, v]) => [`Combined status: ${k}`, String(v)]),
          ],
        },
        {
          heading: `Home care bookings in period (${hcBookings.length})`,
          rows: [
            ['Pending', String(hcBy.pending)],
            ['Active visit pipeline', String(hcBy.active)],
            ['Completed', String(hcBy.completed)],
            ['Cancelled / declined', String(hcBy.cancelled)],
            ['Other', String(hcBy.other)],
          ],
        },
        {
          heading: `Diagnostic orders created in period (${diag.length})`,
          rows: [
            ['Lab', String(diagBy.lab)],
            ['Scan', String(diagBy.scan)],
            ['Other / unknown', String(diagBy.other)],
          ],
        },
        {
          heading: `Pharmacy Rx events in period (${events.length})`,
          rows: [
            ['Total event rows in range', String(events.length)],
            ['Unique prescription IDs (approx)', String(new Set(events.map(e => e.rxId).filter(Boolean)).size)],
          ],
        },
        {
          heading: 'Parent pharmacies (snapshot)',
          rows: pharmDocs.slice(0, 25).map(p => [
            (p.pharmacyName || p.name || '—').slice(0, 36),
            String(p.status || '—'),
          ]),
        },
      ];

      downloadNessaHubSystemPdf({
        filename: `nessahub-system-report-${dateFrom}-to-${dateTo}.pdf`,
        reportTitle: 'NessaHub — system-wide operational export',
        periodFrom: dateFrom,
        periodTo: dateTo,
        generatedAt: new Date().toLocaleString(),
        summarySections: sections,
      });

      setLastSummary({
        rxIn: rxIn.length,
        events: events.length,
        appts: appts.length,
        therapyCalls: therapyCalls.length,
        hcBookings: hcBookings.length,
        diag: diag.length,
      });
    } catch (e) {
      console.error(e);
      setErr(e?.message || 'Export failed. Check Firestore rules and network.');
    } finally {
      setBusy(false);
    }
  }, [dateFrom, dateTo]);

  return (
    <div className="admin-page" style={{ maxWidth: 900 }}>
      <h1 className="admin-page-title">System PDF export</h1>
      <p className="admin-page-sub" style={{ marginBottom: '0.5rem' }}>
        Super-admin snapshot: aggregates across users, providers, therapy sessions, home care nurses & bookings, pharmacies, prescriptions, appointments, diagnostics, and pharmacy activity logs.
        Large tenants may take a few seconds.
      </p>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.25rem', marginTop: '1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b' }}>FROM</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b' }}>TO</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1' }} />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={runExport}
            style={{
              padding: '0.55rem 1.2rem',
              borderRadius: 8,
              fontWeight: 700,
              cursor: busy ? 'wait' : 'pointer',
              background: '#0f172a',
              color: '#fff',
              border: 'none',
            }}
          >
            {busy ? 'Generating…' : 'Generate & download PDF'}
          </button>
        </div>
        {err && <p style={{ color: '#b91c1c', marginTop: '0.85rem', fontSize: '0.88rem' }}>{err}</p>}
        {lastSummary && !err && (
          <p style={{ marginTop: '0.85rem', color: '#475569', fontSize: '0.86rem' }}>
            Last file included ~{lastSummary.rxIn} prescriptions, {lastSummary.appts} doctor appointments, {lastSummary.therapyCalls} therapy sessions, {lastSummary.hcBookings} home care bookings, {lastSummary.diag} diagnostic orders, {lastSummary.events} pharmacy events in range.
          </p>
        )}
      </div>
    </div>
  );
}
