import React, { useEffect, useState } from 'react';
import { auth, db } from '../../Auth/firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export default function ClientProfile() {
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const u = auth.currentUser;
      if (!u) return;
      const snap = await getDoc(doc(db, 'clients', u.uid));
      if (snap.exists()) setProfile({ id: snap.id, ...snap.data() });
    })();
  }, []);

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    await setDoc(doc(db, 'clients', profile.id), { name: profile.name, preferences: profile.preferences || {} }, { merge: true });
    setSaving(false);
  };

  if (!profile) return <div className="q-card">Loading…</div>;

  return (
    <div>
      <h1 className="page-title">Profile & Settings</h1>
      <div className="q-card">
        <div className="field"><div className="label">Full name</div><input className="input" value={profile.name || ''} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></div>
        <div className="field"><div className="label">Preferred communication</div><input className="input" value={profile.preferences?.communication || ''} onChange={(e) => setProfile({ ...profile, preferences: { ...(profile.preferences || {}), communication: e.target.value } })} /></div>
        <div className="q-actions"><button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></div>
      </div>
    </div>
  );
}


