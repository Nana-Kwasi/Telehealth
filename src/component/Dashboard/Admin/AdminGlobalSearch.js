import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Search, Sparkles, User, Building2, CalendarDays, Pill, FlaskConical, Inbox, CornerDownLeft, X,
  ArrowUp, LayoutDashboard,
} from 'lucide-react';
import { api } from '../../../services/apiClient';
import AiMarkdown from '../../Common/AiMarkdown';
import './AdminGlobalSearch.css';

/**
 * Global search for the super admin, in the top bar (⌘K / Ctrl K).
 *
 * One box for three things: jump to an admin screen, find a record anywhere on
 * the platform (GET /api/v1/admin/search), or ask the AI assistant about it
 * (POST /api/v1/admin/assistant) — the first row is always "Ask AI", so a
 * question typed into search never dead-ends.
 */
const GROUP_ICONS = {
  people: User, organisations: Building2, appointments: CalendarDays,
  prescriptions: Pill, orders: FlaskConical, reports: Inbox,
};

/** Where a result opens. People open their profile; records open their screen. */
function pathFor(groupKey, item) {
  const role = String(item.role || '').toUpperCase();
  if (groupKey === 'people' || groupKey === 'organisations') {
    const col = {
      DOCTOR: 'doctors', THERAPIST: 'therapists', HOME_CARE_NURSE: 'homeCareNurses',
      PHARMACY: 'pharmacies', LAB: 'labs', SCAN: 'scanCenters',
    }[role] || 'auth';
    return `/dashboard/users/${col}/${item.id}`;
  }
  return {
    appointments: '/dashboard/appointments', prescriptions: '/dashboard/prescriptions',
    orders: '/dashboard/reports', reports: '/dashboard/reports-center',
  }[groupKey] || '/dashboard';
}

export default function AdminGlobalSearch({ pages = [] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState([]);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const [askOpen, setAskOpen] = useState(false);
  const [askSeed, setAskSeed] = useState('');
  const inputRef = useRef(null);
  const boxRef = useRef(null);

  // ⌘K / Ctrl K focuses search from anywhere in the admin.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setGroups([]); return undefined; }
    setBusy(true);
    const t = setTimeout(() => {
      api(`/api/v1/admin/search?q=${encodeURIComponent(term)}`)
        .then((d) => setGroups(Array.isArray(d?.groups) ? d.groups : []))
        .catch(() => setGroups([]))
        .finally(() => setBusy(false));
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const pageHits = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return pages.slice(0, 6);
    return pages.filter((p) => p.label.toLowerCase().includes(term)).slice(0, 5);
  }, [q, pages]);

  // One flat list for keyboard navigation: Ask AI, pages, then records.
  const rows = useMemo(() => {
    const out = [];
    if (q.trim()) out.push({ kind: 'ask', label: q.trim() });
    pageHits.forEach((p) => out.push({ kind: 'page', label: p.label, path: p.path, Icon: p.icon }));
    groups.forEach((g) => g.items.forEach((it) => out.push({
      kind: 'record', group: g.key, groupLabel: g.label, label: it.title, sub: it.subtitle, path: pathFor(g.key, it),
    })));
    return out;
  }, [q, pageHits, groups]);

  useEffect(() => { setActive(0); }, [q]);

  const choose = useCallback((row) => {
    if (!row) return;
    if (row.kind === 'ask') {
      setAskSeed(row.label);
      setAskOpen(true);
    } else {
      navigate(row.path);
    }
    setOpen(false);
    setQ('');
  }, [navigate]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(rows[active]); }
    else if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
  };

  let lastGroup = null;
  return (
    <>
      <div className="gs" ref={boxRef}>
        <div className={`gs-box ${open ? 'on' : ''}`}>
          <Search size={16} />
          <input
            ref={inputRef}
            value={q}
            placeholder="Search people, records, pages — or ask AI…"
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            aria-label="Search the admin, or ask the AI assistant"
            role="combobox"
            aria-expanded={open}
          />
          <kbd>⌘K</kbd>
        </div>
        {open ? (
          <div className="gs-panel" role="listbox">
            {rows.length === 0 ? <p className="gs-empty">Type to search people, appointments, prescriptions, orders and reports.</p> : null}
            {rows.map((r, i) => {
              const header = r.kind === 'record' && r.group !== lastGroup ? r.groupLabel : r.kind === 'page' && lastGroup !== 'pages' ? 'Pages' : null;
              lastGroup = r.kind === 'record' ? r.group : r.kind === 'page' ? 'pages' : lastGroup;
              const Icon = r.kind === 'ask' ? Sparkles : r.kind === 'page' ? (r.Icon || LayoutDashboard) : (GROUP_ICONS[r.group] || Search);
              return (
                <React.Fragment key={`${r.kind}-${i}`}>
                  {header ? <div className="gs-head">{header}</div> : null}
                  <button type="button" role="option" aria-selected={i === active}
                    className={`gs-row ${i === active ? 'on' : ''} ${r.kind === 'ask' ? 'ask' : ''}`}
                    onMouseEnter={() => setActive(i)} onClick={() => choose(r)}>
                    <span className="gs-icon"><Icon size={15} /></span>
                    <span className="gs-text">
                      {r.kind === 'ask' ? <>Ask AI: <strong>{r.label}</strong></> : <strong>{r.label}</strong>}
                      {r.sub ? <small>{r.sub}</small> : null}
                      {r.kind === 'ask' ? <small>Answered from live platform figures</small> : null}
                    </span>
                    {i === active ? <CornerDownLeft size={13} className="gs-enter" /> : null}
                  </button>
                </React.Fragment>
              );
            })}
            {busy ? <p className="gs-empty">Searching…</p> : null}
          </div>
        ) : null}
      </div>
      <button type="button" className="gs-ai-btn" onClick={() => { setAskSeed(''); setAskOpen(true); }}>
        <Sparkles size={15} /> <span>Ask AI</span>
      </button>
      {/* Rendered outside the top bar: its frosted-glass backdrop filter makes it the
          containing block for fixed elements, which squashed the drawer into it. */}
      {askOpen ? createPortal(
        <AdminAssistantPanel seed={askSeed} pages={pages} onClose={() => setAskOpen(false)} />,
        document.querySelector('.admin-dashboard') || document.body,
      ) : null}
    </>
  );
}

const SUGGESTIONS = [
  'What needs my attention today?',
  'How did this month compare with last month?',
  'Which providers are busiest?',
  'Are there any security concerns?',
];

/** The admin AI assistant, as a side panel. Read-only; answers from live figures. */
/** Pull "/dashboard/…" paths out of an answer: clean text plus links to those screens. */
function splitLinks(text, pages) {
  const found = [];
  const add = (path) => { if (path && !found.includes(path)) found.push(path); };
  let clean = String(text || '').replace(/^\s*SCREENS:\s*(.*)$/im, (m, list) => {
    list.split(/[,\s]+/).filter((x) => x.startsWith('/dashboard')).forEach(add);
    return '';
  });
  // Any path still written inline is lifted out too.
  clean = clean.replace(/\s*\(?(\/dashboard[\/a-z-]*)\)?/g, (m, path) => { add(path); return ''; }).trim();
  const links = found.map((path) => ({ path, label: (pages.find((p) => p.path === path) || {}).label || 'Open' }));
  return { clean, links };
}

function AdminAssistantPanel({ seed, pages = [], onClose }) {
  const navigate = useNavigate();
  const [thread, setThread] = useState([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const sentSeed = useRef(false);

  const ask = useCallback(async (text) => {
    const question = String(text || '').trim();
    if (!question || busy) return;
    setQ('');
    setBusy(true);
    const history = thread.map((m) => ({ role: m.role === 'me' ? 'user' : 'assistant', content: m.text }));
    setThread((t) => [...t, { role: 'me', text: question }]);
    try {
      const d = await api('/api/v1/admin/assistant', { method: 'POST', body: { question, history } });
      setThread((t) => [...t, { role: 'ai', text: d.answer }]);
    } catch (e) {
      setThread((t) => [...t, { role: 'ai', text: e?.message || 'The assistant could not answer right now.' }]);
    } finally {
      setBusy(false);
    }
  }, [busy, thread]);

  useEffect(() => {
    if (seed && !sentSeed.current) { sentSeed.current = true; ask(seed); }
  }, [seed, ask]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [thread, busy]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="ai-drawer-wrap" role="dialog" aria-label="Admin AI assistant">
      <div className="ai-drawer-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="ai-drawer">
        <header className="ai-drawer-head">
          <span className="ai-drawer-icon"><Sparkles size={18} /></span>
          <div>
            <strong>NessaHub AI</strong>
            <small>Answers from live platform figures · read-only</small>
          </div>
          <button type="button" onClick={onClose} aria-label="Close assistant"><X size={18} /></button>
        </header>
        <div className="ai-drawer-body">
          {thread.length === 0 ? (
            <div className="ai-drawer-intro">
              <p>Ask about activity, queues, providers or sign-ins. I can't change anything — I point you to the right screen.</p>
              <div className="ai-drawer-chips">
                {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => ask(s)}>{s}</button>)}
              </div>
            </div>
          ) : null}
          {thread.map((m, i) => (
            <div key={i} className={`ai-msg ${m.role}`}>
              {m.role === 'ai' ? (() => {
                const { clean, links } = splitLinks(m.text, pages);
                return (
                  <>
                    <AiMarkdown text={clean} />
                    {links.length ? (
                      <div className="ai-links">
                        {links.map((l) => (
                          <button key={l.path} type="button" onClick={() => { navigate(l.path); onClose(); }}>
                            {l.label} <ArrowUp size={12} style={{ transform: 'rotate(45deg)' }} />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </>
                );
              })() : m.text}
            </div>
          ))}
          {busy ? <div className="ai-msg ai ai-typing"><span /><span /><span /></div> : null}
          <div ref={endRef} />
        </div>
        <form className="ai-drawer-input" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about the platform…" maxLength={800} autoFocus />
          <button type="submit" disabled={busy || !q.trim()} aria-label="Send"><ArrowUp size={17} /></button>
        </form>
      </aside>
    </div>
  );
}
