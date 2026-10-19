import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '../../../services/firestoreShim';
import { collection, getDocs, query, where } from '../../../services/firestoreShim';
import { downloadNessaHubPharmacyOperationalPdf } from '../../../utils/nessahubOperationalPdf';
import {
  RX_STATUSES,
  toMillis,
  parseRangeBounds,
  rxTouchesBranch,
  buildMetrics,
} from '../../../utils/pharmacyReportMetrics';

// Dates are chosen from the calendar, not typed: a click opens the picker and
// keystrokes (other than Tab to move on) are ignored.
const pickOnly = {
  onClick: (e) => { try { e.currentTarget.showPicker?.(); } catch { /* older browsers open it themselves */ } },
  onKeyDown: (e) => { if (e.key !== 'Tab') e.preventDefault(); },
  style: { cursor: 'pointer', caretColor: 'transparent' },
};

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function branchLabelMap(branches) {
  const m = new Map();
  branches.forEach(b => m.set(b.id, b.branchName || b.id));
  return m;
}

export default function PharmacyReports({ profile }) {
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [dateFrom, setDateFrom] = useState(() => daysAgoISO(30));
  const [dateTo, setDateTo] = useState(() => todayISO());
  const [branchFilterId, setBranchFilterId] = useState('all');
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');
  const [appliedBranch, setAppliedBranch] = useState('all');
  const [reportGenerated, setReportGenerated] = useState(false);
  const [rangeError, setRangeError] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  // Branches/prescriptions are keyed by the organization id (≠ user id for
  // admin-onboarded pharmacies). Prefer it so the branch dropdown actually loads.
  const orgId = profile?.organizationId || profile?.id;

  useEffect(() => {
    const load = async () => {
      if (!orgId) return;
      setLoading(true);
      try {
        const [branchSnap, rxSnap] = await Promise.all([
          getDocs(query(collection(db, 'pharmacyBranches'), where('pharmacyId', '==', orgId))),
          getDocs(query(collection(db, 'doctorPrescriptions'), where('pharmacyId', '==', orgId))),
        ]);
        setBranches(branchSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setPrescriptions(rxSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error('PharmacyReports load error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [orgId]);

  const filteredRx = useMemo(() => {
    if (!reportGenerated || !appliedFrom || !appliedTo) return [];
    const { startMs, endMs } = parseRangeBounds(appliedFrom, appliedTo);
    return prescriptions.filter(rx => {
      const ms = toMillis(rx.createdAt);
      if (!ms || ms < startMs || ms > endMs) return false;
      return rxTouchesBranch(rx, appliedBranch);
    });
  }, [prescriptions, reportGenerated, appliedFrom, appliedTo, appliedBranch]);

  const metrics = useMemo(() => buildMetrics(branches, filteredRx), [branches, filteredRx]);
  const nameByBranchId = useMemo(() => branchLabelMap(branches), [branches]);

  const handleGenerate = () => {
    setRangeError('');
    if (!dateFrom || !dateTo) {
      setRangeError('Select both start and end dates.');
      return;
    }
    if (new Date(dateFrom) > new Date(dateTo)) {
      setRangeError('Start date must be on or before end date.');
      return;
    }
    setAppliedFrom(dateFrom);
    setAppliedTo(dateTo);
    setAppliedBranch(branchFilterId);
    setReportGenerated(true);
  };

  const downloadPdf = useCallback(async () => {
    if (!reportGenerated || !orgId) return;
    setPdfLoading(true);
    try {
      let activityLogRows = [];
      try {
        const evSnap = await getDocs(query(collection(db, 'pharmacyRxEvents'), where('pharmacyId', '==', orgId)));
        const { startMs, endMs } = parseRangeBounds(appliedFrom, appliedTo);
        activityLogRows = evSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(e => {
            const t = toMillis(e.createdAt);
            return t >= startMs && t <= endMs;
          })
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
          .slice(0, 400)
          .map(e => {
            const when = e.createdAt?.seconds
              ? new Date(e.createdAt.seconds * 1000).toLocaleString()
              : '—';
            const trans = `${e.fromStatus || '—'} → ${e.toStatus || '—'}`;
            const actor = e.actorName || e.branchId || '—';
            return [when, String(e.action || '—').replace(/_/g, ' '), (e.rxId || '—').slice(0, 14), String(actor).slice(0, 22), trans];
          });
      } catch {
        activityLogRows = [];
      }

      const scopeLine = appliedBranch === 'all'
        ? 'Scope: All branches (routed + transfer touchpoints)'
        : `Scope: ${nameByBranchId.get(appliedBranch) || appliedBranch} only`;

      const summaryRows = [
        ['Branches in network', String(branches.length)],
        ['Active / suspended branches', `${metrics.branchCounts.active} / ${metrics.branchCounts.suspended}`],
        ['Prescriptions in period & scope', String(metrics.totalRx)],
        ['Delivered', String(metrics.rxCounts.delivered || 0)],
        ['Completion rate', `${metrics.completionRate.toFixed(1)}%`],
        ['Ready backlog', String(metrics.readyBacklog)],
        ['Unassigned (no routed branch)', String(metrics.unassigned)],
        ['Medication lines (snapshot)', String(metrics.medsTotal)],
        ['Drug availability (line share)', `${metrics.availabilityRate.toFixed(1)}%`],
        ['Stockout rate', `${metrics.stockoutRate.toFixed(1)}%`],
        ['Branch logins pending password reset', String(metrics.pendingPasswordResets)],
      ];

      const funnelBody = RX_STATUSES.map(s => [
        s.replace(/_/g, ' '),
        String(metrics.rxCounts[s] || 0),
      ]);

      const branchPerformanceRows = metrics.branchRows.map(r => [
        String(r.branchName).slice(0, 28),
        String(r.total),
        String(r.active),
        String(r.ready),
        String(r.delivered),
      ]);

      const prescriptionDetailRows = filteredRx.map(rx => {
        const rout = rx.branchName || nameByBranchId.get(rx.branchId) || rx.branchId || '—';
        const created = rx.createdAt?.seconds
          ? new Date(rx.createdAt.seconds * 1000).toLocaleString()
          : '—';
        return [
          String(rx.prescriptionRef || rx.id || '—').slice(0, 20),
          String(rx.patientName || '—').slice(0, 24),
          String(rout).slice(0, 22),
          String(rx.pharmacyStatus || 'sent'),
          created,
          String((rx.medications || []).length),
          String(rx.doctorName || '—').slice(0, 20),
        ];
      });

      const safeName = (profile.pharmacyName || 'pharmacy').replace(/[^a-z0-9-_]/gi, '-').slice(0, 36);
      const branchSlug = appliedBranch === 'all' ? 'all-branches' : String(appliedBranch).slice(0, 12);

      downloadNessaHubPharmacyOperationalPdf({
        filename: `nessahub-${safeName}-report-${branchSlug}-${appliedFrom}-to-${appliedTo}.pdf`,
        reportTitle: 'Parent pharmacy — operational report',
        orgName: profile.pharmacyName || 'Pharmacy',
        scopeLine,
        periodFrom: appliedFrom,
        periodTo: appliedTo,
        generatedAt: new Date().toLocaleString(),
        summaryRows,
        funnelRows: funnelBody,
        branchPerformanceRows,
        prescriptionDetailRows,
        activityLogRows,
      });
    } finally {
      setPdfLoading(false);
    }
  }, [reportGenerated, profile, appliedFrom, appliedTo, appliedBranch, metrics, branches, filteredRx, nameByBranchId]);

  if (loading) {
    return (
      <div className="pharmacy-page pharmacy-reports-page">
        <div className="pharmacy-reports-loading">Loading reports…</div>
      </div>
    );
  }

  return (
    <div className="pharmacy-page pharmacy-reports-page">
      <div className="pharmacy-reports-header">
        <div>
          <h1 className="pharmacy-page-title">Pharmacy reports</h1>
          <p className="pharmacy-page-sub pharmacy-reports-sub">
            Pick dates (prescriptions <strong>created</strong> in that window), optionally one branch or the whole network, then generate metrics and download a NessaHub PDF.
          </p>
        </div>
      </div>

      <section className="pharmacy-reports-panel">
        <div className="pharmacy-reports-date-row">
          <label className="pharmacy-reports-date-field">
            <span>From</span>
            <input type="date" value={dateFrom} max={todayISO()} onChange={e => setDateFrom(e.target.value)} {...pickOnly} />
          </label>
          <label className="pharmacy-reports-date-field">
            <span>To</span>
            <input type="date" value={dateTo} max={todayISO()} onChange={e => setDateTo(e.target.value)} {...pickOnly} />
          </label>
          <div className="pharmacy-reports-branch-field">
            <label>
              <span>Branch</span>
              <select value={branchFilterId} onChange={e => setBranchFilterId(e.target.value)}>
                <option value="all">All branches</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.branchName || b.id}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="pharmacy-reports-actions">
            <button type="button" className="pharmacy-reports-btn pharmacy-reports-btn--primary" onClick={handleGenerate}>
              Generate report
            </button>
            <button
              type="button"
              className="pharmacy-reports-btn pharmacy-reports-btn--outline"
              disabled={!reportGenerated || pdfLoading}
              onClick={() => downloadPdf()}
            >
              {pdfLoading ? 'Building PDF…' : 'Download PDF'}
            </button>
          </div>
        </div>
        {rangeError && <div className="pharmacy-reports-error">{rangeError}</div>}
        {reportGenerated && (
          <p className="pharmacy-reports-period-badge">
            Showing <strong>{appliedFrom}</strong> — <strong>{appliedTo}</strong>
            {' · '}
            {appliedBranch === 'all' ? <strong>All branches</strong> : <strong>{nameByBranchId.get(appliedBranch) || appliedBranch}</strong>}
            {' · '}
            <span className="pharmacy-reports-rx-count">{metrics.totalRx} prescription(s)</span>
          </p>
        )}
      </section>

      {!reportGenerated ? (
        <div className="pharmacy-reports-placeholder">
          <div className="pharmacy-reports-placeholder-icon">📊</div>
          <p>Select range and branch scope, then <strong>Generate report</strong>.</p>
        </div>
      ) : (
        <>
          <div className="pharmacy-reports-grid">
            <div className="pharmacy-reports-card">
              <div className="pharmacy-reports-card-label">Branches (network)</div>
              <div className="pharmacy-reports-card-value">{branches.length}</div>
              <div className="pharmacy-reports-card-hint">{metrics.branchCounts.active} active · {metrics.branchCounts.suspended} suspended</div>
            </div>
            <div className="pharmacy-reports-card pharmacy-reports-card--accent">
              <div className="pharmacy-reports-card-label">Rx in scope</div>
              <div className="pharmacy-reports-card-value">{metrics.totalRx}</div>
              <div className="pharmacy-reports-card-hint">{metrics.unassigned} unassigned to branch</div>
            </div>
            <div className="pharmacy-reports-card">
              <div className="pharmacy-reports-card-label">Delivered</div>
              <div className="pharmacy-reports-card-value">{metrics.rxCounts.delivered || 0}</div>
              <div className="pharmacy-reports-card-hint">{metrics.completionRate.toFixed(1)}% completion</div>
            </div>
            <div className="pharmacy-reports-card">
              <div className="pharmacy-reports-card-label">Ready backlog</div>
              <div className="pharmacy-reports-card-value">{metrics.readyBacklog}</div>
              <div className="pharmacy-reports-card-hint">Ready, not delivered</div>
            </div>
            <div className="pharmacy-reports-card">
              <div className="pharmacy-reports-card-label">Branch pw resets</div>
              <div className="pharmacy-reports-card-value">{metrics.pendingPasswordResets}</div>
              <div className="pharmacy-reports-card-hint">First-login reset pending</div>
            </div>
          </div>

          <div className="pharmacy-reports-grid pharmacy-reports-grid--dense">
            <div className="pharmacy-reports-card pharmacy-reports-card--compact">
              <div className="pharmacy-reports-card-label">Drug availability</div>
              <div className="pharmacy-reports-card-value">{metrics.availabilityRate.toFixed(1)}%</div>
              <div className="pharmacy-reports-card-hint">{metrics.medsTotal} medication lines</div>
            </div>
            <div className="pharmacy-reports-card pharmacy-reports-card--compact">
              <div className="pharmacy-reports-card-label">Stockout rate</div>
              <div className="pharmacy-reports-card-value">{metrics.stockoutRate.toFixed(1)}%</div>
              <div className="pharmacy-reports-card-hint">not_available share</div>
            </div>
            <div className="pharmacy-reports-card pharmacy-reports-card--compact">
              <div className="pharmacy-reports-card-label">Alt suggestions</div>
              <div className="pharmacy-reports-card-value">{metrics.altRate.toFixed(1)}%</div>
              <div className="pharmacy-reports-card-hint">of medication lines</div>
            </div>
            <div className="pharmacy-reports-card pharmacy-reports-card--compact">
              <div className="pharmacy-reports-card-label">Alt approval</div>
              <div className="pharmacy-reports-card-value">{metrics.altApprovalRate.toFixed(1)}%</div>
              <div className="pharmacy-reports-card-hint">approved vs suggested</div>
            </div>
          </div>

          <section className="pharmacy-reports-section">
            <h2 className="pharmacy-reports-section-title">Prescription funnel</h2>
            <div className="pharmacy-reports-funnel">
              {RX_STATUSES.map(s => (
                <div key={s} className="pharmacy-reports-funnel-item">
                  <div className="pharmacy-reports-funnel-label">{s.replace(/_/g, ' ')}</div>
                  <div className="pharmacy-reports-funnel-num">{metrics.rxCounts[s] || 0}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="pharmacy-reports-section">
            <h2 className="pharmacy-reports-section-title">Branch performance (in scope)</h2>
            {metrics.branchRows.length === 0 ? (
              <p className="pharmacy-reports-empty">No prescriptions in this range.</p>
            ) : (
              <div className="pharmacy-table-wrap pharmacy-reports-table-wrap">
                <table className="pharmacy-table">
                  <thead>
                    <tr>
                      <th>Branch</th>
                      <th>Total</th>
                      <th>Active</th>
                      <th>Ready</th>
                      <th>Delivered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.branchRows.map((r, i) => (
                      <tr key={`${r.branchName}-${i}`}>
                        <td className="pharmacy-table-strong">{r.branchName}</td>
                        <td>{r.total}</td>
                        <td>{r.active}</td>
                        <td>{r.ready}</td>
                        <td>{r.delivered}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
