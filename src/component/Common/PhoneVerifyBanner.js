import React, { useEffect, useState } from 'react';
import { api, getStoredUserId } from '../../services/apiClient';
import PhoneForSms from './PhoneForSms';

/**
 * Dashboard banner for patients and clients whose phone is not verified.
 *
 * Shown on every dashboard visit until the number is verified — "Later" only
 * snoozes it for 3 days on this browser. Hidden while SMS is not set up, since
 * nobody can complete a verification without it. The bell reminder
 * (PhoneVerificationReminderJob) reaches people who do not sign in.
 */
const SNOOZE_DAYS = 3;
const keyFor = (uid) => `nessa.phoneBanner.snoozedUntil.${uid || 'me'}`;

function snoozed(uid) {
  try { return Number(localStorage.getItem(keyFor(uid)) || 0) > Date.now(); } catch { return false; }
}

export default function PhoneVerifyBanner() {
  const uid = getStoredUserId();
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => snoozed(uid));

  useEffect(() => {
    if (hidden) return;
    api('/api/v1/me/phone').then(setStatus).catch(() => {});
  }, [hidden]);

  if (hidden || !status?.smsAvailable || status.verified) return null;

  const later = () => {
    try { localStorage.setItem(keyFor(uid), String(Date.now() + SNOOZE_DAYS * 86400000)); } catch { /* still hide for now */ }
    setHidden(true);
  };

  return (
    <div role="status" style={{ background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 12, padding: '0.8rem 1rem', margin: '0 0 1rem', display: 'grid', gap: '0.6rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.9rem', color: '#78350f' }}>
          📱 <strong>Verify your phone number</strong> to get prescription codes and updates by SMS.
        </span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {!open && (
            <button type="button" onClick={() => setOpen(true)}
              style={{ padding: '0.45rem 0.9rem', borderRadius: 10, border: 'none', background: '#b45309', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' }}>
              Verify now
            </button>
          )}
          <button type="button" onClick={later}
            style={{ padding: '0.45rem 0.9rem', borderRadius: 10, border: '1.5px solid #fcd34d', background: '#fff', color: '#92400e', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' }}>
            Later
          </button>
        </div>
      </div>
      {open && <PhoneForSms embedded onVerified={(st) => setStatus(st)} />}
    </div>
  );
}
