import { api } from './apiClient';

/** Patient transfers between doctors, and between therapists (backend: /api/v1/care-transfers). */

export const TRANSFER_STATUS = {
  AWAITING_PATIENT_CONSENT: { label: 'Waiting for patient consent', tone: 'wait' },
  AWAITING_RECIPIENT: { label: 'Waiting for the receiving clinician', tone: 'wait' },
  REJECTED_AWAITING_REASSIGN: { label: 'Declined — choose another clinician', tone: 'warn' },
  DECLINED_BY_PATIENT: { label: 'Patient declined', tone: 'muted' },
  COMPLETED: { label: 'Completed', tone: 'ok' },
  CANCELLED: { label: 'Cancelled', tone: 'muted' },
  DECLINED_OR_EXPIRED_FOR_YOU: { label: 'Declined or expired', tone: 'muted' },
};

export const listTransfers = (all = false) => api(`/api/v1/care-transfers${all ? '?all=true' : ''}`).then((r) => (Array.isArray(r) ? r : []));
export const getTransfer = (id) => api(`/api/v1/care-transfers/${id}`);
export const transferReasons = () => api('/api/v1/care-transfers/reasons');
export const requestTransfer = (form) => api('/api/v1/care-transfers', { method: 'POST', body: form });
export const transferSuggestions = ({ patientId, specialty, format, focus = [] }) => {
  const qs = new URLSearchParams({ patientId });
  if (specialty) qs.set('specialty', specialty);
  if (format) qs.set('format', format);
  focus.forEach((f) => qs.append('focus', f));
  return api(`/api/v1/care-transfers/suggestions?${qs}`).then((r) => (Array.isArray(r) ? r : []));
};
export const consentToTransfer = (id, agree, declineReason) =>
  api(`/api/v1/care-transfers/${id}/consent`, { method: 'POST', body: { agree, declineReason, platform: 'web' } });
export const decideTransfer = (id, accept, note) =>
  api(`/api/v1/care-transfers/${id}/decision`, { method: 'POST', body: { accept, note } });
export const redirectTransfer = (id, toClinicianId) =>
  api(`/api/v1/care-transfers/${id}/redirect`, { method: 'POST', body: { toClinicianId } });
export const cancelTransfer = (id, reason) =>
  api(`/api/v1/care-transfers/${id}/cancel`, { method: 'POST', body: { reason } });
export const incomingTransferPatients = () =>
  api('/api/v1/care-transfers/incoming-patients').then((r) => (Array.isArray(r) ? r : [])).catch(() => []);
export const draftTransferSummary = (body) =>
  api('/api/v1/care-transfers/draft-summary', { method: 'POST', body });

export const careCatalog = () => api('/api/v1/care-catalog', { authenticated: false });

/** "in 5 h 20 min" / "overdue" for a deadline. */
export function timeLeft(deadline) {
  if (!deadline) return '';
  const ms = new Date(deadline).getTime() - Date.now();
  if (!Number.isFinite(ms)) return '';
  if (ms <= 0) return 'overdue — reassigning';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h} h ${m} min left` : `${m} min left`;
}

export const fmtWhen = (v) => (v ? new Date(v).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
