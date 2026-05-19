import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import HomeCareTabBar from './HomeCareTabBar';
import HomeCareNurseManageProfile from './HomeCareNurseManageProfile';
import HomeCareNurseAvailability from './HomeCareNurseAvailability';
import HomeCareNurseDocuments from './HomeCareNurseDocuments';
import HomeCareNurseEarnings from './HomeCareNurseEarnings';
import './HomeCareNurseDashboard.css';

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'availability', label: 'Availability' },
  { id: 'documents', label: 'Documents' },
  { id: 'earnings', label: 'Earnings' },
];

export default function HomeCareNurseAccount() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'profile';

  const setTab = (id) => setParams({ tab: id }, { replace: true });

  useEffect(() => {
    if (!params.get('tab')) setParams({ tab: 'profile' }, { replace: true });
  }, [params, setParams]);

  return (
    <div className="hcn-page">
      <header className="hcn-page-header">
        <h1>Account</h1>
        <p>Profile, schedule, verification & earnings</p>
      </header>
      <HomeCareTabBar tabs={TABS.map((t) => ({ ...t, count: 0 }))} active={tab} onChange={setTab} />
      <div className="hcn-tab-panel">
        {tab === 'profile' ? <HomeCareNurseManageProfile embedded /> : null}
        {tab === 'availability' ? <HomeCareNurseAvailability embedded /> : null}
        {tab === 'documents' ? <HomeCareNurseDocuments embedded /> : null}
        {tab === 'earnings' ? <HomeCareNurseEarnings embedded /> : null}
      </div>
    </div>
  );
}
