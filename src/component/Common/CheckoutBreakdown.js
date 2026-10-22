import React, { useEffect, useState } from 'react';
import { api } from '../../services/apiClient';

/**
 * What the patient will actually be charged, before they pay: the provider's
 * price, plus NessaHub's service fee and tax when either is switched on in
 * System Config. Shows nothing extra when the price is the total.
 */
export default function CheckoutBreakdown({ amount, purpose }) {
  const [q, setQ] = useState(null);
  useEffect(() => {
    if (!(Number(amount) > 0)) { setQ(null); return undefined; }
    let live = true;
    api(`/api/v1/payments/quote?amount=${encodeURIComponent(amount)}&purpose=${encodeURIComponent(purpose || '')}`, { authenticated: false })
      .then((r) => { if (live) setQ(r); }).catch(() => { if (live) setQ(null); });
    return () => { live = false; };
  }, [amount, purpose]);

  if (!q || (Number(q.serviceFee) === 0 && Number(q.tax) === 0)) return null;
  const row = { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.85rem', color: '#475569' };
  return (
    <div style={{ marginTop: 8, padding: '8px 10px', background: '#f8fafc', borderRadius: 8, textAlign: 'left' }} aria-label="Price breakdown">
      <div style={row}><span>Price</span><span>GHS {Number(q.price).toFixed(2)}</span></div>
      {Number(q.serviceFee) > 0 ? <div style={row}><span>NessaHub service fee ({Number(q.serviceFeePercent)}%)</span><span>GHS {Number(q.serviceFee).toFixed(2)}</span></div> : null}
      {Number(q.tax) > 0 ? <div style={row}><span>Tax ({Number(q.taxPercent)}%)</span><span>GHS {Number(q.tax).toFixed(2)}</span></div> : null}
      <div style={{ ...row, fontWeight: 700, color: '#0f172a', borderTop: '1px solid #e2e8f0', marginTop: 4, paddingTop: 4 }}>
        <span>You pay</span><span>GHS {Number(q.total).toFixed(2)}</span>
      </div>
    </div>
  );
}
