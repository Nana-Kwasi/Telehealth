import React, { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { auth } from '../../../services/firestoreShim';
import { uploadNursePhoto } from '../../../services/homeCareService';
import { useHomeCareNurse } from './HomeCareNurseContext';
import NurseAvatar from './NurseAvatar';

export default function NursePhotoPicker({
  nurse,
  size = 56,
  className = '',
  label = 'Tap to change photo',
}) {
  const { profile, nurse: ctxNurse, setNurse } = useHomeCareNurse();
  const display = nurse || ctxNurse;
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const nurseId = auth.currentUser?.uid || profile?.id;
    if (!nurseId) {
      window.alert('You must be signed in to upload a photo.');
      return;
    }
    setUploading(true);
    try {
      const photoURL = await uploadNursePhoto(nurseId, file, file.type || 'image/jpeg');
      setNurse((prev) => ({ ...(prev || display || {}), photoURL }));
    } catch (err) {
      const msg = err?.message || 'Upload failed.';
      window.alert(
        msg.includes('storage/unauthorized')
          ? 'Photo upload is blocked by storage rules. Ask your admin to run: firebase deploy --only storage'
          : msg
      );
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <button
      type="button"
      className={`hcn-photo-picker ${className}`.trim()}
      onClick={() => !uploading && fileRef.current?.click()}
      disabled={uploading}
      title={label}
      aria-label={label}
    >
      <NurseAvatar nurse={display} size={size} className="hcn-avatar-lg" />
      <span className="hcn-photo-picker-badge" aria-hidden>
        {uploading ? '…' : <Camera size={14} />}
      </span>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} />
    </button>
  );
}
