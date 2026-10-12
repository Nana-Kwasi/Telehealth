import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, getStoredToken } from '../../services/apiClient';
import { NESSA_HUB_POLICY_LINKS } from '../../utils/nessaHubPolicies';

/**
 * First-visit acceptance of the NessaHub policies, on the web.
 *
 * The phone app has always asked on its first screen; the website never did,
 * so nobody who signed up on the web had a recorded acceptance. Accepting
 * records it against this browser (append-only ledger, /api/v1/consents/device)
 * and, once the person signs in, the record is attached to their account.
 */
export const POLICY_VERSION = '2025-05';
const ACCEPTED_KEY = 'nessaHubPrivacyAccepted';
const DEVICE_KEY = 'nessaHubDeviceId';

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

export function webDeviceId() {
  let id = read(DEVICE_KEY);
  if (!id) {
    id = `web_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    write(DEVICE_KEY, id);
  }
  return id;
}

/** Attach this browser's first-visit acceptance to the signed-in account. */
export function linkPolicyConsentToAccount() {
  const id = read(DEVICE_KEY);
  if (!id || !getStoredToken()) return Promise.resolve();
  return api(`/api/v1/consents/device/${encodeURIComponent(id)}/link`, { method: 'POST' }).catch(() => {});
}

export default function PolicyConsentGate() {
  const location = useLocation();
  const [needed, setNeeded] = useState(() => read(ACCEPTED_KEY) !== 'true');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // The call page runs inside the phone app, which asked on its own first screen.
  const exempt = location.pathname.startsWith('/video-call') || location.pathname.startsWith('/reset-password');

  useEffect(() => {
    if (!needed) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [needed]);

  if (!needed || exempt) return null;

  const accept = async () => {
    setSaving(true);
    setError('');
    try {
      await api('/api/v1/consents/device', {
        method: 'POST',
        authenticated: false,
        body: {
          deviceId: webDeviceId(),
          context: 'app_first_launch',
          platform: 'web',
          items: [{ key: 'nessahub_policies', title: 'NessaHub policies (Terms, Privacy, and all published policies)', version: POLICY_VERSION }],
        },
      });
      write(ACCEPTED_KEY, 'true');
      linkPolicyConsentToAccount();
      setNeeded(false);
    } catch (e) {
      setError('Your acceptance could not be saved. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={S.backdrop} role="dialog" aria-modal="true" aria-labelledby="policy-gate-title">
      <div style={S.card}>
        <h2 id="policy-gate-title" style={S.title}>Privacy &amp; policies</h2>
        <p style={S.body}>
          To use NessaHub, please review and accept our privacy practices and platform policies.
          They cover how we protect your health information, how virtual care works, payments,
          and what to do in an emergency.
        </p>
        <p style={S.links}>
          <a href={NESSA_HUB_POLICY_LINKS.policiesHome} target="_blank" rel="noreferrer">Read the NessaHub policies</a>
          {' · '}
          <a href={NESSA_HUB_POLICY_LINKS.terms} target="_blank" rel="noreferrer">Terms of Service</a>
          {' · '}
          <a href={NESSA_HUB_POLICY_LINKS.privacy} target="_blank" rel="noreferrer">Privacy Policy</a>
        </p>
        {error ? <p style={S.error}>{error}</p> : null}
        <button type="button" style={S.btn} onClick={accept} disabled={saving}>
          {saving ? 'Saving…' : 'I accept'}
        </button>
        <p style={S.foot}>Your acceptance is recorded with the date and policy version ({POLICY_VERSION}).</p>
      </div>
    </div>
  );
}

const S = {
  backdrop: { position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { background: '#fff', borderRadius: 18, maxWidth: 480, width: '100%', padding: '1.6rem 1.5rem', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', boxSizing: 'border-box' },
  title: { margin: '0 0 0.6rem', fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' },
  body: { margin: '0 0 0.8rem', color: '#334155', lineHeight: 1.55, fontSize: '0.95rem' },
  links: { margin: '0 0 1rem', fontSize: '0.92rem', fontWeight: 600 },
  error: { color: '#b91c1c', fontSize: '0.9rem', margin: '0 0 0.75rem' },
  btn: { width: '100%', padding: '0.85rem', border: 'none', borderRadius: 12, background: '#2b5ce6', color: '#fff', fontWeight: 800, fontSize: '1rem', cursor: 'pointer' },
  foot: { margin: '0.8rem 0 0', fontSize: '0.8rem', color: '#64748b', textAlign: 'center' },
};
