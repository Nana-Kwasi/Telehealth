import React from 'react';
import './EmptyState.css';

/*
 * Big, colourful icons for empty screens and section headers.
 *
 *  <EmptyState icon={Medicines} tone="emerald" title="No prescriptions yet">
 *    Prescriptions from your doctor will appear here.
 *  </EmptyState>
 *
 * `icon` is any icon component: Health Icons (@healthicons/react) for anything
 * medical, Lucide (lucide-react) for everyday actions. Health Icons take a
 * `variant`; Lucide ignores it.
 */

export const TONES = {
  indigo: ['#4f46e5', '#e0e7ff'], sky: ['#0284c7', '#e0f2fe'], teal: ['#0d9488', '#ccfbf1'], emerald: ['#059669', '#d1fae5'],
  rose: ['#e11d48', '#ffe4e6'], pink: ['#db2777', '#fce7f3'], violet: ['#7c3aed', '#ede9fe'], amber: ['#d97706', '#fef3c7'],
  orange: ['#ea580c', '#ffedd5'], blue: ['#2563eb', '#dbeafe'], slate: ['#475569', '#e2e8f0'],
};

const toneStyle = (tone) => {
  const [ink, bg] = TONES[tone] || TONES.indigo;
  return { '--es-ink': ink, '--es-bg': bg };
};

/** A coloured circle holding an icon. */
export function IconBubble({ icon: Icon, tone = 'indigo', size = 44, variant = 'filled', title }) {
  if (!Icon) return null;
  return (
    <span className="es-bubble" style={{ ...toneStyle(tone), width: size * 1.8, height: size * 1.8 }} aria-hidden={!title} title={title}>
      <Icon size={size} variant={variant} color="currentColor" />
    </span>
  );
}

export default function EmptyState({ icon, tone = 'indigo', title, children, action, compact = false, variant = 'filled' }) {
  return (
    <div className={`es-empty ${compact ? 'es-compact' : ''}`} role="status">
      <IconBubble icon={icon} tone={tone} size={compact ? 30 : 48} variant={variant} />
      {title && <h3 className="es-title">{title}</h3>}
      {children && <div className="es-text">{children}</div>}
      {action && <div className="es-action">{action}</div>}
    </div>
  );
}

/** A heading with a small coloured icon, for cards and sections. */
export function IconHeading({ icon, tone = 'indigo', children, as: Tag = 'h3', className = '' }) {
  return (
    <Tag className={`es-heading ${className}`}>
      <IconBubble icon={icon} tone={tone} size={18} />
      <span>{children}</span>
    </Tag>
  );
}

/**
 * A short "nothing here" line with a small coloured icon in front. Spans only,
 * so it is valid inside a <p>, <td>, <li> or <span>.
 */
export function EmptyLine({ icon, tone = 'indigo', children }) {
  return (
    <span className="es-line">
      <IconBubble icon={icon} tone={tone} size={20} />
      <span className="es-line-text">{children}</span>
    </span>
  );
}
