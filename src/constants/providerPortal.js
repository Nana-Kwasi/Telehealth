/** The provider application site (separate Firebase site, onboard.nessahub.com). */
export const PROVIDER_PORTAL_URL = (process.env.REACT_APP_PROVIDER_PORTAL_URL || 'https://onboard.nessahub.com').replace(/\/+$/, '');
export const PROVIDER_PORTAL_LINKS = {
  home: PROVIDER_PORTAL_URL,
  apply: `${PROVIDER_PORTAL_URL}/#/signup`,
  track: `${PROVIDER_PORTAL_URL}/#/track`,
  paperForms: `${PROVIDER_PORTAL_URL}/#/forms`,
};
