import { auth } from '../services/firestoreShim';

import { ensureHomeCareIntent } from './homeCarePatientIntent';

export function requireHomeCarePatient(navigate, { returnTo, message } = {}) {
  if (auth.currentUser) return true;
  ensureHomeCareIntent();
  navigate('/home-care/sign-up', {
    state: {
      returnTo: returnTo || '/home-care',
      message: message || 'Create a free account to book home-care nurses.',
    },
  });
  return false;
}
