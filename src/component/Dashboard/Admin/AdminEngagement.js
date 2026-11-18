import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../services/apiClient';

/*
 * Practice & engagement (super admin): how the practice tools, journal and
 * community are used, the announcement log, reminder texts and calls, and
 * safety flags still waiting for a person.
 *
 * Counts and logs only. Journals, private notes, questionnaire answers and note
 * text are private health data and are never shown here.
 */

const BASE = '/api/v1/admin/engagement';
const FEATURE_LABEL = {
  journal: 'My Journal', community: 'Community groups', scoredMeasures: 'Questionnaires', psychRecord: 'Psychiatry record',
  intakeForms: 'Intake forms', customTemplates: 'Custom templates', practiceAnnouncements: 'Clinician announcements',
  calendarSync: 'Calendar sync', waitlistAutoOffers: 'Automatic waitlist offers', reminderCalls: 'Reminder phone calls',
};
const PURPOSE = { 'appointment.reminder': 'Appointment reminder', 'appointment.cancelled': 'Session cancelled', 'waitlist.offer': 'Waitlist offer', 'practice.announcement': 'Announcement' };
const STATUS_TONE = { SENT: '#15803d', DELIVERED: '#15803d', PLACED: '#15803d', FAILED: '#b91c1c', UNDELIVERED: '#b91c1c', NOT_CONFIGURED: '#b45309', QUIET_HOURS: '#64748b', SWITCHED_OFF: '#64748b', QUEUED: '#2563eb' };
const SOURCE = { journal: 'Journal', questionnaire: 'Questionnaire', community_post: 'Community post', community_comment: 'Community reply', community_report: 'Community report' };
const when = (d) => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export default function AdminEngagement() {
  const [tab, setTab] = useState('overview');
  const [days, setDays] = useState(30);
  const [o, setO] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { api(`${BASE}/overview?days=${days}`).then(setO).catch((e) => setError(e?.message || 'Could not load.')); }, [days]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Practice & engagement</h1>
          <p className="admin-page-sub">
            How clinicians and patients use the practice tools, journal and community. Counts and logs only: journals,
            private notes and questionnaire answers stay private. Switch features off or change limits in{' '}
            <Link to="/dashboard/system-config">System Config</Link>.
          </p>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period" style={S.select}>
          <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last year</option>
        </select>
      </div>
      <div style={S.tabs} role="tablist">
        {[['overview', 'Overview'], ['safety', `Safety${o && o.safetyWaiting ? ` (${o.safetyWaiting})` : ''}`], ['announcements', 'Announcements'], ['messages', 'Texts & calls']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} style={{ ...S.tab, ...(tab === k ? S.tabOn : null), ...(k === 'safety' && o && o.safetyWaiting ? S.tabAlert : null) }}>{l}</button>
        ))}
      </div>
      {error && <p style={S.err}>{error}</p>}
      {tab === 'overview' && (o ? <Overview o={o} /> : <p style={S.muted}>Loading…</p>)}
      {tab === 'safety' && <Safety onChanged={load} />}
      {tab === 'announcements' && <Announcements />}
      {tab === 'messages' && <Messages />}
    </div>
  );
}

function Stat({ label, value, warn }) {
  return (
    <div style={{ ...S.stat, ...(warn ? S.statWarn : null) }}>
      <span style={S.statLabel}>{label}</span>
      <strong style={S.statValue}>{value ?? 0}</strong>
    </div>
  );
}

function Block({ title, children, off }) {
  return (
    <div style={S.card}>
      <div style={S.blockHead}><b>{title}</b>{off ? <span style={S.offBadge}>Switched off</span> : null}</div>
      <div style={S.stats}>{children}</div>
    </div>
  );
}

function Overview({ o }) {
  const f = o.features || {};
  const sum = (list, ok) => (list || []).filter((r) => ok.includes(r.status)).reduce((a, r) => a + Number(r.count), 0);
  const texts = o.messages.texts, calls = o.messages.calls;
  return (
    <>
      <div style={S.card}>
        <b>Features</b>
        <div style={{ ...S.stats, marginTop: 8 }}>
          {Object.keys(FEATURE_LABEL).map((k) => (
            <span key={k} style={{ ...S.pill, ...(f[k] === false ? S.pillOff : S.pillOn) }}>{f[k] === false ? '○' : '●'} {FEATURE_LABEL[k]}</span>
          ))}
        </div>
      </div>
      <Block title="My Journal" off={f.journal === false}>
        <Stat label="Entries" value={o.journal.entries} />
        <Stat label="People writing" value={o.journal.writers} />
        <Stat label="Shared with care team" value={o.journal.shared} />
        <Stat label="In a programme now" value={o.journal.inProgrammes} />
        <Stat label="Daily reminder on" value={o.journal.remindersOn} />
      </Block>
      <Block title="Community" off={f.community === false}>
        <Stat label="Groups" value={o.community.groups} />
        <Stat label="Groups with no moderator" value={o.community.groupsWithoutModerator} warn={o.community.groupsWithoutModerator > 0} />
        <Stat label="Members" value={o.community.members} />
        <Stat label="Posts" value={o.community.posts} />
        <Stat label="Replies" value={o.community.replies} />
        <Stat label="Waiting for a moderator" value={o.community.waitingForModerator} warn={o.community.waitingForModerator > 0} />
        <Stat label="Open reports" value={o.community.openReports} warn={o.community.openReports > 0} />
        <Stat label="Moderator actions" value={o.community.moderatorActions} />
      </Block>
      <div style={S.linkRow}><Link to="/dashboard/community-moderation">Manage groups, moderators and the review queue ›</Link></div>
      <Block title="Questionnaires (PHQ-9, GAD-7)" off={f.scoredMeasures === false}>
        <Stat label="Sent" value={o.questionnaires.sent} />
        <Stat label="Answered" value={o.questionnaires.completed} />
        <Stat label="Self-harm answers" value={o.questionnaires.safetyFlags} warn={o.questionnaires.safetyFlags > 0} />
      </Block>
      <Block title="Psychiatry record" off={f.psychRecord === false}>
        <Stat label="Mental status exams" value={o.psychRecord.mentalStatusExams} />
        <Stat label="Diagnoses added" value={o.psychRecord.diagnoses} />
        <Stat label="Treatment plans" value={o.psychRecord.treatmentPlans} />
        <Stat label="Private notes" value={o.psychRecord.privateNotes} />
      </Block>
      <Block title="Intake forms and templates" off={f.intakeForms === false && f.customTemplates === false}>
        <Stat label="Packets sent" value={o.intake.sent} />
        <Stat label="Packets finished" value={o.intake.completed} />
        <Stat label="Signatures" value={o.intake.signatures} />
        <Stat label="Custom forms answered" value={o.intake.customFormsAnswered} />
        <Stat label="Note templates" value={o.templates.noteTemplates} />
        <Stat label="Client forms" value={o.templates.clientForms} />
        <Stat label="Notes written with a template" value={o.templates.notesWritten} />
      </Block>
      <Block title="Practice tools">
        <Stat label="Announcements" value={o.practice.announcements} />
        <Stat label="Clients reached" value={o.practice.announcementRecipients} />
        <Stat label="Calendar links on" value={o.practice.calendarLinks} />
        <Stat label="People on waitlists" value={o.practice.waiting} />
        <Stat label="Clinicians with auto offers" value={o.practice.autoOffersOn} />
        <Stat label="Freed times offered" value={o.practice.autoOffersMade} />
        <Stat label="Upcoming time off" value={o.practice.upcomingTimeOff} />
        <Stat label="Clinicians with goals" value={o.practice.goalsSet} />
      </Block>
      <Block title="Reminder texts and calls">
        <Stat label="Texts sent" value={sum(texts, ['SENT', 'DELIVERED'])} />
        <Stat label="Texts failed" value={sum(texts, ['FAILED', 'UNDELIVERED'])} warn={sum(texts, ['FAILED', 'UNDELIVERED']) > 0} />
        <Stat label="Texts not sent (SMS not set up or off)" value={sum(texts, ['NOT_CONFIGURED', 'SWITCHED_OFF'])} />
        <Stat label="Calls placed" value={sum(calls, ['PLACED'])} />
        <Stat label="Calls failed" value={sum(calls, ['FAILED'])} warn={sum(calls, ['FAILED']) > 0} />
        <Stat label="Calls not placed (not set up)" value={sum(calls, ['NOT_CONFIGURED'])} />
        <Stat label="Calls skipped (night)" value={sum(calls, ['QUIET_HOURS'])} />
        <Stat label="Clinicians with call reminders" value={o.messages.voiceRemindersOn} />
        <Stat label="Clinicians with text reminders off" value={o.messages.textRemindersOff} />
      </Block>
    </>
  );
}

function Safety({ onChanged }) {
  const [list, setList] = useState(null);
  const [all, setAll] = useState(false);
  const [notes, setNotes] = useState({});
  const [msg, setMsg] = useState('');
  const load = useCallback(() => { api(`${BASE}/safety?includeFollowed=${all}`).then((l) => setList(Array.isArray(l) ? l : [])).catch(() => setList([])); }, [all]);
  useEffect(() => { load(); }, [load]);
  const done = async (item) => {
    setMsg('');
    try {
      await api(`${BASE}/safety/${item.source}/${item.id}/follow-up`, { method: 'POST', body: { note: notes[`${item.source}-${item.id}`] || '' } });
      setMsg('Marked as followed up.'); load(); onChanged();
    } catch (e) { setMsg(e?.message || 'Could not save.'); }
  };
  return (
    <>
      <p style={S.muted}>
        The last 30 days. Each was sent straight to the people named under “Told”. Use this list to make sure someone
        followed up, then record it. You see where a flag came from, never what was written. Private journal entries are never listed.
      </p>
      <label style={S.check}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show ones already followed up</label>
      {msg && <p style={S.ok}>{msg}</p>}
      {list === null ? <p style={S.muted}>Loading…</p> : list.length === 0 ? <div style={S.card}><p style={{ margin: 0 }}>Nothing waiting. Every safety flag has been followed up.</p></div> : list.map((i) => {
        const key = `${i.source}-${i.id}`;
        return (
          <div key={key} style={{ ...S.card, borderLeft: `4px solid ${i.followed_at ? '#94a3b8' : '#dc2626'}` }}>
            <div style={S.top}>
              <b>{SOURCE[i.source] || i.source}</b>
              <span>{i.person} <span style={S.muted}>({String(i.person_role || '').toLowerCase()})</span></span>
              <span style={{ ...S.muted, marginLeft: 'auto' }}>{when(i.at)}</span>
            </div>
            <p style={{ margin: '0.3rem 0' }}>{i.what}</p>
            <p style={S.muted}>Told: {i.told}</p>
            {i.followed_at ? (
              <p style={S.muted}>Followed up by {i.followed_by || 'an administrator'} on {when(i.followed_at)}{i.note ? ` — “${i.note}”` : ''}</p>
            ) : (
              <div style={S.actions}>
                <input style={S.input} placeholder="What was done (for example: therapist called them today)" value={notes[key] || ''} onChange={(e) => setNotes({ ...notes, [key]: e.target.value })} />
                <button className="btn btn-primary" onClick={() => done(i)}>Mark followed up</button>
                <Link className="btn" to={`/dashboard/users/${i.person_role === 'CLIENT' ? 'clients' : 'auth'}/${i.person_id}`}>Open account</Link>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function Announcements() {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);
  useEffect(() => { api(`${BASE}/announcements?limit=200`).then((l) => setList(Array.isArray(l) ? l : [])).catch(() => setList([])); }, []);
  if (list === null) return <p style={S.muted}>Loading…</p>;
  if (list.length === 0) return <div style={S.card}><p style={{ margin: 0 }}>No announcements yet.</p></div>;
  return (
    <div style={S.card}>
      <table style={S.table}>
        <thead><tr><th style={S.th}>Sent</th><th style={S.th}>Clinician</th><th style={S.th}>Title</th><th style={S.th}>Clients</th><th style={S.th}>Texts</th><th style={S.th} /></tr></thead>
        <tbody>
          {list.map((a) => (
            <React.Fragment key={a.id}>
              <tr>
                <td style={S.td}>{when(a.created_at)}</td>
                <td style={S.td}>{a.clinician_name} <span style={S.muted}>({String(a.clinician_role || '').toLowerCase()})</span></td>
                <td style={S.td}>{a.title}</td>
                <td style={S.td}>{a.recipient_count}</td>
                <td style={S.td}>{a.sent_text ? a.text_count : '—'}</td>
                <td style={S.td}><button type="button" style={S.link} onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? 'Hide' : 'Read'}</button></td>
              </tr>
              {open === a.id && <tr><td colSpan={6} style={{ ...S.td, whiteSpace: 'pre-wrap', background: '#f8fafc' }}>{a.body}</td></tr>}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Messages() {
  const [channel, setChannel] = useState('texts');
  const [status, setStatus] = useState('');
  const [list, setList] = useState(null);
  useEffect(() => {
    setList(null);
    api(`${BASE}/messages?channel=${channel}${status ? `&status=${status}` : ''}&limit=300`).then((l) => setList(Array.isArray(l) ? l : [])).catch(() => setList([]));
  }, [channel, status]);
  const statuses = channel === 'calls' ? ['PLACED', 'FAILED', 'NOT_CONFIGURED', 'QUIET_HOURS'] : ['SENT', 'DELIVERED', 'FAILED', 'UNDELIVERED', 'NOT_CONFIGURED', 'SWITCHED_OFF'];
  return (
    <>
      <div style={S.actions}>
        <select value={channel} onChange={(e) => { setChannel(e.target.value); setStatus(''); }} style={S.select} aria-label="Channel">
          <option value="texts">Texts</option><option value="calls">Reminder calls</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={S.select} aria-label="Status">
          <option value="">Any status</option>{statuses.map((x) => <option key={x} value={x}>{x.replace('_', ' ').toLowerCase()}</option>)}
        </select>
        <Link to="/dashboard/sms-follow-up">All texts (prescriptions, codes) are under SMS Follow-up ›</Link>
      </div>
      <p style={S.muted}>Numbers are masked, and what the message said is not shown.</p>
      {list === null ? <p style={S.muted}>Loading…</p> : list.length === 0 ? <div style={S.card}><p style={{ margin: 0 }}>None.</p></div> : (
        <div style={S.card}>
          <table style={S.table}>
            <thead><tr><th style={S.th}>When</th><th style={S.th}>For</th><th style={S.th}>Number</th><th style={S.th}>What</th><th style={S.th}>Status</th><th style={S.th}>Error</th></tr></thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id}>
                  <td style={S.td}>{when(m.created_at)}</td>
                  <td style={S.td}>{m.person || '—'}</td>
                  <td style={S.td}>{m.phone}</td>
                  <td style={S.td}>{PURPOSE[m.purpose] || m.purpose}</td>
                  <td style={{ ...S.td, color: STATUS_TONE[m.status] || '#334155', fontWeight: 700 }}>{String(m.status).replace('_', ' ').toLowerCase()}</td>
                  <td style={{ ...S.td, ...S.muted }}>{m.error || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const S = {
  tabs: { display: 'flex', gap: '0.4rem', margin: '0.5rem 0 1rem', flexWrap: 'wrap' },
  tab: { padding: '0.35rem 0.8rem', borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' },
  tabOn: { background: '#0f172a', color: '#fff', borderColor: '#0f172a' },
  tabAlert: { borderColor: '#dc2626' },
  card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.9rem 1rem', marginBottom: '0.75rem', overflowX: 'auto' },
  blockHead: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' },
  offBadge: { fontSize: '0.7rem', fontWeight: 700, color: '#b45309', background: '#fef3c7', borderRadius: 999, padding: '0.1rem 0.5rem' },
  stats: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem' },
  stat: { border: '1px solid #f1f5f9', background: '#f8fafc', borderRadius: 10, padding: '0.5rem 0.75rem', minWidth: 140, flex: '1 1 140px' },
  statWarn: { background: '#fff7ed', borderColor: '#fed7aa' },
  statLabel: { display: 'block', fontSize: '0.75rem', color: '#64748b' },
  statValue: { fontSize: '1.3rem', color: '#0f172a' },
  pill: { fontSize: '0.78rem', fontWeight: 600, borderRadius: 999, padding: '0.2rem 0.6rem' },
  pillOn: { background: '#dcfce7', color: '#166534' },
  pillOff: { background: '#f1f5f9', color: '#64748b' },
  linkRow: { margin: '-0.4rem 0 0.75rem', fontSize: '0.85rem' },
  top: { display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' },
  actions: { display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', margin: '0.4rem 0' },
  input: { flex: '1 1 260px', padding: '0.45rem 0.6rem', border: '1px solid #cbd5e1', borderRadius: 8 },
  select: { padding: '0.4rem 0.6rem', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff' },
  check: { display: 'flex', gap: '0.4rem', alignItems: 'center', margin: '0.3rem 0 0.75rem', fontSize: '0.88rem' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
  th: { textAlign: 'left', padding: '0.4rem', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600 },
  td: { padding: '0.45rem 0.4rem', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' },
  link: { border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', fontWeight: 600, padding: 0 },
  muted: { color: '#64748b', fontSize: '0.85rem', margin: '0.2rem 0' },
  ok: { color: '#15803d' },
  err: { color: '#b91c1c' },
};
