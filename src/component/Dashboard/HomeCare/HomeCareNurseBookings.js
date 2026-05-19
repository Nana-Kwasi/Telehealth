import React, { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useHomeCareNurse } from './HomeCareNurseContext';
import HomeCareTabBar from './HomeCareTabBar';
import HomeCareNurseRequests from './HomeCareNurseRequests';
import HomeCareNurseEmergency from './HomeCareNurseEmergency';
import HomeCareNurseOngoing from './HomeCareNurseOngoing';
import './HomeCareNurseDashboard.css';

const TABS = [
  { id: 'requests', label: 'Requests', countKey: 'pending' },
  { id: 'emergency', label: 'Emergency', countKey: 'emergency', urgent: true },
  { id: 'ongoing', label: 'Ongoing', countKey: 'ongoing' },
];

export default function HomeCareNurseBookings() {
  const [params, setParams] = useSearchParams();
  const { pending, emergency, ongoing } = useHomeCareNurse();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'requests';

  const counts = { pending: pending.length, emergency: emergency.length, ongoing: ongoing.length };
  const tabs = useMemo(
    () => TABS.map((t) => ({ ...t, count: t.countKey ? counts[t.countKey] : 0 })),
    [counts.pending, counts.emergency, counts.ongoing],
  );

  const setTab = (id) => setParams({ tab: id }, { replace: true });

  useEffect(() => {
    if (!params.get('tab')) setParams({ tab: 'requests' }, { replace: true });
  }, [params, setParams]);

  return (
    <div className="hcn-page">
      <header className="hcn-page-header">
        <h1>Bookings</h1>
        <p>Requests, emergency broadcasts, and ongoing care</p>
      </header>
      <HomeCareTabBar tabs={tabs} active={tab} onChange={setTab} />
      <div className="hcn-tab-panel">
        {tab === 'requests' ? <HomeCareNurseRequests embedded /> : null}
        {tab === 'emergency' ? <HomeCareNurseEmergency embedded /> : null}
        {tab === 'ongoing' ? <HomeCareNurseOngoing embedded /> : null}
      </div>
    </div>
  );
}
