import { doc, setDoc, getDoc } from './firestoreShim';
import { auth, db, functions, httpsCallable } from './firestoreShim';
import { COUPLE_STATUSES, COUPLE_STORAGE_KEYS } from '../utils/coupleTherapyConfig';
import { sectionsForPartner } from '../utils/coupleIntakeSections';
import { validateAdultDateOfBirth } from '../utils/therapyAgeValidation';

export function partnerDocRef(coupleId, partnerKey) {
  return doc(db, 'couples', coupleId, 'private', partnerKey);
}

export function coupleDocRef(coupleId) {
  return doc(db, 'couples', coupleId);
}

export async function createCoupleRegistration(payload) {
  const fn = httpsCallable(functions, 'createCoupleRegistration');
  const { data } = await fn(payload);
  return data;
}

export async function linkCouplePartnerAccount(coupleId, partnerKey, { clientId, name }) {
  const fn = httpsCallable(functions, 'linkCouplePartnerAccount');
  const { data } = await fn({ coupleId, partnerKey, clientId, name });
  return data;
}

export async function fetchCoupleByInviteToken(token) {
  const fn = httpsCallable(functions, 'getCoupleInviteByToken');
  const { data } = await fn({ token });
  return data;
}

export async function sendPartnerBInvitation(coupleId) {
  const fn = httpsCallable(functions, 'sendCouplePartnerInvitation');
  const { data } = await fn({ coupleId });
  return data;
}

export async function loadCouple(coupleId) {
  const snap = await getDoc(coupleDocRef(coupleId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function loadPartnerPrivate(coupleId, partnerKey) {
  const snap = await getDoc(partnerDocRef(coupleId, partnerKey));
  if (!snap.exists()) return {};
  return snap.data();
}

function coupleDraftKey(coupleId, partnerKey) {
  return `th.coupleDraft_${coupleId}_${partnerKey}`;
}

export function loadLocalCoupleDraft(coupleId, partnerKey) {
  try {
    const raw = localStorage.getItem(coupleDraftKey(coupleId, partnerKey));
    return raw ? JSON.parse(raw) : { sections: {} };
  } catch {
    return { sections: {} };
  }
}

export async function loadSectionData(coupleId, partnerKey, section) {
  let fromServer = {};
  try {
    const privateData = await loadPartnerPrivate(coupleId, partnerKey);
    fromServer = privateData.sections?.[section.id] || {};
  } catch {
    /* private read may fail until linked */
  }
  const draft = loadLocalCoupleDraft(coupleId, partnerKey);
  const fromDraft = draft.sections?.[section.id] || {};
  return { ...fromServer, ...fromDraft };
}

/** Pull Firestore sections into local draft so resume works across devices. */
export async function syncLocalCoupleDraftFromServer(coupleId, partnerKey) {
  try {
    const priv = await loadPartnerPrivate(coupleId, partnerKey);
    if (!priv?.sections || Object.keys(priv.sections).length === 0) return;
    const draft = loadLocalCoupleDraft(coupleId, partnerKey);
    draft.sections = { ...(draft.sections || {}), ...priv.sections };
    localStorage.setItem(coupleDraftKey(coupleId, partnerKey), JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

/** Prefill personal section from registration (name/email already collected earlier). */
export async function enrichCoupleIntakePersonalSection(coupleId, partnerKey, form = {}) {
  const merged = { ...form };
  const user = auth.currentUser;

  if (!merged.fullName?.trim()) {
    const storedName =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(COUPLE_STORAGE_KEYS.myPartnerName)
        : '';
    let profileName = '';
    if (typeof localStorage !== 'undefined') {
      try {
        const profileStr = localStorage.getItem('userProfile');
        if (profileStr) {
          const p = JSON.parse(profileStr);
          profileName = (p.name || p.displayName || p.clientName || '').trim();
        }
      } catch {
        /* ignore */
      }
    }
    const userName =
      typeof localStorage !== 'undefined' ? localStorage.getItem('userName') || '' : '';

    let coupleName = '';
    if (coupleId) {
      try {
        const couple = await loadCouple(coupleId);
        coupleName = (couple?.[partnerKey]?.name || '').trim();
      } catch {
        /* ignore */
      }
    }

    let authName = '';
    if (user?.uid) {
      try {
        const snap = await getDoc(doc(db, 'auth', user.uid));
        if (snap.exists()) {
          const d = snap.data();
          authName = (d.name || d.displayName || d.clientName || '').trim();
        }
      } catch {
        /* ignore */
      }
    }

    merged.fullName =
      storedName?.trim() ||
      profileName ||
      userName.trim() ||
      authName ||
      (user?.displayName || '').trim() ||
      coupleName ||
      '';
  }

  if (!merged.email?.trim()) {
    merged.email =
      user?.email?.trim() ||
      (typeof localStorage !== 'undefined'
        ? localStorage.getItem(COUPLE_STORAGE_KEYS.myRegistrationEmail) || ''
        : '');
  }

  if (merged.dateOfBirth) {
    merged.age = calculateAgeFromDob(merged.dateOfBirth);
  }
  return merged;
}

export async function savePartnerSection(coupleId, partnerKey, sectionId, sectionData) {
  const draft = loadLocalCoupleDraft(coupleId, partnerKey);
  draft.sections[sectionId] = sectionData;
  localStorage.setItem(coupleDraftKey(coupleId, partnerKey), JSON.stringify(draft));

  try {
    const fn = httpsCallable(functions, 'saveCouplePartnerIntake');
    await fn({ coupleId, partnerKey, sectionId, sectionData });
  } catch (e) {
    console.warn('saveCouplePartnerIntake:', e?.message);
  }
}

export async function markPartnerIntakeComplete(coupleId, partnerKey) {
  const draft = loadLocalCoupleDraft(coupleId, partnerKey);
  const fn = httpsCallable(functions, 'completeCouplePartnerIntake');
  const { data } = await fn({ coupleId, partnerKey, sections: draft.sections });
  localStorage.removeItem(coupleDraftKey(coupleId, partnerKey));
  return data;
}

export function isTherapistSelectionUnlocked(couple) {
  if (!couple) return false;
  return (
    couple.therapistSelectionUnlocked === true ||
    couple.status === COUPLE_STATUSES.READY_FOR_THERAPIST ||
    couple.status === COUPLE_STATUSES.THERAPIST_PENDING_CONFIRM ||
    couple.status === COUPLE_STATUSES.THERAPIST_SELECTED
  );
}

export function isPaymentAllowed(couple) {
  return isTherapistSelectionUnlocked(couple) && !couple?.paymentComplete;
}

export function canBrowseTherapists(couple) {
  return isTherapistSelectionUnlocked(couple) && couple?.paymentComplete === true;
}

export async function linkCouplePartnerAuth(coupleId, partnerKey, { authUid, clientId, name }) {
  await linkCouplePartnerAccount(coupleId, partnerKey, {
    clientId: clientId || authUid,
    name,
  });
}

export function clearCoupleLocalSession() {
  if (typeof localStorage === 'undefined') return;
  Object.values(COUPLE_STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
}

async function callClaimCoupleSession(coupleIdHint, claimAs) {
  const fn = httpsCallable(functions, 'claimCoupleSession');
  const { data } = await fn({ coupleId: coupleIdHint || undefined, claimAs });
  return data;
}

/** Wait until Firebase Auth has restored the session (avoids false "not signed in" on page load). */
export function waitForAuthUser(timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }
    const timer = setTimeout(() => {
      unsub();
      reject(new Error('Auth session not ready'));
    }, timeoutMs);
    const unsub = auth.onAuthStateChanged((user) => {
      if (user) {
        clearTimeout(timer);
        unsub();
        resolve(user);
      }
    });
  });
}

export async function getAuthCoupleHints() {
  try {
    const user = auth.currentUser || (await waitForAuthUser());
    const snap = await getDoc(doc(db, 'auth', user.uid));
    if (!snap.exists()) return {};
    const d = snap.data();
    return {
      coupleId: d.coupleId || null,
      partnerRole: d.couplePartnerRole === 'partnerB' ? 'partnerB' : 'partnerA',
    };
  } catch {
    return {};
  }
}

function applyClaimToLocalStorage(data) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(COUPLE_STORAGE_KEYS.coupleId, data.coupleId);
  localStorage.setItem(COUPLE_STORAGE_KEYS.partnerRole, data.partnerRole);
  if (data.registeredEmail) {
    localStorage.setItem(COUPLE_STORAGE_KEYS.myRegistrationEmail, data.registeredEmail);
  }
  if (data.otherPartnerName) {
    localStorage.setItem(COUPLE_STORAGE_KEYS.otherPartnerName, data.otherPartnerName);
  }
  if (data.coupleId && data.partnerRole) {
    loadCouple(data.coupleId)
      .then((couple) => {
        const name = (couple?.[data.partnerRole]?.name || '').trim();
        if (name) localStorage.setItem(COUPLE_STORAGE_KEYS.myPartnerName, name);
      })
      .catch(() => {});
  }
  if (data.intakeComplete) {
    localStorage.setItem(COUPLE_STORAGE_KEYS.myIntakeComplete, 'true');
  } else {
    localStorage.removeItem(COUPLE_STORAGE_KEYS.myIntakeComplete);
  }
}

/**
 * Links the signed-in user to the correct couple (by email), syncs auth profile + localStorage.
 * @returns {Promise<{ok:boolean, coupleId?:string, partnerRole?:string, reason?:string, message?:string}>}
 */
export async function ensureCoupleSession(coupleIdHint, options = {}) {
  let user;
  try {
    user = auth.currentUser || (await waitForAuthUser());
  } catch {
    return { ok: false, reason: 'not_signed_in', message: 'Please sign in first.' };
  }

  const claimAs =
    options.claimAs === 'partnerB'
      ? 'partnerB'
      : options.claimAs === 'partnerA'
        ? 'partnerA'
        : partnerClaimKey();
  try {
    let data = await callClaimCoupleSession(coupleIdHint, claimAs);

    if (!data?.linked && data?.reason === 'email_mismatch') {
      clearCoupleLocalSession();
      data = await callClaimCoupleSession(undefined, claimAs);
    }

    if (!data?.linked && data?.reason === 'link_failed') {
      const hints = await getAuthCoupleHints();
      const repairCoupleId = coupleIdHint || hints.coupleId;
      if (repairCoupleId) {
        try {
          await linkCouplePartnerAccount(repairCoupleId, claimAs, { clientId: user.uid });
          data = await callClaimCoupleSession(repairCoupleId, claimAs);
        } catch (repairErr) {
          console.warn('ensureCoupleSession link repair:', repairErr?.message);
        }
      }
    }

    if (!data?.linked) {
      if (
        coupleIdHint &&
        (data?.reason === 'email_mismatch' ||
          data?.reason === 'no_couple_for_email' ||
          data?.reason === 'link_failed')
      ) {
        clearCoupleLocalSession();
      }
      if (data?.reason === 'no_couple_for_email') {
        return {
          ok: false,
          reason: data.reason,
          message:
            'No couple registration found for this email. Use the same email you entered when starting couple therapy, or begin registration again.',
        };
      }
      if (data?.reason === 'email_mismatch') {
        return {
          ok: false,
          reason: data.reason,
          message: `This couple was registered with different emails (Partner A: ${data.partnerAEmail || '—'}, Partner B: ${data.partnerBEmail || '—'}). You are signed in as ${data.signedInEmail || user.email}.`,
        };
      }
      if (data?.reason === 'link_failed') {
        return {
          ok: false,
          reason: data.reason,
          message:
            'We found your couple registration but could not attach it to this login. Sign out, then sign in with the same email you used when you started couple therapy.',
        };
      }
      return { ok: false, reason: data.reason, message: 'Could not link your couple account.' };
    }

    applyClaimToLocalStorage(data);

    return {
      ok: true,
      coupleId: data.coupleId,
      partnerRole: data.partnerRole,
      intakeComplete: !!data.intakeComplete,
      inviteUrl: data.inviteUrl,
      partnerAIntakeComplete: data.partnerAIntakeComplete,
      partnerBIntakeComplete: data.partnerBIntakeComplete,
      therapistSelectionUnlocked: data.therapistSelectionUnlocked,
      paymentComplete: data.paymentComplete,
      therapistId: data.therapistId || null,
    };
  } catch (e) {
    return { ok: false, reason: 'error', message: mapCoupleCallableError(e) };
  }
}

/** @deprecated use ensureCoupleSession */
export async function ensureCouplePartnerLinked(coupleId, partnerKey) {
  const claimAs = partnerKey === 'partnerB' ? 'partnerB' : 'partnerA';
  return ensureCoupleSession(coupleId, { claimAs });
}

function partnerClaimKey() {
  const role =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(COUPLE_STORAGE_KEYS.partnerRole)
      : null;
  return role === 'partnerB' ? 'partnerB' : 'partnerA';
}

export function isCoupleIntakeDoneLocally() {
  return (
    typeof localStorage !== 'undefined' &&
    localStorage.getItem(COUPLE_STORAGE_KEYS.myIntakeComplete) === 'true'
  );
}

/** Account route from onboarding: individual | teen | couples (not therapyTypes array). */
export function profileHasCoupleMarkers(profile) {
  // Any one of these is sufficient evidence. Relying on therapyType alone meant a
  // profile that merely omitted it (which resolve-role used to do for every
  // account) was read as "not a couple account", and the caller wiped the stored
  // couple session on every session resolve.
  return (
    profile?.therapyType === 'couples' ||
    !!profile?.coupleId ||
    !!profile?.couplePartnerRole ||
    profile?.metadata?.therapyType === 'couples' ||
    !!profile?.metadata?.coupleId
  );
}

export function isCoupleTherapyAccount(profile) {
  return profileHasCoupleMarkers(profile);
}

/** Restore couple session keys from auth profile (e.g. after refresh). */
export function syncCoupleSessionFromProfile(profile) {
  if (!profile || typeof localStorage === 'undefined') return;
  if (!profileHasCoupleMarkers(profile)) {
    clearCoupleLocalSession();
    return;
  }
  if (profile.coupleId) {
    localStorage.setItem(COUPLE_STORAGE_KEYS.coupleId, profile.coupleId);
  }
  if (profile.couplePartnerRole) {
    localStorage.setItem(COUPLE_STORAGE_KEYS.partnerRole, profile.couplePartnerRole);
  }
  const regName = (profile.name || profile.displayName || profile.clientName || '').trim();
  if (regName) localStorage.setItem(COUPLE_STORAGE_KEYS.myPartnerName, regName);
  if (profile.coupleIntakeComplete === true) {
    localStorage.setItem(COUPLE_STORAGE_KEYS.myIntakeComplete, 'true');
  }
}

export function mapCoupleCallableError(err) {
  const code = err?.code || '';
  const msg = err?.message || String(err);
  if (code === 'functions/internal' || msg === 'internal') {
    return 'Could not load couple status from the server. Please retry — your intake progress is still saved locally.';
  }
  if (/permission|insufficient|not linked|not a couple/i.test(msg)) {
    return 'Could not verify your couple account. Sign out, sign in with the email you used when starting couple registration, then retry.';
  }
  return msg;
}

/** Waiting-page snapshot from localStorage when API is unavailable. */
export function buildLocalWaitingFallback(coupleId) {
  const partnerName = localStorage.getItem(COUPLE_STORAGE_KEYS.otherPartnerName) || 'your partner';
  const intakeDone = localStorage.getItem(COUPLE_STORAGE_KEYS.myIntakeComplete) === 'true';
  if (!coupleId || !intakeDone) return null;
  return {
    myRole: 'partnerA',
    couple: {
      id: coupleId,
      status: COUPLE_STATUSES.AWAITING_PARTNER_B,
      partnerA: { intakeComplete: true, consentComplete: true },
      partnerB: { intakeComplete: false, name: partnerName },
    },
    otherPartnerName: partnerName,
    waitingForPartner: true,
    inviteUrl: null,
    _localFallback: true,
  };
}

export function isCouplesClient(profile) {
  return profileHasCoupleMarkers(profile);
}

function coupleNavStateFromClaim(data) {
  if (!data || data.partnerAIntakeComplete === undefined) return null;
  return {
    partnerAIntakeComplete: !!data.partnerAIntakeComplete,
    partnerBIntakeComplete: !!data.partnerBIntakeComplete,
    therapistSelectionUnlocked: !!data.therapistSelectionUnlocked,
    paymentComplete: !!data.paymentComplete,
    therapistId: data.therapistId || null,
  };
}

/** Where a couple partner should go in the onboarding funnel (intake → waiting → payment → match). */
export function resolveCoupleFunnelPath(coupleId, partnerKey, navState) {
  const partnerRole = partnerKey === 'partnerB' ? 'partnerB' : 'partnerA';
  const state = { coupleId, partnerRole };
  const myDone =
    partnerKey === 'partnerA' ? navState.partnerAIntakeComplete : navState.partnerBIntakeComplete;

  if (!myDone) {
    return { path: '/couple/intake', state };
  }
  if (!navState.partnerAIntakeComplete || !navState.partnerBIntakeComplete) {
    if (partnerKey === 'partnerA') return { path: '/couple/waiting', state };
    return { path: '/couple/dashboard', state };
  }
  if (!navState.therapistSelectionUnlocked) {
    return { path: '/couple/dashboard', state };
  }
  if (!navState.paymentComplete) {
    return { path: '/payment', state: { ...state, therapyType: 'couples' } };
  }
  if (navState.therapistId) {
    return { path: '/dashboard' };
  }
  return { path: '/match-therapist', state: { coupleId, therapyType: 'couples' } };
}

/**
 * After login / session restore: resume couple onboarding or return null (not a couple client).
 * @returns {Promise<{path:string, state?:object}|null>}
 */
export async function resolveCoupleLandingPath(profile) {
  if (!profileHasCoupleMarkers(profile)) {
    clearCoupleLocalSession();
    return null;
  }

  syncCoupleSessionFromProfile(profile);
  const hint =
    profile?.coupleId ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem(COUPLE_STORAGE_KEYS.coupleId) : null);

  const session = await ensureCoupleSession(hint || undefined);
  if (!session.ok) {
    if (session.reason === 'no_couple_for_email' || session.reason === 'email_mismatch') {
      clearCoupleLocalSession();
    }
    if (!profileHasCoupleMarkers(profile) && !hint && session.reason === 'no_couple_for_email') return null;
    const coupleId = hint || profile?.coupleId;
    if (coupleId) {
      return {
        path: '/couple/intake',
        state: {
          coupleId,
          partnerRole: profile?.couplePartnerRole === 'partnerB' ? 'partnerB' : 'partnerA',
        },
      };
    }
    if (session.reason === 'no_couple_for_email') return null;
    return { path: '/couple/initiation' };
  }

  const coupleId = session.coupleId;
  const partnerKey =
    session.partnerRole === 'partnerB' ? 'partnerB' : session.partnerRole === 'partnerA' ? 'partnerA' : 'partnerA';

  const navFromClaim = coupleNavStateFromClaim(session);
  if (navFromClaim) {
    return resolveCoupleFunnelPath(coupleId, partnerKey, navFromClaim);
  }

  if (!session.intakeComplete && !isCoupleIntakeDoneLocally()) {
    return { path: '/couple/intake', state: { coupleId, partnerRole: partnerKey } };
  }

  try {
    const navState = await resolveCoupleNavState(coupleId);
    return resolveCoupleFunnelPath(coupleId, partnerKey, navState);
  } catch {
    return { path: '/couple/dashboard', state: { coupleId, partnerRole: partnerKey } };
  }
}

async function resolveCoupleNavState(coupleId, completionResult) {
  if (completionResult?.partnerAIntakeComplete != null) {
    return {
      partnerAIntakeComplete: completionResult.partnerAIntakeComplete,
      partnerBIntakeComplete: completionResult.partnerBIntakeComplete,
      therapistSelectionUnlocked: completionResult.therapistSelectionUnlocked,
      paymentComplete: completionResult.paymentComplete,
      therapistId: completionResult.therapistId,
    };
  }

  const session = await ensureCoupleSession(coupleId);
  const navFromClaim = coupleNavStateFromClaim(session);
  if (navFromClaim) return navFromClaim;

  try {
    const dash = await fetchCoupleDashboard(coupleId, { skipEnsure: true });
    const c = dash.couple;
    return {
      partnerAIntakeComplete: !!c.partnerA?.intakeComplete,
      partnerBIntakeComplete: !!c.partnerB?.intakeComplete,
      therapistSelectionUnlocked: !!c.therapistSelectionUnlocked,
      paymentComplete: !!c.paymentComplete,
      therapistId: c.therapistId || null,
    };
  } catch {
    const couple = await loadCouple(coupleId);
    if (!couple) throw new Error('Could not load couple status.');
    return {
      partnerAIntakeComplete: !!couple.partnerA?.intakeComplete,
      partnerBIntakeComplete: !!couple.partnerB?.intakeComplete,
      therapistSelectionUnlocked: isTherapistSelectionUnlocked(couple),
      paymentComplete: !!couple.paymentComplete,
      therapistId: couple.therapistId || null,
    };
  }
}

export async function getCoupleMatchedTherapists(coupleId) {
  const fn = httpsCallable(functions, 'getCoupleMatchedTherapists');
  const { data } = await fn({ coupleId });
  return data;
}

export async function proposeCoupleTherapist(coupleId, therapistId, therapistName) {
  const fn = httpsCallable(functions, 'proposeCoupleTherapist');
  const { data } = await fn({ coupleId, therapistId, therapistName });
  return data;
}

export async function confirmCoupleTherapist(coupleId, accept = true) {
  const fn = httpsCallable(functions, 'confirmCoupleTherapist');
  const { data } = await fn({ coupleId, accept });
  return data;
}

/** Marks the couple paid — the server checks the Paystack reference before it does. */
export async function markCouplePaymentComplete(coupleId, plan, paymentReference) {
  const fn = httpsCallable(functions, 'markCouplePaymentComplete');
  const { data } = await fn({ coupleId, plan, paymentReference });
  return data;
}

export async function getCoupleDashboard(coupleId, claimAs) {
  const fn = httpsCallable(functions, 'getCoupleDashboard');
  const role = claimAs || partnerClaimKey();
  const { data } = await fn({ coupleId, claimAs: role });
  return data;
}

/** Minimal dashboard when callable fails but claimCoupleSession already linked the user. */
function buildDashboardFromSession(session, coupleId) {
  const myRole = session.partnerRole === 'partnerB' ? 'partnerB' : 'partnerA';
  const otherName =
    session.otherPartnerName ||
    (typeof localStorage !== 'undefined'
      ? localStorage.getItem(COUPLE_STORAGE_KEYS.otherPartnerName)
      : null) ||
    'your partner';
  const mineDone = !!session.intakeComplete;
  return {
    couple: {
      id: coupleId,
      status: COUPLE_STATUSES.AWAITING_PARTNER_B,
      therapistSelectionUnlocked: false,
      paymentComplete: false,
      partnerA: {
        name: myRole === 'partnerA' ? '' : otherName,
        intakeComplete: myRole === 'partnerA' ? mineDone : false,
        consentComplete: myRole === 'partnerA' ? mineDone : false,
      },
      partnerB: {
        name: myRole === 'partnerB' ? '' : otherName,
        intakeComplete: myRole === 'partnerB' ? mineDone : false,
        consentComplete: myRole === 'partnerB' ? mineDone : false,
      },
    },
    myRole,
    otherPartnerName: otherName,
    waitingForPartner: true,
    inviteUrl: session.inviteUrl || null,
    _sessionFallback: true,
  };
}

function buildDashboardFromCoupleDoc(couple) {
  const uid = auth.currentUser?.uid;
  const isA = couple.partnerA?.authUid === uid;
  const isB = couple.partnerB?.authUid === uid;
  if (!isA && !isB) {
    throw new Error('Your account is not linked to this couple registration yet.');
  }
  const partnerKey = isA ? 'partnerA' : 'partnerB';
  const otherKey = isA ? 'partnerB' : 'partnerA';
  return {
    couple: {
      id: couple.id,
      status: couple.status,
      relationshipType: couple.relationshipType,
      therapistSelectionUnlocked: couple.therapistSelectionUnlocked,
      paymentComplete: couple.paymentComplete,
      therapistId: couple.therapistId,
      therapistName: couple.therapistName,
      therapistProposal: couple.therapistProposal,
      partnerA: {
        name: couple.partnerA?.name,
        intakeComplete: couple.partnerA?.intakeComplete,
        consentComplete: couple.partnerA?.consentComplete,
      },
      partnerB: {
        name: couple.partnerB?.name,
        intakeComplete: couple.partnerB?.intakeComplete,
        consentComplete: couple.partnerB?.consentComplete,
      },
    },
    myRole: partnerKey,
    otherPartnerName: couple[otherKey]?.name,
    waitingForPartner: !couple[otherKey]?.intakeComplete,
    inviteUrl: couple.partnerB?.inviteUrl || null,
  };
}

/** Callable first; optional Firestore read only when already linked. */
export async function fetchCoupleDashboard(coupleId, { skipEnsure = false } = {}) {
  const session = skipEnsure ? { ok: true, coupleId, partnerRole: partnerClaimKey() } : await ensureCoupleSession(coupleId);
  const activeId = session.coupleId || coupleId;
  if (!session.ok) {
    const fallback = buildLocalWaitingFallback(activeId);
    if (fallback) return fallback;
    throw new Error(session.message || 'Could not verify couple account.');
  }
  const claimAs = session.partnerRole || partnerClaimKey();

  try {
    return await getCoupleDashboard(activeId, claimAs);
  } catch (callableErr) {
    try {
      const couple = await loadCouple(activeId);
      if (couple) return buildDashboardFromCoupleDoc(couple);
    } catch {
      // ignore Firestore permission errors
    }
    const fallback = buildLocalWaitingFallback(activeId);
    if (fallback) return fallback;
    if (session.ok) {
      return buildDashboardFromSession(session, activeId);
    }
    throw new Error(mapCoupleCallableError(callableErr));
  }
}

export function isSectionDataComplete(section, data) {
  if (!data || typeof data !== 'object') return false;
  return Object.keys(validateSection(section, data)).length === 0;
}

/** First section that is not fully saved (resume intake). Uses validation, not just non-empty objects. */
export async function findResumeSectionIndex(coupleId, partnerKey, sections) {
  const draft = loadLocalCoupleDraft(coupleId, partnerKey);
  let saved = { ...(draft.sections || {}) };
  try {
    const priv = await loadPartnerPrivate(coupleId, partnerKey);
    saved = { ...saved, ...(priv.sections || {}) };
  } catch {
    // private read may fail until linked
  }
  for (let i = 0; i < sections.length; i++) {
    if (!isSectionDataComplete(sections[i], saved[sections[i].id] || {})) {
      return i;
    }
  }
  return Math.max(0, sections.length - 1);
}

export function isMyCoupleIntakeComplete(dashboardData) {
  if (!dashboardData?.couple || !dashboardData?.myRole) return false;
  const p = dashboardData.couple[dashboardData.myRole];
  return p?.intakeComplete === true && p?.consentComplete === true;
}

export function calculateAgeFromDob(dob) {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(String(dob).trim())) return '';
  const today = new Date();
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return '';
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return String(age);
}

export function validateSection(section, form) {
  const errors = {};
  for (const field of section.fields) {
    if (field.readOnly) continue;
    if (field.type === 'consent_check') {
      if (field.required && !form[field.name]) errors[field.name] = 'Required';
      continue;
    }
    if (field.type === 'signature') {
      if (field.required && !String(form[field.name] || '').trim()) errors[field.name] = 'Signature is required';
      continue;
    }

    if (field.name === 'previousCoupleOutcome' && form.previousCoupleCounselling !== 'Yes') {
      continue;
    }
    if (field.name === 'treatmentObjectivesOther') {
      const selected = form.treatmentObjectives || [];
      if (!Array.isArray(selected) || !selected.some((v) => /other/i.test(v))) continue;
    }
    if (field.name === 'infidelityWho' && form.infidelity === 'No') {
      continue;
    }

    if (!field.required) continue;
    const val = form[field.name];
    if (field.type === 'multiselect') {
      if (!Array.isArray(val) || val.length === 0) errors[field.name] = 'Required';
    } else if (field.type === 'scale') {
      if (val === undefined || val === null || val === '') errors[field.name] = 'Required';
    } else if (field.type === 'number') {
      if (val === '' || val === undefined || val === null) errors[field.name] = 'Required';
    } else if (field.type === 'birthdate' || field.type === 'date') {
      if (!String(val || '').trim()) {
        errors[field.name] = 'Required';
      } else if (field.name === 'dateOfBirth') {
        const ageErr = validateAdultDateOfBirth(val, calculateAgeFromDob);
        if (ageErr) errors[field.name] = ageErr;
      }
    } else if (!val && val !== 0) {
      errors[field.name] = 'Required';
    }
  }
  return errors;
}

export async function createPartnerClientRecord(coupleId, partnerKey, partnerEmail, displayName, authUid) {
  if (!authUid) throw new Error('authUid is required to create a client profile');
  const clientId = authUid;
  await setDoc(doc(db, 'clients', clientId), {
    authUid,
    therapyType: 'couples',
    coupleId,
    couplePartnerRole: partnerKey,
    email: partnerEmail,
    displayName,
    clientName: displayName,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
  return clientId;
}

function postIntakeFallbackPath(coupleId, partnerKey) {
  const state = { coupleId, partnerRole: partnerKey };
  if (partnerKey === 'partnerA') return { path: '/couple/waiting', state };
  return { path: '/couple/dashboard', state };
}

export async function navigateAfterCoupleIntake(navigate, coupleId, partnerKey, completionResult) {
  const navState = await resolveCoupleNavState(coupleId, completionResult);
  let landing = resolveCoupleFunnelPath(coupleId, partnerKey, navState);
  if (landing.path === '/couple/intake') {
    const localDone =
      typeof localStorage !== 'undefined' &&
      localStorage.getItem(COUPLE_STORAGE_KEYS.myIntakeComplete) === 'true';
    const serverDone =
      partnerKey === 'partnerA'
        ? completionResult?.partnerAIntakeComplete
        : completionResult?.partnerBIntakeComplete;
    if (localDone || serverDone) {
      landing = postIntakeFallbackPath(coupleId, partnerKey);
    }
  }
  navigate(landing.path, { replace: true, state: landing.state });
}

export { sectionsForPartner };

// ─── Therapist-side couple case ──────────────────────────────────────────────
// The therapist dashboard needs the couples assigned to them and, for one couple,
// the full case (registration + both partners' intake sections).

/** Couples assigned to the signed-in therapist (or the caller's own, for clients). */
export async function listMyCouples() {
  const fn = httpsCallable(functions, 'listMyCouples');
  const { data } = await fn({});
  return Array.isArray(data) ? data : [];
}

/** Full case for one couple — therapist/admin only, server-enforced. */
export async function getCoupleCaseForTherapist(coupleId) {
  const fn = httpsCallable(functions, 'getCoupleCaseForTherapist');
  const { data } = await fn({ coupleId });
  return data;
}
