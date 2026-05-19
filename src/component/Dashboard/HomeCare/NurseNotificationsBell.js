import React, { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useHomeCareNurse } from './HomeCareNurseContext';
import { fetchUserNotifications } from '../../../services/homeCareService';
import HomeCareNurseNotifications from './HomeCareNurseNotifications';

export default function NurseNotificationsBell() {
  const { profile } = useHomeCareNurse();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(async () => {
    if (!profile?.id) return;
    const list = await fetchUserNotifications(profile.id, 50);
    setUnread(list.filter((n) => !n.read).length);
  }, [profile?.id]);

  useEffect(() => {
    refreshUnread();
    const t = setInterval(refreshUnread, 60000);
    return () => clearInterval(t);
  }, [refreshUnread]);

  useEffect(() => {
    if (!open) refreshUnread();
  }, [open, refreshUnread]);

  return (
    <>
      <button
        type="button"
        className="hcn-bell-btn"
        onClick={() => setOpen(true)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
      >
        <Bell size={20} />
        {unread > 0 ? <span className="hcn-bell-badge">{unread > 9 ? '9+' : unread}</span> : null}
      </button>
      {open ? (
        <div className="hcn-overlay" role="presentation" onClick={() => setOpen(false)}>
          <div className="hcn-notifications-panel" role="dialog" onClick={(e) => e.stopPropagation()}>
            <HomeCareNurseNotifications embedded onClose={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
