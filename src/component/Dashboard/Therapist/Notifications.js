import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../../../services/firestoreShim';
import { collection, query, where, getDocs, updateDoc, doc, orderBy, limit } from '../../../services/firestoreShim';
import { ArrowLeft, Bell, MessageSquare, Calendar, Video, AlertCircle, CheckCircle } from 'lucide-react';
import './Notifications.css';

const getNotificationIcon = (type) => {
  const icons = {
    message: <MessageSquare size={20} />,
    appointment: <Calendar size={20} />,
    video: <Video size={20} />,
    alert: <AlertCircle size={20} />,
    success: <CheckCircle size={20} />
  };
  return icons[type] || <Bell size={20} />;
};

export default function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const userId = auth.currentUser?.uid;
        if (!userId) return;

        const notificationsQuery = query(
          collection(db, 'notifications'),
          where('therapistId', '==', userId),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
        
        const snapshot = await getDocs(notificationsQuery);
        const notifs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          time: doc.data().createdAt?.toDate 
            ? doc.data().createdAt.toDate().toLocaleString()
            : new Date(doc.data().createdAt).toLocaleString()
        }));
        
        setNotifications(notifs);
      } catch (error) {
        console.error('Error fetching notifications:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, []);

  const markAsRead = async (notificationId) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        unread: false
      });
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, unread: false } : n)
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadNotifications = notifications.filter(n => n.unread);
      const updatePromises = unreadNotifications.map(n => 
        updateDoc(doc(db, 'notifications', n.id), { unread: false })
      );
      await Promise.all(updatePromises);
      setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-state">Loading notifications...</div>
      </div>
    );
  }

  return (
    <div className="page-container notifications-page">
      <div className="page-header">
        <button onClick={() => navigate('/dashboard')} className="back-button">
          <ArrowLeft size={20} />
          Back to Dashboard
        </button>
        <div className="header-actions">
          <h1 className="page-title">Notifications</h1>
          {notifications.some(n => n.unread) && (
            <button onClick={markAllAsRead} className="btn-secondary">
              Mark All as Read
            </button>
          )}
        </div>
      </div>

      <div className="notifications-content">
        {notifications.length === 0 ? (
          <div className="no-notifications">
            <Bell size={64} />
            <h3>No notifications</h3>
            <p>You're all caught up!</p>
          </div>
        ) : (
          <div className="notifications-list">
            {notifications.map(notification => (
              <div 
                key={notification.id} 
                className={`notification-item ${notification.unread ? 'unread' : ''}`}
                onClick={() => notification.unread && markAsRead(notification.id)}
              >
                <div className="notification-icon">
                  {getNotificationIcon(notification.type)}
                </div>
                <div className="notification-content">
                  <h4 className="notification-title">{notification.title}</h4>
                  <p className="notification-message">{notification.message}</p>
                  <span className="notification-time">{notification.time}</span>
                </div>
                {notification.unread && <div className="unread-indicator"></div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
