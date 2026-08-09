import { useEffect, useMemo, useRef } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from '../../services/firestoreShim';
import { auth, db } from '../../services/firestoreShim';
import useAddressAutofill from '../../hooks/useAddressAutofill';

function roleTarget(role, profile) {
  const id = profile?.id || auth.currentUser?.uid || null;
  if (!id) return null;
  if (role === 'admin') {
    return { collection: profile?.adminSource === 'therapists' ? 'therapists' : 'admins', id };
  }
  if (role === 'doctor') return { collection: 'doctors', id };
  if (role === 'therapist') return { collection: 'therapists', id };
  if (role === 'pharmacy') return { collection: 'pharmacies', id };
  if (role === 'branch_user') return { collection: 'pharmacyBranches', id };
  if (role === 'lab') return { collection: 'labs', id };
  if (role === 'scan') return { collection: 'scanCenters', id };
  if (role === 'lab_branch') return { collection: 'labBranches', id };
  if (role === 'scan_branch') return { collection: 'scanBranches', id };
  if (role === 'homecare_nurse') return { collection: 'homeCareNurses', id };
  return { collection: 'auth', id: auth.currentUser?.uid || id };
}

function hasLocationData(data) {
  if (!data) return false;
  const lat = Number(data?.latitude ?? data?.locationMeta?.latitude ?? data?.location?.latitude);
  const lng = Number(data?.longitude ?? data?.locationMeta?.longitude ?? data?.location?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return true;
  return !!(data?.country || data?.city || data?.area || data?.region || data?.street);
}

/**
 * Silent location gate. On entering the dashboard it auto-detects the user's
 * current location (once) and saves it to their profile — no modal, no manual
 * step, no repeated prompts. If a location is already saved, or the browser
 * blocks geolocation, it does nothing. Users can edit their address manually in
 * their profile/settings screen.
 */
export default function DashboardLocationGate({ role, profile, activePath = '' }) {
  const { detectAddress } = useAddressAutofill();
  const target = useMemo(() => roleTarget(role, profile), [role, profile]);
  const ranRef = useRef(false);

  useEffect(() => {
    if (!role || !activePath.startsWith('/dashboard') || !target || ranRef.current) return;
    ranRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const flagKey = `loc.autosaved.${target.id}`;
        if (sessionStorage.getItem(flagKey)) return;

        const snap = await getDoc(doc(db, target.collection, target.id));
        const data = snap.exists() ? snap.data() : {};
        if (hasLocationData(data)) { sessionStorage.setItem(flagKey, '1'); return; }

        // No location yet — detect and save silently.
        detectAddress(async (loc) => {
          if (cancelled || !loc) return;
          const latitude = Number.isFinite(Number(loc.latitude)) ? Number(loc.latitude) : null;
          const longitude = Number.isFinite(Number(loc.longitude)) ? Number(loc.longitude) : null;
          if (latitude == null && !loc.city && !loc.countryCode && !loc.country) return;

          const payload = {
            country: loc.countryCode || loc.country || null,
            city: loc.city || null,
            area: loc.area || null,
            region: loc.region || null,
            street: loc.street || null,
            latitude,
            longitude,
            locationMeta: {
              country: loc.countryCode || loc.country || null,
              city: loc.city || null,
              area: loc.area || null,
              region: loc.region || null,
              street: loc.street || null,
              latitude,
              longitude,
            },
            updatedAt: serverTimestamp(),
          };
          try {
            await setDoc(doc(db, target.collection, target.id), payload, { merge: true });
            if (role === 'client' || profile?.userIntent === 'medical') {
              const uid = auth.currentUser?.uid;
              if (uid) {
                await setDoc(doc(db, 'auth', uid), payload, { merge: true }).catch(() => {});
                await setDoc(doc(db, 'patientProfiles', uid), payload, { merge: true }).catch(() => {});
              }
            }
            sessionStorage.setItem(flagKey, '1');
          } catch { /* best-effort; user can set it manually in settings */ }
        });
      } catch { /* ignore */ }
    })();

    return () => { cancelled = true; };
  }, [role, target, activePath, profile, detectAddress]);

  return null; // never renders UI
}
