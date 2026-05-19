/** `auth` collection rows that are provider/partner accounts, not end patients */
export const AUTH_PROVIDER_ROLES = new Set([
  'doctor', 'therapist', 'admin', 'pharmacy', 'lab', 'scan', 'branch_user', 'pharmacist',
  'homecare_nurse',
]);

/** Therapy clients: SignUp.js sets userIntent to therapy when not booking a doctor */
export function isTherapyClientAuthDoc(data) {
  return String(data?.userIntent || '').toLowerCase() === 'therapy';
}

function authDocUid(data) {
  const u = data?.uid ?? data?.id;
  return u != null && u !== '' ? String(u) : '';
}

/**
 * Doctor / medical module users in `auth` (exclude therapy clients — they belong under Clients).
 * @param {Record<string, unknown>} data - Firestore auth profile fields (+ optional `id` doc id)
 * @param {Set<string>|null} therapyLinkedAuthUids - uids that appear as `authUid` on a `clients` doc (therapy track)
 */
export function isMedicalPatientAuthDoc(data, therapyLinkedAuthUids = null, nurseUids = null) {
  if (!data || AUTH_PROVIDER_ROLES.has(data.role)) return false;
  if (isTherapyClientAuthDoc(data)) return false;
  const intent = String(data?.userIntent || '').toLowerCase();
  if (intent === 'homecare_nurse') return false;
  const uid = authDocUid(data);
  if (nurseUids && uid && nurseUids.has(uid)) return false;
  if (intent === 'medical') return true;
  if (therapyLinkedAuthUids && uid && therapyLinkedAuthUids.has(uid)) return false;
  return true;
}

/** Build Set of Auth UIDs that are linked from the therapy `clients` collection */
export function buildTherapyLinkedAuthUidSet(clientsSnapshot) {
  const set = new Set();
  if (!clientsSnapshot?.forEach) return set;
  clientsSnapshot.forEach((d) => {
    const u = d.data()?.authUid;
    if (u != null && u !== '') set.add(String(u));
  });
  return set;
}

/** UIDs of home-care nurses (`homeCareNurses` doc id = auth uid) */
export function buildHomeCareNurseUidSet(nursesSnapshot) {
  const set = new Set();
  if (!nursesSnapshot?.forEach) return set;
  nursesSnapshot.forEach((d) => {
    const u = d.id || d.data()?.uid;
    if (u != null && u !== '') set.add(String(u));
  });
  return set;
}
