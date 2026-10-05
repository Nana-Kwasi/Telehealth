import React from 'react';
import { formatMoney } from '../../services/pricing';

/**
 * A fee, with its discount shown the way every shop shows one: the old price
 * struck through, the new price beside it, and a badge saying how much came
 * off.
 *
 * `quote` is whatever /promotions/quote returned. When it is missing, or says
 * `discounted: false`, this renders the plain fee and NOTHING else — no
 * strike-through, no badge. A line through an identical number is worse than
 * no line at all.
 */
export default function PriceTag({
  quote,
  baseAmount,
  suffix = '',
  size = 'md',
  currency = 'GHS',
  showEnds = true,
}) {
  const base = Number(quote?.baseAmount ?? baseAmount);
  if (!Number.isFinite(base) || base <= 0) {
    return <span style={{ color: '#6f7787', fontSize: SIZES[size].final }}>Rate not set</span>;
  }

  const s = SIZES[size] || SIZES.md;

  if (!quote?.discounted) {
    return (
      <span style={{ fontSize: s.final, fontWeight: 700, color: '#0f1424' }}>
        {formatMoney(base, currency)}{suffix}
      </span>
    );
  }

  const badgeColour = quote.badgeColour || '#b3121f';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
      <span style={{
        fontSize: s.was,
        color: '#8a90a0',
        textDecoration: 'line-through',
        // The old price must not compete with the new one.
        textDecorationThickness: '1.5px',
        fontWeight: 500,
      }}>
        {formatMoney(base, currency)}
      </span>

      <span style={{ fontSize: s.final, fontWeight: 800, color: '#0f1424' }}>
        {formatMoney(quote.finalAmount, currency)}{suffix}
      </span>

      <span style={{
        padding: '0.14rem 0.42rem',
        borderRadius: 6,
        fontSize: s.badge,
        fontWeight: 800,
        letterSpacing: '0.02em',
        color: '#ffffff',
        background: badgeColour,
        whiteSpace: 'nowrap',
      }}>
        {quote.badgeLabel || `-${quote.percentOff}%`}
      </span>

      {showEnds && quote.endsAt ? (
        <span style={{ fontSize: s.ends, color: '#6f7787', width: '100%' }}>
          Offer ends {new Date(quote.endsAt).toLocaleDateString(undefined, {
            day: 'numeric', month: 'short',
          })}
        </span>
      ) : null}
    </span>
  );
}

const SIZES = {
  sm: { was: '0.72rem', final: '0.86rem', badge: '0.6rem',  ends: '0.66rem' },
  md: { was: '0.82rem', final: '1rem',    badge: '0.66rem', ends: '0.72rem' },
  lg: { was: '1rem',    final: '1.5rem',  badge: '0.74rem', ends: '0.78rem' },
};
