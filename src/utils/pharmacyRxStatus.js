/**
 * Pharmacy prescription status + per-line pickup (medications[].pickupDeliveredAt).
 * Rx pharmacyStatus stays stock-based until finalize; delivered is set only with dispensing notes.
 */

/**
 * A pharmacy clinical-impact note needs the prescribing doctor to sign off before
 * the drug may be handed over. Notes without `requiresDoctorApproval` are purely
 * operational and never block.
 */
export function pendingDoctorNotes(med) {
  if (!med || !Array.isArray(med.pharmacyNotes)) return [];
  return med.pharmacyNotes.filter(
    n => n?.requiresDoctorApproval && (n.approvalStatus || 'pending_doctor') === 'pending_doctor'
  );
}

export function hasPendingDoctorNote(med) {
  return pendingDoctorNotes(med).length > 0;
}

/**
 * A delivered prescription is a closed clinical record: nobody edits it afterwards,
 * not the pharmacy and not the prescribing doctor. `deliveredAt` is the reliable
 * signal (it is a real column); the status fields are checked too because the
 * pharmacy workflow state and the doctor's Rx status share one column.
 */
export function isRxDelivered(rx) {
  if (!rx) return false;
  if (rx.deliveredAt) return true;
  return (rx.pharmacyStatus || '') === 'delivered' || (rx.status || '') === 'delivered';
}

/**
 * The line is parked with the prescribing doctor and the pharmacy must not move it
 * on: either an alternative drug has been suggested and not yet ruled on, or a
 * clinical-impact note is awaiting sign-off. Without this the pharmacy could
 * suggest a replacement and then simply mark the line Available itself.
 */
export function awaitingDoctorDecision(med) {
  if (!med) return false;
  if ((med.drugStatus || '') === 'alternative_suggested') return true;
  return hasPendingDoctorNote(med);
}

/** Human-readable reason the line is parked, or null. */
export function doctorDecisionReason(med) {
  if (!med) return null;
  if ((med.drugStatus || '') === 'alternative_suggested') {
    return `the prescribing doctor approves the suggested alternative${med.alternativeSuggested ? ` (${med.alternativeSuggested})` : ''}`;
  }
  if (hasPendingDoctorNote(med)) return 'the prescribing doctor approves the clinical-impact note raised on this line';
  return null;
}

/** Notes the patient is allowed to see — only what the doctor has approved. */
export function patientVisibleNotes(med) {
  if (!med || !Array.isArray(med.pharmacyNotes)) return [];
  return med.pharmacyNotes.filter(
    n => n && (!n.requiresDoctorApproval || n.approvalStatus === 'approved')
  );
}

/** Line is closed for pickup purposes (picked up, or NA / no dispense). */
export function isLinePickupSatisfied(m) {
  if (!m) return true;
  const ds = m.drugStatus || 'pending';
  if (ds === 'not_available') return true;
  if (ds === 'alternative_suggested') return false;
  if (['pending', 'transfer_requested', 'transferred'].includes(ds)) return false;
  if (ds === 'available' || ds === 'approved_replacement') return !!m.pickupDeliveredAt;
  return false;
}

/** Stock / workflow status only — never returns delivered (that is set on finalize). */
export function deriveRxStockStatus(meds = []) {
  if (!meds.length) return 'sent';
  const statuses = meds.map(m => m.drugStatus || 'pending');
  if (statuses.every(s => s === 'available' || s === 'approved_replacement')) return 'ready';
  if (statuses.some(s => ['not_available', 'alternative_suggested', 'transferred', 'transfer_requested'].includes(s))) {
    return 'partially_fulfilled';
  }
  return 'accepted';
}

// `ownerId` is the entity responsible for a line that isn't transferred elsewhere.
// It defaults to rx.branchId (the routed branch) so existing branch behaviour is
// unchanged; the parent pharmacy passes its own id so it can own/dispense
// prescriptions that aren't routed to any branch.
export function pickupResponsibleBranchId(med, rx, ownerId) {
  if (!med || !rx) return null;
  if (med.pickupDeliveredAt) return null;
  const ds = med.drugStatus || 'pending';
  if (ds === 'not_available') return null;
  if (ds === 'alternative_suggested') return null;
  if (!['available', 'approved_replacement'].includes(ds)) return null;

  const tb = med.transferBranchId || '';
  const owner = (ownerId || rx.branchId) || '';
  if (tb && tb !== owner) return tb;
  return owner || null;
}

export function branchCanMarkLinePickup(profileId, med, rx, ownerId) {
  if (!profileId || !med || !rx) return false;
  if ((rx.pharmacyStatus || '') === 'delivered') return false;
  if (med.pickupDeliveredAt) return false;
  // A clinical-impact note raised on this line must be signed off by the doctor
  // before the drug can be handed over.
  if (hasPendingDoctorNote(med)) return false;
  const ds = med.drugStatus || 'pending';
  if (!['available', 'approved_replacement'].includes(ds)) return false;
  return pickupResponsibleBranchId(med, rx, ownerId) === profileId;
}

/** Owner cannot change stock on a line fulfilled at another branch after transfer. */
export function ownerDrugRowLockedForOps(isOwnerBranch, med, profileId) {
  if (!isOwnerBranch || !med) return false;
  const tb = med.transferBranchId || '';
  if (!tb || tb === profileId) return false;
  const ds = med.drugStatus || 'pending';
  return ['transferred', 'available', 'approved_replacement'].includes(ds);
}

export function allPickupsSatisfied(meds = []) {
  return meds.length > 0 && meds.every(isLinePickupSatisfied);
}
