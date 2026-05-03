import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../../Auth/firebaseConfig';
import { collection, getDocs, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import LocationSummaryCard from '../../Common/LocationSummaryCard';

const STATUS_LABEL = {
  sent: 'Incoming',
  accepted: 'Accepted',
  partially_fulfilled: 'Partial',
  ready: 'Ready',
  delivered: 'Delivered',
};

const ATTENTION_KIND = {
  incoming: { label: 'Incoming', filter: 'incoming', color: '#a16207' },
  overdue_pickup: { label: 'Pickup overdue', filter: 'overdue', color: '#b45309' },
  refill_block: { label: 'Needs review', filter: 'review', color: '#7c3aed' },
  stuck: { label: 'Stuck >48h', filter: 'stuck', color: '#b91c1c' },
};

const MS_DAY = 86400000;
const MS_48H = 48 * 3600000;

function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return 0;
}

function formatAge(ms) {
  if (!ms || ms <= 0) return '—';
  const h = Math.floor(ms / 3600000);
  if (h < 48) return h < 1 ? '<1h' : `${h}h`;
  const d = Math.floor(ms / MS_DAY);
  return `${d}d`;
}

function localDayKey(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function composeFormattedAddress(row = {}) {
  const locationMeta = row.locationMeta || {};
  const location = row.location || {};
  const country = row.country || locationMeta.country || location.country || '';
  const city = row.city || locationMeta.city || location.city || '';
  const area = row.area || locationMeta.area || location.area || '';
  const street = row.street || locationMeta.street || location.street || '';
  const display = [area || street, city, country].filter(Boolean).join(', ');
  if (display) return display;
  const raw = (row.address || location.address || '').trim();
  return /^[A-Z]{2}-\d{3}-\d{4}$/i.test(raw) ? '' : raw;
}

function medianHours(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function completionTs(rx) {
  return toMillis(rx.deliveredAt) || (rx.pharmacyStatus === 'delivered' ? toMillis(rx.updatedAt) : 0);
}

function classifyAttention(rx) {
  const st = rx.pharmacyStatus || 'sent';
  const updated = toMillis(rx.updatedAt);
  const created = toMillis(rx.createdAt);
  if (st === 'sent' || !rx.pharmacyStatus) {
    return { kind: 'incoming', score: 300 + (Date.now() - created) / MS_DAY };
  }
  if (st === 'ready') {
    const age = Date.now() - updated;
    if (age > MS_48H) return { kind: 'overdue_pickup', score: 250 + age / MS_DAY };
    return null;
  }
  if (st === 'partially_fulfilled') {
    const meds = rx.medications || [];
    const blocked = meds.some(m =>
      ['not_available', 'alternative_suggested'].includes(m.drugStatus)
      || m.drugStatus === 'pending'
    );
    if (blocked) return { kind: 'refill_block', score: 280 + (Date.now() - updated) / MS_DAY };
  }
  if (st === 'accepted') {
    const last = Math.max(updated, created);
    if (Date.now() - last > MS_48H) return { kind: 'stuck', score: 200 + (Date.now() - last) / MS_DAY };
  }
  return null;
}

function activityTs(rx) {
  return Math.max(toMillis(rx.updatedAt), toMillis(rx.createdAt));
}

function DeltaRow({ label, cur, prev, suffix = '' }) {
  let hint = '—';
  let cls = 'pharmacy-overview-delta--flat';
  if (prev === 0 && cur === 0) hint = '0';
  else if (prev === 0 && cur > 0) {
    hint = `↑ ${cur}${suffix}`;
    cls = 'pharmacy-overview-delta--up';
  } else if (prev > 0) {
    const pct = Math.round(((cur - prev) / prev) * 100);
    if (pct === 0) {
      hint = `${cur}${suffix} (0%)`;
    } else if (pct > 0) {
      hint = `↑ ${pct}% (${cur}${suffix})`;
      cls = 'pharmacy-overview-delta--up';
    } else {
      hint = `↓ ${Math.abs(pct)}% (${cur}${suffix})`;
      cls = 'pharmacy-overview-delta--down';
    }
  }
  return (
    <div className="pharmacy-overview-delta-row">
      <span className="pharmacy-overview-delta-label">{label}</span>
      <span className={`pharmacy-overview-delta ${cls}`}>{hint}</span>
    </div>
  );
}

export default function PharmacyOverview({ profile }) {
  const [stats, setStats] = useState({ branches: 0, incoming: 0, active: 0, completed: 0 });
  const [branches, setBranches] = useState([]);
  const [rxList, setRxList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [emailVerified, setEmailVerified] = useState(!!auth.currentUser?.emailVerified);

  useEffect(() => onAuthStateChanged(auth, (u) => setEmailVerified(!!u?.emailVerified)), []);

  useEffect(() => {
    const load = async () => {
      try {
        const pharmacyId = profile?.id;
        if (!pharmacyId) return;

        const [branchSnap, rxSnap] = await Promise.all([
          getDocs(query(collection(db, 'pharmacyBranches'), where('pharmacyId', '==', pharmacyId))),
          getDocs(query(collection(db, 'doctorPrescriptions'), where('pharmacyId', '==', pharmacyId))),
        ]);

        const brList = branchSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const rx = rxSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // One-time backfill for legacy docs missing formattedAddress.
        const parentFormatted = composeFormattedAddress(profile || {});
        if (!profile?.formattedAddress && parentFormatted) {
          updateDoc(doc(db, 'pharmacies', pharmacyId), {
            formattedAddress: parentFormatted,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
        const backfillOps = brList
          .filter((b) => !b.formattedAddress)
          .map((b) => {
            const next = composeFormattedAddress(b);
            if (!next) return null;
            return updateDoc(doc(db, 'pharmacyBranches', b.id), {
              formattedAddress: next,
              updatedAt: serverTimestamp(),
            }).catch(() => {});
          })
          .filter(Boolean);
        if (backfillOps.length) await Promise.all(backfillOps);

        setBranches(brList);
        setRxList(rx);

        setStats({
          branches: brList.length,
          incoming: rx.filter(r => r.pharmacyStatus === 'sent' || !r.pharmacyStatus).length,
          active: rx.filter(r => ['accepted', 'partially_fulfilled'].includes(r.pharmacyStatus)).length,
          completed: rx.filter(r => ['ready', 'delivered'].includes(r.pharmacyStatus)).length,
        });
      } catch (e) {
        console.error('PharmacyOverview load error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [profile?.id]);

  const branchById = useMemo(() => {
    const m = {};
    branches.forEach(b => { m[b.id] = b; });
    return m;
  }, [branches]);

  const period = useMemo(() => {
    const end = Date.now();
    const curStart = end - 7 * MS_DAY;
    const prevStart = end - 14 * MS_DAY;
    const prevEnd = curStart;

    let newCur = 0;
    let newPrev = 0;
    let doneCur = 0;
    let donePrev = 0;
    rxList.forEach(rx => {
      const c = toMillis(rx.createdAt);
      if (c >= curStart && c <= end) newCur += 1;
      if (c >= prevStart && c < prevEnd) newPrev += 1;

      const doneAt = completionTs(rx);
      if (doneAt && rx.pharmacyStatus === 'delivered') {
        if (doneAt >= curStart && doneAt <= end) doneCur += 1;
        if (doneAt >= prevStart && doneAt < prevEnd) donePrev += 1;
      }
    });

    const activeBranchIds = branches.filter(b => (b.status || 'active').toLowerCase() !== 'suspended').map(b => b.id);
    let idleCur = 0;
    activeBranchIds.forEach(bid => {
      const touched = rxList.some(rx => {
        if (rx.branchId !== bid) return false;
        const t = activityTs(rx);
        return t >= curStart && t <= end;
      });
      if (!touched) idleCur += 1;
    });

    let idlePrev = 0;
    activeBranchIds.forEach(bid => {
      const touched = rxList.some(rx => {
        if (rx.branchId !== bid) return false;
        const t = activityTs(rx);
        return t >= prevStart && t < prevEnd;
      });
      if (!touched) idlePrev += 1;
    });

    return { newCur, newPrev, doneCur, donePrev, idleCur, idlePrev };
  }, [rxList, branches]);

  const attentionQueue = useMemo(() => {
    const rows = [];
    rxList.forEach(rx => {
      const c = classifyAttention(rx);
      if (!c) return;
      const bid = rx.branchId;
      const bname = rx.branchName || branchById[bid]?.branchName || 'Unassigned';
      const created = toMillis(rx.createdAt);
      const updated = toMillis(rx.updatedAt);
      const ageMs = c.kind === 'overdue_pickup'
        ? Date.now() - (updated || created)
        : Date.now() - created;
      rows.push({
        rx,
        kind: c.kind,
        score: c.score,
        branchLabel: bname,
        ageMs,
      });
    });
    rows.sort((a, b) => b.score - a.score);
    return rows.slice(0, 8);
  }, [rxList, branchById]);

  const branchSnapshots = useMemo(() => {
    const today = localDayKey(Date.now());
    return branches.map(b => {
      const bid = b.id;
      let todayCount = 0;
      let needs = 0;
      rxList.forEach(rx => {
        if (rx.branchId !== bid) return;
        const c = toMillis(rx.createdAt);
        if (localDayKey(c) === today) todayCount += 1;
        const st = rx.pharmacyStatus || 'sent';
        if (st === 'sent' || !rx.pharmacyStatus) {
          needs += 1;
          return;
        }
        if (st === 'partially_fulfilled') {
          const meds = rx.medications || [];
          if (meds.some(m => ['not_available', 'alternative_suggested', 'pending'].includes(m.drugStatus))) needs += 1;
        }
      });
      return {
        id: bid,
        name: b.branchName || 'Branch',
        status: (b.status || 'active').toLowerCase(),
        todayCount,
        needsReview: needs,
      };
    }).sort((a, b) => b.needsReview - a.needsReview || b.todayCount - a.todayCount);
  }, [branches, rxList]);

  const activityFeed = useMemo(() => {
    const sorted = [...rxList].sort((a, b) => activityTs(b) - activityTs(a));
    return sorted.slice(0, 15).map(rx => ({
      id: rx.id,
      ts: activityTs(rx),
      patient: rx.patientName || 'Patient',
      branch: rx.branchName || branchById[rx.branchId]?.branchName || 'Unassigned',
      status: rx.pharmacyStatus || 'sent',
    }));
  }, [rxList, branchById]);

  const opsKpis = useMemo(() => {
    const stuck = rxList.filter(rx => {
      if (rx.pharmacyStatus !== 'accepted') return false;
      const last = Math.max(toMillis(rx.updatedAt), toMillis(rx.createdAt));
      return Date.now() - last > MS_48H;
    }).length;

    const hoursToTerminal = [];
    rxList.forEach(rx => {
      const st = rx.pharmacyStatus;
      if (!['ready', 'delivered'].includes(st)) return;
      const start = toMillis(rx.createdAt);
      const end = st === 'delivered'
        ? (toMillis(rx.deliveredAt) || toMillis(rx.updatedAt))
        : toMillis(rx.updatedAt);
      if (start && end && end > start) hoursToTerminal.push((end - start) / 3600000);
    });
    const medH = medianHours(hoursToTerminal);

    return { stuck, medHours: medH };
  }, [rxList]);

  const CARDS = [
    { label: 'Branches', value: stats.branches, icon: '🏪', bg: '#e0f2fe', color: '#0369a1' },
    { label: 'Incoming Rx', value: stats.incoming, icon: '📥', bg: '#fef9c3', color: '#a16207' },
    { label: 'Active Orders', value: stats.active, icon: '⚡', bg: '#dcfce7', color: '#15803d' },
    { label: 'Completed Orders', value: stats.completed, icon: '✅', bg: '#f0fdf4', color: '#16a34a' },
  ];

  const showOnboarding =
    stats.branches === 0
    || !emailVerified
    || (stats.branches > 0 && stats.incoming === 0);

  if (loading) {
    return (
      <div className="pharmacy-page">
        <p className="pharmacy-overview-muted">Loading overview…</p>
      </div>
    );
  }

  return (
    <div className="pharmacy-page pharmacy-overview-page">
      <h1 className="pharmacy-page-title">Dashboard Overview</h1>
      <p className="pharmacy-page-sub">{profile?.pharmacyName || 'Your Pharmacy'} — All branches</p>
      <LocationSummaryCard profile={profile} title="Pharmacy Location" onEdit={() => window.location.assign('/dashboard/settings')} />

      {showOnboarding && (
        <div className="pharmacy-overview-alerts" role="region" aria-label="Account notices">
          {stats.branches === 0 && (
            <Link className="pharmacy-overview-alert pharmacy-overview-alert--accent" to="/dashboard/branches">
              <span className="pharmacy-overview-alert-icon" aria-hidden>➕</span>
              <span className="pharmacy-overview-alert-text">Add your first branch to route prescriptions</span>
            </Link>
          )}
          {!emailVerified && (
            <Link className="pharmacy-overview-alert" to="/dashboard/settings">
              <span className="pharmacy-overview-alert-icon" aria-hidden>✉️</span>
              <span className="pharmacy-overview-alert-text">Verify your email in Settings for full account access</span>
            </Link>
          )}
          {stats.branches > 0 && stats.incoming === 0 && (
            <Link className="pharmacy-overview-alert" to="/dashboard/reports">
              <span className="pharmacy-overview-alert-icon" aria-hidden>📈</span>
              <span className="pharmacy-overview-alert-text">No incoming Rx right now — open Reports or check branch activity</span>
            </Link>
          )}
        </div>
      )}

      <div className="pharmacy-overview-surface pharmacy-overview-surface--padding">
        <h2 className="pharmacy-overview-eyebrow">At a glance</h2>
        <div className="pharmacy-overview-kpi-grid">
          {CARDS.map(c => (
            <div key={c.label} className="pharmacy-overview-kpi-card">
              <div className="pharmacy-overview-kpi-top">
                <div className="pharmacy-overview-kpi-icon" style={{ background: c.bg }}>{c.icon}</div>
                <div className="pharmacy-overview-kpi-value" style={{ color: c.color }}>{c.value}</div>
              </div>
              <div className="pharmacy-overview-kpi-label">{c.label}</div>
            </div>
          ))}
        </div>

        <div className="pharmacy-overview-period-block">
          <h3 className="pharmacy-overview-h3">Last 7 days vs prior week</h3>
          <div className="pharmacy-overview-period">
            <DeltaRow label="New Rx (by created date)" cur={period.newCur} prev={period.newPrev} />
            <DeltaRow label="Marked delivered" cur={period.doneCur} prev={period.donePrev} />
            <DeltaRow label="Active branches with no Rx touch" cur={period.idleCur} prev={period.idlePrev} />
          </div>
          <p className="pharmacy-overview-hint">Delivered counts use deliveredAt when set, otherwise delivery status update time.</p>
        </div>
      </div>

      <section className="pharmacy-overview-shell">
        <header className="pharmacy-overview-shell-head">
          <h2 className="pharmacy-overview-shell-title">Operations</h2>
          <p className="pharmacy-overview-shell-desc">Items needing action and branch health</p>
        </header>
        <div className="pharmacy-overview-shell-body pharmacy-overview-shell-body--2col">
          <div className="pharmacy-overview-panel">
            <h3 className="pharmacy-overview-panel-title">Attention queue</h3>
            {attentionQueue.length === 0 ? (
              <div className="pharmacy-overview-empty">
                <span className="pharmacy-overview-empty-icon" aria-hidden>✓</span>
                <p>Nothing urgent — you&apos;re caught up.</p>
              </div>
            ) : (
              <ul className="pharmacy-overview-queue">
                {attentionQueue.map(({ rx, kind, branchLabel, ageMs }) => {
                  const meta = ATTENTION_KIND[kind];
                  const q = new URLSearchParams({ filter: meta.filter, rx: rx.id });
                  return (
                    <li key={rx.id}>
                      <Link className="pharmacy-overview-queue-link" to={`/dashboard/prescriptions?${q.toString()}`}>
                        <span className="pharmacy-overview-queue-patient">{rx.patientName || 'Patient'}</span>
                        <span className="pharmacy-overview-queue-meta" style={{ color: meta.color }}>{meta.label}</span>
                        <span className="pharmacy-overview-queue-branch">{branchLabel}</span>
                        <span className="pharmacy-overview-queue-age">{formatAge(ageMs)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="pharmacy-overview-panel pharmacy-overview-panel--branch">
            <h3 className="pharmacy-overview-panel-title">Branches</h3>
            {branchSnapshots.length === 0 ? (
              <div className="pharmacy-overview-empty">
                <p>No branches yet.</p>
                <Link className="pharmacy-overview-inline-link" to="/dashboard/branches">Add a branch</Link>
              </div>
            ) : (
              <ul className="pharmacy-overview-branch-list">
                {branchSnapshots.map(b => (
                  <li key={b.id}>
                    <Link className="pharmacy-overview-branch-row" to={`/dashboard/branches/${b.id}`}>
                      <span className="pharmacy-overview-branch-name">{b.name}</span>
                      <span className={`pharmacy-overview-branch-status pharmacy-overview-branch-status--${b.status}`}>{b.status}</span>
                      <span className="pharmacy-overview-branch-stat" title="Rx created today">{b.todayCount} today</span>
                      {b.needsReview > 0 ? (
                        <span className="pharmacy-overview-branch-needs">{b.needsReview} open</span>
                      ) : (
                        <span className="pharmacy-overview-branch-clear">—</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="pharmacy-overview-shell">
        <header className="pharmacy-overview-shell-head">
          <h2 className="pharmacy-overview-shell-title">Activity &amp; performance</h2>
          <p className="pharmacy-overview-shell-desc">Latest touches, throughput, and quick navigation</p>
        </header>
        <div className="pharmacy-overview-shell-body pharmacy-overview-shell-body--2col pharmacy-overview-shell-body--wide-right">
          <div className="pharmacy-overview-panel">
            <h3 className="pharmacy-overview-panel-title">Recent activity</h3>
            {activityFeed.length === 0 ? (
              <div className="pharmacy-overview-empty">
                <p>No prescription activity yet.</p>
              </div>
            ) : (
              <ul className="pharmacy-overview-feed">
                {activityFeed.map(row => (
                  <li key={row.id}>
                    <Link to={`/dashboard/prescriptions?rx=${encodeURIComponent(row.id)}`} className="pharmacy-overview-feed-link">
                      <span className="pharmacy-overview-feed-time">
                        {row.ts ? new Date(row.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </span>
                      <span className="pharmacy-overview-feed-main">
                        {row.patient} · {STATUS_LABEL[row.status] || row.status}
                        <span className="pharmacy-overview-feed-branch"> · {row.branch}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="pharmacy-overview-aside">
            <div className="pharmacy-overview-aside-block">
              <h3 className="pharmacy-overview-panel-title">Operational KPIs</h3>
              <dl className="pharmacy-overview-ops">
                <div>
                  <dt>Median time to ready / delivered</dt>
                  <dd>
                    {opsKpis.medHours != null
                      ? (opsKpis.medHours < 24
                        ? `${opsKpis.medHours.toFixed(1)}h`
                        : `${(opsKpis.medHours / 24).toFixed(1)}d`)
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Accepted &gt; 48h without progress</dt>
                  <dd>{opsKpis.stuck}</dd>
                </div>
              </dl>
              <Link className="pharmacy-overview-text-link" to="/dashboard/prescriptions?filter=stuck">View stuck prescriptions →</Link>
            </div>
            <div className="pharmacy-overview-aside-block">
              <h3 className="pharmacy-overview-panel-title">Shortcuts</h3>
              <nav className="pharmacy-overview-shortcuts" aria-label="Dashboard shortcuts">
                <Link className="pharmacy-overview-shortcut" to="/dashboard/branches">Manage branches</Link>
                <Link className="pharmacy-overview-shortcut" to="/dashboard/prescriptions">All prescriptions</Link>
                <Link className="pharmacy-overview-shortcut" to="/dashboard/reports">Reports</Link>
                <Link className="pharmacy-overview-shortcut" to="/dashboard/settings">Settings</Link>
              </nav>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
