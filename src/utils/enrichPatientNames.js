import { doc, getDoc } from '../services/firestoreShim';
import { db } from '../services/firestoreShim';

/** Resolve generic "Patient" / missing names via `auth/{uid}` */
export async function enrichPatientNames(patMap) {
  const enriched = new Map(patMap);
  const lookups = [];
  for (const [id, patient] of enriched.entries()) {
    if (!patient.name || patient.name === 'Patient') lookups.push(id);
  }
  await Promise.all(
    lookups.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, 'auth', id));
        if (snap.exists()) {
          const d = snap.data();
          const name = d.name || d.displayName || d.fullName || null;
          if (name) {
            const existing = enriched.get(id);
            enriched.set(id, { ...existing, name });
          }
        }
      } catch (_) {}
    })
  );
  return enriched;
}
