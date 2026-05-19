/**
 * Where authenticated users should return from the public marketing shell.
 * Dashboard routes (/dashboard, /home-care shell) hide the global Navbar entirely.
 */

const ONBOARDING_PREFIXES = [
  '/couple/initiation',
  '/couple/join',
  '/couple/welcome',
  '/couple/intake',
  '/couple/waiting',
  '/teen/',
  '/questionnaire',
  '/payment',
  '/match-therapist',
];

const STAFF_HUB = {
  admin: { label: 'Admin dashboard', path: '/dashboard' },
  pharmacy: { label: 'Pharmacy dashboard', path: '/dashboard' },
  branch_user: { label: 'Branch dashboard', path: '/dashboard' },
  lab: { label: 'Lab dashboard', path: '/dashboard' },
  scan: { label: 'Scan dashboard', path: '/dashboard' },
  lab_branch: { label: 'Lab branch dashboard', path: '/dashboard' },
  scan_branch: { label: 'Scan branch dashboard', path: '/dashboard' },
  therapist: { label: 'Therapist dashboard', path: '/dashboard' },
  doctor: { label: 'Doctor dashboard', path: '/dashboard' },
  homecare_nurse: { label: 'Nurse dashboard', path: '/dashboard' },
};

export function isOnboardingPath(pathname = '') {
  const path = pathname || '';
  return ONBOARDING_PREFIXES.some((p) => path === p || path.startsWith(p));
}

/** Navbar not rendered at all — each product has its own shell. */
export function isNavbarHiddenPath(pathname = '') {
  const path = pathname || '';
  if (path === '/dashboard' || path.startsWith('/dashboard/')) return true;
  if (path.startsWith('/home-care') && path !== '/home-care/sign-up') return true;
  return false;
}

function isOnHubPath(pathname, hubPath) {
  if (!hubPath) return false;
  return pathname === hubPath || pathname.startsWith(`${hubPath}/`);
}

/**
 * @returns {{ label: string, path: string } | null}
 */
export function resolveDashboardHub({ role, profile, pathname = '' }) {
  const path = pathname || '';

  if (!role || role === 'guest') return null;

  if (STAFF_HUB[role]) {
    return STAFF_HUB[role];
  }

  if (role === 'client') {
    const inCoupleFlow =
      path.startsWith('/couple') ||
      profile?.therapyType === 'couples' ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('th.coupleId'));

    if (inCoupleFlow) {
      if (isOnboardingPath(path)) return null;

      const intakeDone =
        profile?.coupleIntakeComplete === true ||
        (typeof localStorage !== 'undefined' &&
          localStorage.getItem('th.coupleMyIntakeComplete') === 'true');

      if (!intakeDone) {
        return { label: 'Continue intake', path: '/couple/intake' };
      }

      return { label: 'Couple setup', path: '/couple/dashboard' };
    }

    const intent = String(profile?.userIntent || '').toLowerCase();
    const stored = String(
      typeof localStorage !== 'undefined' ? localStorage.getItem('userIntent') : '',
    ).toLowerCase();

    if (path.startsWith('/home-care') || intent === 'homecare' || stored === 'homecare') {
      return { label: 'My Home Care', path: '/home-care' };
    }

    if (intent === 'medical' || stored === 'medical' || path.startsWith('/medical') || path.startsWith('/doctors')) {
      return { label: 'Medical dashboard', path: '/dashboard' };
    }

    return { label: 'Therapy dashboard', path: '/dashboard' };
  }

  return { label: 'Dashboard', path: '/dashboard' };
}

/** Hub CTA only when logged in, not mid-onboarding, and not already on that destination. */
export function resolveNavbarHubAction({ role, profile, pathname }) {
  if (isOnboardingPath(pathname)) return null;
  const hub = resolveDashboardHub({ role, profile, pathname });
  if (!hub) return null;
  if (isOnHubPath(pathname, hub.path)) return null;
  return hub;
}

export function shouldShowMarketingNavLinks(pathname, isAuthenticated) {
  if (!isAuthenticated) return true;
  return !isOnboardingPath(pathname);
}
