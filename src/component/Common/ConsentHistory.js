import React, { useEffect, useState } from 'react';
import { api } from '../../services/apiClient';
import { NESSA_HUB_POLICY_LINKS, nessaHubPolicyUrl } from '../../utils/nessaHubPolicies';
import Paged from './Paged';

/**
 * What this person has agreed to, read-only, grouped by where they agreed.
 *
 * Replaces tickable "Consent & Agreements" checkboxes that showed defaults,
 * could be unticked, and saved somewhere never read back. The record comes
 * from the append-only ledger (/api/v1/consents/me). Consents cannot be undone
 * here: closing the account is the only way out, and the data is then kept for
 * the legal retention period before it is purged.
 */
const CONTEXT_LABELS = {
  app_first_launch: 'When you first opened NessaHub',
  registration: 'When you created your account',
  therapy_registration: 'Therapy sign-up',
  medical_registration: 'Medical sign-up',
  teen_registration: 'Teen therapy — parent or guardian consent',
  couple_registration: 'Couples therapy sign-up',
  psychiatry_registration: 'Psychiatry sign-up',
  second_opinion: 'Second opinion',
  in_call: 'During a session',
};

/** Where to read the document behind a consent, when there is one. */
function policyLink(key) {
  if (key === 'nessahub_policies') return NESSA_HUB_POLICY_LINKS.policiesHome;
  if (key.startsWith('teen_')) return nessaHubPolicyUrl('children-minors-parental-consent-policy');
  if (key.includes('privacy')) return NESSA_HUB_POLICY_LINKS.privacy;
  if (key.includes('terms')) return NESSA_HUB_POLICY_LINKS.terms;
  return null;
}

const when = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function ConsentHistory() {
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api('/api/v1/consents/me')
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => { setRows([]); setFailed(true); });
  }, []);

  const groups = new Map();
  (rows || []).forEach((r) => {
    if (!groups.has(r.context)) groups.set(r.context, []);
    groups.get(r.context).push(r);
  });

  return (
    <div style={S.wrap}>
      <div style={S.note}>
        These are the agreements you accepted, with the date and policy version. They are part of your
        record and cannot be withdrawn here. To stop using NessaHub you can close your account; your data
        is then kept only for the period the law requires before it is permanently deleted.
      </div>
      {rows === null ? <p style={S.muted}>Loading…</p> : null}
      {failed ? <p style={S.muted}>Your consent record could not be loaded right now.</p> : null}
      {rows && !failed && rows.length === 0 ? (
        <p style={S.muted}>No agreements are recorded for this account yet.</p>
      ) : null}
      {[...groups.entries()].map(([ctx, list]) => (
        <div key={ctx} style={S.card}>
          <h3 style={S.h3}>{CONTEXT_LABELS[ctx] || ctx}</h3>
          <Paged items={list}>{(list) => list.map((r) => {
            const link = policyLink(r.consent_key);
            return (
              <div key={`${r.consent_key}-${r.policy_version}`} style={S.row}>
                <span style={S.tick} aria-hidden>✓</span>
                <div style={{ flex: 1 }}>
                  <p style={S.title}>{r.policy_title}</p>
                  <p style={S.meta}>
                    Accepted {when(r.accepted_at)} · version {r.policy_version}
                    {r.platform ? ` · ${r.platform === 'web' ? 'website' : r.platform === 'ios' ? 'iPhone app' : 'Android app'}` : ''}
                  </p>
                </div>
                {link ? <a href={link} target="_blank" rel="noreferrer" style={S.read}>Read</a> : null}
              </div>
            );
          })}</Paged>
        </div>
      ))}
    </div>
  );
}

const S = {
  wrap: { maxWidth: 720, display: 'flex', flexDirection: 'column', gap: '1rem' },
  note: { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '0.875rem', fontSize: '0.85rem', color: '#1e3a8a', lineHeight: 1.5 },
  card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '1rem 1.1rem' },
  h3: { margin: '0 0 0.5rem', fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' },
  row: { display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.6rem 0', borderTop: '1px solid #f1f5f9' },
  tick: { width: 22, height: 22, borderRadius: 6, background: '#16a34a', color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title: { margin: 0, fontSize: '0.9rem', fontWeight: 650, color: '#0f172a' },
  meta: { margin: '0.15rem 0 0', fontSize: '0.78rem', color: '#64748b' },
  read: { fontSize: '0.85rem', fontWeight: 700, color: 'var(--nh-accent, #2b5ce6)', textDecoration: 'none', flexShrink: 0 },
  muted: { color: '#64748b', fontSize: '0.9rem' },
};
