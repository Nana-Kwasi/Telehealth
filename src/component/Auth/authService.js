import { auth, db } from './firebaseConfig';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { ensureVanessaAdmin } from './adminSeed';

// Sign-in that accepts email OR username
export async function signInWithEmailOrUsername(identifier, password) {
  // If identifier looks like an email, try email sign-in directly first
  const looksLikeEmail = /@/.test(identifier);
  if (looksLikeEmail) {
    try {
      const res = await signInWithEmailAndPassword(auth, identifier, password);
      return await resolveRole(res.user.uid);
    } catch (e) {
      // fallthrough to username scan
    }
  }
  // Search username in both collections
  const userDoc = await findUserByUsernameOrEmail(identifier);
  if (!userDoc) {
    // Seed Vanessa (first admin) on-demand
    if (identifier === 'nessa1' || identifier === 'franciskontoh4@gmail.com') {
      await ensureVanessaAdmin();
      const res = await signInWithEmailAndPassword(auth, 'franciskontoh4@gmail.com', password);
      return await resolveRole(res.user.uid);
    }
    throw new Error('User not found');
  }
  const { email } = userDoc;
  const res = await signInWithEmailAndPassword(auth, email, password);
  return await resolveRole(res.user.uid);
}

export async function resolveRole(uid) {
  console.log('Resolving role for UID:', uid);
  
  // Check therapists collection first
  const therapistRef = doc(db, 'therapists', uid);
  const therapistSnap = await getDoc(therapistRef);
  
  if (therapistSnap.exists()) {
    const therapistData = therapistSnap.data();
    console.log('Found therapist data:', therapistData);
    
    // Check if this is an admin user
    if (therapistData.role === 'admin') {
      return { 
        role: 'therapist', // Admin users get therapist dashboard
        profile: { 
          id: therapistSnap.id, 
          ...therapistData,
          role: 'admin'
        } 
      };
    }
    
    // Regular therapist
    return { 
      role: 'therapist', 
      profile: { 
        id: therapistSnap.id, 
        ...therapistData,
        role: therapistData.role || 'therapist'
      } 
    };
  }
  
  // Check auth collection for clients
  const authRef = doc(db, 'auth', uid);
  const authSnap = await getDoc(authRef);
  
  if (authSnap.exists()) {
    const authData = authSnap.data();
    console.log('Found auth data:', authData);
    return { 
      role: 'client', 
      profile: { 
        id: authSnap.id, 
        ...authData,
        role: 'client'
      } 
    };
  }
  
  console.log('No user data found, returning guest role');
  return { role: 'guest', profile: null };
}

export async function findUserByUsernameOrEmail(identifier) {
  // Check therapists collection first
  const tQ = query(collection(db, 'therapists'), where('username', '==', identifier));
  const tR = await getDocs(tQ);
  if (!tR.empty) return { id: tR.docs[0].id, ...tR.docs[0].data() };
  
  // Check therapists by email
  const tQE = query(collection(db, 'therapists'), where('email', '==', identifier));
  const tRE = await getDocs(tQE);
  if (!tRE.empty) return { id: tRE.docs[0].id, ...tRE.docs[0].data() };
  
  // Check auth collection for clients
  const cQ = query(collection(db, 'auth'), where('username', '==', identifier));
  const cR = await getDocs(cQ);
  if (!cR.empty) return { id: cR.docs[0].id, ...cR.docs[0].data() };
  
  const cQE = query(collection(db, 'auth'), where('email', '==', identifier));
  const cRE = await getDocs(cQE);
  if (!cRE.empty) return { id: cRE.docs[0].id, ...cRE.docs[0].data() };
  
  return null;
}


