/**
 * Hosted policy site (Firebase Hosting — Nessa-Hub-Policies).
 * Override at build time: REACT_APP_NESSA_HUB_POLICIES_URL=https://your-host.web.app
 */
const DEFAULT_POLICIES_BASE = 'https://teleehealth.web.app';

export function getNessaHubPoliciesBase() {
  const raw = process.env.REACT_APP_NESSA_HUB_POLICIES_URL || DEFAULT_POLICIES_BASE;
  return String(raw).replace(/\/+$/, '');
}

/** Opens policy detail page (policy.html?slug=…) on the static policies site. */
export function nessaHubPolicyUrl(slug) {
  return `${getNessaHubPoliciesBase()}/policy.html?slug=${encodeURIComponent(slug)}`;
}

export const NESSA_HUB_POLICY_LINKS = {
  terms: nessaHubPolicyUrl('terms-of-service'),
  privacy: nessaHubPolicyUrl('patient-privacy-data-protection'),
  cookies: nessaHubPolicyUrl('cookie-policy'),
  policiesHome: getNessaHubPoliciesBase(),
  therapyOverview: nessaHubPolicyUrl('mental-health-therapy-policy'),
  individualInformedConsent: nessaHubPolicyUrl('individual-therapy-informed-consent'),
  therapyAssessments: nessaHubPolicyUrl('therapy-clinical-assessments-questionnaires'),
  therapyMatching: nessaHubPolicyUrl('therapy-therapist-matching-selection'),
  electronicSignature: nessaHubPolicyUrl('therapy-electronic-signature-consent'),
  coupleSensitiveScreening: nessaHubPolicyUrl('couple-therapy-sensitive-screening'),
};
