import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../../Auth/firebaseConfig';
import { logPharmacyRxEvent, queuePatientRxNotification } from '../../../utils/pharmacyCollab';
import {
  deriveRxStockStatus,
  branchCanMarkLinePickup,
  ownerDrugRowLockedForOps,
  allPickupsSatisfied,
  pickupResponsibleBranchId,
} from '../../../utils/pharmacyRxStatus';

const DRUG_STATUS_META = {
  pending: { label: 'Pending', icon: '⏳', color: '#f59e0b' },
  available: { label: 'Available', icon: '✅', color: '#16a34a' },
  not_available: { label: 'Not Available', icon: '❌', color: '#dc2626' },
  transfer_requested: { label: 'Awaiting Patient Consent', icon: '🕒', color: '#0f766e' },
  alternative_suggested: { label: 'Alt. Suggested', icon: '🔁', color: '#7c3aed' },
  approved_replacement: { label: 'Approved Alt.', icon: '✅', color: '#16a34a' },
  transferred: { label: 'Transferred', icon: '↔️', color: '#0369a1' },
};

const DEFAULT_TRANSFER_APPROVAL_TTL_HOURS = 6;

function pickCoords(obj) {
  if (!obj) return null;
  const candidates = [
    [obj.latitude, obj.longitude],
    [obj.lat, obj.lng],
    [obj.lat, obj.lon],
    [obj.location?.latitude, obj.location?.longitude],
    [obj.location?.lat, obj.location?.lng],
    [obj.location?.lat, obj.location?.lon],
    [obj.coords?.latitude, obj.coords?.longitude],
    [obj.coords?.lat, obj.coords?.lng],
  ];
  for (const [la, lo] of candidates) {
    const lat = Number(la);
    const lon = Number(lo);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  }
  return null;
}

function kmBetween(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const x = s1 * s1 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * s2 * s2;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

function isTransferRequestExpired(med) {
  if (!med || med.drugStatus !== 'transfer_requested' || med.transferRequestStatus !== 'pending_patient') return false;
  const requestedAt = med.transferRequestedAt ? new Date(med.transferRequestedAt).getTime() : NaN;
  if (!Number.isFinite(requestedAt)) return false;
  const ttlHours = Math.max(1, Number(med.transferApprovalTtlHours) || DEFAULT_TRANSFER_APPROVAL_TTL_HOURS);
  const ttlMs = ttlHours * 60 * 60 * 1000;
  return Date.now() - requestedAt > ttlMs;
}

function expirePendingTransferRequest(med) {
  return {
    ...med,
    drugStatus: 'not_available',
    transferRequestStatus: 'expired',
    transferRequestExpiredAt: new Date().toISOString(),
    transferBranchId: null,
    transferBranchName: null,
    transferBranchAddress: null,
    transferRequestBranchId: null,
    transferRequestBranchName: null,
    transferRequestBranchAddress: null,
  };
}

export default function BranchPrescriptionOps({ profile }) {
  const { rxId } = useParams();
  const navigate = useNavigate();
  const [rx, setRx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [altDraft, setAltDraft] = useState({});
  const [altRationaleDraft, setAltRationaleDraft] = useState({});
  const [branches, setBranches] = useState([]);
  const [branchPickerFor, setBranchPickerFor] = useState(null);
  const [patientCity, setPatientCity] = useState('');
  const [nearbyOnly, setNearbyOnly] = useState(false);
  const [nearbyRadiusKm, setNearbyRadiusKm] = useState(20);
  const [patientCoords, setPatientCoords] = useState(null);
  const [clinicalNoteDraft, setClinicalNoteDraft] = useState({});
  const [showClinicalNoteFor, setShowClinicalNoteFor] = useState({});
  const [dispenseBrandPackNote, setDispenseBrandPackNote] = useState('');
  const [deliveryCounselingNote, setDeliveryCounselingNote] = useState('');
  const [deliveryColdChainNote, setDeliveryColdChainNote] = useState('');
  const [deliveryHasException, setDeliveryHasException] = useState(false);
  const [deliveryExceptionNote, setDeliveryExceptionNote] = useState('');
  const [partialFillReasonDraft, setPartialFillReasonDraft] = useState({});
  const [showPartialReasonFor, setShowPartialReasonFor] = useState({});

  useEffect(() => {
    let cancelled = false;
    let unsubRx = null;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'doctorPrescriptions', rxId));
        if (!snap.exists()) return;
        const data = { id: snap.id, ...snap.data() };
        const isOwnerBranch = (data.branchId || '') === (profile?.id || '');
        const isTransferTarget = (data.medications || []).some(m => (m.transferBranchId || '') === (profile?.id || ''));
        if (!isOwnerBranch && !isTransferTarget) return;
        if (!cancelled) setRx(data);
        if (!cancelled) setDispenseBrandPackNote(data?.dispensedBrandPackUsed || '');
        if (!cancelled) setDeliveryCounselingNote(data?.counselingPickupInstruction || '');
        if (!cancelled) setDeliveryColdChainNote(data?.coldChainStorageHandling || '');
        if (!cancelled) setDeliveryExceptionNote(data?.dispenseExceptionDetail || '');
        if (!cancelled) setDeliveryHasException(!!(data?.dispenseExceptionDetail || '').trim());
        unsubRx = onSnapshot(doc(db, 'doctorPrescriptions', rxId), async live => {
          if (!live.exists() || cancelled) return;
          const liveData = { id: live.id, ...live.data() };
          const isOwnerLive = (liveData.branchId || '') === (profile?.id || '');
          const isTransferTargetLive = (liveData.medications || []).some(m => (m.transferBranchId || '') === (profile?.id || ''));
          if (!isOwnerLive && !isTransferTargetLive) return;
          const meds = Array.isArray(liveData.medications) ? liveData.medications : [];
          const hasExpiredPending = meds.some(isTransferRequestExpired);
          if (hasExpiredPending) {
            const nextMeds = meds.map(m => (isTransferRequestExpired(m) ? expirePendingTransferRequest(m) : m));
            await updateDoc(doc(db, 'doctorPrescriptions', rxId), {
              medications: nextMeds,
              pharmacyStatus: deriveRxStockStatus(nextMeds),
              updatedAt: serverTimestamp(),
            }).catch(() => {});
            return;
          }
          setRx(liveData);
        });

        const bSnap = await getDocs(query(
          collection(db, 'pharmacyBranches'),
          where('pharmacyId', '==', data.pharmacyId || profile?.pharmacyId || ''),
          where('status', '==', 'active'),
        ));
        const list = bSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(b => b.id !== profile?.id);
        if (!cancelled) setBranches(list);

        if (data.patientId) {
          const pSnap = await getDoc(doc(db, 'patientProfiles', data.patientId));
          if (pSnap.exists() && !cancelled) {
            const pd = pSnap.data();
            setPatientCity((pd?.location?.city || pd?.city || '').toLowerCase());
            setPatientCoords(pickCoords(pd));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; if (unsubRx) unsubRx(); };
  }, [rxId, profile?.id]);

  const rankedBranches = useMemo(() => {
    let list = branches.map(b => {
      const bc = pickCoords(b);
      let distanceKm = null;
      if (patientCoords && bc) {
        distanceKm = kmBetween(
          { lat: patientCoords.lat, lon: patientCoords.lon },
          { lat: bc.lat, lon: bc.lon },
        );
      }
      return { ...b, _distanceKm: distanceKm };
    });
    if (nearbyOnly && (patientCoords || patientCity)) {
      list = list.filter(b => {
        if (patientCoords && Number.isFinite(b._distanceKm)) {
          return b._distanceKm <= nearbyRadiusKm;
        }
        const city = (b.city || b.location?.city || '').toLowerCase();
        return patientCity && city && city === patientCity;
      });
    }
    list.sort((a, b) => {
      const ad = Number.isFinite(a._distanceKm) ? a._distanceKm : null;
      const bd = Number.isFinite(b._distanceKm) ? b._distanceKm : null;
      if (ad !== null && bd !== null && ad !== bd) return ad - bd;
      if (ad !== null && bd === null) return -1;
      if (ad === null && bd !== null) return 1;
      const ac = (a.city || a.location?.city || '').toLowerCase();
      const bc = (b.city || b.location?.city || '').toLowerCase();
      const aNear = patientCity && ac && ac === patientCity ? 1 : 0;
      const bNear = patientCity && bc && bc === patientCity ? 1 : 0;
      if (aNear !== bNear) return bNear - aNear;
      return (a.branchName || '').localeCompare(b.branchName || '');
    });
    return list;
  }, [branches, patientCity, nearbyOnly, patientCoords, nearbyRadiusKm]);

  const persistMeds = async (nextMeds, action, meta = {}) => {
    if (!rx) return;
    if (rx.pharmacyStatus === 'delivered') return;
    setSaving(true);
    try {
      const prevStatus = rx.pharmacyStatus || 'sent';
      const nextStatus = deriveRxStockStatus(nextMeds);
      await updateDoc(doc(db, 'doctorPrescriptions', rx.id), {
        medications: nextMeds,
        pharmacyStatus: nextStatus,
        updatedAt: serverTimestamp(),
      });
      await logPharmacyRxEvent({
        rxId: rx.id,
        patientId: rx.patientId,
        pharmacyId: rx.pharmacyId || null,
        branchId: profile?.id || rx.branchId || null,
        actorId: profile?.id || null,
        actorName: profile?.branchName || 'Branch',
        actorRole: 'PHARMACY_BRANCH',
        action,
        fromStatus: prevStatus,
        toStatus: nextStatus,
        metadata: meta,
      }).catch(() => {});
      if (prevStatus !== nextStatus) {
        await queuePatientRxNotification({
          patientId: rx.patientId,
          rxId: rx.id,
          prescriptionRef: rx.prescriptionRef,
          pharmacyStatus: nextStatus,
          branchName: profile?.branchName || rx.branchName || '',
          pharmacyName: profile?.pharmacyName || rx.pharmacyName || '',
        }).catch(() => {});
      }
      setRx(prev => ({ ...prev, medications: nextMeds, pharmacyStatus: nextStatus }));
    } finally {
      setSaving(false);
    }
  };

  const setDrugStatus = async (i, drugStatus, opts = {}) => {
    const next = (rx?.medications || []).map((m, idx) => {
      if (idx !== i) return m;
      const patch = {};
      if (drugStatus === 'not_available') patch.partialFillReasoning = opts.partialFillReasoning || m.partialFillReasoning || null;
      const isTransferredToMe = (m.transferBranchId || '') === (profile?.id || '');
      // If destination branch confirms transferred drug availability/unavailability,
      // resolve the transfer assignment so it leaves the incoming queue.
      if (isTransferredToMe && (drugStatus === 'available' || drugStatus === 'not_available')) {
        const base = {
          ...m,
          drugStatus,
          ...patch,
          transferResolvedByBranchId: profile?.id || null,
          transferResolvedByBranchName: profile?.branchName || 'Branch',
          transferResolvedAt: new Date().toISOString(),
          transferOutcome: drugStatus === 'available' ? 'received' : 'not_received',
        };
        if (drugStatus === 'available') {
          return base;
        }
        return {
          ...base,
          transferBranchId: null,
          transferBranchName: null,
          transferBranchAddress: null,
          transferFailedByBranchId: profile?.id || null,
          transferFailedByBranchName: profile?.branchName || 'Branch',
          transferFailedAt: new Date().toISOString(),
        };
      }
      return { ...m, drugStatus, ...patch };
    });
    await persistMeds(next, 'DRUG_STATUS_UPDATED', { medIndex: i, drugStatus, partialFillReasoning: opts.partialFillReasoning || null });
  };

  const suggestAlt = async (i) => {
    const text = (altDraft[i] || '').trim();
    const rationale = (altRationaleDraft[i] || '').trim();
    if (!text) return;
    if (!rationale) return;
    const next = (rx?.medications || []).map((m, idx) =>
      idx === i ? { ...m, drugStatus: 'alternative_suggested', alternativeSuggested: text, alternativeRationale: rationale || null } : m
    );
    await persistMeds(next, 'ALTERNATIVE_SUGGESTED', { medIndex: i, alternative: text, rationale: rationale || null });
    setAltDraft(prev => ({ ...prev, [i]: '' }));
    setAltRationaleDraft(prev => ({ ...prev, [i]: '' }));
  };

  const transferDrug = async (i, toBranch) => {
    const med = (rx?.medications || [])[i];
    if (!isOwnerBranch) return;
    if (!med || med.drugStatus !== 'not_available') return;
    if ((toBranch.pharmacyId || '') !== (rx?.pharmacyId || '')) return;
    const next = (rx?.medications || []).map((m, idx) =>
      idx === i ? {
        ...m,
        drugStatus: 'transfer_requested',
        transferFromBranchId: profile?.id || rx?.branchId || null,
        transferFromBranchName: profile?.branchName || rx?.branchName || 'Branch',
        transferRequestStatus: 'pending_patient',
        transferRequestedAt: new Date().toISOString(),
        transferRequestedByBranchId: profile?.id || rx?.branchId || null,
        transferRequestedByBranchName: profile?.branchName || rx?.branchName || 'Branch',
        transferApprovalTtlHours: Math.max(1, Number(profile?.transferApprovalTtlHours) || DEFAULT_TRANSFER_APPROVAL_TTL_HOURS),
        transferRequestBranchId: toBranch.id,
        transferRequestBranchName: toBranch.branchName || 'Branch',
        transferRequestBranchAddress: toBranch.address || '',
        transferBranchId: null,
        transferBranchName: null,
        transferBranchAddress: null,
        transferOutcome: null,
      } : m
    );
    await persistMeds(next, 'TRANSFER_REQUESTED_TO_PATIENT', {
      medIndex: i,
      transferRequestBranchId: toBranch.id,
      transferRequestBranchName: toBranch.branchName || '',
      transferRequestStatus: 'pending_patient',
    });
    await addDoc(collection(db, 'patientNotifications'), {
      patientId: rx?.patientId || null,
      type: 'TRANSFER_APPROVAL_REQUEST',
      channel: 'in_app',
      title: 'Pharmacy transfer request',
      message: `${med?.name || 'A medicine'} is unavailable at ${profile?.branchName || rx?.branchName || 'the current branch'}. Confirm transfer to ${toBranch.branchName || 'another branch'}?`,
      read: false,
      rxId: rx?.id || null,
      prescriptionRef: rx?.prescriptionRef || null,
      medIndex: i,
      transferRequestBranchId: toBranch.id,
      transferRequestBranchName: toBranch.branchName || '',
      createdAt: serverTimestamp(),
    }).catch(() => {});
    setBranchPickerFor(null);
  };

  const addClinicalImpactNote = async (i) => {
    const noteText = (clinicalNoteDraft[i] || '').trim();
    if (!noteText) return;
    const next = (rx?.medications || []).map((m, idx) => {
      if (idx !== i) return m;
      const existing = Array.isArray(m.pharmacyNotes) ? m.pharmacyNotes : [];
      return {
        ...m,
        pharmacyNotes: [
          ...existing,
          {
            type: 'clinical_impact_note',
            label: 'Clinical-impact note',
            note: noteText,
            requiresDoctorApproval: true,
            approvalStatus: 'pending_doctor',
            createdAt: new Date().toISOString(),
            createdByBranchId: profile?.id || null,
            createdByBranchName: profile?.branchName || 'Branch',
          },
        ],
      };
    });
    await persistMeds(
      next,
      'PHARMACY_CLINICAL_NOTE_ADDED',
      { medIndex: i, noteType: 'clinical_impact_note', requiresDoctorApproval: true },
    );
    setClinicalNoteDraft(prev => ({ ...prev, [i]: '' }));
    setShowClinicalNoteFor(prev => ({ ...prev, [i]: false }));
  };

  const markLinePickupDelivered = async (i) => {
    if (!rx || rx.pharmacyStatus === 'delivered') return;
    const med = (rx.medications || [])[i];
    if (!branchCanMarkLinePickup(profile?.id, med, rx)) return;
    const nextMeds = (rx.medications || []).map((m, idx) =>
      idx === i
        ? {
            ...m,
            pickupDeliveredAt: new Date().toISOString(),
            pickupDeliveredByBranchId: profile?.id || null,
            pickupDeliveredByBranchName: profile?.branchName || 'Branch',
          }
        : m
    );
    await persistMeds(nextMeds, 'LINE_PICKUP_DELIVERED', { medIndex: i });
  };

  const finalizeDelivery = async () => {
    if (!rx) return;
    if (rx.pharmacyStatus === 'delivered') return;
    if (!allPickupsSatisfied(rx.medications || [])) {
      alert('Every medication line must be picked up or marked not available before closing this prescription.');
      return;
    }
    if (!(dispenseBrandPackNote || '').trim()) return;
    if (!(deliveryCounselingNote || '').trim()) return;
    if (!(deliveryColdChainNote || '').trim()) return;
    if (deliveryHasException && !(deliveryExceptionNote || '').trim()) return;
    setSaving(true);
    try {
      const prevStatus = rx.pharmacyStatus || 'sent';
      await updateDoc(doc(db, 'doctorPrescriptions', rx.id), {
        pharmacyStatus: 'delivered',
        dispensedBrandPackUsed: (dispenseBrandPackNote || '').trim(),
        counselingPickupInstruction: (deliveryCounselingNote || '').trim(),
        coldChainStorageHandling: (deliveryColdChainNote || '').trim(),
        dispenseExceptionDetail: deliveryHasException ? (deliveryExceptionNote || '').trim() : null,
        deliveredAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logPharmacyRxEvent({
        rxId: rx.id,
        patientId: rx.patientId,
        pharmacyId: rx.pharmacyId || null,
        branchId: profile?.id || rx.branchId || null,
        actorId: profile?.id || null,
        actorName: profile?.branchName || 'Branch',
        actorRole: 'PHARMACY_BRANCH',
        action: 'PRESCRIPTION_DELIVERED',
        fromStatus: prevStatus,
        toStatus: 'delivered',
      }).catch(() => {});
      await queuePatientRxNotification({
        patientId: rx.patientId,
        rxId: rx.id,
        prescriptionRef: rx.prescriptionRef,
        pharmacyStatus: 'delivered',
        branchName: profile?.branchName || rx.branchName || '',
        pharmacyName: profile?.pharmacyName || rx.pharmacyName || '',
      }).catch(() => {});
      setRx(prev => ({ ...prev, pharmacyStatus: 'delivered' }));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="pharmacy-page"><p>Loading prescription…</p></div>;
  if (!rx) return <div className="pharmacy-page"><p>Prescription not found or not assigned to this branch.</p></div>;
  const isFinalized = rx.pharmacyStatus === 'delivered';
  const isOwnerBranch = (rx.branchId || '') === (profile?.id || '');
  const meds = rx.medications || [];
  const visibleMeds = meds
    .map((m, i) => ({ ...m, __idx: i }))
    .filter(m => isOwnerBranch || ((m.transferBranchId || '') === (profile?.id || '')));

  return (
    <div className="pharmacy-page">
      <button className="doctor-btn doctor-btn-outline doctor-btn-sm" onClick={() => navigate('/dashboard/prescriptions')}>← Back</button>
      <h1 className="pharmacy-page-title" style={{ marginTop: '0.75rem' }}>Prescription Operations</h1>
      <p className="pharmacy-page-sub">{rx.patientName} · Ref {rx.prescriptionRef || '—'}</p>
      {isFinalized && (
        <div style={{ marginBottom: '0.75rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '0.75rem 0.9rem', color: '#166534', fontWeight: 700 }}>
          ✅ This prescription is delivered and marked done. Further status changes are locked.
        </div>
      )}
      {!isOwnerBranch && !isFinalized && allPickupsSatisfied(meds) && (
        <div style={{ marginBottom: '0.75rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '0.65rem 0.85rem', color: '#1e40af', fontSize: '0.82rem' }}>
          Pickups are complete for your branch. The routing branch will complete the dispensing checklist and lock this prescription when ready.
        </div>
      )}
      {isOwnerBranch && !isFinalized && !allPickupsSatisfied(meds) && (
        <div style={{ marginBottom: '0.75rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '0.65rem 0.85rem', color: '#92400e', fontSize: '0.82rem', lineHeight: 1.45 }}>
          <b>Bottom checklist is hidden until all handovers are done.</b> Each branch that gives a drug must click <b>Deliver this drug</b> on its lines. Transferred lines are delivered at the other branch first. Then the routing branch fills the whole-Rx fields once and locks.
        </div>
      )}

      {visibleMeds.map((med) => {
        const i = med.__idx;
        const ds = DRUG_STATUS_META[med.drugStatus] || DRUG_STATUS_META.pending;
        const isTransferredToMe = (med.transferBranchId || '') === (profile?.id || '');
        const ownerLocked = ownerDrugRowLockedForOps(isOwnerBranch, med, profile?.id || '');
        const canManageDrugRow = (isOwnerBranch && !ownerLocked) || isTransferredToMe;
        const canMarkPickupHere = branchCanMarkLinePickup(profile?.id, med, rx);
        const pickupRespId = pickupResponsibleBranchId(med, rx);
        const handoverElsewhere = isOwnerBranch
          && ['available', 'approved_replacement'].includes(med.drugStatus || '')
          && !med.pickupDeliveredAt
          && pickupRespId
          && pickupRespId !== (profile?.id || '');
        return (
          <div key={i} className="rx-card" style={{ marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <b>{med.name}</b>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{[med.drugForm, med.dosage, med.frequency].filter(Boolean).join(' · ')}</div>
                {med.drugStatus === 'approved_replacement' && med.alternativeSuggested && (
                  <div style={{ fontSize: '0.8rem', color: '#15803d', marginTop: 4 }}>
                    Approved alternative: <b>{med.alternativeSuggested}</b>
                  </div>
                )}
                {med.drugStatus === 'transferred' && med.transferBranchName && (
                  <div style={{ fontSize: '0.8rem', color: '#0369a1', marginTop: 4 }}>
                    Transferred to: <b>{med.transferBranchName}</b>{med.transferBranchAddress ? ` · ${med.transferBranchAddress}` : ''}
                  </div>
                )}
                {med.drugStatus === 'transfer_requested' && med.transferRequestBranchName && (
                  <div style={{ fontSize: '0.8rem', color: '#0f766e', marginTop: 4 }}>
                    Awaiting patient consent to transfer to: <b>{med.transferRequestBranchName}</b>{med.transferRequestBranchAddress ? ` · ${med.transferRequestBranchAddress}` : ''}
                  </div>
                )}
                {med.transferOutcome === 'not_received' && (
                  <div style={{ fontSize: '0.8rem', color: '#be123c', marginTop: 4, fontWeight: 700 }}>
                    Rejected by {med.transferFailedByBranchName || 'Branch B'} (did not get this drug)
                  </div>
                )}
                {med.partialFillReasoning && (
                  <div style={{ fontSize: '0.8rem', color: '#92400e', marginTop: 4 }}>
                    Partial fill reason: <b>{med.partialFillReasoning}</b>
                  </div>
                )}
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: ds.color }}>{ds.icon} {ds.label}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <button className="doctor-btn doctor-btn-sm doctor-btn-outline" disabled={saving || isFinalized || !canManageDrugRow} onClick={() => setDrugStatus(i, 'available')}>Available</button>
              <button
                className="doctor-btn doctor-btn-sm doctor-btn-danger"
                disabled={saving || isFinalized || !canManageDrugRow}
                onClick={() => {
                  const reason = (partialFillReasonDraft[i] || med.partialFillReasoning || '').trim();
                  if (!reason) {
                    setShowPartialReasonFor(prev => ({ ...prev, [i]: true }));
                    return;
                  }
                  setDrugStatus(i, 'not_available', { partialFillReasoning: reason });
                  setShowPartialReasonFor(prev => ({ ...prev, [i]: false }));
                }}
              >
                Not available
              </button>
              <button
                className="doctor-btn doctor-btn-sm doctor-btn-outline"
                disabled={saving || isFinalized || !canManageDrugRow || med.drugStatus !== 'not_available'}
                onClick={() => setBranchPickerFor(branchPickerFor === i ? null : i)}
              >
                Transfer
              </button>
            </div>
            {canMarkPickupHere && (
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="doctor-btn doctor-btn-sm doctor-btn-primary"
                  disabled={saving || isFinalized}
                  onClick={() => markLinePickupDelivered(i)}
                >
                  Deliver this drug
                </button>
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 6, maxWidth: 420 }}>
                  Handover for this line only. Routing branch fills the Rx-level checklist at the bottom once every line is delivered.
                </div>
              </div>
            )}
            {handoverElsewhere && (
              <div style={{ marginTop: 8, fontSize: '0.78rem', color: '#9a3412', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '0.5rem 0.65rem', maxWidth: 480 }}>
                Handover for this line is done at <b>{med.transferBranchName || 'the transfer branch'}</b> (<b>Deliver this drug</b> there). This branch cannot close that line here, so the whole-Rx checklist stays hidden until that branch finishes too.
              </div>
            )}
            {med.pickupDeliveredAt && (
              <div style={{ fontSize: '0.76rem', color: '#15803d', marginTop: 6, fontWeight: 600 }}>
                ✓ Picked up {med.pickupDeliveredByBranchName ? `· ${med.pickupDeliveredByBranchName}` : ''}{med.pickupDeliveredAt ? ` · ${new Date(med.pickupDeliveredAt).toLocaleString()}` : ''}
              </div>
            )}
            {(showPartialReasonFor[i] || med.drugStatus === 'not_available') && (
              <div style={{ marginTop: 6 }}>
                <input
                  value={partialFillReasonDraft[i] ?? med.partialFillReasoning ?? ''}
                  onChange={e => setPartialFillReasonDraft(prev => ({ ...prev, [i]: e.target.value }))}
                  placeholder="Partial fill reasoning (required for Not available)"
                  disabled={isFinalized || !canManageDrugRow}
                  style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: 8, border: '1px solid #d1d5db' }}
                />
              </div>
            )}
            {branchPickerFor === i && (
              <div style={{ marginTop: 8, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <div style={{ padding: '0.45rem 0.75rem', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>
                    {patientCoords
                      ? `Patient coordinates detected · radius ${nearbyRadiusKm}km`
                      : patientCity
                        ? `Patient city: ${patientCity}`
                        : 'Patient location unavailable'}
                  </span>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', color: '#334155', cursor: (patientCoords || patientCity) ? 'pointer' : 'not-allowed', opacity: (patientCoords || patientCity) ? 1 : 0.5 }}>
                    <input
                      type="checkbox"
                      checked={nearbyOnly}
                      disabled={!(patientCoords || patientCity)}
                      onChange={e => setNearbyOnly(e.target.checked)}
                    />
                    Nearby only
                  </label>
                </div>
                {nearbyOnly && patientCoords && (
                  <div style={{ padding: '0.45rem 0.75rem', borderBottom: '1px solid #f1f5f9', background: '#fff' }}>
                    <label style={{ fontSize: '0.76rem', color: '#475569', fontWeight: 600, marginRight: 8 }}>Radius (km)</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={nearbyRadiusKm}
                      onChange={e => setNearbyRadiusKm(Math.max(1, Math.min(100, Number(e.target.value) || 20)))}
                      style={{ width: 72, padding: '0.25rem 0.4rem', borderRadius: 6, border: '1px solid #d1d5db' }}
                    />
                  </div>
                )}
                {rankedBranches.length === 0 ? (
                  <p style={{ margin: 0, padding: 10, fontSize: '0.82rem', color: '#94a3b8' }}>No other active branches found.</p>
                ) : rankedBranches.map(b => {
                  const city = b.city || b.location?.city || '';
                  const near = patientCity && city.toLowerCase() === patientCity;
                  const distanceText = Number.isFinite(b._distanceKm) ? `${b._distanceKm.toFixed(1)} km` : '';
                  return (
                    <button
                      key={b.id}
                      type="button"
                      style={{ width: '100%', textAlign: 'left', padding: '0.55rem 0.75rem', border: 'none', borderBottom: '1px solid #f1f5f9', background: '#fff', cursor: 'pointer' }}
                      disabled={isFinalized}
                      onClick={() => transferDrug(i, b)}
                    >
                      <b>{b.branchName || 'Branch'}</b>{near ? ' · Near patient' : ''}{distanceText ? ` · ${distanceText}` : ''}
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{b.address || city || 'No location'}</div>
                    </button>
                  );
                })}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                value={altDraft[i] || ''}
                onChange={e => setAltDraft(prev => ({ ...prev, [i]: e.target.value }))}
                placeholder="Suggest alternative drug"
                disabled={isFinalized || !canManageDrugRow}
                style={{ flex: 1, padding: '0.45rem 0.6rem', borderRadius: 8, border: '1px solid #d1d5db' }}
              />
              <button
                className="doctor-btn doctor-btn-sm"
                disabled={saving || isFinalized || !canManageDrugRow || !(altDraft[i] || '').trim() || !(altRationaleDraft[i] || '').trim()}
                onClick={() => suggestAlt(i)}
              >
                Suggest
              </button>
            </div>
            {(altDraft[i] || '').trim() && (
              <div style={{ marginTop: 6 }}>
                <input
                  value={altRationaleDraft[i] || ''}
                  onChange={e => setAltRationaleDraft(prev => ({ ...prev, [i]: e.target.value }))}
                  placeholder="Rationale for this alternative (required)"
                  disabled={isFinalized || !canManageDrugRow}
                  style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: 8, border: '1px solid #d1d5db' }}
                />
              </div>
            )}
            <div style={{ marginTop: 8, borderTop: '1px dashed #e2e8f0', paddingTop: 8 }}>
              <button
                type="button"
                className="doctor-btn doctor-btn-sm doctor-btn-outline"
                disabled={isFinalized || !canManageDrugRow}
                onClick={() => setShowClinicalNoteFor(prev => ({ ...prev, [i]: !prev[i] }))}
                style={{ borderColor: '#c4b5fd', color: '#6d28d9', background: '#f5f3ff', borderRadius: 14, padding: '0.22rem 0.65rem', fontSize: '0.72rem', fontWeight: 700 }}
              >
                {showClinicalNoteFor[i] ? 'Hide Clinical Note' : 'Clinical Note'}
              </button>
              {showClinicalNoteFor[i] && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <input
                    value={clinicalNoteDraft[i] || ''}
                    onChange={e => setClinicalNoteDraft(prev => ({ ...prev, [i]: e.target.value }))}
                    placeholder="Enter clinical-impact note (doctor approval required)"
                    disabled={isFinalized || !canManageDrugRow}
                    style={{ flex: 1, padding: '0.45rem 0.6rem', borderRadius: 8, border: '1px solid #d1d5db' }}
                  />
                  <button
                    className="doctor-btn doctor-btn-sm doctor-btn-outline"
                    disabled={saving || isFinalized || !canManageDrugRow || !((clinicalNoteDraft[i] || '').trim())}
                    onClick={() => addClinicalImpactNote(i)}
                  >
                    Send
                  </button>
                </div>
              )}
              {Array.isArray(med.pharmacyNotes) && med.pharmacyNotes.length > 0 && (
                <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                  {med.pharmacyNotes.slice(-3).map((n, ni) => (
                    <div key={ni} style={{ fontSize: '0.74rem', color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 6px' }}>
                      <b>{n.label || n.type}</b> · {n.note}
                      {n.requiresDoctorApproval ? ` · ${n.approvalStatus === 'approved' ? 'Approved by doctor' : n.approvalStatus === 'rejected' ? 'Rejected by doctor' : 'Pending doctor approval'}` : ' · Operational'}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {isOwnerBranch && allPickupsSatisfied(meds) && !isFinalized && (
        <div
          style={{
            marginTop: 12,
            border: '1.5px solid #bfdbfe',
            borderRadius: 12,
            background: '#f8fbff',
            padding: '0.95rem',
          }}
        >
          <div style={{ marginBottom: 10 }}>
            <p style={{ margin: 0, fontSize: '0.86rem', fontWeight: 800, color: '#1d4ed8' }}>Pre-delivery Checklist</p>
            <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: '#64748b' }}>
              All branches have confirmed each drug handover. Complete the dispensing records below, then lock this prescription.
            </p>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
                Dispensed brand/NDC/pack used <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                value={dispenseBrandPackNote}
                onChange={e => setDispenseBrandPackNote(e.target.value)}
                placeholder="e.g. Amoxicillin 500mg (Brand X), NDC 12345-6789, pack 21 capsules"
                style={{ width: '100%', padding: '0.55rem 0.65rem', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
                Counseling / pickup instruction <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                value={deliveryCounselingNote}
                onChange={e => setDeliveryCounselingNote(e.target.value)}
                placeholder="e.g. Take after food; return in 7 days if symptoms persist"
                style={{ width: '100%', padding: '0.55rem 0.65rem', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
                Cold-chain / storage handling <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                value={deliveryColdChainNote}
                onChange={e => setDeliveryColdChainNote(e.target.value)}
                placeholder="e.g. Maintained at 2-8C, packed with ice gel"
                style={{ width: '100%', padding: '0.55rem 0.65rem', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff' }}
              />
            </div>
            <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: 8 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: '#334155', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={deliveryHasException}
                  onChange={e => setDeliveryHasException(e.target.checked)}
                />
                Exception occurred during dispensing
              </label>
              {deliveryHasException && (
                <input
                  value={deliveryExceptionNote}
                  onChange={e => setDeliveryExceptionNote(e.target.value)}
                  placeholder="Dispense exception detail (required when exception is checked)"
                  style={{ width: '100%', marginTop: 8, padding: '0.55rem 0.65rem', borderRadius: 8, border: '1px solid #fda4af', background: '#fff1f2' }}
                />
              )}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              className="doctor-btn doctor-btn-primary"
              disabled={
                saving ||
                !(dispenseBrandPackNote || '').trim() ||
                !(deliveryCounselingNote || '').trim() ||
                !(deliveryColdChainNote || '').trim() ||
                (deliveryHasException && !(deliveryExceptionNote || '').trim())
              }
              onClick={finalizeDelivery}
            >
              {saving ? 'Saving…' : 'Complete & lock prescription'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
