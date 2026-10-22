import React from 'react';
import { useNavigate } from 'react-router-dom';
import { refreshSession } from '../Auth/authService';
import { getStoredUserId } from '../../services/apiClient';
import { accountServices, chooseService } from '../../utils/careServices';
import './ServiceSwitcher.css';

const LABELS = { therapy: 'Therapy', medical: 'Medical' };

/**
 * Therapy | Medical toggle for an account that uses both services. Shown in
 * both patient dashboards' sidebars; hidden when the account has only one.
 * The choice is remembered on this device and applied on the next sign-in too.
 */
export default function ServiceSwitcher({ profile, current }) {
  const navigate = useNavigate();
  const services = accountServices(profile);
  if (services.length < 2) return null;

  const pick = (service) => {
    if (service === current) return;
    chooseService(getStoredUserId() || profile?.id || profile?.uid, service);
    navigate('/dashboard');
    refreshSession(); // re-resolves the profile with the new choice → App swaps dashboards
  };

  return (
    <div className="nh-service-switch" role="group" aria-label="Switch dashboard">
      {['therapy', 'medical'].map((s) => (
        <button
          key={s}
          type="button"
          className={`nh-service-switch-btn${s === current ? ' is-active' : ''}`}
          aria-pressed={s === current}
          onClick={() => pick(s)}
        >
          {LABELS[s]}
        </button>
      ))}
    </div>
  );
}
