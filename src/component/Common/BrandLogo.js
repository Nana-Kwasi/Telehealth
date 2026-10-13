import React from 'react';
import logoOnLight from '../../assets/brand/nessahub-logo.png';
import logoOnDark from '../../assets/brand/nessahub-logo-white.png';
import './BrandLogo.css';

/**
 * The NessaHub logo for dashboard sidebars, with the area the person is in
 * ("Admin", "Pharmacy"…) underneath. tone="dark" for dark sidebars (white
 * "Nessa"), tone="light" for white ones (the logo as designed).
 */
export default function BrandLogo({ badge, tone = 'dark', className = '' }) {
  return (
    <div className={`nh-brand nh-brand--${tone} ${className}`.trim()}>
      <img className="nh-brand-logo" src={tone === 'light' ? logoOnLight : logoOnDark} alt="NessaHub" draggable="false" />
      {badge ? <span className="nh-brand-badge">{badge}</span> : null}
    </div>
  );
}
