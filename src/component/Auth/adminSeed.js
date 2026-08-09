import { auth, db } from '../../services/firestoreShim';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from '../../services/authShim';
import { doc, setDoc, getDoc } from '../../services/firestoreShim';

// Creates Vanessa (admin) if not present. Use cautiously; call once from an admin-only control.
export async function ensureVanessaAdmin() {
  const uidDoc = doc(db, 'therapists_admin_index', 'nessa1');
  const exists = await getDoc(uidDoc);
  if (exists.exists()) return true;

  // Try to sign up or sign in Vanessa
  const email = 'franciskontoh4@gmail.com';
  const password = 'nessa@30';
  let user;
  try {
    user = (await createUserWithEmailAndPassword(auth, email, password)).user;
  } catch (e) {
    user = (await signInWithEmailAndPassword(auth, email, password)).user;
  }

  const therapist = {
    uid: user.uid,
    name: 'Vanessa',
    username: 'nessa1',
    email,
    role: 'admin',
    type: 'Administrator',
    createdAt: new Date().toISOString()
  };
  await setDoc(doc(db, 'therapists', user.uid), therapist);
  await setDoc(uidDoc, { uid: user.uid });
  return true;
}


