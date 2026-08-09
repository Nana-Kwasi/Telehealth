import { useEffect, useRef, useState } from 'react';
import { createLocationTracker } from '../services/locationTracker';

/**
 * React binding for the location tracker.
 *
 * Cleanup is the point of this hook: the tracker is created inside the effect and
 * torn down in its cleanup function, so a component that mounts twice (StrictMode,
 * route changes, re-renders) can never leave a second watchPosition subscription
 * running. `onFix` is held in a ref so changing the callback does not restart the
 * watch — that restart-on-every-render was how duplicate subscriptions appeared.
 *
 *   const { position, error } = useLiveLocation({
 *     enabled: isOnShift,
 *     onFix: (fix) => api('/…/location', { method: 'PATCH', body: fix }),
 *   });
 */
export default function useLiveLocation({ enabled = true, onFix, threshold } = {}) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const onFixRef = useRef(onFix);

  // Keep the latest callback without re-running the effect below.
  useEffect(() => { onFixRef.current = onFix; }, [onFix]);

  useEffect(() => {
    if (!enabled) return undefined;

    const tracker = createLocationTracker({
      threshold,
      onFix: (fix) => {
        setPosition(fix);
        setError(null);
        onFixRef.current?.(fix);
      },
      onError: setError,
    });

    tracker.start();
    const detach = tracker.attachLifecycle();

    return () => {
      detach();
      tracker.stop();   // clearWatch — no leaked subscription
    };
  }, [enabled, threshold]);

  return { position, error };
}
