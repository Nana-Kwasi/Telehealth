// Region-based feature flags
// Add new countries and toggle features per-region here.

const REGION_FLAGS = {
  GH: {
    country: 'Ghana',
    pharmacyOnboarding: true,
    prescriptionRouting: true,
    pharmacyFulfillment: true,
  },
  US: {
    country: 'United States',
    pharmacyOnboarding: false,
    prescriptionRouting: false, // limited / future integration
    pharmacyFulfillment: false,
  },
  DEFAULT: {
    country: 'Unknown',
    pharmacyOnboarding: false,
    prescriptionRouting: false,
    pharmacyFulfillment: false,
  },
};

/**
 * Get feature flags for a country code.
 * @param {string} countryCode - ISO 3166-1 alpha-2 code (e.g. 'GH', 'US')
 */
export function getFlags(countryCode) {
  return REGION_FLAGS[countryCode?.toUpperCase()] || REGION_FLAGS.DEFAULT;
}

/**
 * Check a single feature flag.
 * @param {string} countryCode
 * @param {string} feature - key in REGION_FLAGS
 */
export function isEnabled(countryCode, feature) {
  const flags = getFlags(countryCode);
  return flags[feature] === true;
}

export const SUPPORTED_COUNTRIES = Object.entries(REGION_FLAGS)
  .filter(([k]) => k !== 'DEFAULT')
  .map(([code, v]) => ({ code, label: v.country }));

export default REGION_FLAGS;
