import React, { useState, useEffect } from 'react';
import { api } from '../../services/apiClient';
import Paged from './Paged';

/**
 * Surveys waiting for this person to answer.
 *
 * Rendered inside the notification centre so it sits where someone already
 * looks, rather than as another thing to find. Only surveys actually sent to
 * them appear — the backend refuses a response from anyone who was not a
 * recipient, so a forwarded link cannot skew the results.
 */
export default function FeedbackPrompt() {
  const [pending, setPending] = useState([]);
  const [answers, setAnswers] = useState({});
  const [busyId, setBusyId]   = useState(null);
  const [done, setDone]       = useState('');

  const load = async () => {
    try {
      const rows = await api('/api/v1/campaigns/feedback/pending');
      setPending(Array.isArray(rows) ? rows : []);
    } catch {
      setPending([]);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async (id) => {
    const a = answers[id] || {};
    if (!a.rating && !(a.comment || '').trim()) return;
    setBusyId(id);
    try {
      await api(`/api/v1/campaigns/${id}/feedback`, {
        method: 'POST',
        body: { rating: a.rating || null, comment: a.comment || null },
      });
      setDone('Thank you — your feedback has been recorded.');
      load();
    } catch (e) {
      setDone(e.message || 'Could not send your feedback.');
    } finally {
      setBusyId(null);
    }
  };

  if (!pending.length) return done ? <Note>{done}</Note> : null;

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      {done ? <Note>{done}</Note> : null}
      <Paged items={pending}>{(pending) => pending.map((p) => {
        const a = answers[p.id] || {};
        return (
          <div key={p.id} style={{ background: '#eff6ff', border: '1px solid #bfdbfe',
                                   borderRadius: 12, padding: '1.25rem', marginBottom: '0.75rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{p.title}</div>
            <div style={{ color: '#1e40af', fontSize: '0.85rem', margin: '0.3rem 0 0.9rem' }}>{p.subject}</div>

            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button"
                  onClick={() => setAnswers({ ...answers, [p.id]: { ...a, rating: n } })}
                  aria-label={`${n} out of 5`}
                  style={{
                    width: 40, height: 40, borderRadius: 10, cursor: 'pointer', fontWeight: 700,
                    border: a.rating === n ? '2px solid #1d4ed8' : '1px solid #cbd5e1',
                    background: a.rating === n ? '#dbeafe' : '#fff',
                    color: a.rating === n ? '#1e40af' : '#475569',
                  }}>{n}</button>
              ))}
            </div>

            <textarea rows={3} placeholder="Anything you would like to add? (optional)"
              value={a.comment || ''}
              onChange={(e) => setAnswers({ ...answers, [p.id]: { ...a, comment: e.target.value } })}
              style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #cbd5e1',
                       borderRadius: 8, fontSize: '0.85rem', boxSizing: 'border-box' }} />

            <button onClick={() => submit(p.id)} disabled={busyId === p.id}
              style={{ marginTop: '0.6rem', background: '#1d4ed8', color: '#fff', border: 'none',
                       borderRadius: 8, padding: '0.55rem 1.1rem', fontWeight: 600, cursor: 'pointer' }}>
              {busyId === p.id ? 'Sending…' : 'Send feedback'}
            </button>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
              Your answer is shared with the care team anonymously.
            </div>
          </div>
        );
      })}</Paged>
    </div>
  );
}

function Note({ children }) {
  return (
    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534',
                  padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.88rem' }}>
      {children}
    </div>
  );
}
