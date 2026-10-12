import React, { useEffect, useState } from 'react';
import {
  Sun, Moon, CloudSun, CloudMoon, Cloud, CloudFog, CloudDrizzle, CloudRain,
  CloudLightning, CloudSnow, Droplets, Wind, Sunrise, Sunset, Umbrella, Thermometer, MapPin,
} from 'lucide-react';
import { pickLocation } from './LocationSummaryCard';
import { fetchCurrentWeather, weatherTheme } from '../../services/weatherService';
import './WeatherCard.css';

/**
 * Current conditions where the person is, with the next few hours.
 *
 * The look follows the weather: a sky that matches the conditions, an icon
 * that moves (falling rain, a turning sun, a lightning flash, drifting snow),
 * today's high/low, rain chance, UV, wind, sunrise/sunset, an hourly strip and
 * one practical tip. Motion is off for anyone who asks for reduced motion.
 *
 * Coordinates come from the same profile the location card uses, so the
 * weather follows a changed location. Renders nothing without coordinates or
 * when the service is unreachable — this is decoration on a care dashboard.
 *
 * compact: a small card for a header or a stat slot (icon, temp, condition,
 * high/low, rain chance).
 */

/** Icon colour per condition — the card is white glass, the icons carry the colour. */
export const WEATHER_ICON_COLORS = {
  'clear-day': '#f59e0b', 'partly-day': '#f59e0b', 'clear-night': '#6366f1', 'partly-night': '#6366f1',
  cloudy: '#64748b', fog: '#94a3b8', rain: '#3b82f6', storm: '#7c3aed', snow: '#38bdf8',
};

/** The icon for a theme (and a specific code where it reads better). */
export function weatherIconFor(theme, code) {
  const c = Number(code);
  switch (theme) {
    case 'storm': return CloudLightning;
    case 'rain': return c >= 51 && c <= 57 ? CloudDrizzle : CloudRain;
    case 'snow': return CloudSnow;
    case 'fog': return CloudFog;
    case 'cloudy': return Cloud;
    case 'partly-day': return CloudSun;
    case 'partly-night': return CloudMoon;
    case 'clear-night': return Moon;
    default: return Sun;
  }
}

/** Falling rain / snow, behind the content. */
function Precipitation({ theme }) {
  if (theme !== 'rain' && theme !== 'storm' && theme !== 'snow') return null;
  const n = theme === 'snow' ? 14 : 22;
  return (
    <div className="wx-precip" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className={theme === 'snow' ? 'wx-flake' : 'wx-drop'}
          style={{
            left: `${(i * 97) % 100}%`,
            animationDelay: `${((i * 37) % 100) / 60}s`,
            animationDuration: `${theme === 'snow' ? 3.2 + (i % 4) * 0.4 : 0.7 + (i % 5) * 0.08}s`,
          }}
        />
      ))}
    </div>
  );
}

function useWeather(latitude, longitude) {
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
  }, [latitude, longitude]);
  return weather;
}

export default function WeatherCard({ profile, compact = false }) {
  const { latitude, longitude, city, area, region, country } = pickLocation(profile);
  const weather = useWeather(latitude, longitude);
  if (!weather) return null;

  const theme = weather.theme || weatherTheme(weather.code, weather.isDay);
  const Icon = weatherIconFor(theme, weather.code);
  const place = [area || city, region && region !== city ? region : '', country]
    .filter(Boolean).slice(0, 2).join(', ');
  const hiLo = weather.highC != null && weather.lowC != null ? `H ${weather.highC}°  L ${weather.lowC}°` : '';

  if (compact) {
    return (
      <div className={`wx-card wx-compact wx-${theme}`} title={`${weather.label} · feels like ${weather.feelsLikeC}°C${place ? ` · ${place}` : ''}`}>
        <Precipitation theme={theme} />
        <span className={`wx-icon wx-icon-${theme}`} aria-hidden="true"><Icon size={30} strokeWidth={1.75} color={WEATHER_ICON_COLORS[theme]} /></span>
        <div className="wx-compact-text">
          <p className="wx-compact-temp">{weather.tempC}°<span>C</span></p>
          <p className="wx-compact-label">{weather.label}</p>
          <p className="wx-compact-sub">
            {hiLo}
            {weather.rainChance != null ? <span><Umbrella size={11} color="#6366f1" /> {weather.rainChance}%</span> : null}
          </p>
        </div>
      </div>
    );
  }

  const stats = [
    { icon: Thermometer, color: '#ef4444', label: 'Feels like', value: `${weather.feelsLikeC}°` },
    { icon: Droplets, color: '#0ea5e9', label: 'Humidity', value: `${weather.humidity}%` },
    { icon: Wind, color: '#14b8a6', label: 'Wind', value: `${weather.windKph} km/h${weather.windDir ? ` ${weather.windDir}` : ''}` },
    weather.rainChance != null ? { icon: Umbrella, color: '#6366f1', label: 'Rain chance', value: `${weather.rainChance}%` } : null,
    weather.uvMax != null ? { icon: Sun, color: '#f59e0b', label: 'UV today', value: `${weather.uvMax}${weather.uvMax >= 8 ? ' · very high' : weather.uvMax >= 6 ? ' · high' : ''}` } : null,
  ].filter(Boolean);

  return (
    <div className={`wx-card wx-${theme}`}>
      <Precipitation theme={theme} />
      <div className="wx-top">
        <div>
          {place ? <p className="wx-place"><MapPin size={13} color="#e11d48" /> {place}</p> : null}
          <p className="wx-temp">{weather.tempC}°<span>C</span></p>
          <p className="wx-label">{weather.label}</p>
          {hiLo ? <p className="wx-hilo">{hiLo}</p> : null}
        </div>
        <span className={`wx-icon wx-icon-big wx-icon-${theme}`} aria-hidden="true"><Icon size={72} strokeWidth={1.4} color={WEATHER_ICON_COLORS[theme]} /></span>
      </div>

      <div className="wx-stats">
        {stats.map(({ icon: SIcon, color, label, value }) => (
          <div key={label} className="wx-stat">
            <SIcon size={18} color={color} aria-hidden="true" />
            <span className="wx-stat-label">{label}</span>
            <span className="wx-stat-value">{value}</span>
          </div>
        ))}
      </div>

      {weather.hourly?.length ? (
        <div className="wx-hours" aria-label="Next hours">
          {weather.hourly.map((h) => {
            const HIcon = weatherIconFor(h.theme, h.code);
            return (
              <div key={h.iso} className="wx-hour">
                <span className="wx-hour-time">{h.time}</span>
                <HIcon size={20} color={WEATHER_ICON_COLORS[h.theme]} aria-hidden="true" />
                <span className="wx-hour-temp">{h.tempC}°</span>
                {h.rainChance ? <span className="wx-hour-rain">{h.rainChance}%</span> : <span className="wx-hour-rain"> </span>}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="wx-foot">
        {weather.sunrise ? <span><Sunrise size={16} color="#f97316" /> {weather.sunrise}</span> : null}
        {weather.sunset ? <span><Sunset size={16} color="#e11d48" /> {weather.sunset}</span> : null}
      </div>
      {weather.tip ? <p className="wx-tip">{weather.tip}</p> : null}
    </div>
  );
}
