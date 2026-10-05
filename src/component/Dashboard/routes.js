// Route config placeholders for RBAC
export const clientRoutes = [
  { path: 'home', label: 'Home' },
  { path: 'messages', label: 'Therapist' },
  { path: 'video', label: 'Schedule' },
  { path: 'schedule', label: 'Calendar' },
  { path: 'resources', label: 'Resources' },
  { path: 'billing', label: 'Billing' },
  { path: 'settings', label: 'Settings' },
  { path: 'support', label: 'Support' },
];

/**
 * Second Opinion clients see a deliberately narrow dashboard.
 *
 * They are not in a programme: there is one case, one consultation and one
 * opinion at the end of it. Showing Resources (programme material) and Calendar
 * (a recurring schedule) would advertise a service they have not bought and
 * make a simple errand look like a commitment. Everything here maps to
 * something they actually have.
 *
 * The full nav returns the moment they convert to membership.
 */
export const secondOpinionRoutes = [
  { path: 'home', label: 'My case' },
  { path: 'messages', label: 'Specialist' },
  { path: 'video', label: 'Consultation' },
  { path: 'billing', label: 'Billing' },
  { path: 'settings', label: 'Settings' },
  { path: 'support', label: 'Support' },
];





export const therapistRoutes = [
  { path: 'home', label: 'Home' },
  { path: 'clients', label: 'Clients' },
  { path: 'messages', label: 'Messaging' },
  { path: 'video', label: 'Live Sessions' },
  { path: 'calendar', label: 'Calendar' },
  { path: 'notes', label: 'Notes & Progress' },
  { path: 'resources', label: 'Resources & Training' },
  { path: 'settings', label: 'Settings' },
  { path: 'admin', label: 'Therapist Onboarding (Admin)' },
];


