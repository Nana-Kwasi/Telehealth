import React, { useState, useEffect } from 'react';
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

const MOOD_EMOJI = { 9:'😄', 8:'😊', 7:'🙂', 6:'🙂', 5:'😐', 4:'😰', 3:'😔', 2:'😢', 1:'😭' };
const MOOD_COLOR = (v) => v >= 7 ? '#10B981' : v >= 5 ? '#F59E0B' : '#EF4444';

export default function TherapistMoodDashboard() {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [moodEntries, setMoodEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMoodLoading, setIsMoodLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [summary, setSummary] = useState({ avg: 0, total: 0, trend: 'stable' });

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
            onChange={e => setSearchQuery(e.target.value)}
            className="mood-search-input"
          />
        </div>

        {filteredClients.length === 0 ? (
          <div className="mood-empty">
            <Heart size={48} color="#e2e8f0" />
            <p>{clients.length === 0 ? 'No clients assigned yet' : 'No clients match your search'}</p>
          </div>
        ) : (
          <div className="mood-clients-grid">
            {filteredClients.map(c => (
              <button key={c.id} className="mood-client-card" onClick={() => selectClient(c)}>
                <div className="mood-client-avatar">{c.name[0].toUpperCase()}</div>
                <div className="mood-client-info">
                  <div className="mood-client-name">{c.name}</div>
                  <div className="mood-client-email">{c.email}</div>
                </div>
                <div className={`mood-client-status mood-status-${c.status}`}>{c.status}</div>
              </button>
            ))}
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
