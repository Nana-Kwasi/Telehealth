import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../component/Auth/firebaseConfig';

export async function logPharmacyRxEvent({
  rxId,
  patientId,
  pharmacyId,
  branchId = null,
  actorId = null,
  actorName = '',
  actorRole = 'PHARMACY',
  action,
  fromStatus = null,
  toStatus = null,
  note = '',
  metadata = {},
}) {
  if (!rxId || !action) return;
  await addDoc(collection(db, 'pharmacyRxEvents'), {
    rxId,
    patientId: patientId || null,
    pharmacyId: pharmacyId || null,
    branchId: branchId || null,
    actorId: actorId || null,
    actorName: actorName || '',
    actorRole,
    action,
    fromStatus,
    toStatus,
    note,
    metadata,
    createdAt: serverTimestamp(),
  });
}

export async function queuePatientRxNotification({
  patientId,
  rxId,
  prescriptionRef,
  pharmacyStatus,
  branchName = '',
  pharmacyName = '',
}) {
  if (!patientId || !rxId || !pharmacyStatus) return;
  if (!['ready', 'delivered'].includes(pharmacyStatus)) return;

  const title = pharmacyStatus === 'ready'
    ? 'Prescription ready for pickup'
    : 'Prescription marked delivered';

  const parts = [];
  if (branchName) parts.push(branchName);
  else if (pharmacyName) parts.push(pharmacyName);
  if (prescriptionRef) parts.push(`Ref ${prescriptionRef}`);

  const message = pharmacyStatus === 'ready'
    ? `Your prescription is ready${parts.length ? ` at ${parts.join(' · ')}` : ''}.`
    : `Your prescription has been marked as delivered${parts.length ? ` (${parts.join(' · ')})` : ''}.`;

  await addDoc(collection(db, 'patientNotifications'), {
    patientId,
    type: 'PRESCRIPTION_STATUS',
    channel: 'in_app',
    title,
    message,
    read: false,
    rxId,
    prescriptionRef: prescriptionRef || null,
    pharmacyStatus,
    createdAt: serverTimestamp(),
  });
}
