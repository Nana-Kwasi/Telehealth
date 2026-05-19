import React, { useCallback, useState } from 'react';
import { useHomeCareNurse } from './HomeCareNurseContext';
import { fetchUserNotifications, markNotificationRead } from '../../../services/homeCareService';
import './HomeCareNurseDashboard.css';

function fmtWhen(ts) {
  if (!ts?.seconds) return '';
  return new Date(ts.seconds * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HomeCareNurseNotifications({ embedded = false, onClose }) {
  const { profile } = useHomeCareNurse();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      setList(await fetchUserNotifications(profile.id));
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const open = async (n) => {
    if (!n.read) {
      await markNotificationRead(n.id);
      setList((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
  };

  const unread = list.filter((n) => !n.read).length;

  const body = (
    <>
      {embedded && onClose ? (
        <div className="hcn-panel-toolbar">
          <strong>Notifications{unread > 0 ? ` (${unread})` : ''}</strong>
          <button type="button" className="hcn-btn hcn-btn-outline hcn-btn-sm" onClick={onClose}>Close</button>
        </div>
      ) : null}
      <button type="button" className="hcn-btn hcn-btn-outline" style={{ marginBottom: '1rem' }} onClick={load}>
        Refresh
      </button>
      {loading ? <p className="hcn-empty">Loading…</p> : null}
      {!loading && list.length === 0 ? <p className="hcn-empty">No notifications yet.</p> : null}
      {list.map((n) => (
        <button
          key={n.id}
          type="button"
          className={`hcn-card hcn-notification-card ${n.read ? '' : 'hcn-notification-unread'}`}
          onClick={() => open(n)}
        >
          <strong>{n.title || 'Notification'}</strong>
          <p className="hcn-card-meta">{n.body || ''}</p>
          {fmtWhen(n.createdAt) ? <p className="hcn-card-meta">{fmtWhen(n.createdAt)}</p> : null}
        </button>
      ))}
    </>
  );

  if (embedded) return <div className="hcn-notifications-embedded">{body}</div>;

  return (
    <div className="hcn-page">
      <header className="hcn-page-header">
        <h1>Notifications</h1>
        <p>Bookings, emergencies & updates{unread > 0 ? ` · ${unread} unread` : ''}</p>
      </header>
      {body}
    </div>
  );
}
