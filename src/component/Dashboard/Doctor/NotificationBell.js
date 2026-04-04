import React, { useState, useEffect, useRef } from 'react';
import { Bell, Calendar, MessageSquare, Video, Star, X } from 'lucide-react';
import { db } from '../../Auth/firebaseConfig';
import { collection, query, where, onSnapshot, doc, updateDoc, orderBy, limit, serverTimestamp } from 'firebase/firestore';

export default function NotificationBell({ userId }) {
  const [notifications, setNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!userId) return;
    const q = query(
      collection(db, 'notifications'),
      where('targetId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsub = onSnapshot(q, snap => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [userId]);

  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (notifId) => {
    try {
      await updateDoc(doc(db, 'notifications', notifId), { read: true });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllRead = async () => {
    try {
      await Promise.all(
        notifications.filter(n => !n.read).map(n =>
          updateDoc(doc(db, 'notifications', n.id), { read: true })
        )
      );
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'appointment': return <Calendar size={16} color="#1e6bb8" />;
      case 'message': return <MessageSquare size={16} color="#7c3aed" />;
      case 'video': return <Video size={16} color="#10b981" />;
      case 'review': return <Star size={16} color="#f59e0b" />;
      default: return <Bell size={16} color="#64748b" />;
    }
  };

  const getTimeAgo = (timestamp) => {
    if (!timestamp?.toDate) return '';
    const diff = Date.now() - timestamp.toDate().getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        style={{
          position: 'relative', background: 'none', border: 'none',
          cursor: 'pointer', padding: 8, borderRadius: 8,
          color: '#64748b', transition: 'background 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#f0f6fc'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
      >
        <Bell size={22} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            background: '#ef4444', color: 'white',
            fontSize: '0.6rem', fontWeight: 700,
            width: 18, height: 18, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 8,
          width: 360, maxHeight: 440, background: 'white',
          borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
          border: '1px solid #e2e8f0', zIndex: 1000, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0',
          }}>
            <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#1e293b' }}>Notifications</h4>
            {unreadCount > 0 && (
              <button onClick={markAllRead}
                style={{
                  background: 'none', border: 'none', color: '#1e6bb8',
                  fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                }}>
                Mark all read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#94a3b8' }}>
                <Bell size={28} style={{ marginBottom: 8 }} />
                <p style={{ margin: 0, fontSize: '0.85rem' }}>No notifications yet</p>
              </div>
            ) : (
              notifications.map(notif => (
                <div
                  key={notif.id}
                  onClick={() => !notif.read && markAsRead(notif.id)}
                  style={{
                    display: 'flex', gap: '0.75rem', padding: '0.75rem 1rem',
                    borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                    background: notif.read ? 'white' : '#f0f6fc',
                    transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {getIcon(notif.type)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      margin: 0, fontSize: '0.8rem', color: '#1e293b',
                      fontWeight: notif.read ? 400 : 600, lineHeight: 1.4,
                    }}>
                      {notif.title || 'Notification'}
                    </p>
                    <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: '#64748b', lineHeight: 1.3 }}>
                      {notif.body || ''}
                    </p>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.65rem', color: '#94a3b8' }}>
                      {getTimeAgo(notif.createdAt)}
                    </p>
                  </div>
                  {!notif.read && (
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', background: '#1e6bb8',
                      flexShrink: 0, marginTop: 4,
                    }} />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
