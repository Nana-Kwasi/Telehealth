import { useEffect, useState } from 'react';
import { api } from '../../services/apiClient';

/*
 * The feature switches the super admin sets in System Config › Features.
 * Menus hide what is switched off; the server refuses it either way.
 * Read once per page load and shared; unknown or unreadable means "on".
 */
let cache = null;
let pending = null;
const listeners = new Set();

function load() {
  if (pending) return pending;
  pending = api('/api/v1/admin/system-config/public/settings', { authenticated: false })
    .then((s) => { cache = (s && s.features) || {}; })
    .catch(() => { cache = {}; })
    .finally(() => { listeners.forEach((l) => l(cache)); });
  return pending;
}

export function usePlatformFeatures() {
  const [features, setFeatures] = useState(cache || {});
  useEffect(() => {
    listeners.add(setFeatures);
    if (cache) setFeatures(cache); else load();
    return () => { listeners.delete(setFeatures); };
  }, []);
  return features;
}

/** True unless the admin switched this feature off. */
export const featureOn = (features, key) => !key || features[key] !== false;
