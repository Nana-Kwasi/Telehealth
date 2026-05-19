import React from 'react';
import { formatDashboardLocationLine } from './LocationSummaryCard';

export default function SidebarSavedLocation({ profile, tone = 'dark' }) {
  const line = formatDashboardLocationLine(profile);
  if (!line) return null;
  const color = tone === 'dark' ? 'rgba(255,255,255,0.72)' : 'rgba(15,23,42,0.58)';
  return (
    <p
      title={line}
      style={{
        margin: '0.35rem 0 0',
        fontSize: '0.72rem',
        color,
        lineHeight: 1.35,
        maxWidth: 230,
        wordBreak: 'break-word',
      }}
    >
      <span aria-hidden>📍 </span>
      {line}
    </p>
  );
}
