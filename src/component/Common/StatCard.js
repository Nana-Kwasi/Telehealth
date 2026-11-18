import React from 'react';
import './StatCard.css';

/*
 * The stat card used by Analytics and Earnings, so the two screens look the
 * same: a coloured icon tile, a big value, a label and an optional line under it.
 *
 *   <StatGrid><StatCard icon={DollarSign} tone="green" value="GHS 1,200.00" label="Total Earnings" /></StatGrid>
 */
const TONES = {
  green: ['#dcfce7', '#16a34a'], blue: ['#e8f1fb', '#1e6bb8'], violet: ['#f3e8ff', '#7c3aed'],
  amber: ['#fef3c7', '#d97706'], rose: ['#ffe4e6', '#e11d48'], teal: ['#ccfbf1', '#0d9488'], slate: ['#f1f5f9', '#475569'],
};

export function StatGrid({ children }) {
  return <div className="sc-grid">{children}</div>;
}

export default function StatCard({ icon: Icon, tone = 'blue', value, label, sub }) {
  const [bg, fg] = TONES[tone] || TONES.blue;
  return (
    <div className="sc-card">
      {Icon ? <div className="sc-icon" style={{ background: bg, color: fg }} aria-hidden><Icon size={24} /></div> : null}
      <div className="sc-text">
        <p className="sc-value">{value}</p>
        <p className="sc-label">{label}</p>
        {sub ? <p className="sc-sub">{sub}</p> : null}
      </div>
    </div>
  );
}
