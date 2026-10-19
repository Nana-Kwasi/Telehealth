import { useEffect, useState } from 'react';
import { api } from '../services/apiClient';

/**
 * Whether the signed-in account's email is confirmed, from the server
 * (/auth/me). The dashboard banner read the sign-in session, which has no such
 * field, so it always said "verify your email"; Settings read a stored copy that
 * defaulted to verified. Both now ask the one place that knows.
 * Returns null while loading so nothing flashes.
 */
export default function useEmailVerified() {
  const [verified, setVerified] = useState(null);
  useEffect(() => {
    let live = true;
    api('/api/v1/auth/me')
      .then((me) => { if (live) setVerified(me?.emailVerified !== false); })
      .catch(() => { if (live) setVerified(true); });
    return () => { live = false; };
  }, []);
  return verified;
}
