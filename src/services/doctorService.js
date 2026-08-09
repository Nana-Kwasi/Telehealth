// ─── Doctor Service (REST) ─────────────────────────────────────────────────
import { api } from './apiClient';

export async function getDoctorProfile(doctorId) {
  return api(`/api/v1/doctors/${doctorId}`);
}

export async function updateDoctorProfile(doctorId, data) {
  return api(`/api/v1/doctors/${doctorId}`, { method: 'PATCH', body: data });
}

export async function listDoctors(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return api(`/api/v1/doctors${qs ? `?${qs}` : ''}`) || [];
}

export async function getDoctorAnalytics(doctorId) {
  return api(`/api/v1/doctors/${doctorId}/analytics`);
}

// ── Appointments ─────────────────────────────────────────────────────────────

export async function getDoctorAppointments(doctorId) {
  return api(`/api/v1/medical/appointments/doctor/${doctorId}`) || [];
}

export async function getPatientAppointments(patientId) {
  return api(`/api/v1/medical/appointments/patient/${patientId}`) || [];
}

export async function createAppointment(data) {
  return api('/api/v1/medical/appointments', { method: 'POST', body: data });
}

export async function updateAppointment(appointmentId, data) {
  return api(`/api/v1/medical/appointments/${appointmentId}`, { method: 'PATCH', body: data });
}

export async function rescheduleAppointment(appointmentId, scheduledAt) {
  return api(`/api/v1/care/appointments/${appointmentId}/reschedule`, {
    method: 'PATCH',
    body: { scheduledAt },
  });
}

export async function cancelAppointment(appointmentId) {
  return api(`/api/v1/care/appointments/${appointmentId}/cancel`, { method: 'PATCH' });
}

// ── Prescriptions ─────────────────────────────────────────────────────────────

export async function getDoctorPrescriptions(doctorId) {
  return api(`/api/v1/medical/prescriptions/doctor/${doctorId}`) || [];
}

export async function getPatientPrescriptions(patientId) {
  return api(`/api/v1/medical/prescriptions/patient/${patientId}`) || [];
}

export async function createPrescription(data) {
  return api('/api/v1/medical/prescriptions', { method: 'POST', body: data });
}

export async function updatePrescription(prescriptionId, data) {
  return api(`/api/v1/medical/prescriptions/${prescriptionId}`, { method: 'PATCH', body: data });
}

export async function deletePrescription(prescriptionId) {
  return api(`/api/v1/medical/prescriptions/${prescriptionId}`, { method: 'DELETE' });
}

// ── Availability ──────────────────────────────────────────────────────────────

export async function getDoctorAvailability(doctorId) {
  return api(`/api/v1/care/doctors/${doctorId}/availability`) || [];
}

export async function addAvailabilitySlot(doctorId, { startsAt, endsAt }) {
  return api(`/api/v1/care/doctors/${doctorId}/availability`, {
    method: 'POST',
    body: { startsAt, endsAt },
  });
}

export async function deleteAvailabilitySlot(doctorId, slotId) {
  return api(`/api/v1/care/doctors/${doctorId}/availability/${slotId}`, { method: 'DELETE' });
}

// ── Patients ──────────────────────────────────────────────────────────────────

export async function getDoctorPatientsSummary(doctorId) {
  return api(`/api/v1/care/doctors/${doctorId}/patients/summary`) || [];
}

export async function getPatientProfile(patientId) {
  try { return await api(`/api/v1/patients/${patientId}`); } catch { return null; }
}

export async function updatePatientProfile(patientId, data) {
  return api(`/api/v1/patients/${patientId}`, { method: 'PATCH', body: data });
}

// ── Organizations (pharmacies, labs, scans) ───────────────────────────────────

export async function listOrganizations(type) {
  const qs = type ? `?type=${type}` : '';
  return api(`/api/v1/registrations/organizations${qs}`) || [];
}
