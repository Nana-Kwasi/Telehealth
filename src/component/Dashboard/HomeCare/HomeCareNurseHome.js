import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isNurseProfileComplete, nurseProfileCompleteMessage } from '../../../utils/homeCareProfileComplete';
import { Star, Inbox, ClipboardList } from 'lucide-react';
import { useHomeCareNurse } from './HomeCareNurseContext';
import { updateNursePresence } from '../../../services/homeCareService';
import { NURSE_PRESENCE } from '../../../constants/homeCareConstants';
import { statusLabel } from '../../../utils/homeCareUtils';
import NursePhotoPicker from './NursePhotoPicker';
import LocationSummaryCard from '../../Common/LocationSummaryCard';
import { mergeLocationProfile } from '../../../utils/locationProfile';
import './HomeCareNurseDashboard.css';

export default function HomeCareNurseHome() {
  const navigate = useNavigate();
  const { profile, nurse, setNurse, pending, emergency, ongoing, active, refresh } = useHomeCareNurse();
  const presence = nurse?.presenceStatus || NURSE_PRESENCE.OFFLINE;
  const isBusy = presence === NURSE_PRESENCE.BUSY;
  const switchOn = presence === NURSE_PRESENCE.ONLINE || isBusy;

  useEffect(() => {
    if (!nurse || isNurseProfileComplete(nurse)) return;
    const key = `hc.profilePrompt.${profile?.id || nurse.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    const msg = nurseProfileCompleteMessage(nurse);
    if (window.confirm(`${msg || 'Complete your profile so patients can book you.'}\n\nOpen Account now?`)) {
      navigate('/dashboard/account?tab=profile');
    }
  }, [nurse, profile?.id, navigate]);

  const toggleOnline = async (e) => {
    const on = e.target.checked;
    if (!on && isBusy) {
      window.alert('You are on an active booking. Complete the visit before going offline.');
      return;
    }
    await updateNursePresence(profile.id, on ? NURSE_PRESENCE.ONLINE : NURSE_PRESENCE.OFFLINE);
    setNurse((prev) => ({ ...prev, presenceStatus: on ? NURSE_PRESENCE.ONLINE : NURSE_PRESENCE.OFFLINE }));
  };

  return (
    <div className="hcn-page">
      <header className="hcn-page-header hcn-page-header-row">
        <NursePhotoPicker nurse={nurse} size={56} className="hcn-avatar-lg" />
        <div>
          <h1>Nurse dashboard</h1>
          <p>{nurse?.fullName} · {nurse?.accountStatus || 'pending'}</p>
        </div>
      </header>

      <LocationSummaryCard
        profile={mergeLocationProfile(profile, nurse)}
        title="Service location"
        onEdit={() => navigate('/dashboard/account?tab=profile')}
      />

      <div className="hcn-card hcn-toggle-row">
        <div>
          <strong>Go online</strong>
          <p className="hcn-card-meta" style={{ marginTop: 4 }}>
            {isBusy ? 'On assignment — not taking new browse requests' : switchOn ? 'You can receive new requests' : 'Turn on to appear available'}
          </p>
        </div>
        <label className="hcn-switch">
          <input type="checkbox" checked={switchOn} onChange={toggleOnline} />
          <span className="hcn-switch-slider" />
        </label>
      </div>

      <div className="hcn-stats">
        <div className="hcn-stat-card" onClick={() => navigate('/dashboard/bookings?tab=requests')} role="button" tabIndex={0}>
          <div className="hcn-stat-icon" style={{ background: '#ccfbf1', color: '#0d9488' }}>
            <Star size={22} />
          </div>
          <div>
            <p className="hcn-stat-value">★ {(nurse?.ratingAvg || 0).toFixed(1)}</p>
            <p className="hcn-stat-label">{nurse?.ratingCount || 0} reviews</p>
          </div>
        </div>
        <div className="hcn-stat-card">
          <div className="hcn-stat-icon" style={{ background: '#ecfdf5', color: '#047857' }}>
            <ClipboardList size={22} />
          </div>
          <div>
            <p className="hcn-stat-value">{nurse?.completedVisits || 0}</p>
            <p className="hcn-stat-label">Completed visits</p>
          </div>
        </div>
        <div className="hcn-stat-card" onClick={() => navigate('/dashboard/bookings?tab=requests')} role="button" tabIndex={0}>
          <div className="hcn-stat-icon" style={{ background: '#fef3c7', color: '#b45309' }}>
            <Inbox size={22} />
          </div>
          <div>
            <p className="hcn-stat-value">{pending.length}</p>
            <p className="hcn-stat-label">Pending requests</p>
          </div>
        </div>
      </div>

      <p className="hcn-section-title">Quick actions</p>
      <div className="hcn-quick-grid">
        <button type="button" className="hcn-quick-card" onClick={() => navigate('/dashboard/bookings?tab=requests')}>
          <strong>Incoming requests ({pending.length})</strong>
          <span>Review and accept bookings</span>
        </button>
        <button type="button" className="hcn-quick-card" onClick={() => navigate('/dashboard/bookings?tab=emergency')}>
          <strong>Emergency requests →</strong>
          <span>{emergency.length} open broadcast</span>
        </button>
        <button type="button" className="hcn-quick-card" onClick={() => navigate('/dashboard/bookings?tab=ongoing')}>
          <strong>Ongoing engagements →</strong>
          <span>{ongoing.length} packaged plans</span>
        </button>
        <button type="button" className="hcn-quick-card" onClick={() => navigate('/dashboard/account?tab=availability')}>
          <strong>Availability & schedule</strong>
          <span>Set working days and hours</span>
        </button>
      </div>

      <p className="hcn-section-title">Today&apos;s visits</p>
      {active.length === 0 ? (
        <p className="hcn-empty">No active visits.</p>
      ) : (
        active.map((b) => (
          <div key={b.id} className="hcn-card">
            <h3>{b.patientName}</h3>
            <p className="hcn-card-meta">{statusLabel(b.status)} · {b.careType}</p>
            <p className="hcn-card-meta">{b.address}</p>
            <div className="hcn-actions">
              <button type="button" className="hcn-btn" onClick={() => navigate(`/dashboard/visit/${b.id}`)}>
                Open visit
              </button>
            </div>
          </div>
        ))
      )}

      <button type="button" className="hcn-btn hcn-btn-outline" style={{ marginTop: '0.5rem' }} onClick={refresh}>
        Refresh
      </button>
    </div>
  );
}
