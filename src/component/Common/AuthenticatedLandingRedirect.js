import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { resolveCoupleLandingPath } from '../../services/coupleTherapyService';
import { homeCarePatientLandingPath, isHomeCarePatientIntent } from '../../utils/homeCarePatientIntent';
import { resolveDashboardHub } from '../../utils/dashboardHub';

function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#64748b',
      }}
    >
      Loading…
    </div>
  );
}

/** Picks home-care, couple onboarding, or role dashboard after auth. */
export default function AuthenticatedLandingRedirect({ session }) {
  const location = useLocation();
  const [dest, setDest] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { role, profile } = session;
      const pathname = location.pathname;

      if (role === 'client' && isHomeCarePatientIntent(profile, pathname)) {
        if (!cancelled) setDest({ path: homeCarePatientLandingPath() });
        return;
      }

      if (role === 'client') {
        const couple = await resolveCoupleLandingPath(profile);
        if (couple) {
          if (!cancelled) setDest(couple);
          return;
        }
      }

      const hub = resolveDashboardHub({ role, profile, pathname });
      if (!cancelled) setDest({ path: hub?.path || '/dashboard' });
    })();

    return () => {
      cancelled = true;
    };
  }, [session, location.pathname]);

  if (!dest) return <LoadingScreen />;
  return <Navigate to={dest.path} state={dest.state} replace />;
}
