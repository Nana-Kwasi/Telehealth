import React, { useState, useEffect, useMemo } from 'react';
import { Heart, TrendingUp, TrendingDown, Minus, Search, ChevronLeft } from 'lucide-react';
import { auth, db } from '../../../services/firestoreShim';
import {
  collection, query, where, getDocs, orderBy, limit,
  doc, getDoc,
} from '../../../services/firestoreShim';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import './MoodDashboard.css';
import { api } from '../../../services/apiClient';
import { resolveFileUrl } from '../../../utils/fileUrl';

const MOOD_EMOJI = { 9:'😄', 8:'😊', 7:'🙂', 6:'🙂', 5:'😐', 4:'😰', 3:'😔', 2:'😢', 1:'😭' };
const MOOD_COLOR = (v) => v >= 7 ? '#10B981' : v >= 5 ? '#F59E0B' : '#EF4444';


/* ── Roster helpers ───────────────────────────────────────────────────────
   All read the mood-overview response. None of them judge a client: the
   thresholds are arithmetic on the numbers the client themselves logged, and
   the latest note is shown verbatim so the therapist reads it, not a summary
   of it. */

/** 1-3 low, 4-6 middling, 7+ good. Null when there is nothing to show. */
function moodTone(value) {
  if (value == null || Number.isNaN(value)) return 'none';
  if (value <= 3) return 'low';
  if (value <= 6) return 'mid';
  return 'good';
}

function initialsOf(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]).join('').toUpperCase() || '?';
}

/** "2 days ago" — never a raw timestamp. */
function sinceLabel(iso) {
  if (!iso) return 'never';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return 'never';
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

/** True when nothing has been logged in a fortnight, or ever. */
function isSilent(row) {
  if (!row.last_logged) return true;
  const then = new Date(row.last_logged);
  if (Number.isNaN(then.getTime())) return true;
  return (Date.now() - then.getTime()) / 86400000 > 14;
}

/** Declining when the recent average sits a clear half-point below the older
    one. The half-point margin keeps normal day-to-day variation out of it. */
function isDeclining(row) {
  const recent = Number(row.recent_avg);
  const older = Number(row.older_avg);
  if (!Number.isFinite(recent) || !Number.isFinite(older)) return false;
  return recent < older - 0.5;
}

/**
 * A mood line. Oldest to newest, so it reads left to right like a timeline —
 * the API returns newest first.
 */
function MoodSpark({ points }) {
  const vals = (points || []).map(Number).filter(Number.isFinite).slice().reverse();
  if (vals.length < 2) return <span className="mood-spark-empty" aria-hidden="true" />;
  const W = 62, H = 26, min = 0, max = 10;
  const step = W / (vals.length - 1);
  const d = vals
    .map((v, i) => `${i * step},${H - ((v - min) / (max - min)) * (H - 4) - 2}`)
    .join(' ');
  const last = vals[vals.length - 1];
  const stroke = last <= 3 ? '#b3261e' : last <= 6 ? '#9a4f08' : '#12602f';
  return (
    <svg className="mood-spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polyline points={d} fill="none" stroke={stroke} strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function TherapistMoodDashboard() {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [moodEntries, setMoodEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMoodLoading, setIsMoodLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [summary, setSummary] = useState({ avg: 0, total: 0, trend: 'stable' });

  // One request for every assigned client's mood aggregates. The alternative
  // was a request per client, which is why the screen previously showed no
  // moods at all until you opened one.
  const [roster, setRoster] = useState([]);
  const [rosterFilter, setRosterFilter] = useState('all');

  useEffect(() => {
    let live = true;
    api('/api/v1/therapy-management/mood-overview')
      .then((rows) => { if (live) setRoster(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (live) setRoster([]); });
    return () => { live = false; };
  }, []);

  const rosterStats = useMemo(() => ({
    low: roster.filter((r) => r.latest_value != null && Number(r.latest_value) <= 3).length,
    declining: roster.filter(isDeclining).length,
    silent: roster.filter(isSilent).length,
  }), [roster]);

  const visibleRoster = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return roster.filter((r) => {
      if (q && !`${r.client_name || ''} ${r.client_email || ''}`.toLowerCase().includes(q)) {
        return false;
      }
      if (rosterFilter === 'low') return r.latest_value != null && Number(r.latest_value) <= 3;
      if (rosterFilter === 'declining') return isDeclining(r);
      if (rosterFilter === 'silent') return isSilent(r);
      return true;
    });
  }, [roster, searchQuery, rosterFilter]);

  const currentUser = auth.currentUser;

  useEffect(() => {
    if (currentUser) loadClients();
  }, []);

  const loadClients = async () => {
    try {
      setIsLoading(true);
      const ref = collection(db, 'therapists', currentUser.uid, 'clients');
      const snap = await getDocs(ref);
      const ids = snap.docs.map(d => d.data().clientId).filter(Boolean);
      const list = [];
      for (const id of ids) {
        try {
          const cSnap = await getDoc(doc(db, 'clients', id));
          if (cSnap.exists()) {
            const cd = cSnap.data();
            list.push({ id, name: cd.name || cd.email || 'Client', email: cd.email || '', status: cd.status || 'active' });
          }
        } catch (_) {}
      }
      setClients(list);
    } catch (e) {
      console.error('Load clients error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMoodData = async (client) => {
    setIsMoodLoading(true);
    try {
      const q = query(
        collection(db, 'Client daily mood tracking'),
        where('clientId', '==', client.id),
        orderBy('createdAt', 'desc'),
        limit(30)
      );
      const snap = await getDocs(q);
      const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMoodEntries(entries);
      computeSummary(entries);
    } catch (e) {
      console.error('Load mood error:', e);
      setMoodEntries([]);
    } finally {
      setIsMoodLoading(false);
    }
  };

  const computeSummary = (entries) => {
    if (!entries.length) { setSummary({ avg: 0, total: 0, trend: 'stable' }); return; }
    const vals = entries.map(e => Number(e.moodValue) || 5);
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    const recent = vals.slice(0, 5);
    const older = vals.slice(5, 10);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / (recent.length || 1);
    const olderAvg = older.length ? older.reduce((a, b) => a + b, 0) / older.length : recentAvg;
    const trend = recentAvg > olderAvg + 0.5 ? 'improving' : recentAvg < olderAvg - 0.5 ? 'declining' : 'stable';
    setSummary({ avg, total: entries.length, trend });
  };

  const selectClient = async (client) => {
    setSelectedClient(client);
    await loadMoodData(client);
  };

  const fmtDate = (val) => {
    if (!val) return '';
    const d = val?.toDate ? val.toDate() : new Date(val);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const chartData = [...moodEntries].reverse().slice(-14).map(e => ({
    date: fmtDate(e.createdAt || e.date),
    mood: Math.max(1, Math.min(10, Number(e.moodValue) || 5)),
    label: e.moodLabel || '',
  }));

  const moodDistribution = [1,2,3,4,5,6,7,8,9,10].map(v => ({
    value: v,
    count: moodEntries.filter(e => Number(e.moodValue) === v).length,
    emoji: MOOD_EMOJI[v] || '',
  })).filter(x => x.count > 0);

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const TrendIcon = summary.trend === 'improving' ? TrendingUp : summary.trend === 'declining' ? TrendingDown : Minus;
  const trendColor = summary.trend === 'improving' ? '#10B981' : summary.trend === 'declining' ? '#EF4444' : '#6B7280';

  if (isLoading) {
    return (
      <div className="mood-dashboard">
        <div className="mood-loading">
          <div className="mood-spinner"></div>
          <p>Loading clients…</p>
        </div>
      </div>
    );
  }

  // ── Client list view ──
  if (!selectedClient) {
    return (
      <div className="mood-dashboard">
        <div className="mood-header">
          <div className="mood-header-icon"><Heart size={28} color="#818cf8" /></div>
          <div>
            <h1>Client Mood Dashboard</h1>
            <p>Track your clients' daily mood check-ins and emotional trends</p>
          </div>
        </div>

        <div className="mood-search-bar">
          <Search size={18} className="mood-search-icon" />
          <input
            type="text"
            placeholder="Search clients…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mood-search-input"
          />
        </div>

        {/* ── Summary ──
            The screen used to list names and account status and nothing else —
            a mood dashboard showing no moods. These three answer the question
            a therapist opens it with. Each filters the roster below. */}
        <div className="mood-summary-row">
          <button
            className={`mood-summary-card ${rosterFilter === 'low' ? 'is-active' : ''}`}
            onClick={() => setRosterFilter(rosterFilter === 'low' ? 'all' : 'low')}
          >
            <span className="mood-summary-value">{rosterStats.low}</span>
            <span className="mood-summary-label">Low mood</span>
            <span className="mood-summary-note">Latest 3 or below</span>
          </button>
          <button
            className={`mood-summary-card ${rosterFilter === 'declining' ? 'is-active' : ''}`}
            onClick={() => setRosterFilter(rosterFilter === 'declining' ? 'all' : 'declining')}
          >
            <span className="mood-summary-value">{rosterStats.declining}</span>
            <span className="mood-summary-label">Trending down</span>
            <span className="mood-summary-note">Recent vs earlier</span>
          </button>
          <button
            className={`mood-summary-card ${rosterFilter === 'silent' ? 'is-active' : ''}`}
            onClick={() => setRosterFilter(rosterFilter === 'silent' ? 'all' : 'silent')}
          >
            <span className="mood-summary-value">{rosterStats.silent}</span>
            <span className="mood-summary-label">Not logging</span>
            <span className="mood-summary-note">Nothing in 14 days</span>
          </button>
        </div>

        {visibleRoster.length === 0 ? (
          <div className="mood-empty">
            <Heart size={48} color="#e2e8f0" />
            <p>
              {roster.length === 0
                ? 'No clients assigned yet'
                : rosterFilter !== 'all'
                  ? 'No clients in this group'
                  : 'No clients match your search'}
            </p>
          </div>
        ) : (
          <div className="mood-roster">
            {visibleRoster.map((c) => {
              const latest = c.latest_value == null ? null : Number(c.latest_value);
              const tone = moodTone(latest);
              return (
                <button
                  key={c.client_id}
                  className="mood-row"
                  onClick={() => selectClient({
                    id: c.client_id,
                    name: c.client_name || c.client_email || 'Client',
                    email: c.client_email || '',
                  })}
                >
                  {resolveFileUrl(c.photo_url) ? (
                    <img className="mood-row-avatar" src={resolveFileUrl(c.photo_url)} alt="" />
                  ) : (
                    <span className="mood-row-avatar mood-row-initials">
                      {initialsOf(c.client_name || c.client_email)}
                    </span>
                  )}

                  <span className="mood-row-text">
                    <span className="mood-row-name">{c.client_name || 'Client'}</span>
                    <span className="mood-row-sub">
                      {/* "Has not logged anything" and "has asked not to share"
                          look identical as an empty row, and they are not the
                          same thing — one is a prompt to check in, the other is
                          a decision to respect. */}
                      {c.progress_shared === false
                        ? 'Not sharing mood with you'
                        : c.entry_count > 0
                          ? `${c.entry_count} entr${c.entry_count === 1 ? 'y' : 'ies'} · last ${sinceLabel(c.last_logged)}`
                          : 'No entries yet'}
                    </span>
                    {/* Their own words, unedited and unsummarised. This is the
                        thing a therapist most needs to see without clicking. */}
                    {c.latest_note ? (
                      <span className="mood-row-note">“{c.latest_note}”</span>
                    ) : null}
                  </span>

                  <MoodSpark points={c.recent} />

                  <span className={`mood-row-score mood-score-${tone}`}>
                    {latest == null ? '—' : latest}
                    <em>
                      {c.progress_shared === false
                        ? 'private'
                        : c.latest_mood || (latest == null ? 'no data' : '')}
                    </em>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Mood detail view ──
  return (
    <div className="mood-dashboard">
      {/* Back header */}
      <div className="mood-detail-header">
        <button className="mood-back-btn" onClick={() => setSelectedClient(null)}>
          <ChevronLeft size={20} />
          Back
        </button>
        <div className="mood-client-avatar">{selectedClient.name[0].toUpperCase()}</div>
        <div>
          <h2>{selectedClient.name}</h2>
          <p>Mood history · last 30 check-ins</p>
        </div>
      </div>

      {isMoodLoading ? (
        <div className="mood-loading"><div className="mood-spinner"></div><p>Loading mood data…</p></div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="mood-summary-grid">
            <div className="mood-summary-card" style={{ borderTopColor: MOOD_COLOR(summary.avg) }}>
              <div className="mood-summary-value">
                {summary.avg > 0 ? `${MOOD_EMOJI[summary.avg] || '😐'} ${summary.avg}/10` : '—'}
              </div>
              <div className="mood-summary-label">Average Mood</div>
            </div>
            <div className="mood-summary-card" style={{ borderTopColor: '#4f46e5' }}>
              <div className="mood-summary-value">{summary.total}</div>
              <div className="mood-summary-label">Total Check-ins</div>
            </div>
            <div className="mood-summary-card" style={{ borderTopColor: trendColor }}>
              <div className="mood-summary-value" style={{ color: trendColor }}>
                <TrendIcon size={24} />
                {summary.trend}
              </div>
              <div className="mood-summary-label">Recent Trend</div>
            </div>
          </div>

          {/* Mood trend chart */}
          {chartData.length >= 2 && (
            <div className="mood-chart-card">
              <h3>Mood Trend (last {chartData.length} check-ins)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis domain={[1, 10]} tick={{ fontSize: 11, fill: '#94a3b8' }} tickCount={5} />
                  <Tooltip
                    formatter={(v, _, p) => [`${v}/10 ${MOOD_EMOJI[v] || ''}`, 'Mood']}
                    labelStyle={{ fontSize: 12 }}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                  />
                  <Line type="monotone" dataKey="mood" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 4, fill: '#4f46e5' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Distribution chart */}
          {moodDistribution.length > 0 && (
            <div className="mood-chart-card">
              <h3>Mood Distribution</h3>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={moodDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="value" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                  <Tooltip formatter={(v) => [v, 'Check-ins']} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
                  <Bar dataKey="count" fill="#818cf8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Entry list */}
          <div className="mood-entries-card">
            <h3>All Check-ins ({moodEntries.length})</h3>
            {moodEntries.length === 0 ? (
              <div className="mood-empty">
                <Heart size={32} color="#e2e8f0" />
                <p>No mood check-ins recorded yet</p>
              </div>
            ) : (
              <div className="mood-entries-list">
                {moodEntries.map(entry => {
                  const val = Number(entry.moodValue) || 5;
                  return (
                    <div key={entry.id} className="mood-entry-row">
                      <div className="mood-entry-badge" style={{ background: `${MOOD_COLOR(val)}18`, border: `1px solid ${MOOD_COLOR(val)}40` }}>
                        <span className="mood-entry-emoji">{MOOD_EMOJI[val] || '😐'}</span>
                        <span className="mood-entry-val" style={{ color: MOOD_COLOR(val) }}>{val}/10</span>
                      </div>
                      <div className="mood-entry-body">
                        <div className="mood-entry-label">{entry.moodLabel || entry.mood || 'Check-in'}</div>
                        {entry.journalEntry && <p className="mood-entry-journal">"{entry.journalEntry}"</p>}
                        {entry.gratitude && <p className="mood-entry-gratitude">✅ {entry.gratitude}</p>}
                        {entry.challenges && <p className="mood-entry-challenges">⚡ {entry.challenges}</p>}
                      </div>
                      <div className="mood-entry-date">{fmtDate(entry.createdAt || entry.date)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
