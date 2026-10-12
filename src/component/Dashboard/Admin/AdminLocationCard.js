import React, { useEffect, useRef, useState } from 'react';
import { MapPin, ChevronDown, LocateFixed, Check, Loader } from 'lucide-react';
import { auth, db, doc, setDoc, serverTimestamp } from '../../../services/firestoreShim';
import useAddressAutofill from '../../../hooks/useAddressAutofill';
import { publishLocationUpdate } from '../../../utils/locationBus';
import { pickLocation, flagFromCountry } from '../../Common/LocationSummaryCard';

/**
 * Where the admin is: country flag and place, and — on click — a dropdown to
 * update it, either from the device's location or by typing a city. A typed
 * city is looked up (Open-Meteo geocoding, the same service as the weather) so
 * the weather card follows the new place. Saved to the admin's own profile,
 * the same record the dashboard's location gate writes.
 */
export default function AdminLocationCard({ profile, onSaved }) {
  const { detectAddress, loading: detecting } = useAddressAutofill();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ city: '', region: '', country: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const boxRef = useRef(null);

  const picked = pickLocation(profile || {});
  // A location detected on the device is often only one address string
  // ("Pobiman, Ga West …, Ghana") with no separate fields — read it from that.
  const addrParts = String(picked.address || '').split(',').map((t) => t.trim()).filter(Boolean);
  const loc = {
    ...picked,
    country: picked.country || (addrParts.length > 1 ? addrParts[addrParts.length - 1] : ''),
  };
  const place = [loc.area || loc.city, loc.region && loc.region !== loc.city ? loc.region : ''].filter(Boolean).join(', ')
    || addrParts.slice(0, 2).join(', ');

  useEffect(() => {
    setForm({ city: loc.city || addrParts[0] || '', region: loc.region || '', country: loc.country || '' });
  }, [loc.city, loc.region, loc.country, addrParts[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const save = async (next) => {
    const id = profile?.id || auth.currentUser?.uid;
    if (!id) { setMsg('Your account could not be identified. Please sign in again.'); return; }
    const collection = profile?.adminSource === 'therapists' ? 'therapists' : 'admins';
    const payload = {
      country: next.country || null, city: next.city || null, area: next.area || null,
      region: next.region || null, street: next.street || null,
      latitude: next.latitude ?? null, longitude: next.longitude ?? null,
      locationMeta: {
        country: next.country || null, city: next.city || null, area: next.area || null, region: next.region || null,
        street: next.street || null, latitude: next.latitude ?? null, longitude: next.longitude ?? null,
      },
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, collection, id), payload, { merge: true });
    publishLocationUpdate(payload);
    onSaved?.(payload);
  };

  const useDevice = () => {
    setMsg('');
    detectAddress(async (l) => {
      if (!l) { setMsg('Your location could not be detected. Allow location access, or type a city.'); return; }
      setBusy(true);
      try {
        await save({
          country: l.countryCode || l.country, city: l.city, area: l.area, region: l.region, street: l.street,
          latitude: Number(l.latitude), longitude: Number(l.longitude),
        });
        setMsg('Location updated.');
        setOpen(false);
      } catch (e) {
        setMsg(e?.message || 'Could not save your location.');
      } finally { setBusy(false); }
    });
  };

  const saveTyped = async (e) => {
    e.preventDefault();
    if (!form.city.trim()) { setMsg('Enter a city.'); return; }
    setBusy(true); setMsg('');
    try {
      // Coordinates for the weather; a place the lookup cannot find is still saved.
      let coords = {};
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=${encodeURIComponent(form.city.trim())}`)
          .then((x) => x.json());
        const hit = (r?.results || []).find((h) => !form.country || [h.country_code, h.country].some((c) => String(c || '').toLowerCase() === form.country.trim().toLowerCase())) || r?.results?.[0];
        if (hit) coords = { latitude: hit.latitude, longitude: hit.longitude, country: form.country || hit.country_code, region: form.region || hit.admin1 };
      } catch { /* save without coordinates */ }
      await save({ city: form.city.trim(), region: form.region.trim() || coords.region, country: form.country.trim() || coords.country, ...coords });
      setMsg('Location updated.');
      setOpen(false);
    } catch (err) {
      setMsg(err?.message || 'Could not save your location.');
    } finally { setBusy(false); }
  };

  return (
    <div className="loc-card" ref={boxRef}>
      <button type="button" className="loc-trigger" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="loc-flag" aria-hidden="true">{flagFromCountry(loc.country)}</span>
        <span className="loc-text">
          <small>Your location</small>
          <strong>{place || 'Not set'}</strong>
          <em>{loc.country || 'Tap to set your location'}</em>
        </span>
        <ChevronDown size={18} className={`loc-chev ${open ? 'up' : ''}`} />
      </button>
      {msg && !open ? <p className="loc-msg">{msg}</p> : null}

      {open ? (
        <div className="loc-drop">
          <p className="loc-drop-title"><MapPin size={14} /> Update location</p>
          <button type="button" className="loc-device" onClick={useDevice} disabled={busy || detecting}>
            {detecting || busy ? <Loader size={15} className="loc-spin" /> : <LocateFixed size={15} />}
            {detecting ? 'Detecting…' : 'Use my current location'}
          </button>
          <div className="loc-or"><span>or type it</span></div>
          <form onSubmit={saveTyped} className="loc-form">
            <input type="text" placeholder="City, e.g. Accra" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <div className="loc-form-row">
              <input type="text" placeholder="Region" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
              <input type="text" placeholder="Country, e.g. GH" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              {busy ? <Loader size={14} className="loc-spin" /> : <Check size={14} />} Save location
            </button>
          </form>
          {msg ? <p className="loc-msg">{msg}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
