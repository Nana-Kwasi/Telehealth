import React, { useState, useEffect } from 'react';
import { ClipboardList } from 'lucide-react';
import { api } from '../../services/apiClient';

/**
 * The patient's own care plan.
 *
 * Only approved plans reach this screen — the server filters on
 * `visible_to_patient AND NOT is_draft`, so a draft a clinician is still
 * working on cannot appear here. That matters: an unapproved plan is a
 * machine's proposal, and a patient reading one would be taking instructions
 * from a model.
 *
 * What is shown is the plain-language summary the clinician approved, not the
 * structured plan, which is written for them.
 */
export default function MyCarePlan() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await api('/api/v1/care-plans');
        if (!cancelled) setPlans(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setPlans([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return null;

  return (
    <div style={S.page}>
      <header style={S.head}>
        <span style={S.icon}><ClipboardList size={20} /></span>
        <div>
          <h1 style={S.h1}>My care plan</h1>
          <p style={S.lead}>
            What your clinician has asked you to do. Ask them if anything here is
            unclear — this is a reminder, not a replacement for talking to them.
          </p>
        </div>
      </header>

      {plans.length === 0 ? (
        <section style={S.card}>
          <p style={S.empty}>
            You do not have a care plan yet. One appears here when your clinician
            shares it with you.
          </p>
        </section>
      ) : plans.map((p) => (
        <section key={p.id} style={S.card}>
          <div style={S.meta}>
            {p.approved_at ? `Shared ${fmt(p.approved_at)}` : `Added ${fmt(p.created_at)}`}
          </div>
          <div style={S.body}>
            {String(p.patient_summary || '').split(/\n+/).filter(Boolean).map((line, i) => (
              <p key={i} style={S.para}>{line}</p>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function fmt(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' :
    d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const S = {
  page: { padding: '1.5rem', maxWidth: 720, margin: '0 auto' },
  head: { display: 'flex', gap: '0.85rem', alignItems: 'flex-start', marginBottom: '1.25rem' },
  icon: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 44, height: 44, flexShrink: 0, borderRadius: 14,
    background: '#e6f6ec', color: '#12602f',
  },
  h1: { margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#15173a' },
  lead: { margin: '0.2rem 0 0', fontSize: '0.87rem', lineHeight: 1.55, color: '#565c6e' },
  card: {
    background: '#ffffff', border: '1px solid #e4e7ee', borderRadius: 18,
    padding: '1.1rem 1.2rem', marginBottom: '0.8rem',
  },
  meta: { fontSize: '0.75rem', color: '#656b7d', marginBottom: '0.5rem' },
  body: { display: 'flex', flexDirection: 'column' },
  para: { margin: '0 0 0.6rem', fontSize: '0.95rem', lineHeight: 1.7, color: '#2c3040' },
  empty: { margin: 0, fontSize: '0.88rem', lineHeight: 1.6, color: '#565c6e' },
};
