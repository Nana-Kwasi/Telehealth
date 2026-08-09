import React from 'react';

export function formatDashboardLocationLine(profile = {}) {
  const loc = pickLocation(profile);
  const composed = [loc.area || loc.street, loc.city].filter(Boolean).join(', ');
  const tail = [loc.region, loc.country].filter(Boolean).join(', ');
  const primary = [composed, tail].filter(Boolean).join(' · ');
  if (primary) return primary;
  if (loc.ghanaDigitalAddress) return loc.ghanaDigitalAddress;
  const raw = String(loc.address || '').trim();
  if (raw && !/^[A-Z]{2}-\d{3}-\d{4}$/i.test(raw)) return raw;
  if (Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)) {
    return `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`;
  }
  return '';
}

function pickLocation(profile = {}) {
  const src = profile || {};
  const locationMeta = src.locationMeta || {};
  // `location` may be a structured object OR a plain address string (the doctor /
  // staff profiles store it as a string). Live coords captured on app open land in
  // `currentLocation` (or `metadata.currentLocation`).
  const location = (src.location && typeof src.location === 'object') ? src.location : {};
  const locationStr = (typeof src.location === 'string') ? src.location.trim() : '';
  const current = src.currentLocation || src.metadata?.currentLocation || {};
  const country = src.country || locationMeta.country || location.country || '';
  const city = src.city || locationMeta.city || location.city || '';
  const area = src.area || locationMeta.area || location.area || '';
  const region = src.region || locationMeta.region || location.region || '';
  const street = src.street || locationMeta.street || location.street || '';
  const rawAddress = String(
    src.address || location.address || src.formattedAddress || current.address || locationStr || '',
  ).trim();
  const codeMatch = rawAddress.match(/\b[A-Z]{2}-\d{3}-\d{4}\b/i);
  const ghanaDigitalAddress = src.ghanaDigitalAddress || locationMeta.ghanaDigitalAddress || location.ghanaDigitalAddress || (codeMatch ? codeMatch[0].toUpperCase() : '');
  const latitude = Number(src.latitude ?? locationMeta.latitude ?? location.latitude ?? current.latitude);
  const longitude = Number(src.longitude ?? locationMeta.longitude ?? location.longitude ?? current.longitude);
  return {
    country,
    city,
    area,
    region,
    street,
    address: rawAddress,
    ghanaDigitalAddress,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
}

function normalizeCountryCode(country = '') {
  const raw = String(country || '').trim();
  if (!raw) return '';
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  const table = {
    ghana: 'GH',
    nigeria: 'NG',
    kenya: 'KE',
    uganda: 'UG',
    rwanda: 'RW',
    tanzania: 'TZ',
    southafrica: 'ZA',
    southafrican: 'ZA',
    unitedstates: 'US',
    usa: 'US',
    us: 'US',
    unitedkingdom: 'GB',
    uk: 'GB',
    britain: 'GB',
    canada: 'CA',
    india: 'IN',
    australia: 'AU',
    germany: 'DE',
    france: 'FR',
    italy: 'IT',
    spain: 'ES',
  };
  const key = raw.toLowerCase().replace(/[^a-z]/g, '');
  return table[key] || '';
}

function flagFromCountry(country = '') {
  const cc = normalizeCountryCode(country);
  if (!cc) return '🏳️';
  const points = [...cc].map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...points);
}

export default function LocationSummaryCard({ profile, title = 'Your Saved Location', onEdit }) {
  const loc = pickLocation(profile);
  const composedAddress = [loc.area || loc.street, loc.city].filter(Boolean).join(', ');
  const rawFormatted = (loc.address || '').trim();
  const isDigitalCodeOnly = /^[A-Z]{2}-\d{3}-\d{4}$/i.test(rawFormatted);
  const formattedAddress = composedAddress || (rawFormatted && !isDigitalCodeOnly ? rawFormatted : '');
  const hasStructured = Boolean(loc.country || loc.city || loc.area || loc.region || loc.street);
  const hasLocation = Boolean(formattedAddress) || hasStructured || Boolean(loc.ghanaDigitalAddress) || (Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude));
  const flag = flagFromCountry(loc.country);

  return (
    <section style={{
      border: '1px solid #e2e8f0',
      borderRadius: 14,
      background: 'linear-gradient(135deg,#f8fafc,#eff6ff)',
      padding: '0.9rem 1rem',
      marginBottom: '1rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              fontSize: '1.05rem',
              lineHeight: 1,
            }}
          >
            {flag}
          </span>
          <span>{loc.country || 'Location'}</span>
        </h3>
        <span style={{
          padding: '0.2rem 0.55rem',
          borderRadius: 999,
          fontSize: '0.68rem',
          fontWeight: 800,
          background: hasLocation ? '#dcfce7' : '#fee2e2',
          color: hasLocation ? '#166534' : '#991b1b',
        }}>
          {hasLocation ? 'Location Saved' : 'Location Missing'}
        </span>
      </div>
      {hasLocation ? (
        <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
          {!!formattedAddress && (
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#334155', fontWeight: 700 }}>
              {formattedAddress}
            </p>
          )}
          {!formattedAddress && loc.ghanaDigitalAddress ? (
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
              Address name not set yet. Update location details to show format like "East Legon, Accra, Ghana".
            </p>
          ) : null}
          {loc.ghanaDigitalAddress ? (
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#0f766e' }}>Ghana Digital Address: {loc.ghanaDigitalAddress}</p>
          ) : null}
        </div>
      ) : (
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
          No location on record yet. Open Settings and save your address/location to improve nearby matching.
        </p>
      )}
      {onEdit ? (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={onEdit}
            style={{
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#0f172a',
              borderRadius: 8,
              padding: '0.35rem 0.6rem',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Update Location
          </button>
        </div>
      ) : null}
    </section>
  );
}
