import React, { useRef, useState } from 'react';
import { auth } from '../../../services/firestoreShim';
import { uploadNurseDocument, fetchNurseProfile } from '../../../services/homeCareService';
import { useHomeCareNurse } from './HomeCareNurseContext';
import './HomeCareNurseDashboard.css';

export default function HomeCareNurseDocuments({ embedded = false }) {
  const { profile, nurse, setNurse } = useHomeCareNurse();
  const licenseRef = useRef(null);
  const idRef = useRef(null);
  const [uploading, setUploading] = useState(null);

  const upload = async (type, file) => {
    if (!file) return;
    const nurseId = auth.currentUser?.uid || profile?.id;
    setUploading(type);
    try {
      await uploadNurseDocument(nurseId, type, file, file.type || 'image/jpeg');
      const fresh = await fetchNurseProfile(nurseId);
      if (fresh) setNurse(fresh);
    } catch (e) {
      window.alert(e.message || 'Upload failed.');
    } finally {
      setUploading(null);
    }
  };

  const body = (
    <>
      {!embedded ? (
        <p className="hcn-card-meta" style={{ marginBottom: '0.75rem' }}>
          Status: {nurse?.documentsStatus || 'not submitted'}
        </p>
      ) : null}
      <div className="hcn-card">
        <p className="hcn-card-meta">License: {nurse?.licenseVerified ? 'Verified' : 'Pending review'}</p>
        {nurse?.licenseDocUrl ? (
          <p className="hcn-card-meta">
            <a href={nurse.licenseDocUrl} target="_blank" rel="noreferrer">View license document</a>
          </p>
        ) : null}
        <div className="hcn-actions">
          <button type="button" className="hcn-btn" disabled={!!uploading} onClick={() => licenseRef.current?.click()}>
            {uploading === 'license' ? 'Uploading…' : 'Upload license'}
          </button>
          <input ref={licenseRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { upload('license', e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>
      <div className="hcn-card">
        <p className="hcn-card-meta">National ID / Ghana Card</p>
        {nurse?.idDocUrl ? (
          <p className="hcn-card-meta">
            <a href={nurse.idDocUrl} target="_blank" rel="noreferrer">View ID document</a>
          </p>
        ) : null}
        <div className="hcn-actions">
          <button type="button" className="hcn-btn hcn-btn-outline" disabled={!!uploading} onClick={() => idRef.current?.click()}>
            {uploading === 'id' ? 'Uploading…' : 'Upload ID'}
          </button>
          <input ref={idRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { upload('id', e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>
    </>
  );

  if (embedded) return body;

  return (
    <div className="hcn-page">
      <header className="hcn-page-header">
        <h1>Verification documents</h1>
        <p>Status: {nurse?.documentsStatus || 'not submitted'}</p>
      </header>
      {body}
    </div>
  );
}
