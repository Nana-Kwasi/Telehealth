import React, { useEffect, useState } from 'react';
import { pickLocation } from './LocationSummaryCard';
import { fetchCurrentWeather } from '../../services/weatherService';
import './WeatherCard.css';

/**
 * Current conditions where the patient is. Reads its coordinates from the same
 * profile the location card uses, so the moment a saved location changes the
 * weather follows it — the caller passes the already-updated profile.
 *
 * Renders nothing at all when there are no coordinates or the service is
 * unreachable. A dashboard that shows an empty box, or worse an error, over
 * something this peripheral is worse than one that simply omits it.
 */
export default function WeatherCard({ profile, compact = false }) {
  const { latitude, longitude, city, area, region, country } = pickLocation(profile);
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setWeather(null);
      return undefined;
    }
    const controller = new AbortController();
    let alive = true;

    const load = async () => {
      const w = await fetchCurrentWeather(latitude, longitude, { signal: controller.signal });
      if (alive) setWeather(w);
    };
    load();

    // Conditions change through the day and a dashboard is often left open.
    const timer = setInterval(load, 10 * 60 * 1000);
    return () => { alive = false; clearInterval(timer); controller.abort(); };
    // Re-runs on a new location: that is the whole point of the card.
  }, [latitude, longitude]);

  if (!weather) return null;

  const place = [area || city, region && region !== city ? region : '', country]
    .filter(Boolean).slice(0, 2).join(', ');

  if (compact) {
    return (
      <div className="mp-weather-inline" title={`${weather.label} · feels like ${weather.feelsLikeC}°C`}>
        <span className="mp-weather-inline-icon" aria-hidden="true">{weather.icon}</span>
        <span className="mp-weather-inline-temp">{weather.tempC}°C</span>
        <span className="mp-weather-inline-label">{weather.label}</span>
      </div>
    );
  }

  return (
    <div className="mp-weather-card">
      <div className="mp-weather-main">
        <span className="mp-weather-icon" aria-hidden="true">{weather.icon}</span>
        <div>
          <p className="mp-weather-temp">{weather.tempC}°C</p>
          <p className="mp-weather-label">{weather.label}</p>
        </div>
      </div>
      {place ? <p className="mp-weather-place">{place}</p> : null}
      <div className="mp-weather-meta">
        <span>Feels {weather.feelsLikeC}°</span>
        <span>Humidity {weather.humidity}%</span>
        <span>Wind {weather.windKph} km/h</span>
      </div>
    </div>
  );
}
