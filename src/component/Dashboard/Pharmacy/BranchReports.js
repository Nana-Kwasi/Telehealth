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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function BranchReports({ profile }) {
  const [loading, setLoading] = useState(true);
  const [prescriptions, setPrescriptions] = useState([]);
  const [dateFrom, setDateFrom] = useState(() => daysAgoISO(30));
  const [dateTo, setDateTo] = useState(() => todayISO());
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');
  const [reportGenerated, setReportGenerated] = useState(false);
  const [rangeError, setRangeError] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  const branchMeta = useMemo(() => ([{
    id: profile?.id,
    branchName: profile?.branchName,
    status: profile?.status || 'active',
    mustChangePassword: profile?.mustChangePassword,
  }]), [profile]);

  // A branch user's profile carries the parent org id as `organizationId` (and not
  // always `pharmacyId`). Without this fallback the effect bailed early and never
  // cleared `loading`, leaving the screen stuck on "Loading…" forever.
  const parentOrgId = profile?.pharmacyId || profile?.organizationId;

  useEffect(() => {
    const load = async () => {
      if (!parentOrgId) { setLoading(false); return; }
      setLoading(true);
      try {
        const rxSnap = await getDocs(query(
          collection(db, 'doctorPrescriptions'),
          where('pharmacyId', '==', parentOrgId),
        ));
        setPrescriptions(rxSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error('BranchReports load error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [parentOrgId]);

  const filteredRx = useMemo(() => {
    if (!reportGenerated || !appliedFrom || !appliedTo || !profile?.id) return [];
    const { startMs, endMs } = parseRangeBounds(appliedFrom, appliedTo);
    return prescriptions.filter(rx => {
      const ms = toMillis(rx.createdAt);
      if (!ms || ms < startMs || ms > endMs) return false;
      return rxTouchesBranch(rx, profile.id);
    });
  }, [prescriptions, reportGenerated, appliedFrom, appliedTo, profile?.id]);

  const metrics = useMemo(() => buildMetrics(branchMeta, filteredRx), [branchMeta, filteredRx]);

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
    setReportGenerated(true);
  };

  const downloadPdf = useCallback(async () => {
    if (!reportGenerated || !profile?.id) return;
    setPdfLoading(true);
    try {
      let activityLogRows = [];
      try {
        const evSnap = await getDocs(query(collection(db, 'pharmacyRxEvents'), where('branchId', '==', profile.id)));
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
            const actor = e.actorName || '—';
            return [when, String(e.action || '—').replace(/_/g, ' '), (e.rxId || '—').slice(0, 14), String(actor).slice(0, 22), trans];
          });
      } catch {
        activityLogRows = [];
      }

      const scopeLine = `Scope: This branch only (${profile.branchName || profile.id})`;

      const summaryRows = [
        ['Branch', profile.branchName || profile.id],
        ['Parent pharmacy', profile.pharmacyName || '—'],
        ['Prescriptions (created in period, touching branch)', String(metrics.totalRx)],
        ['Delivered', String(metrics.rxCounts.delivered || 0)],
        ['Completion rate', `${metrics.completionRate.toFixed(1)}%`],
        ['Ready backlog', String(metrics.readyBacklog)],
        ['Medication lines (snapshot)', String(metrics.medsTotal)],
        ['Drug availability (line share)', `${metrics.availabilityRate.toFixed(1)}%`],
        ['Stockout rate', `${metrics.stockoutRate.toFixed(1)}%`],
      ];

      const funnelBody = RX_STATUSES.map(s => [s.replace(/_/g, ' '), String(metrics.rxCounts[s] || 0)]);

      const branchPerformanceRows = metrics.branchRows.map(r => [
        String(r.branchName).slice(0, 28),
        String(r.total),
        String(r.active),
        String(r.ready),
        String(r.delivered),
      ]);

      const prescriptionDetailRows = filteredRx.map(rx => {
        const rout = rx.branchName || rx.branchId || '—';
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

      const safe = (profile.branchName || 'branch').replace(/[^a-z0-9-_]/gi, '-').slice(0, 28);

      downloadNessaHubPharmacyOperationalPdf({
        filename: `nessahub-branch-${safe}-${appliedFrom}-to-${appliedTo}.pdf`,
        reportTitle: 'Branch pharmacy — operational report',
        orgName: `${profile.branchName || 'Branch'} · ${profile.pharmacyName || ''}`,
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
  }, [reportGenerated, profile, appliedFrom, appliedTo, metrics, filteredRx]);

  if (loading) {
    return (
      <div className="pharmacy-page pharmacy-reports-page">
        <div className="pharmacy-reports-loading">Loading…</div>
      </div>
    );
  }

  return (
    <div className="pharmacy-page pharmacy-reports-page">
      <h1 className="pharmacy-page-title">Branch reports</h1>
      <p className="pharmacy-page-sub pharmacy-reports-sub">
        Prescriptions <strong>created</strong> in the date range that are <strong>routed to this branch</strong> or include a <strong>transfer</strong> to this branch. Download a NessaHub PDF for compliance or handoff.
      </p>

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
            <strong>{appliedFrom}</strong> — <strong>{appliedTo}</strong>
            {' · '}
            <span className="pharmacy-reports-rx-count">{metrics.totalRx} prescription(s)</span>
          </p>
        )}
      </section>

      {!reportGenerated ? (
        <div className="pharmacy-reports-placeholder">
          <div className="pharmacy-reports-placeholder-icon">📋</div>
          <p>Pick dates and click <strong>Generate report</strong>.</p>
        </div>
      ) : (
        <>
          <div className="pharmacy-reports-grid">
            <div className="pharmacy-reports-card pharmacy-reports-card--accent">
              <div className="pharmacy-reports-card-label">Rx in scope</div>
              <div className="pharmacy-reports-card-value">{metrics.totalRx}</div>
            </div>
            <div className="pharmacy-reports-card">
              <div className="pharmacy-reports-card-label">Delivered</div>
              <div className="pharmacy-reports-card-value">{metrics.rxCounts.delivered || 0}</div>
              <div className="pharmacy-reports-card-hint">{metrics.completionRate.toFixed(1)}% completion</div>
            </div>
            <div className="pharmacy-reports-card">
              <div className="pharmacy-reports-card-label">Ready</div>
              <div className="pharmacy-reports-card-value">{metrics.readyBacklog}</div>
            </div>
          </div>
          <section className="pharmacy-reports-section">
            <h2 className="pharmacy-reports-section-title">Funnel</h2>
            <div className="pharmacy-reports-funnel">
              {RX_STATUSES.map(s => (
                <div key={s} className="pharmacy-reports-funnel-item">
                  <div className="pharmacy-reports-funnel-label">{s.replace(/_/g, ' ')}</div>
                  <div className="pharmacy-reports-funnel-num">{metrics.rxCounts[s] || 0}</div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
