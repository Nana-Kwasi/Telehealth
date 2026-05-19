import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { resolveCoupleLandingPath } from '../../services/coupleTherapyService';

/**
 * Keeps couple partners out of /dashboard until intake, payment, and therapist matching are done.
 */
export default function CoupleClientGate({ profile, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!location.pathname.startsWith('/dashboard')) {
        if (!cancelled) setReady(true);
        return;
      }

      const landing = await resolveCoupleLandingPath(profile);
      if (!cancelled && landing && landing.path !== '/dashboard') {
        navigate(landing.path, { replace: true, state: landing.state });
        return;
      }
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [profile, location.pathname, navigate]);

  if (!ready) {
    return (
      <div
        style={{
          minHeight: '50vh',
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

  return children;
}
