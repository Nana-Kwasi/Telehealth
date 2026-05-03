import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut, updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../Auth/firebaseConfig';

/**
 * Blocks dashboard until user replaces temp password. Clears mustChangePassword on the Firestore entity doc.
 */
export default function ForcedPasswordChangeOverlay({ profile, firestoreCollection, entityDocId }) {
  const navigate = useNavigate();
  const [mustChange, setMustChange] = useState(profile?.mustChangePassword === true);
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    setMustChange(profile?.mustChangePassword === true);
  }, [profile?.mustChangePassword]);

  const docId = entityDocId || profile?.id;

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (_) {}
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    if (newPw.length < 8) {
      setPwError('Password must be at least 8 characters.');
      return;
    }
    if (newPw !== confirmPw) {
      setPwError('Passwords do not match.');
      return;
    }
    if (!docId || !firestoreCollection) {
      setPwError('Configuration error. Please contact support.');
      return;
    }

    setPwSaving(true);
    try {
      const user = auth.currentUser;
      await updatePassword(user, newPw);
      await updateDoc(doc(db, firestoreCollection, docId), { mustChangePassword: false });
      setMustChange(false);
    } catch (err) {
      if (err.code === 'auth/requires-recent-login') {
        setPwError('Please log out, sign in with your temporary password once more, then try again.');
      } else {
        setPwError('Failed to update password. Please try again.');
      }
      console.error('ForcedPasswordChangeOverlay:', err);
    } finally {
      setPwSaving(false);
    }
  };

  if (!mustChange) return null;

  return (
    <div className="force-pw-overlay">
      <div className="force-pw-card">
        <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔐</div>
        <h2 className="force-pw-title">Password Reset Required</h2>
        <p className="force-pw-sub">
          Your account was created with a temporary password. You must set a new password before accessing your dashboard.
        </p>

        {pwError ? (
          <div style={{
            background: '#fff1f2',
            border: '1px solid #fecdd3',
            borderRadius: 8,
            padding: '0.65rem 0.875rem',
            color: '#be123c',
            fontSize: '0.83rem',
            marginBottom: '1rem',
          }}>
            🚨 {pwError}
          </div>
        ) : null}

        <form onSubmit={handleChangePassword}>
          {[
            { label: 'New Password', key: 'new', val: newPw, set: setNewPw },
            { label: 'Confirm New Password', key: 'confirm', val: confirmPw, set: setConfirmPw },
          ].map((f) => (
            <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: '0.875rem' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151' }}>{f.label}</label>
              <input
                type="password"
                value={f.val}
                onChange={(e) => f.set(e.target.value)}
                required
                style={{
                  padding: '0.6rem 0.875rem',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  fontSize: '0.875rem',
                  outline: 'none',
                }}
              />
            </div>
          ))}
          <button
            type="submit"
            disabled={pwSaving}
            style={{
              width: '100%',
              padding: '0.7rem',
              borderRadius: 8,
              background: '#0c4a6e',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              cursor: pwSaving ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
              marginTop: '0.25rem',
              opacity: pwSaving ? 0.7 : 1,
            }}
          >
            {pwSaving ? 'Saving…' : 'Set New Password & Continue'}
          </button>
        </form>

        <button
          type="button"
          onClick={handleLogout}
          style={{
            width: '100%',
            marginTop: '0.75rem',
            padding: '0.55rem',
            borderRadius: 8,
            background: 'none',
            border: '1px solid #e2e8f0',
            cursor: 'pointer',
            fontSize: '0.83rem',
            color: '#64748b',
            fontWeight: 600,
          }}
        >
          Log Out
        </button>
      </div>
    </div>
  );
}
