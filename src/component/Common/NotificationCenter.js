import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Bell, X, Calendar, MessageSquare, Pill, FileText, Heart,
  AlertTriangle, CheckCircle, Users, ChevronLeft,
} from 'lucide-react';
import { api, getStoredUserId } from '../../services/apiClient';
import { subscribeToTopic } from '../../services/notificationStream';
import './NotificationCenter.css';
import Paged from './Paged';

/**
 * The notification bell: unread badge, list, and a detail view for one item.
 *
 * Live rather than polled — it subscribes to the user's SSE topic, so a
 * notification raised anywhere in the system lands here the moment it happens.
 * A short poll runs alongside as a safety net for the case where the stream is
 * blocked (a corporate proxy that buffers text/event-stream will happily hold a
 * connection open and deliver nothing).
 */

/** Icon per event family, so the list is scannable without reading it. */
const ICONS = {
  appointment: Calendar,
  message: MessageSquare,
  prescription: Pill,
  diagnostic: FileText,
  therapy: Heart,
  couple: Users,
  support: AlertTriangle,
  account: CheckCircle,
};

function iconFor(eventType) {
  const family = String(eventType || '').split('.')[0];
  return ICONS[family] || Bell;
}

/** "just now" / "12m" / "3h" / "5d" — compact, for a dense list. */
function ago(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function NotificationCenter() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const [list, count] = await Promise.all([
        api('/api/v1/notifications/mine').catch(() => []),
        api('/api/v1/notifications/mine/unread-count').catch(() => ({ count: 0 })),
      ]);
      setItems(Array.isArray(list) ? list : []);
      setUnread(Number(count?.count) || 0);
    } catch { /* leave whatever is on screen */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Live stream. `refresh` on reconnect covers anything missed while away.
  useEffect(() => {
    const uid = getStoredUserId();
    if (!uid) return undefined;
    return subscribeToTopic(
      `notifications:target:${uid}`,
      (evt) => {
        if (evt?.type === 'notification.created') {
          // Render straight from the frame — no round trip for the common case.
          setItems((prev) => [{
            id: evt.id,
            eventType: evt.eventType,
            title: evt.title,
            body: evt.body,
            link: evt.link,
            createdAt: evt.createdAt,
            readAt: null,
          }, ...prev.filter((n) => n.id !== evt.id)].slice(0, 50));
          setUnread((n) => n + 1);
        } else {
          // read / read-all from another tab or the phone.
          refresh();
        }
      },
      refresh,
    );
  }, [refresh]);

  // Safety net for environments where the stream is silently buffered.
  useEffect(() => {
    const timer = setInterval(refresh, 60000);
    return () => clearInterval(timer);
  }, [refresh]);

  // Click-away closes the panel.
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
        setDetail(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const markRead = async (id) => {
    setItems((prev) => prev.map((n) => (n.id === id && !n.readAt
      ? { ...n, readAt: new Date().toISOString() } : n)));
    setUnread((n) => Math.max(0, n - 1));
    try { await api(`/api/v1/notifications/mine/${id}/read`, { method: 'POST' }); }
    catch { refresh(); }
  };

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    setUnread(0);
    try { await api('/api/v1/notifications/mine/read-all', { method: 'POST' }); }
    catch { refresh(); }
  };

  const openDetail = async (item) => {
    setDetail(item);
    if (!item.readAt) markRead(item.id);
    // The list frame is enough to render, but re-read the stored row so the
    // detail shows anything the SSE payload trimmed.
    setLoading(true);
    try {
      const full = await api(`/api/v1/notifications/mine/${item.id}`);
      if (full) setDetail(full);
    } catch { /* the list version stands */ }
    finally { setLoading(false); }
  };

  const followLink = (item) => {
    if (!item?.link) return;
    setOpen(false);
    setDetail(null);
    navigate(item.link);
  };

  return (
    <div className="nh-notif" ref={panelRef}>
      <button
        type="button"
        className="nh-notif-bell"
        onClick={() => { setOpen((v) => !v); setDetail(null); }}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      >
        <Bell size={20} />
        {unread > 0 && <span className="nh-notif-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="nh-notif-panel" role="dialog" aria-label="Notifications">
          {detail ? (
            <>
              <div className="nh-notif-head">
                <button type="button" className="nh-notif-back" onClick={() => setDetail(null)}>
                  <ChevronLeft size={16} /> All notifications
                </button>
                <button type="button" className="nh-notif-close" onClick={() => { setOpen(false); setDetail(null); }}>
                  <X size={16} />
                </button>
              </div>
              <div className="nh-notif-detail">
                <h4>{detail.title}</h4>
                <p className="nh-notif-detail-time">{new Date(detail.createdAt).toLocaleString()}</p>
                {detail.body ? <p className="nh-notif-detail-body">{detail.body}</p> : null}
                {loading ? <p className="nh-notif-empty-sub">Loading…</p> : null}
                {detail.link ? (
                  <button type="button" className="nh-notif-cta" onClick={() => followLink(detail)}>
                    Open
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="nh-notif-head">
                <strong>Notifications</strong>
                {unread > 0 && (
                  <button type="button" className="nh-notif-mark" onClick={markAllRead}>
                    Mark all read
                  </button>
                )}
              </div>

              <div className="nh-notif-list">
                {items.length === 0 ? (
                  <div className="nh-notif-empty">
                    <Bell size={28} />
                    <p>You are all caught up</p>
                    <p className="nh-notif-empty-sub">New activity will appear here.</p>
                  </div>
                ) : <Paged items={items}>{(items) => items.map((n) => {
                  const Icon = iconFor(n.eventType);
                  return (
                    <button
                      type="button"
                      key={n.id}
                      className={`nh-notif-item${n.readAt ? '' : ' nh-notif-item--unread'}`}
                      onClick={() => openDetail(n)}
                    >
                      <span className="nh-notif-item-icon"><Icon size={16} /></span>
                      <span className="nh-notif-item-text">
                        <span className="nh-notif-item-title">{n.title}</span>
                        {n.body ? <span className="nh-notif-item-body">{n.body}</span> : null}
                      </span>
                      <span className="nh-notif-item-time">{ago(n.createdAt)}</span>
                    </button>
                  );
                })}</Paged>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The app-wide bell. Pinned to the corner it sat on top of the dashboard header
 * (over the admin search and its buttons). Where a dashboard header has a
 * right-hand slot, the bell moves into it and lines up with the other items;
 * screens without one keep the floating bell.
 */
const BELL_SLOTS = '.admin-topbar-right, .nd-topbar-right';

export function NotificationMount() {
  const [slot, setSlot] = useState(null);
  useEffect(() => {
    // Dashboards mount after the app shell and swap on navigation, so keep looking.
    // On phones the dashboards' frosted top bar (ResponsiveNav) holds the bell;
    // it is hidden on laptops, so only use it while it is actually showing.
    const find = () => {
      const phoneBar = document.querySelector('.nh-mtop-right');
      const el = phoneBar && phoneBar.offsetParent !== null ? phoneBar : document.querySelector(BELL_SLOTS);
      setSlot((cur) => (cur === el ? cur : el));
    };
    find();
    const obs = new MutationObserver(find);
    obs.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', find);
    return () => { obs.disconnect(); window.removeEventListener('resize', find); };
  }, []);
  if (slot && slot.isConnected) {
    return createPortal(<div className="nh-notif-docked"><NotificationCenter /></div>, slot);
  }
  return <div className="nh-notif-floating"><NotificationCenter /></div>;
}
