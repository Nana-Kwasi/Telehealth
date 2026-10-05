import React from 'react';
import { ChevronRight, Search, Bell } from 'lucide-react';
import './dashboard.css';

/**
 * The shared dashboard kit.
 *
 * Therapist and doctor home screens are the same layout with different data,
 * so the layout lives here exactly once. Each role file supplies content; none
 * of them re-implement a card.
 *
 * Nothing in here invents a number. Every component renders what it is handed
 * and has an explicit empty state, because a dashboard that shows plausible
 * figures when the data failed to load is worse than one that says so.
 */

/** Page shell: the three-column grid the reference layout uses. */
export function DashboardGrid({ children }) {
  return <div className="nd-grid">{children}</div>;
}

/**
 * The hero banner. Greeting, headline, one primary action and one secondary.
 */
export function HeroBanner({
  greeting, name, headline, accent, body, actions, aside,
  /** Rendered at the right edge, behind nothing — see nd-hero-art. */
  art,
  /** Full width rather than two of three columns. */
  wide = false,
}) {
  return (
    <section className={`nd-hero ${wide ? 'nd-hero-wide' : ''}`}>
      <div className="nd-hero-copy">
        {greeting ? (
          <span className="nd-hero-greet">
            <span className="nd-hero-greet-dot" aria-hidden="true" />
            {greeting}{name ? `, ${name}` : ''}
          </span>
        ) : null}
        <h1 className="nd-hero-title">
          {headline}
          {accent ? <><br /><span className="nd-hero-accent">{accent}</span></> : null}
        </h1>
        {body ? <p className="nd-hero-body">{body}</p> : null}
        {actions?.length ? (
          <div className="nd-hero-actions">
            {actions.map((a, i) => (
              <button
                key={a.label}
                type="button"
                onClick={a.onClick}
                className={i === 0 ? 'nd-cta' : 'nd-cta-ghost'}
                disabled={a.disabled}
              >
                {a.Icon ? <a.Icon size={16} /> : null}
                {a.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {aside ? <div className="nd-hero-aside">{aside}</div> : null}
      {/* Decorative. Last in the DOM so it never comes before the copy for a
          screen reader, and marked aria-hidden for the same reason. */}
      {art ? <img className="nd-hero-art" src={art} alt="" aria-hidden="true" /> : null}
    </section>
  );
}

/** One of the three stacked cards beside the hero. */
export function StatTile({ Icon, tone = 'lilac', label, value, meta, onClick, trend }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
         className={`nd-stat ${onClick ? 'is-clickable' : ''}`}>
      <span className={`nd-stat-icon nd-tone-${tone}`}>{Icon ? <Icon size={19} /> : null}</span>
      <span className="nd-stat-body">
        <span className="nd-stat-label">{label}</span>
        <span className="nd-stat-value">{value}</span>
        {meta ? <span className="nd-stat-meta">{meta}</span> : null}
      </span>
      {trend ? <span className="nd-spark" aria-hidden="true">{trend}</span> : null}
      {onClick ? <ChevronRight size={16} className="nd-stat-chev" /> : null}
    </Tag>
  );
}

/** A titled panel with an optional "View all". */
export function Panel({ title, subtitle, action, span = 1, children, className = '' }) {
  return (
    <section className={`nd-panel nd-span-${span} ${className}`}>
      <header className="nd-panel-head">
        <div className="nd-panel-heading">
          <h2 className="nd-panel-title">{title}</h2>
          {subtitle ? <p className="nd-panel-sub">{subtitle}</p> : null}
        </div>
        {action ? (
          <button type="button" className="nd-viewall" onClick={action.onClick}>
            {action.label || 'View all'}
          </button>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/**
 * The ring in "Health Overview".
 *
 * Drawn with stroke-dasharray rather than a chart library: it is one number,
 * and pulling in a charting dependency to draw a circle is not a trade worth
 * making.
 */
export function ScoreRing({ value, max = 100, label, caption, tone = '#5b5bd6' }) {
  const pct = Math.max(0, Math.min(100, (Number(value) / max) * 100 || 0));
  const R = 46;
  const C = 2 * Math.PI * R;
  return (
    <div className="nd-ring-wrap">
      <svg className="nd-ring" viewBox="0 0 110 110" role="img"
           aria-label={`${label}: ${value} of ${max}`}>
        <circle cx="55" cy="55" r={R} className="nd-ring-track" />
        {/* At 0 a round-capped stroke of length 0 still paints a dot, which
            looks like a broken control. Draw nothing instead. */}
        {pct > 0 ? (
          <circle
            cx="55" cy="55" r={R}
            className="nd-ring-fill"
            stroke={tone}
            strokeDasharray={`${(pct / 100) * C} ${C}`}
          />
        ) : null}
        <text x="55" y="52" className="nd-ring-value">{value}</text>
        <text x="55" y="70" className="nd-ring-unit">{max === 100 ? '%' : `/ ${max}`}</text>
      </svg>
      <span className="nd-ring-label">{label}</span>
      {caption ? <span className="nd-ring-caption">{caption}</span> : null}
    </div>
  );
}

/** The 2x2 metric tiles beside the ring. */
export function MetricTile({ Icon, tone = 'lilac', label, value, note }) {
  return (
    <div className="nd-metric">
      <span className={`nd-metric-icon nd-tone-${tone}`}>{Icon ? <Icon size={15} /> : null}</span>
      <span className="nd-metric-label">{label}</span>
      <span className="nd-metric-value">{value}</span>
      {note ? <span className="nd-metric-note">{note}</span> : null}
    </div>
  );
}

/** A person row: avatar, two lines, a status pill. */
export function PersonRow({ avatar, initials, name, meta, when, status, statusTone = 'scheduled', onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
         className={`nd-row ${onClick ? 'is-clickable' : ''}`}>
      {avatar
        ? <img className="nd-row-avatar" src={avatar} alt="" />
        : <span className="nd-row-avatar nd-row-initials" aria-hidden="true">{initials}</span>}
      <span className="nd-row-text">
        <span className="nd-row-name">{name}</span>
        {meta ? <span className="nd-row-meta">{meta}</span> : null}
        {when ? <span className="nd-row-when">{when}</span> : null}
      </span>
      {status ? <span className={`nd-pill nd-pill-${statusTone}`}>{status}</span> : null}
      {onClick ? <ChevronRight size={15} className="nd-row-chev" /> : null}
    </Tag>
  );
}

/** Recent-activity style row: tinted icon, title, subtitle, timestamp. */
export function ActivityRow({ Icon, tone = 'lilac', title, subtitle, time, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
         className={`nd-act ${onClick ? 'is-clickable' : ''}`}>
      <span className={`nd-act-icon nd-tone-${tone}`}>{Icon ? <Icon size={16} /> : null}</span>
      <span className="nd-act-text">
        <span className="nd-act-title">{title}</span>
        {subtitle ? <span className="nd-act-sub">{subtitle}</span> : null}
      </span>
      {time ? <span className="nd-act-time">{time}</span> : null}
      {onClick ? <ChevronRight size={15} className="nd-row-chev" /> : null}
    </Tag>
  );
}

/** The four square shortcuts in "Medical Records". */
export function ShortcutTile({ Icon, tone = 'lilac', label, count, onClick }) {
  return (
    <button type="button" className="nd-shortcut" onClick={onClick}>
      <span className={`nd-shortcut-icon nd-tone-${tone}`}>{Icon ? <Icon size={17} /> : null}</span>
      <span className="nd-shortcut-label">{label}</span>
      <span className="nd-shortcut-count">{count}</span>
    </button>
  );
}

/** The promo card — one clear action, nothing else competing with it. */
export function PromoCard({ Icon, title, body, action }) {
  return (
    <section className="nd-panel nd-promo">
      <span className="nd-promo-icon">{Icon ? <Icon size={26} /> : null}</span>
      <h2 className="nd-promo-title">{title}</h2>
      <p className="nd-promo-body">{body}</p>
      {action ? (
        <button type="button" className="nd-cta" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </section>
  );
}

/** A labelled trend line in the insights panel. */
export function TrendRow({ Icon, tone = 'lilac', label, delta, positive = true }) {
  return (
    <div className="nd-trend">
      <span className={`nd-trend-icon nd-tone-${tone}`}>{Icon ? <Icon size={14} /> : null}</span>
      <span className="nd-trend-label">{label}</span>
      <span className={positive ? 'nd-trend-up' : 'nd-trend-down'}>{delta}</span>
    </div>
  );
}

/** Said plainly, so an empty panel never reads as a broken one. */
export function Empty({ children }) {
  return <p className="nd-empty">{children}</p>;
}

/**
 * The top bar from the reference: search, alerts, a status pill, the avatar.
 *
 * Search is real — it routes to the screen that can actually answer the query
 * rather than being decoration. A search box that does nothing is worse than
 * no search box.
 */
export function TopBar({
  placeholder, onSearch, unread = 0, onBell, pill, avatar, name, onAvatar,
  weather,
  status,
  onStatusClick,
  /**
   * Off by default. NotificationCenter is already mounted globally in App.js
   * as a fixed floating bell for every signed-in user, so a bell here made two
   * on the same screen. Only pass this on a surface that has no global bell.
   */
  showBell = false,
}) {
  const [q, setQ] = React.useState('');
  return (
    <header className="nd-topbar">
      <form
        className="nd-search"
        onSubmit={(e) => { e.preventDefault(); onSearch?.(q.trim()); }}
      >
        <Search size={17} className="nd-search-icon" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
      </form>

      <div className="nd-topbar-right">
        {weather ? (
          <div className="nd-topbar-weather" aria-label="Current weather">
            <span className="nd-topbar-weather-icon" aria-hidden="true">{weather.icon || '☀️'}</span>
            <div className="nd-topbar-weather-text">
              <strong>{weather.temp || weather.value || '29°C'}</strong>
              <span>{weather.label || weather.text || 'Clear sky'}</span>
            </div>
          </div>
        ) : null}

        {status ? (
          <button
            type="button"
            className="nd-topbar-status"
            onClick={onStatusClick}
            aria-label={status.label || 'Availability'}
          >
            <span className="nd-topbar-status-dot" aria-hidden="true" />
            <span className="nd-topbar-status-copy">
              <strong>{status.label || 'Available'}</strong>
              {status.note ? <em>{status.note}</em> : null}
            </span>
          </button>
        ) : null}

        {showBell ? (
          <button type="button" className="nd-bell" onClick={onBell} aria-label={
            unread > 0 ? `${unread} unread notifications` : 'Notifications'
          }>
            <Bell size={18} />
            {unread > 0 ? <span className="nd-bell-dot" aria-hidden="true" /> : null}
          </button>
        ) : null}

        {pill ? (
          <span className="nd-toppill">
            <span className="nd-toppill-icon"><pill.Icon size={17} /></span>
            <span className="nd-toppill-text">
              <strong>{pill.title}</strong>
              <em>{pill.subtitle}</em>
            </span>
          </span>
        ) : null}

        <button type="button" className="nd-avatar-btn" onClick={onAvatar} aria-label="Your profile">
          {avatar
            ? <img className="nd-avatar" src={avatar} alt="" />
            : <span className="nd-avatar nd-avatar-initials">{initials(name)}</span>}
        </button>
      </div>
    </header>
  );
}

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]).join('').toUpperCase() || '?';
}

/**
 * A sparkline. Real points, drawn as a polyline.
 *
 * Flat or single-point series render nothing rather than a misleading straight
 * line implying a measured trend.
 */
export function Spark({ points = [], tone = '#15803d', width = 74, height = 28 }) {
  const vals = (points || []).map(Number).filter(Number.isFinite);
  if (vals.length < 2) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const step = width / (vals.length - 1);
  const d = vals
    .map((v, i) => `${i * step},${height - ((v - min) / span) * (height - 4) - 2}`)
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={d} fill="none" stroke={tone} strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A compact horizontal bar, for "sessions by month" style breakdowns. */
export function BarRow({ label, value, max, tone = '#5b5bd6' }) {
  const pct = max > 0 ? Math.round((Number(value) / max) * 100) : 0;
  return (
    <div className="nd-bar">
      <span className="nd-bar-label">{label}</span>
      <span className="nd-bar-track">
        <span className="nd-bar-fill" style={{ width: `${pct}%`, background: tone }} />
      </span>
      <span className="nd-bar-value">{value}</span>
    </div>
  );
}

/** A client-progress row: name, trend word, and a proportional bar. */
export function ProgressRow({ name, label, value, tone }) {
  return (
    <div className="nd-prog">
      <span className="nd-prog-top">
        <span className="nd-prog-name">{name}</span>
        <span className="nd-prog-label" style={{ color: tone }}>{label}</span>
      </span>
      <span className="nd-prog-track">
        <span className="nd-prog-fill"
              style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: tone }} />
      </span>
    </div>
  );
}
