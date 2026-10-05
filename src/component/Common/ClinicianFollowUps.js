import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ClipboardList, Search, Send, Clock, CheckCircle2, AlertTriangle, X, ChevronRight,
} from 'lucide-react';
import { api, getStoredUserId } from '../../services/apiClient';
import CheckInReviewQueue from './CheckInReviewQueue';

/**
 * Follow-up check-ins: ask a patient something between appointments, and read
 * what comes back.
 *
 * Rebuilt around what a clinician actually opens this screen to do, which is
 * NOT "compose a question" — it is "did anyone answer me, and is anyone
 * overdue?". The previous layout led with a full-height unfiltered roster and
 * a compose form, and put responses in a panel that was permanently empty
 * because it read the caller's own pending questions rather than the ones they
 * had sent. Answers now lead; composing is a drawer you open when you want it.
 *
 * The question is always the clinician's, in their words. The system carries
 * it and records the reply; it does not write or interpret either.
 */

const QUESTION_TEMPLATES = [
  { label: 'Symptom rating',  text: 'How have your symptoms been since our last session? Rate them 0-10.' },
  { label: 'Medication',      text: 'Have you been able to take your medication as prescribed? Any side effects?' },
  { label: 'Sleep',           text: 'How has your sleep been this week? Roughly how many hours a night?' },
  { label: 'Mood',            text: 'How has your mood been since we last spoke?' },
  { label: 'Coping',          text: 'Have you been able to use the strategies we discussed? What got in the way?' },
];

const money = (n) => Number(n || 0);

export default function ClinicianFollowUps({ role = 'THERAPIST' }) {
  const [people, setPeople]     = useState([]);
  const [restricted, setRestricted] = useState(0);
  const [sent, setSent]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');
  const [message, setMessage]   = useState('');

  const [composing, setComposing] = useState(false);
  const [subject, setSubject]   = useState(null);
  const [query, setQuery]       = useState('');
  const [prompt, setPrompt]     = useState(QUESTION_TEMPLATES[0].text);
  const [dueIn, setDueIn]       = useState('3');
  const [series, setSeries]     = useState('');
  const [filter, setFilter]     = useState('all');
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [rows, mine] = await Promise.all([
        role === 'DOCTOR'
          ? api('/api/v1/doctors/me/patients').catch(() => [])
          : api('/api/v1/therapy-management/clients').catch(() => []),
        api('/api/v1/care/followups/sent').catch(() => []),
      ]);
      const list = Array.isArray(rows) ? rows : (rows?.items || []);

      // Only people actually assigned to this clinician. An admin therapist's
      // roster returns the whole platform, which is why the old list showed
      // four separate "Nana Kwasi" entries and twenty-odd strangers.
      const me = getStoredUserId();
      const own = list.filter((p) => !p.therapistId || String(p.therapistId) === String(me));
      setPeople(own.length ? own : list);
      setRestricted(own.length > 0 && own.length < list.length ? list.length - own.length : 0);
      setSent(Array.isArray(mine) ? mine : []);
    } catch (e) {
      setError(e?.message || 'Could not load your check-ins.');
    } finally { setLoading(false); }
  }, [role]);

  useEffect(() => { load(); }, [load]);

  const nameOf = (p) => p.fullName || p.name || p.displayName || p.email || 'Unnamed';

  const stats = useMemo(() => ({
    answered: sent.filter((f) => f.status === 'answered' || f.response).length,
    waiting:  sent.filter((f) => f.status === 'pending' && !f.overdue).length,
    overdue:  sent.filter((f) => f.overdue).length,
  }), [sent]);

  const visible = useMemo(() => {
    if (filter === 'answered') return sent.filter((f) => f.response);
    if (filter === 'waiting')  return sent.filter((f) => f.status === 'pending' && !f.overdue);
    if (filter === 'overdue')  return sent.filter((f) => f.overdue);
    return sent;
  }, [sent, filter]);

  const schedule = async () => {
    if (!subject) { setError('Choose a patient first.'); return; }
    if (!prompt.trim()) { setError('Write the question you want asked.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const due = new Date(Date.now() + Number(dueIn || 3) * 86400000);
      await api('/api/v1/care/followups', {
        method: 'POST',
        body: {
          patientId: subject.id,
          prompt: prompt.trim(),
          dueAt: due.toISOString().slice(0, 19),
          seriesKey: series.trim() || null,
        },
      });
      setMessage(`Scheduled — ${subject.name} will be asked in ${dueIn} day${dueIn === '1' ? '' : 's'}.`);
      setComposing(false);
      setSubject(null);
      setSeries('');
      await load();
    } catch (e) {
      setError(e?.message || 'Could not schedule that.');
    } finally { setBusy(false); }
  };

  if (loading) return <div style={S.loading}>Loading check-ins…</div>;

  return (
    <div style={S.page}>
      <div style={S.head}>
        <div style={S.headText}>
          <h1 style={S.h1}>
            <ClipboardList size={20} style={{ flexShrink: 0 }} />
            Follow-up check-ins
          </h1>
          <p style={S.lead}>
            Ask a patient something between appointments and see how their answers change.
          </p>
        </div>
        <button style={S.primary} onClick={() => { setComposing(true); setMessage(''); }}>
          <Send size={15} /> New check-in
        </button>
      </div>

      {error   ? <Banner tone="error" onClose={() => setError('')}>{error}</Banner> : null}
      {message ? <Banner tone="ok" onClose={() => setMessage('')}>{message}</Banner> : null}

      {/* What the clinician came here to find out, before anything else. */}
      <div style={S.stats}>
        <Stat label="Answered"  value={stats.answered} tone="ok"
              Icon={CheckCircle2} active={filter === 'answered'}
              onClick={() => setFilter(filter === 'answered' ? 'all' : 'answered')} />
        <Stat label="Waiting"   value={stats.waiting} tone="info"
              Icon={Clock} active={filter === 'waiting'}
              onClick={() => setFilter(filter === 'waiting' ? 'all' : 'waiting')} />
        <Stat label="Overdue"   value={stats.overdue} tone="warn"
              Icon={AlertTriangle} active={filter === 'overdue'}
              onClick={() => setFilter(filter === 'overdue' ? 'all' : 'overdue')} />
      </div>

      {/* Unread answers (safety flags first) and the follow-ups that run
          themselves once planned. */}
      <CheckInReviewQueue
        people={people.map((p) => ({ ...p, id: p.id || p.userId || p.clientId }))}
        nameOf={nameOf} />

      <div style={S.card}>
        <div style={S.cardHead}>
          <h2 style={S.h2}>
            {filter === 'all' ? 'All check-ins' :
             filter === 'answered' ? 'Answered' :
             filter === 'waiting' ? 'Waiting for a reply' : 'Overdue'}
          </h2>
          {filter !== 'all' ? (
            <button style={S.clear} onClick={() => setFilter('all')}>Show all</button>
          ) : null}
        </div>

        {visible.length === 0 ? (
          <p style={S.empty}>
            {sent.length === 0
              ? 'You have not sent any check-ins yet. Use “New check-in” to ask a patient something between appointments.'
              : 'Nothing in this group.'}
          </p>
        ) : (
          <div style={S.list}>
            {visible.map((f) => {
              const open = expanded === f.id;
              return (
                <div key={f.id} style={S.item}>
                  <button style={S.itemHead} onClick={() => setExpanded(open ? null : f.id)}>
                    <span style={S.itemMain}>
                      <span style={S.itemName}>{f.patient_name || f.patient_email || 'Patient'}</span>
                      <span style={S.itemPrompt}>{f.prompt}</span>
                    </span>
                    <span style={S.itemRight}>
                      {f.response
                        ? <span style={S.pillOk}>Answered</span>
                        : f.overdue
                          ? <span style={S.pillWarn}>Overdue</span>
                          : <span style={S.pillInfo}>Waiting</span>}
                      <ChevronRight
                        size={16}
                        style={{ color: '#9aa0b2', transform: open ? 'rotate(90deg)' : 'none' }}
                      />
                    </span>
                  </button>

                  {open ? (
                    <div style={S.itemBody}>
                      {f.response ? (
                        <>
                          <span style={S.answerLabel}>
                            Their answer
                            {f.responded_at
                              ? ` — ${new Date(f.responded_at).toLocaleDateString()}` : ''}
                          </span>
                          {/* Plain text. The patient's own words, not summarised. */}
                          <p style={S.answer}>{f.response}</p>
                        </>
                      ) : (
                        <p style={S.pendingNote}>
                          No answer yet. Due {new Date(f.due_at).toLocaleDateString()}.
                        </p>
                      )}
                      <p style={S.meta}>
                        Sent {f.created_at ? new Date(f.created_at).toLocaleDateString() : '—'}
                        {f.series_key ? ` · tracked as “${f.series_key}”` : ''}
                      </p>
                      <button
                        style={S.repeat}
                        onClick={() => {
                          setSubject({ id: f.patient_id, name: f.patient_name || 'Patient' });
                          setPrompt(f.prompt);
                          setSeries(f.series_key || '');
                          setComposing(true);
                        }}
                      >
                        Ask this again
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Compose drawer ── */}
      {composing ? (
        <div style={S.overlay} onClick={() => setComposing(false)}>
          <div style={S.drawer} onClick={(e) => e.stopPropagation()}>
            <div style={S.drawerHead}>
              <h2 style={S.h2}>New check-in</h2>
              <button style={S.iconBtn} onClick={() => setComposing(false)} aria-label="Close">
                <X size={17} />
              </button>
            </div>

            <div style={S.drawerBody}>
              <label style={S.label}>Who</label>
              {subject ? (
                <div style={S.chosen}>
                  <span>{subject.name}</span>
                  <button style={S.chosenX} onClick={() => setSubject(null)} aria-label="Change">
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <>
                  <div style={S.searchWrap}>
                    <Search size={15} style={S.searchIcon} />
                    <input
                      style={{ ...S.input, paddingLeft: '2.1rem' }}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by name or email…"
                      autoFocus
                    />
                  </div>
                  <div style={S.peopleBox}>
                    {people
                      .filter((p) => {
                        const q = query.trim().toLowerCase();
                        return !q || `${nameOf(p)} ${p.email || ''}`.toLowerCase().includes(q);
                      })
                      .slice(0, 40)
                      .map((p) => {
                        const id = p.id || p.userId || p.clientId;
                        return (
                          <button key={id} style={S.personRow}
                            onClick={() => { setSubject({ id, name: nameOf(p) }); setQuery(''); }}>
                            <span style={S.personName}>{nameOf(p)}</span>
                            {/* Email disambiguates namesakes — several accounts
                                can share a name. */}
                            {p.email ? <span style={S.personEmail}>{p.email}</span> : null}
                          </button>
                        );
                      })}
                  </div>
                  {restricted > 0 ? (
                    <p style={S.note}>
                      {restricted} other {restricted === 1 ? 'person is' : 'people are'} on the
                      platform but not assigned to you.
                    </p>
                  ) : null}
                </>
              )}

              <label style={{ ...S.label, marginTop: '1.1rem' }}>
                Your question — they see this exactly as written
              </label>
              <div style={S.templates}>
                {QUESTION_TEMPLATES.map((t) => (
                  <button
                    key={t.label}
                    style={prompt === t.text ? S.templateOn : S.template}
                    onClick={() => setPrompt(t.text)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <textarea
                style={{ ...S.input, minHeight: 88, resize: 'vertical', fontFamily: 'inherit' }}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />

              <div style={S.row2}>
                <div>
                  <label style={S.label}>Ask in</label>
                  <select style={S.input} value={dueIn} onChange={(e) => setDueIn(e.target.value)}>
                    {['1', '2', '3', '5', '7', '14', '30'].map((d) => (
                      <option key={d} value={d}>{d} day{d === '1' ? '' : 's'}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Track as (optional)</label>
                  <input
                    style={S.input}
                    value={series}
                    onChange={(e) => setSeries(e.target.value)}
                    placeholder="e.g. headache"
                  />
                  <span style={S.hint}>
                    Reuse the same label to see answers as a series over time.
                  </span>
                </div>
              </div>
            </div>

            <div style={S.drawerFoot}>
              <button
                style={subject && prompt.trim() && !busy ? S.primary : S.primaryOff}
                disabled={!subject || !prompt.trim() || busy}
                onClick={schedule}
              >
                {busy ? 'Scheduling…' : 'Schedule check-in'}
              </button>
              <button style={S.ghost} onClick={() => setComposing(false)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone, Icon, active, onClick }) {
  const tones = {
    ok:   { bg: '#f0fdf4', border: '#bbf7d0', fg: '#14532d' },
    info: { bg: '#eff6ff', border: '#bfdbfe', fg: '#14427e' },
    warn: { bg: '#fffbeb', border: '#fde68a', fg: '#8a4b09' },
  }[tone];
  return (
    <button
      onClick={onClick}
      style={{
        ...S.stat,
        background: tones.bg,
        borderColor: active ? tones.fg : tones.border,
        boxShadow: active ? `inset 0 0 0 1px ${tones.fg}` : 'none',
      }}
    >
      <Icon size={17} color={tones.fg} />
      <span style={{ ...S.statValue, color: tones.fg }}>{money(value)}</span>
      <span style={{ ...S.statLabel, color: tones.fg }}>{label}</span>
    </button>
  );
}

function Banner({ tone, children, onClose }) {
  const ok = tone === 'ok';
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem',
      background: ok ? '#f0fdf4' : '#fef2f2',
      border: `1px solid ${ok ? '#bbf7d0' : '#fecaca'}`,
      color: ok ? '#166534' : '#991b1b',
      padding: '0.7rem 0.9rem', borderRadius: 10, marginBottom: '1rem', fontSize: '0.85rem',
    }}>
      <span>{children}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: 'inherit', padding: 0, flexShrink: 0 }} aria-label="Dismiss">
        <X size={15} />
      </button>
    </div>
  );
}

/* Literal colours, each measured against its own background — this renders
   inside dashboard shells that do not define the zencare tokens. */
const S = {
  page: { padding: '1.5rem', maxWidth: 940, margin: '0 auto' },
  loading: { padding: '2rem', color: '#545a6b' },

  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' },
  headText: { minWidth: 0 },
  h1: { display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0,
        fontSize: '1.35rem', fontWeight: 800, color: '#0f1424' },
  h2: { margin: 0, fontSize: '0.95rem', fontWeight: 750, color: '#0f1424' },
  lead: { margin: '0.35rem 0 0', fontSize: '0.86rem', lineHeight: 1.55, color: '#545a6b' },

  stats: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
           gap: '0.7rem', marginBottom: '1.1rem' },
  stat: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.85rem 1rem',
          borderRadius: 14, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit',
          textAlign: 'left' },
  statValue: { fontSize: '1.25rem', fontWeight: 800 },
  statLabel: { fontSize: '0.8rem', fontWeight: 650 },

  card: { background: '#fff', border: '1px solid #e4e7ee', borderRadius: 16, padding: '1.1rem' },
  cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: '1rem', marginBottom: '0.85rem' },
  clear: { background: 'none', border: 'none', cursor: 'pointer', color: '#1d4ed8',
           fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit', padding: 0 },
  empty: { margin: 0, fontSize: '0.86rem', lineHeight: 1.6, color: '#6b7283' },

  list: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  item: { border: '1px solid #e4e7ee', borderRadius: 12, overflow: 'hidden' },
  itemHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: '0.9rem', width: '100%', padding: '0.8rem 0.9rem', background: '#fff',
              border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' },
  itemMain: { display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: 0, flex: 1 },
  itemName: { fontSize: '0.9rem', fontWeight: 700, color: '#0f1424' },
  itemPrompt: { fontSize: '0.79rem', color: '#6b7283', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  itemRight: { display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 },
  itemBody: { padding: '0.2rem 0.9rem 0.9rem', borderTop: '1px solid #f1f3f8' },

  answerLabel: { display: 'block', marginTop: '0.7rem', fontSize: '0.72rem', fontWeight: 800,
                 letterSpacing: '0.05em', textTransform: 'uppercase', color: '#6b7283' },
  answer: { margin: '0.35rem 0 0.6rem', padding: '0.65rem 0.8rem', borderRadius: 10,
            background: '#f7f9fc', border: '1px solid #e4e7ee',
            fontSize: '0.88rem', lineHeight: 1.6, color: '#16203a', whiteSpace: 'pre-wrap' },
  pendingNote: { margin: '0.7rem 0 0.5rem', fontSize: '0.83rem', color: '#6b7283' },
  meta: { margin: '0 0 0.7rem', fontSize: '0.74rem', color: '#8a90a0' },
  repeat: { background: '#f1f5fb', border: '1px solid #d8dce6', borderRadius: 8,
            padding: '0.4rem 0.8rem', fontSize: '0.78rem', fontWeight: 650,
            color: '#1a3ea8', cursor: 'pointer', fontFamily: 'inherit' },

  pillOk:   { padding: '0.14rem 0.5rem', borderRadius: 999, background: '#dcfce7',
              color: '#14532d', fontSize: '0.68rem', fontWeight: 800 },
  pillInfo: { padding: '0.14rem 0.5rem', borderRadius: 999, background: '#eff6ff',
              color: '#14427e', fontSize: '0.68rem', fontWeight: 800 },
  pillWarn: { padding: '0.14rem 0.5rem', borderRadius: 999, background: '#fffbeb',
              color: '#8a4b09', fontSize: '0.68rem', fontWeight: 800 },

  overlay: { position: 'fixed', inset: 0, zIndex: 1400, display: 'flex',
             justifyContent: 'flex-end', background: 'rgba(16,22,48,0.4)' },
  drawer: { display: 'flex', flexDirection: 'column', width: 'min(460px, 100%)',
            height: '100%', background: '#fff', boxShadow: '-20px 0 60px rgba(16,22,48,0.25)' },
  drawerHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '1rem 1.1rem', borderBottom: '1px solid #edeff4', flexShrink: 0 },
  drawerBody: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '1.1rem' },
  drawerFoot: { display: 'flex', gap: '0.6rem', padding: '0.9rem 1.1rem',
                borderTop: '1px solid #edeff4', flexShrink: 0 },
  iconBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30,
             border: 'none', borderRadius: 8, background: '#f1f3f8', color: '#454b5c',
             cursor: 'pointer' },

  label: { display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#2b3142',
           marginBottom: '0.35rem' },
  hint: { display: 'block', marginTop: '0.25rem', fontSize: '0.71rem', lineHeight: 1.45,
          color: '#6b7283' },
  note: { margin: '0.5rem 0 0', fontSize: '0.73rem', color: '#6b7283' },
  input: { width: '100%', padding: '0.6rem 0.7rem', border: '1.5px solid #d8dce6',
           borderRadius: 10, fontSize: '0.87rem', color: '#0f1424', background: '#fff',
           boxSizing: 'border-box' },
  searchWrap: { position: 'relative' },
  searchIcon: { position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)',
                color: '#9aa0b2', pointerEvents: 'none' },

  peopleBox: { marginTop: '0.5rem', maxHeight: 210, overflowY: 'auto',
               border: '1px solid #e4e7ee', borderRadius: 10, padding: '0.3rem' },
  personRow: { display: 'flex', flexDirection: 'column', gap: '0.1rem', width: '100%',
               textAlign: 'left', padding: '0.5rem 0.6rem', border: 'none', borderRadius: 8,
               background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' },
  personName: { fontSize: '0.86rem', fontWeight: 650, color: '#16203a' },
  personEmail: { fontSize: '0.73rem', color: '#6b7283' },

  chosen: { display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.55rem 0.45rem 0.85rem',
            borderRadius: 999, background: '#eff4ff', color: '#1a3ea8',
            fontSize: '0.85rem', fontWeight: 700 },
  chosenX: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20,
             border: 'none', borderRadius: '50%', background: '#1a3ea8', color: '#fff',
             cursor: 'pointer', padding: 0 },

  templates: { display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.5rem' },
  template: { padding: '0.3rem 0.65rem', borderRadius: 999, border: '1.5px solid #d8dce6',
              background: '#fff', color: '#4a5163', fontSize: '0.75rem', fontWeight: 650,
              cursor: 'pointer', fontFamily: 'inherit' },
  templateOn: { padding: '0.3rem 0.65rem', borderRadius: 999, border: '1.5px solid #1d4ed8',
                background: '#eff4ff', color: '#1a3ea8', fontSize: '0.75rem', fontWeight: 750,
                cursor: 'pointer', fontFamily: 'inherit' },

  row2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '0.8rem', marginTop: '1rem' },

  primary: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.65rem 1.2rem',
             border: 'none', borderRadius: 10, background: '#1d4ed8', color: '#fff',
             fontSize: '0.87rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  primaryOff: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.65rem 1.2rem',
                border: 'none', borderRadius: 10, background: '#1d4ed8', color: '#fff',
                fontSize: '0.87rem', fontWeight: 700, opacity: 0.4, cursor: 'not-allowed',
                fontFamily: 'inherit' },
  ghost: { padding: '0.65rem 1.2rem', border: '1.5px solid #d8dce6', borderRadius: 10,
           background: '#fff', color: '#2b3142', fontSize: '0.87rem', fontWeight: 700,
           cursor: 'pointer', fontFamily: 'inherit' },
};
