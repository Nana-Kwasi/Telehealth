import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/apiClient';
import './Measures.css';
import './PsychRecord.css';
import './Journal.css';
import './Community.css';

/*
 * Community (patients and clients): groups by condition or goal, moderated by
 * NessaHub. People post under a nickname. Posts that need a moderator first are
 * shown to their writer as "waiting for a moderator", never silently dropped.
 */

const REACTIONS = [['encourage', '💪', 'Encourage'], ['relate', '🤝', 'Me too'], ['thanks', '🙏', 'Thank you']];
const REPORT_REASONS = [
  ['worrying', 'I am worried about this person'], ['unkind', 'Unkind or bullying'], ['unsafe_advice', 'Unsafe health advice'],
  ['selling', 'Selling or advertising'], ['personal_details', 'Shares personal details'], ['other', 'Something else'],
];
const CATEGORY = { medical: 'Health conditions', lifestyle: 'Fitness, beauty and longevity', mind: 'Mind and feelings' };
const ago = (d) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export default function Community() {
  const [me, setMe] = useState(null);
  const [groups, setGroups] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    api('/api/v1/community/me').then(setMe).catch((e) => setError(e?.message || 'Could not load.'));
    api('/api/v1/community/groups').then((g) => setGroups(Array.isArray(g) ? g : [])).catch(() => setGroups([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!me || !groups) return <div className="ms-wrap jr-wrap"><p className="ms-muted">{error || 'Loading…'}</p></div>;
  if (!me.nickname) return <div className="ms-wrap jr-wrap"><NicknameSetup onDone={load} /></div>;
  if (open) return <div className="ms-wrap jr-wrap"><GroupView group={open} me={me} onBack={() => { setOpen(null); load(); }} /></div>;

  const joined = groups.filter((g) => g.joined);
  const byCat = ['medical', 'lifestyle', 'mind'].map((c) => [c, groups.filter((g) => !g.joined && g.category === c)]);
  return (
    <div className="ms-wrap jr-wrap">
      <div className="jr-head">
        <div>
          <h2 style={{ margin: 0 }}>Community</h2>
          <p className="ms-muted" style={{ margin: '0.2rem 0 0' }}>Groups where people on the same journey encourage each other between visits. You appear as <strong>{me.nickname}</strong>.</p>
        </div>
        <NicknameChange me={me} onDone={load} />
      </div>
      <div className="cm-notice">Groups are for support and shared experience, not medical advice. Your clinician decides your treatment. In an emergency, call 112.</div>
      {joined.length > 0 && (
        <div className="ms-card">
          <h3 className="ms-title">My groups</h3>
          <div className="cm-grid">{joined.map((g) => <GroupCard key={g.id} g={g} onOpen={() => setOpen(g)} />)}</div>
        </div>
      )}
      {byCat.map(([c, list]) => list.length > 0 && (
        <div key={c} className="ms-card">
          <h3 className="ms-title">{CATEGORY[c]}</h3>
          <div className="cm-grid">{list.map((g) => <GroupCard key={g.id} g={g} onOpen={() => setOpen(g)} />)}</div>
        </div>
      ))}
    </div>
  );
}

function GroupCard({ g, onOpen }) {
  return (
    <button className="cm-group" onClick={onOpen}>
      <strong>{g.name}</strong>
      <span className="ms-muted">{g.description}</span>
      <span className="cm-meta">{g.members} member{Number(g.members) === 1 ? '' : 's'}{g.joined ? ' · joined' : ''}</span>
    </button>
  );
}

function NicknameSetup({ onDone }) {
  const [n, setN] = useState('');
  const [error, setError] = useState('');
  const save = async () => {
    setError('');
    try { await api('/api/v1/community/me', { method: 'PUT', body: { nickname: n } }); onDone(); }
    catch (e) { setError(e?.message || 'Could not save.'); }
  };
  return (
    <div className="ms-card">
      <h2 style={{ marginTop: 0 }}>Join the NessaHub community</h2>
      <p>Meet people living with the same condition or working on the same goal, share how you are doing and cheer each other on.</p>
      <p className="ms-muted">First, choose a nickname. It is how others will see you. To keep your health private, do not use your real name.</p>
      <label className="pr-label">Nickname<input className="pr-full" value={n} maxLength={30} onChange={(e) => setN(e.target.value)} placeholder="e.g. MorningWalker" /></label>
      {error && <p className="ms-err">{error}</p>}
      <div className="ms-actions"><button className="ms-btn" onClick={save} disabled={n.trim().length < 3}>Continue</button></div>
    </div>
  );
}

function NicknameChange({ me, onDone }) {
  const [edit, setEdit] = useState(false);
  const [n, setN] = useState(me.nickname);
  const [error, setError] = useState('');
  if (!edit) return <button className="ms-link" onClick={() => setEdit(true)}>Change nickname</button>;
  return (
    <div className="pr-row">
      <input value={n} maxLength={30} onChange={(e) => setN(e.target.value)} aria-label="Nickname" />
      <button className="ms-btn" onClick={async () => { setError(''); try { await api('/api/v1/community/me', { method: 'PUT', body: { nickname: n } }); setEdit(false); onDone(); } catch (e) { setError(e?.message || 'Could not save.'); } }}>Save</button>
      <button className="ms-link" onClick={() => setEdit(false)}>Cancel</button>
      {error && <span className="ms-err">{error}</span>}
    </div>
  );
}

function GroupView({ group, me, onBack }) {
  const [joined, setJoined] = useState(!!group.joined);
  const [accept, setAccept] = useState(false);
  const [posts, setPosts] = useState(null);
  const [more, setMore] = useState(false);
  const [draft, setDraft] = useState(() => { try { const d = sessionStorage.getItem('community-draft'); if (d) sessionStorage.removeItem('community-draft'); return d || ''; } catch (_) { return ''; } });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState('');
  const moderator = (me.moderates || []).includes(group.id) || me.isAdmin;

  const load = useCallback(async (before) => {
    try {
      const l = await api(`/api/v1/community/groups/${group.id}/posts${before ? `?before=${encodeURIComponent(before)}` : ''}`);
      const list = Array.isArray(l) ? l : [];
      setPosts((p) => (before ? [...(p || []), ...list] : list));
      setMore(list.length === 30);
    } catch (e) { setPosts([]); setError(e?.message || 'Could not load.'); }
  }, [group.id]);
  useEffect(() => { if (joined || moderator) load(); }, [joined, moderator, load]);

  const join = async () => {
    setError('');
    try { await api(`/api/v1/community/groups/${group.id}/join`, { method: 'POST', body: { acceptRules: true } }); setJoined(true); }
    catch (e) { setError(e?.message || 'Could not join.'); }
  };
  const leave = async () => { try { await api(`/api/v1/community/groups/${group.id}/leave`, { method: 'POST', body: {} }); onBack(); } catch (e) { setError(e?.message || 'Could not leave.'); } };
  const post = async () => {
    setBusy(true); setError(''); setNotice(null);
    try {
      const r = await api(`/api/v1/community/groups/${group.id}/posts`, { method: 'POST', body: { body: draft } });
      setDraft('');
      if (r.holdMessage) setNotice({ crisis: /112/.test(r.holdMessage) && /harming/.test(r.holdMessage), text: r.holdMessage });
      else if (r.emergencyNote) setNotice({ crisis: false, text: `Posted. ${r.emergencyNote}` });
      load();
    } catch (e) { setError(e?.message || 'Could not post.'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <button className="ms-link" onClick={onBack} style={{ alignSelf: 'flex-start' }}>‹ All groups</button>
      <div className="ms-card">
        <h2 style={{ margin: 0 }}>{group.name}</h2>
        <p className="ms-muted" style={{ margin: '0.3rem 0 0' }}>{group.description}</p>
        {joined && <button className="ms-link" onClick={leave} style={{ marginTop: 6 }}>Leave group</button>}
      </div>
      {!joined && !moderator ? (
        <div className="ms-card">
          <h3 className="ms-title">Group rules</h3>
          <ol className="cm-rules">{me.rules.map((r) => <li key={r}>{r}</li>)}</ol>
          <label className="pr-check" style={{ display: 'flex', margin: '0.5rem 0' }}>
            <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} /> I have read the rules and I will follow them.
          </label>
          {error && <p className="ms-err">{error}</p>}
          <div className="ms-actions"><button className="ms-btn" onClick={join} disabled={!accept}>Join as {me.nickname}</button></div>
        </div>
      ) : (
        <>
          {joined && (
            <div className="ms-card">
              <textarea className="pr-full" rows={3} maxLength={4000} value={draft} onChange={(e) => setDraft(e.target.value)}
                placeholder={`Share how you are doing, ${me.nickname}. A win, a struggle, a question.`} aria-label="New post" />
              <p className="ms-muted" style={{ fontSize: '0.78rem', margin: '0.3rem 0 0' }}>Posts are checked for safety. Do not include names, phone numbers or links.</p>
              {notice && <div className={notice.crisis ? 'jr-crisis' : 'pr-gaps'} role="status" style={{ display: 'block', marginTop: 8 }}>{notice.text}</div>}
              {error && <p className="ms-err">{error}</p>}
              <div className="ms-actions"><button className="ms-btn" onClick={post} disabled={busy || draft.trim().length < 2}>{busy ? 'Posting…' : 'Post'}</button></div>
            </div>
          )}
          {posts === null ? <p className="ms-muted">Loading…</p> : posts.length === 0 ? <div className="ms-card"><p className="ms-muted">No posts yet. Be the first to say hello.</p></div>
            : posts.map((p) => <PostCard key={p.id} post={p} group={group} canWrite={joined} moderator={moderator} onChanged={() => load()} />)}
          {more && <button className="ms-link" onClick={() => load(posts[posts.length - 1].created_at)}>Show older posts</button>}
        </>
      )}
    </>
  );
}

function PostCard({ post, group, canWrite, moderator, onChanged }) {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState(null);
  const [reply, setReply] = useState('');
  const [reporting, setReporting] = useState(null);
  const [counts, setCounts] = useState({ encourage: Number(post.encourage), relate: Number(post.relate), thanks: Number(post.thanks) });
  const [mine, setMine] = useState(post.my_reactions || []);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadComments = useCallback(() => {
    api(`/api/v1/community/posts/${post.id}/comments`).then((l) => setComments(Array.isArray(l) ? l : [])).catch((e) => setError(e?.message || 'Could not load replies.'));
  }, [post.id]);
  useEffect(() => { if (showComments) loadComments(); }, [showComments, loadComments]);

  const react = async (kind) => {
    try {
      const r = await api(`/api/v1/community/posts/${post.id}/react`, { method: 'POST', body: { kind } });
      setCounts((c) => ({ ...c, [kind]: c[kind] + (r.on ? 1 : -1) }));
      setMine((m) => (r.on ? [...m, kind] : m.filter((k) => k !== kind)));
    } catch (e) { setError(e?.message || 'Could not react.'); }
  };
  const sendReply = async () => {
    setError(''); setNotice('');
    try {
      const r = await api(`/api/v1/community/posts/${post.id}/comments`, { method: 'POST', body: { body: reply } });
      setReply('');
      if (r.holdMessage) setNotice(r.holdMessage); else if (r.emergencyNote) setNotice(r.emergencyNote);
      loadComments();
    } catch (e) { setError(e?.message || 'Could not reply.'); }
  };
  const del = async (type, id) => { try { await api(`/api/v1/community/${type === 'post' ? 'posts' : 'comments'}/${id}`, { method: 'DELETE' }); type === 'post' ? onChanged() : loadComments(); } catch (e) { setError(e?.message || 'Could not delete.'); } };
  const mod = async (type, id, action) => { try { await api(`/api/v1/community/moderation/${type}/${id}`, { method: 'POST', body: { action } }); type === 'post' ? onChanged() : loadComments(); } catch (e) { setError(e?.message || 'Could not do that.'); } };

  return (
    <article className={`ms-card cm-post ${post.status === 'held' ? 'cm-held' : ''}`}>
      <header>
        <span><strong>{post.nickname}</strong>{post.by_moderator ? <span className="cm-badge">Moderator</span> : null}<span className="ms-muted"> · {ago(post.created_at)}</span>{post.pinned ? <span className="cm-badge">Pinned</span> : null}</span>
        <span>
          {post.mine && <button className="ms-link" onClick={() => del('post', post.id)}>Delete</button>}
          {!post.mine && <button className="ms-link" onClick={() => setReporting({ type: 'post', id: post.id })}>Report</button>}
          {moderator && <>
            <button className="ms-link" onClick={() => mod('post', post.id, post.pinned ? 'unpin' : 'pin')}>{post.pinned ? 'Unpin' : 'Pin'}</button>
            <button className="ms-link" onClick={() => mod('post', post.id, 'hide')}>Hide</button>
          </>}
        </span>
      </header>
      {post.status === 'held' && <p className="cm-hold">Only you can see this for now. {post.holdMessage}</p>}
      <p className="cm-body">{post.body}</p>
      {post.status === 'visible' && (
        <div className="cm-actions">
          {REACTIONS.map(([k, e, l]) => (
            <button key={k} className={mine.includes(k) ? 'on' : ''} aria-pressed={mine.includes(k)} disabled={!canWrite} onClick={() => react(k)}>
              <span aria-hidden>{e}</span> {l}{counts[k] ? ` · ${counts[k]}` : ''}
            </button>
          ))}
          <button onClick={() => setShowComments(!showComments)}>💬 {Number(post.comment_count) ? `${post.comment_count} ` : ''}{Number(post.comment_count) === 1 ? 'reply' : 'replies'}</button>
        </div>
      )}
      {reporting && <ReportBox target={reporting} onClose={() => setReporting(null)} />}
      {showComments && (
        <div className="cm-comments">
          {comments === null ? <p className="ms-muted">Loading…</p> : comments.map((c) => (
            <div key={c.id} className={`cm-comment ${c.status === 'held' ? 'cm-held' : ''}`}>
              <div><strong>{c.nickname}</strong>{c.by_moderator ? <span className="cm-badge">Moderator</span> : null}<span className="ms-muted"> · {ago(c.created_at)}</span>
                {c.mine ? <button className="ms-link" onClick={() => del('comment', c.id)}>Delete</button> : <button className="ms-link" onClick={() => setReporting({ type: 'comment', id: c.id })}>Report</button>}
                {moderator && !c.mine && <button className="ms-link" onClick={() => mod('comment', c.id, 'hide')}>Hide</button>}
              </div>
              {c.status === 'held' && <p className="cm-hold">Only you can see this for now. {c.holdMessage}</p>}
              <p className="cm-body">{c.body}</p>
            </div>
          ))}
          {(canWrite || moderator) && (
            <div className="pr-row">
              <input className="pr-grow" value={reply} maxLength={2000} onChange={(e) => setReply(e.target.value)} placeholder="Write a kind reply" aria-label="Reply" />
              <button className="ms-btn" onClick={sendReply} disabled={!reply.trim()}>Reply</button>
            </div>
          )}
          {notice && <p className="pr-gaps" style={{ display: 'block' }}>{notice}</p>}
        </div>
      )}
      {error && <p className="ms-err">{error}</p>}
    </article>
  );
}

function ReportBox({ target, onClose }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const send = async () => {
    setError('');
    try { await api('/api/v1/community/reports', { method: 'POST', body: { targetType: target.type, targetId: target.id, reason, details } }); setDone('Thank you. A moderator will look at it.'); }
    catch (e) { setError(e?.message || 'Could not send.'); }
  };
  return (
    <div className="cm-report">
      {done ? <p className="ms-ok">{done} <button className="ms-link" onClick={onClose}>Close</button></p> : <>
        <strong>Why are you reporting this?</strong>
        {REPORT_REASONS.map(([k, l]) => <label key={k} className="pr-check tp-opt"><input type="radio" checked={reason === k} onChange={() => setReason(k)} /> {l}</label>)}
        <input className="pr-full" value={details} maxLength={500} onChange={(e) => setDetails(e.target.value)} placeholder="Anything else the moderator should know (optional)" />
        {reason === 'worrying' && <p className="ms-muted" style={{ fontSize: '0.8rem' }}>A moderator is told straight away. If someone is in danger now, call 112.</p>}
        {error && <p className="ms-err">{error}</p>}
        <div className="ms-actions"><button className="ms-link" onClick={onClose}>Cancel</button><button className="ms-btn" onClick={send} disabled={!reason}>Send report</button></div>
      </>}
    </div>
  );
}

/** Moderators and admins: held posts, reports, and (admins) groups and moderators. */
export function CommunityModeration({ admin = false }) {
  const [q, setQ] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const load = useCallback(() => { api('/api/v1/community/moderation/queue').then(setQ).catch((e) => setError(e?.message || 'Could not load.')); }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (fn, done) => { setError(''); setMsg(''); try { await fn(); setMsg(done); load(); } catch (e) { setError(e?.message || 'Could not do that.'); } };
  const moderate = (type, id, action) => act(() => api(`/api/v1/community/moderation/${type}/${id}`, { method: 'POST', body: { action } }), action === 'approve' ? 'Published.' : 'Done.');
  const pause = (group, user, action) => act(() => api(`/api/v1/community/moderation/groups/${group}/members/${user}`, { method: 'POST', body: { action, days: 7 } }),
    action === 'ban' ? 'Member removed from the group.' : 'Member paused for 7 days.');
  const REASON = { safety: 'Safety concern', health_advice: 'Medicine advice', contact_details: 'Link or phone number' };

  return (
    <div className="ms-wrap jr-wrap">
      <h2 style={{ margin: 0 }}>Community moderation</h2>
      <p className="ms-muted" style={{ margin: 0 }}>Safety concerns come first. If a member may be in danger, reach out to them through their care team as well as reviewing the post.</p>
      {msg && <p className="ms-ok">{msg}</p>}
      {error && <p className="ms-err">{error}</p>}
      {!q ? <p className="ms-muted">Loading…</p> : q.groups.length === 0 && !admin ? <div className="ms-card"><p className="ms-muted">You do not moderate any groups yet. An administrator can add you.</p></div> : <>
        <div className="ms-card">
          <h3 className="ms-title">Waiting for review ({q.held.length})</h3>
          {q.held.length === 0 ? <p className="ms-muted">Nothing waiting.</p> : q.held.map((h) => (
            <div key={`${h.type}-${h.id}`} className={`cm-queue ${h.hold_reason === 'safety' ? 'cm-urgent' : ''}`}>
              <span className="ms-muted">{h.group_name} · {h.type} by {h.nickname} · {ago(h.created_at)} · {h.status === 'hidden' ? 'hidden after reports' : REASON[h.hold_reason] || 'held'}</span>
              <p className="cm-body">{h.body}</p>
              <div className="ms-actions" style={{ justifyContent: 'flex-start' }}>
                <button className="ms-btn" onClick={() => moderate(h.type, h.id, 'approve')}>Publish</button>
                <button className="ms-link" onClick={() => moderate(h.type, h.id, 'remove')}>Remove</button>
                <button className="ms-link" onClick={() => pause(h.group_id, h.author_id, 'mute')}>Pause member 7 days</button>
              </div>
            </div>
          ))}
        </div>
        <div className="ms-card">
          <h3 className="ms-title">Reports ({q.reports.length})</h3>
          {q.reports.length === 0 ? <p className="ms-muted">No open reports.</p> : q.reports.map((r) => (
            <div key={r.id} className={`cm-queue ${r.reason === 'worrying' ? 'cm-urgent' : ''}`}>
              <span className="ms-muted">{r.group_name} · {r.target_type} · {r.reason.replace('_', ' ')} · {ago(r.created_at)}{r.target_status !== 'visible' ? ` · now ${r.target_status}` : ''}</span>
              <p className="cm-body">{r.body}</p>
              {r.details && <p className="ms-muted">“{r.details}”</p>}
              <div className="ms-actions" style={{ justifyContent: 'flex-start' }}>
                <button className="ms-link" onClick={() => act(() => api(`/api/v1/community/moderation/reports/${r.id}/dismiss`, { method: 'POST', body: {} }), 'Report dismissed.')}>Nothing wrong</button>
                {r.target_status !== 'visible' && <button className="ms-link" onClick={() => moderate(r.target_type, r.target_id, 'approve')}>Restore it</button>}
                <button className="ms-link" onClick={() => moderate(r.target_type, r.target_id, 'remove')}>Remove it</button>
                <button className="ms-link" onClick={() => pause(r.group_id, r.author_id, 'mute')}>Pause writer 7 days</button>
                <button className="ms-link" style={{ color: '#b91c1c' }} onClick={() => pause(r.group_id, r.author_id, 'ban')}>Remove writer from group</button>
              </div>
            </div>
          ))}
        </div>
      </>}
      {admin && <GroupAdmin />}
    </div>
  );
}

function GroupAdmin() {
  const [groups, setGroups] = useState([]);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState({});
  const [results, setResults] = useState({});
  const [error, setError] = useState('');
  const load = () => api('/api/v1/community/admin/groups').then((g) => setGroups(Array.isArray(g) ? g : [])).catch((e) => setError(e?.message || 'Could not load.'));
  useEffect(() => { load(); }, []);
  const run = async (fn) => { setError(''); try { await fn(); load(); } catch (e) { setError(e?.message || 'Could not do that.'); } };
  const find = async (gid, text) => {
    setSearch({ ...search, [gid]: text });
    if (text.trim().length < 2) { setResults({ ...results, [gid]: [] }); return; }
    try { setResults({ ...results, [gid]: await api(`/api/v1/community/admin/staff?q=${encodeURIComponent(text)}`) }); } catch (_) { /* ignore */ }
  };
  const save = () => run(async () => {
    await api(editing.id ? `/api/v1/community/admin/groups/${editing.id}` : '/api/v1/community/admin/groups', { method: editing.id ? 'PUT' : 'POST', body: editing });
    setEditing(null);
  });
  return (
    <div className="ms-card">
      <h3 className="ms-title">Groups and moderators</h3>
      {error && <p className="ms-err">{error}</p>}
      {editing ? (
        <div>
          <label className="pr-label">Name<input className="pr-full" value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
          <label className="pr-label">Description<input className="pr-full" value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></label>
          <div className="pr-row">
            <label>Section <select value={editing.category || 'medical'} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
              <option value="medical">Health conditions</option><option value="lifestyle">Fitness, beauty and longevity</option><option value="mind">Mind and feelings</option>
            </select></label>
            <label>Open to <select value={editing.audience || 'all'} onChange={(e) => setEditing({ ...editing, audience: e.target.value })}>
              <option value="all">Medical patients and therapy clients</option><option value="medical">Medical patients only</option><option value="therapy">Therapy clients only</option>
            </select></label>
            {editing.id && <label className="pr-check"><input type="checkbox" checked={!!editing.archived} onChange={(e) => setEditing({ ...editing, archived: e.target.checked })} /> Archived</label>}
          </div>
          <div className="ms-actions"><button className="ms-link" onClick={() => setEditing(null)}>Cancel</button><button className="ms-btn" onClick={save}>Save</button></div>
        </div>
      ) : <button className="ms-btn" onClick={() => setEditing({ category: 'medical', audience: 'all' })}>New group</button>}
      {groups.map((g) => (
        <div key={g.id} className="cm-queue">
          <div className="jr-chart-head" style={{ margin: 0 }}>
            <span><strong>{g.name}</strong><span className="ms-muted"> · {g.members} members{g.archived ? ' · archived' : ''}{g.audience !== 'all' ? ` · ${g.audience} only` : ''}</span></span>
            <button className="ms-link" onClick={() => setEditing({ id: g.id, name: g.name, description: g.description, category: g.category, audience: g.audience, archived: g.archived })}>Edit</button>
          </div>
          <p className="ms-muted" style={{ margin: '0.3rem 0' }}>Moderators: {g.moderators.length === 0 ? 'none yet (administrators cover it)' : g.moderators.map((m) => (
            <span key={m.id} className="cm-chip">{m.full_name} ({m.role.toLowerCase()})<button aria-label={`Remove ${m.full_name}`} onClick={() => run(() => api(`/api/v1/community/admin/groups/${g.id}/moderators/${m.id}`, { method: 'DELETE' }))}>×</button></span>
          ))}</p>
          <input placeholder="Add a moderator: search staff by name or email" value={search[g.id] || ''} onChange={(e) => find(g.id, e.target.value)} className="pr-full" />
          {(results[g.id] || []).map((u) => (
            <button key={u.id} className="ms-link" onClick={() => run(async () => { await api(`/api/v1/community/admin/groups/${g.id}/moderators`, { method: 'POST', body: { userId: u.id } }); setSearch({ ...search, [g.id]: '' }); setResults({ ...results, [g.id]: [] }); })}>
              + {u.full_name} · {u.role.toLowerCase()}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
