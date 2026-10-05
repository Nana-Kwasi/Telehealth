import React, { useState, useEffect } from 'react';
import { ClipboardCheck, AlertTriangle } from 'lucide-react';
import { api } from '../../services/apiClient';

/**
 * "Before therapy": what this client has told us since last time — their
 * latest weekly check-in, recent mood entries, open goals and homework, and
 * the last session note. All of it is what they or the therapist entered;
 * nothing here is generated.
 */
const SCALE = { mood: 'Mood', anxiety: 'Anxiety', stress: 'Stress', energy: 'Energy' };

export default function PreSessionBrief({ clientId }) {
  const [d, setD] = useState(null);

  useEffect(() => {
    if (!clientId) return;
    api(`/api/v1/ai/sessions/pre-brief?clientId=${clientId}`).then(setD).catch(() => setD(null));
  }, [clientId]);

  if (!d) return null;
  let ci = null;
  try { ci = d.lastCheckIn?.answers ? JSON.parse(d.lastCheckIn.answers) : null; } catch { ci = null; }
  const moods = d.moods || [];
  const nothing = !ci && !moods.length && !(d.goals || []).length && !(d.homework || []).length && !d.lastNote;

  return (
    <section style={S.card} aria-label="Before the session">
      <header style={S.head}>
        <span style={S.icon}><ClipboardCheck size={17} /></span>
        <div>
          <h2 style={S.title}>Before the session</h2>
          <p style={S.sub}>What this client has shared since last time.</p>
        </div>
      </header>
      {d.flagged ? <p style={S.flag}><AlertTriangle size={14} /> A check-in in the last two weeks raised a safety concern.</p> : null}
      {nothing ? <p style={S.sub}>Nothing new has been entered yet.</p> : null}

      {ci ? (
        <div style={S.block}>
          <div style={S.label}>Latest weekly check-in · {new Date(d.lastCheckIn.responded_at).toLocaleDateString()}</div>
          <div style={S.line}>
            {Object.keys(SCALE).filter((k) => ci[k] != null).map((k) => `${SCALE[k]} ${ci[k]}/10`).join(' · ')}
            {ci.sleepHours != null ? ` · Sleep ${ci.sleepHours}h` : ''}
          </div>
          {ci.events ? <div style={S.quote}>“{ci.events}”</div> : null}
        </div>
      ) : null}

      {moods.length ? (
        <div style={S.block}>
          <div style={S.label}>Mood entries (last 2 weeks)</div>
          {moods.slice(0, 4).map((m, i) => (
            <div key={i} style={S.line}>{new Date(m.created_at).toLocaleDateString()} · {m.mood}{m.mood_value != null ? ` (${m.mood_value})` : ''}
              {m.challenges ? <span style={S.quote}> — “{m.challenges}”</span> : null}</div>
          ))}
        </div>
      ) : null}

      {(d.goals || []).length ? (
        <div style={S.block}>
          <div style={S.label}>Goals</div>
          {d.goals.map((g, i) => <div key={i} style={S.line}>{g.goal_title}{g.progress != null ? ` · ${g.progress}%` : ''}</div>)}
        </div>
      ) : null}

      {(d.homework || []).length ? (
        <div style={S.block}>
          <div style={S.label}>Homework</div>
          {d.homework.map((h, i) => <div key={i} style={S.line}>{h.title} · {h.status === 'submitted' ? 'answered' : 'not answered yet'}</div>)}
        </div>
      ) : null}

      {d.lastNote ? (
        <div style={S.block}>
          <div style={S.label}>Last session note · {new Date(d.lastNote.created_at).toLocaleDateString()}</div>
          <div style={S.line}>{d.lastNote.excerpt}{d.lastNote.excerpt?.length >= 500 ? '…' : ''}</div>
        </div>
      ) : null}
    </section>
  );
}

const S = {
  card: { background: '#fff', border: '1px solid #e4e7ee', borderRadius: 16, padding: '1rem 1.1rem', marginBottom: '1.25rem' },
  head: { display: 'flex', gap: '0.7rem', alignItems: 'flex-start', marginBottom: '0.4rem' },
  icon: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, flexShrink: 0, borderRadius: 10, background: '#ecfdf3', color: '#067647' },
  title: { margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#15173a' },
  sub: { margin: '0.15rem 0 0', fontSize: '0.78rem', color: '#565c6e' },
  flag: { display: 'flex', gap: '0.35rem', alignItems: 'center', fontSize: '0.82rem', fontWeight: 700, color: '#8f1d17', margin: '0.4rem 0' },
  block: { padding: '0.45rem 0', borderTop: '1px solid #f1f2f6' },
  label: { fontSize: '0.74rem', fontWeight: 800, color: '#3d4257', marginBottom: '0.15rem' },
  line: { fontSize: '0.84rem', color: '#2c3040', lineHeight: 1.5 },
  quote: { fontSize: '0.82rem', color: '#475569', fontStyle: 'italic' },
};
