import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import * as HI from '@healthicons/react';
import { IconBubble } from './EmptyState';
import { refreshSession } from '../Auth/authService';
import { getStoredUserId } from '../../services/apiClient';
import { accountServices, chooseService } from '../../utils/careServices';
import './ServiceChooser.css';

/*
 * For an account that uses both medical care and therapy: right after signing
 * in, ask which dashboard to open. Asked once per sign-in (this browser tab);
 * the sidebar switch changes it any time after that. Each dashboard loads its
 * own data, exactly as when switching.
 */
const SEEN = 'nessa.dashboardChosen';

const CHOICES = [
  { service: 'medical', icon: HI.Stethoscope, tone: 'blue', title: 'Medical', text: 'Doctors, prescriptions, lab and scan results, your health record.' },
  { service: 'therapy', icon: HI.MentalHealthTherapy, tone: 'violet', title: 'Therapy', text: 'Your therapist, sessions, journal, community and wellbeing.' },
];

export default function ServiceChooser({ profile, current }) {
  const navigate = useNavigate();
  const uid = getStoredUserId() || profile?.id || profile?.uid;
  const [open, setOpen] = useState(() => {
    if (accountServices(profile).length < 2) return false;
    try { return sessionStorage.getItem(SEEN) !== String(uid); } catch { return false; }
  });
  if (!open) return null;

  const pick = (service) => {
    try { sessionStorage.setItem(SEEN, String(uid)); } catch { /* private mode */ }
    setOpen(false);
    if (service === current) return;
    chooseService(uid, service);
    navigate('/dashboard');
    refreshSession(); // re-resolves the profile with the new choice: the right dashboard and its data load
  };
  const first = String(profile?.fullName || profile?.name || '').trim().split(/\s+/)[0];

  // Drawn on the page body: inside a sidebar or chat panel it could be hidden or clipped.
  return createPortal(
    <div className="svc-back" role="dialog" aria-modal="true" aria-labelledby="svc-title">
      <div className="svc-card">
        <h2 id="svc-title">{first ? `Welcome back, ${first}` : 'Welcome back'}</h2>
        <p>Where would you like to go?</p>
        <div className="svc-choices">
          {CHOICES.map((c) => (
            <button key={c.service} type="button" className={`svc-choice svc-${c.service}`} onClick={() => pick(c.service)} autoFocus={c.service === current}>
              <IconBubble icon={c.icon} tone={c.tone} size={36} />
              <strong>{c.title}</strong>
              <span>{c.text}</span>
              {c.service === current ? <em>Last used</em> : null}
            </button>
          ))}
        </div>
        <p className="svc-foot">You can switch at any time from the menu.</p>
      </div>
    </div>,
    document.body,
  );
}
