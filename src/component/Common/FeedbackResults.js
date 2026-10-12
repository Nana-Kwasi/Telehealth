import React, { useState, useEffect } from 'react';
import { api } from '../../services/apiClient';
import Paged from './Paged';

/**
 * Feedback results for doctors and therapists.
 *
 * Aggregate only, deliberately. Ratings are counted and comments are shown
 * without any author attached — a provider seeing "3 people rated us 2/5" is
 * useful; a provider reading one named patient's private complaint about
 * unrelated care is not.
 */
export default function FeedbackResults() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await api('/api/v1/campaigns/feedback/results');
        setRows(Array.isArray(r) ? r : []);
      } catch (e) {
        setError(e.message || 'Could not load feedback.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div style={{ padding: '1.5rem', maxWidth: 900 }}>
      <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.35rem' }}>Patient feedback</h1>
      <p style={{ margin: '0 0 1.25rem', color: '#64748b', fontSize: '0.9rem' }}>
        Results from platform feedback surveys. Responses are anonymous.
      </p>

      {error ? (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b',
                      padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem' }}>{error}</div>
      ) : null}

      {loading ? (
        <div style={{ color: '#64748b' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ ...card, color: '#64748b', textAlign: 'center' }}>
          No feedback surveys have been run yet.
        </div>
      ) : <Paged items={rows}>{(rows) => rows.map((r) => {
        const total = Number(r.responses || 0);
        return (
          <div key={r.id} style={{ ...card, marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{r.title}</div>
              <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                {total} response{total === 1 ? '' : 's'}
                {r.average_rating ? ` · average ${r.average_rating} / 5` : ''}
              </div>
            </div>

            {total > 0 ? (
              <div style={{ marginTop: '0.9rem' }}>
                {[['5', r.five], ['4', r.four], ['3', r.three], ['2', r.two], ['1', r.one]].map(([star, count]) => {
                  const n = Number(count || 0);
                  const pct = total ? Math.round((n / total) * 100) : 0;
                  return (
                    <div key={star} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: 4 }}>
                      <span style={{ width: 16, fontSize: '0.8rem', color: '#64748b' }}>{star}★</span>
                      <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 999, height: 8 }}>
                        <div style={{ width: `${pct}%`, background: '#1d4ed8', height: 8, borderRadius: 999 }} />
                      </div>
                      <span style={{ width: 34, fontSize: '0.78rem', color: '#64748b', textAlign: 'right' }}>{n}</span>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {(r.comments || []).length ? (
              <div style={{ marginTop: '1rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.85rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  What people said
                </div>
                {r.comments.map((c, i) => (
                  <div key={i} style={{ background: '#f8fafc', borderRadius: 8, padding: '0.6rem 0.8rem',
                                        marginBottom: '0.4rem', fontSize: '0.85rem', color: '#334155' }}>
                    {c.rating ? <strong style={{ marginRight: 6 }}>{c.rating}★</strong> : null}
                    {c.comment}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}</Paged>}
    </div>
  );
}

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.25rem' };
