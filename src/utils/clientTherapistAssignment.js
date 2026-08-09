// ─── Who is this client's therapist? ─────────────────────────────────────────
// The authoritative record is therapist_client_assignments_v2, written when the
// client picks a therapist (POST /therapy-management/client-select-therapist).
//
// Client screens used to read `clientProfile.assignedTherapist` instead — a
// Firestore-era field that nothing in the REST backend ever writes. So a client
// could pick and pay for a therapist and still be told "You haven't chosen a
// therapist yet", because the field they were checking stayed empty forever.
//
// Read the assignment, then resolve the therapist profile for display.

import { api } from '../services/apiClient';

/**
 * @returns {Promise<{id, name, ...}|null>} the client's active therapist, or null.
 */
export async function fetchAssignedTherapist(clientId) {
  if (!clientId) return null;
  try {
    const rows = await api(
      `/api/v1/therapy-management/assignments?clientId=${encodeURIComponent(clientId)}`,
    );
    const list = Array.isArray(rows) ? rows : [];
    // Newest active assignment wins; 'replaced'/'removed' rows are history.
    const active = list
      .filter(a => String(a.status || '').toLowerCase() === 'active')
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
    if (!active?.therapistId) return null;

    const therapist = await api(`/api/v1/therapists/${active.therapistId}`).catch(() => null);
    if (!therapist) return { id: active.therapistId, name: 'Your therapist' };
    return {
      ...therapist,
      id: active.therapistId,
      name: therapist.name || therapist.fullName || 'Your therapist',
      assignmentId: active.id,
      assignedAt: active.createdAt,
    };
  } catch {
    return null;
  }
}
