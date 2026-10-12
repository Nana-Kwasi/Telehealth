import { api, getStoredToken } from '../services/apiClient';
import { TEEN_CONSENT_ITEMS } from './teenTherapyConfig';

/**
 * Consents given BEFORE the account existed, recorded once the person is
 * signed in.
 *
 * The teen flow collects the parent's or guardian's consents and signature in
 * the browser and creates the account only after payment, so nothing reached
 * the server: the consent lived in localStorage and nowhere else. On the first
 * signed-in load it now goes into the append-only ledger (context
 * teen_registration), once.
 */
const TEEN_KEY = 'th.parentConsent';

export async function recordPendingConsents() {
  if (!getStoredToken()) return;
  let consent = null;
  try { consent = JSON.parse(localStorage.getItem(TEEN_KEY) || 'null'); } catch { consent = null; }
  if (!consent || !consent.signedAt || consent.recordedAt) return;

  const signer = consent.signature ? ` — signed by ${consent.signature}` : '';
  const items = TEEN_CONSENT_ITEMS
    .filter((c) => consent[c.key] === true)
    .map((c) => ({ key: `teen_${c.key.replace(/Consent$/, '').replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)}`, title: `${c.title}${signer}`, version: '2025-05' }));
  if (!items.length) return;
  try {
    await api('/api/v1/consents', { method: 'POST', body: { context: 'teen_registration', platform: 'web', items } });
    localStorage.setItem(TEEN_KEY, JSON.stringify({ ...consent, recordedAt: new Date().toISOString() }));
  } catch { /* retried on the next signed-in load */ }
}
