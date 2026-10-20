import React from 'react';
import { Link } from 'react-router-dom';
import { hasActiveSession } from '../../services/apiClient';

/**
 * Where the lab or scan QR code points (/dx/<token>). Deliberately shows no
 * order details: the token only means something to a signed-in lab or scan
 * centre, which checks the patient in from its dashboard. A patient who opens
 * their own QR is pointed back to their orders.
 */
export default function DxLinkPage() {
  const signedIn = hasActiveSession();
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: 440, background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 16, padding: '1.5rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem' }}>🔬</div>
        <h1 style={{ fontSize: '1.2rem', margin: '0.5rem 0' }}>NessaHub lab &amp; scan check-in</h1>
        <p style={{ color: '#475569', fontSize: '0.92rem', lineHeight: 1.5 }}>
          This code is for checking in for a lab test or scan. Show it at the centre — staff
          will scan it from their dashboard.
        </p>
        {signedIn
          ? <Link to="/dashboard/diagnostics" style={{ fontWeight: 700 }}>Go to my lab &amp; scan orders</Link>
          : <Link to="/login" style={{ fontWeight: 700 }}>Sign in to see your orders</Link>}
      </div>
    </div>
  );
}
