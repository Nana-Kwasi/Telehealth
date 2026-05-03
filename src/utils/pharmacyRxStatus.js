/**
 * Pharmacy prescription status + per-line pickup (medications[].pickupDeliveredAt).
 * Rx pharmacyStatus stays stock-based until finalize; delivered is set only with dispensing notes.
 */

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

export function pickupResponsibleBranchId(med, rx) {
  if (!med || !rx) return null;
  if (med.pickupDeliveredAt) return null;
  const ds = med.drugStatus || 'pending';
  if (ds === 'not_available') return null;
  if (ds === 'alternative_suggested') return null;
  if (!['available', 'approved_replacement'].includes(ds)) return null;

  const tb = med.transferBranchId || '';
  const owner = rx.branchId || '';
  if (tb && tb !== owner) return tb;
  return owner || null;
}

export function branchCanMarkLinePickup(profileId, med, rx) {
  if (!profileId || !med || !rx) return false;
  if ((rx.pharmacyStatus || '') === 'delivered') return false;
  if (med.pickupDeliveredAt) return false;
  const ds = med.drugStatus || 'pending';
  if (!['available', 'approved_replacement'].includes(ds)) return false;
  return pickupResponsibleBranchId(med, rx) === profileId;
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
