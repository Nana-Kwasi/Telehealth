import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { COUPLE_STORAGE_KEYS } from '../../utils/coupleTherapyConfig';
import { fetchCoupleByInviteToken } from '../../services/coupleTherapyService';
import { api } from '../../services/apiClient';
import { beginTherapySession } from '../../utils/patientSessionIntent';
import './CoupleTherapyIntake.css';

export default function CoupleInviteEntry() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialToken = searchParams.get('token') || '';
  const [token, setToken] = useState(initialToken);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const openWelcome = async (inviteToken) => {
    const trimmed = (inviteToken || '').trim();
    if (!trimmed) {
      setError('Enter your invitation code or open the link from your email.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      // A code can be one of two things, and partner B cannot tell them apart:
      // a DRAFT token (new flow — no accounts exist yet) or a legacy invite
      // against a real couple record. Try the draft first, because that is what
      // every new invitation now is, and fall back for couples still mid-flight
      // from before the change.
      let draft = null;
      try {
        draft = await api(`/api/v1/couples/drafts?token=${encodeURIComponent(trimmed)}`, {
          authenticated: false,
        });
      } catch (_) {
        draft = null;
      }

      if (draft && draft.draftId) {
        localStorage.setItem(COUPLE_STORAGE_KEYS.partnerRole, 'partnerB');
        localStorage.setItem(COUPLE_STORAGE_KEYS.inviteToken, trimmed);
        // No coupleId on purpose — there is no couple record yet, and setting
        // one would make the welcome page take the old register-now branch.
        navigate('/couple/welcome', {
          replace: true,
          state: {
            draftToken: trimmed,
            token: trimmed,
            partnerAName: draft.invitedByName,
            partnerBEmail: draft.partnerBEmail,
            partnerBName: draft.partnerBName,
          },
        });
        return;
      }

      const invite = await fetchCoupleByInviteToken(trimmed);
      localStorage.setItem(COUPLE_STORAGE_KEYS.coupleId, invite.coupleId);
      localStorage.setItem(COUPLE_STORAGE_KEYS.partnerRole, 'partnerB');
      localStorage.setItem(COUPLE_STORAGE_KEYS.inviteToken, trimmed);

      navigate('/couple/welcome', {
        replace: true,
        state: {
          coupleId: invite.coupleId,
          token: trimmed,
          partnerAName: invite.partnerAName,
          partnerBEmail: invite.partnerBEmail,
          partnerBName: invite.partnerBName,
        },
      });
    } catch (e) {
      setError(e.message || 'This link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    beginTherapySession('couples');
    if (initialToken) openWelcome(initialToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="teen-intake-page">
      <header className="teen-intake-header">
        <h1>Partner invitation</h1>
        <p>Open the link from your email or paste your invitation code.</p>
      </header>

      <section className="couple-form-card">
        <div className="teen-intake-field">
          <label className="teen-intake-label" htmlFor="couple-invite-token">
            Invitation code
          </label>
          <input
            id="couple-invite-token"
            className="teen-intake-input"
            placeholder="Paste code from email"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>
      </section>

      {error ? <p className="teen-intake-error">{error}</p> : null}

      <button type="button" className="teen-intake-submit" onClick={() => openWelcome(token)} disabled={loading}>
        {loading ? 'Verifying…' : 'Continue'}
      </button>

      <p style={{ marginTop: '1.25rem', fontSize: '0.85rem', color: '#6b7280', textAlign: 'center' }}>
        <Link to="/">← Back to home</Link>
      </p>
    </div>
  );
}
