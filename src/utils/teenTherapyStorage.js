import { validateTeenDateOfBirth } from './therapyAgeValidation';

const KEYS = {
  parent: 'th.parentInfo',
  child: 'th.childInfo',
  consent: 'th.parentConsent',
  onboard: 'th.onboard',
};

export function clearTeenTherapyDraft() {
  [KEYS.parent, KEYS.child, KEYS.consent].forEach((k) => localStorage.removeItem(k));
}

export function clearTherapySession() {
  ['th.onboard', 'th.subscription', 'th.match', KEYS.parent, KEYS.child, KEYS.consent].forEach((k) =>
    localStorage.removeItem(k),
  );
}

export function loadJson(key, fallback = {}) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function buildTeenOnboardPayload(consent) {
  const parentInfo = loadJson(KEYS.parent);
  const childInfo = loadJson(KEYS.child);
  return {
    therapyType: 'teen',
    isParentRegistration: true,
    parentInfo,
    childInfo,
    parentGuardian: parentInfo,
    consent,
    startedAt: new Date().toISOString(),
  };
}

export function mergeTeenIntoQuestionnaireData(questionnaireData) {
  const onboard = loadJson(KEYS.onboard);
  if (onboard.therapyType !== 'teen') return questionnaireData;

  const parentInfo = onboard.parentInfo || loadJson(KEYS.parent);
  const childInfo = onboard.childInfo || loadJson(KEYS.child);
  const consent = onboard.consent || loadJson(KEYS.consent);

  return {
    ...questionnaireData,
    therapyType: 'teen',
    isParentRegistration: true,
    parentInfo,
    childInfo,
    parentGuardian: parentInfo,
    consent,
    country: questionnaireData.country || parentInfo.country || '',
  };
}

export function buildTeenClientRecord(questionnaireData) {
  const parentInfo = questionnaireData.parentInfo || {};
  const childInfo = questionnaireData.childInfo || {};
  const childName = [childInfo.firstName, childInfo.lastName].filter(Boolean).join(' ').trim() || 'Client';

  return {
    ...questionnaireData,
    therapyType: 'teen',
    isParentRegistration: true,
    parentGuardianId: parentInfo.email || null,
    parentGuardianName: [parentInfo.firstName, parentInfo.lastName].filter(Boolean).join(' ').trim(),
    parentGuardianEmail: parentInfo.email || '',
    parentGuardianPhone: parentInfo.phone || '',
    parentGuardianRelationship: parentInfo.relationship || '',
    firstName: childInfo.firstName || questionnaireData.firstName || '',
    lastName: childInfo.lastName || questionnaireData.lastName || '',
    dateOfBirth: childInfo.dateOfBirth || '',
    childAge: childInfo.age || '',
    childGender: childInfo.gender || '',
    schoolName: childInfo.schoolName || '',
    grade: childInfo.grade || '',
    displayName: childName,
    clientName: childName,
    name: childName,
  };
}

export function calculateAgeFromDob(dob) {
  if (!dob) return '';
  const today = new Date();
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return '';
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
  return String(age);
}

export function validateTeenAge(dob) {
  return validateTeenDateOfBirth(dob, calculateAgeFromDob);
}

export { KEYS as TEEN_STORAGE_KEYS };
