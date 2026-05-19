import React, { useCallback, useEffect, useState } from 'react';
import {
  getCurrentLocationMobile,
  reverseGeocodeMobile,
} from '../../services/homeCareService';

export default function HomeCareAddressField({
  label = 'Visit address *',
  address,
  onAddressChange,
  coords,
  onCoordsChange,
  detectOnMount = true,
}) {
  const [locLoading, setLocLoading] = useState(false);
  const [locFailed, setLocFailed] = useState(false);
  const [detected, setDetected] = useState(false);

  const detectLocation = useCallback(async () => {
    setLocLoading(true);
    setLocFailed(false);
    try {
      const loc = await getCurrentLocationMobile();
      if (!loc) {
        setLocFailed(true);
        return;
      }
      onCoordsChange?.(loc);
      const text = await reverseGeocodeMobile(loc.latitude, loc.longitude);
      if (text) {
        onAddressChange(text);
        setDetected(true);
      } else {
        setLocFailed(true);
      }
    } catch {
      setLocFailed(true);
    } finally {
      setLocLoading(false);
    }
  }, [onAddressChange, onCoordsChange]);

  useEffect(() => {
    if (detectOnMount) detectLocation();
  }, [detectOnMount, detectLocation]);

  return (
    <div className="hc-address-field">
      <label>{label}</label>
      {locLoading ? <p className="hc-loc-hint">Detecting your location…</p> : null}
      {!locLoading && locFailed && !address.trim() ? (
        <p className="hc-loc-hint" style={{ color: '#b45309' }}>
          Location unavailable — type your address or use the button below.
        </p>
      ) : null}
      {!locLoading && detected && address ? (
        <p className="hc-loc-hint" style={{ color: '#047857' }}>
          Location detected — edit if needed.
        </p>
      ) : null}
      <textarea
        rows={3}
        value={address}
        onChange={(e) => {
          onAddressChange(e.target.value);
          if (detected) setDetected(false);
        }}
        placeholder="House number, street, area, city"
        required
      />
      <div className="hc-loc-row">
        <button type="button" className="hc-btn hc-btn-outline" onClick={detectLocation} disabled={locLoading}>
          {locLoading ? 'Detecting…' : 'Use my location'}
        </button>
      </div>
    </div>
  );
}
