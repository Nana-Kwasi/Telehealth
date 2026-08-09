// ─── Admin Service (REST) ──────────────────────────────────────────────────
import { api } from './apiClient';

// ── Platform stats ────────────────────────────────────────────────────────────

export async function getPlatformStats() {
  return api('/api/v1/admin/overview/all-platform-stats');
}

// ── User management ───────────────────────────────────────────────────────────

export async function listAdminUsers({ type = 'all', search, status, limit = 200 } = {}) {
  const p = new URLSearchParams({ type, limit });
  if (search) p.set('search', search);
  if (status) p.set('status', status);
  return api(`/api/v1/admin/users?${p}`) || [];
}

export async function getAdminUser(userId) {
  return api(`/api/v1/admin/users/${userId}`);
}

export async function patchAdminUser(userId, data) {
  return api(`/api/v1/admin/users/${userId}`, { method: 'PATCH', body: data });
}

export async function userAction(userId, action, reason) {
  return api(`/api/v1/admin/users/${userId}/actions`, {
    method: 'POST',
    body: { action, reason },
  });
}

export async function deleteAdminUser(userId) {
  return api(`/api/v1/admin/users/${userId}`, { method: 'DELETE' });
}

// ── Approvals ─────────────────────────────────────────────────────────────────

export async function getApprovalsQueue({ entityType = 'all', listType = 'pending' } = {}) {
  return api(`/api/v1/admin/approvals/queue?entityType=${entityType}&listType=${listType}`) || [];
}

export async function approvalDecision(entityType, entityId, decision, reason) {
  return api(`/api/v1/admin/approvals/${entityType}/${entityId}/decision`, {
    method: 'POST',
    body: { decision, reason },
  });
}

// ── System config ─────────────────────────────────────────────────────────────

export async function getSystemConfig() {
  return api('/api/v1/admin/system-config/settings');
}

export async function patchSystemConfigSection(section, payload) {
  return api(`/api/v1/admin/system-config/settings/${section}`, {
    method: 'PATCH',
    body: payload,
  });
}

export async function getFeatureFlags() {
  return api('/api/v1/admin/system-config/feature-flags') || [];
}

export async function patchFeatureFlags(countryCode, overrides) {
  return api(`/api/v1/admin/system-config/feature-flags/${countryCode}`, {
    method: 'PATCH',
    body: overrides,
  });
}

// ── Onboarding ────────────────────────────────────────────────────────────────

export async function registerUser(email, password, fullName, role) {
  return api('/api/v1/auth/register', {
    method:        'POST',
    authenticated: false,
    body:          { email, password, fullName, role },
  });
}

export async function onboardDoctor(data) {
  return api('/api/v1/admin/onboarding/doctor', { method: 'POST', body: data });
}

export async function onboardTherapist(data) {
  return api('/api/v1/admin/onboarding/therapist', { method: 'POST', body: data });
}

// ── Notifications ─────────────────────────────────────────────────────────────

export async function sendAdminNotification(data) {
  return api('/api/v1/admin/notifications', { method: 'POST', body: data });
}

export async function listAdminNotifications(limit = 50) {
  return api(`/api/v1/admin/notifications?limit=${limit}`) || [];
}
