import { useState } from 'react';

export default function useAddressAutofill() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const detectAddress = async (onDetected) => {
    if (!navigator.geolocation) {
      setMessage('Location is unavailable on this browser. Please enter your address manually.');
      return;
    }
    setLoading(true);
    setMessage('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const data = await resp.json();
          const addr = data?.address || {};
          const country = addr?.country || '';
          const countryCode = (addr?.country_code || '').toUpperCase();
          const region = addr?.state || addr?.region || '';
          const city = addr?.city || addr?.town || addr?.village || addr?.county || '';
          const area = addr?.suburb || addr?.neighbourhood || addr?.city_district || '';
          const street = addr?.road || addr?.pedestrian || '';
          const display = data?.display_name || [street, area, city, region, country].filter(Boolean).join(', ');
          onDetected?.({
            address: display,
            latitude,
            longitude,
            country,
            countryCode,
            region,
            city,
            area,
            street,
            geocodedAt: new Date().toISOString(),
          });
          setMessage('Location detected and address suggested.');
        } catch {
          setMessage('Could not reverse-detect your address. Please enter it manually.');
        } finally {
          setLoading(false);
        }
      },
      () => {
        setLoading(false);
        setMessage('Location access helps us provide better services like nearby pharmacies, labs, and doctors. You can continue manually, but some features may be limited.');
      },
      // maximumAge:0 — never accept a cached position for an explicit "use my
      // current location" action.
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    );
  };

  return { detectAddress, loading, message };
}
