import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { COUPLE_STORAGE_KEYS } from '../../utils/coupleTherapyConfig';
import { api } from '../../services/apiClient';
import './CoupleTherapyIntake.css';

/**
 * Partner B accepts a couple invitation.
 *
 * B has no account and does not get one here. They choose a password, which is
 * stored — hashed — on the draft, and go on to their own private intake. Both
 * accounts are created together when partner A pays for the first session.
 *
 * The old path sent B to /signup, which registered them immediately. That left
 * a real account behind whenever a couple did not go through with it, and meant
 * B could end up registered for a service nobody had paid for.
 */
export default function CoupleAccept() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const {
    draftToken,
    partnerBEmail = '',
    partnerBName = '',
    partnerAName = 'Your partner',
  } = state || {};

  const [name, setName] = useState(partnerBName);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!draftToken) {
    return (
      <div className="teen-intake-page">
        <p>
          Invalid invitation. <Link to="/couple/join">Enter your code</Link>
        </p>
      </div>
    );
  }

  const accept = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Please enter your full name.'); return; }
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirm) { setError('Those passwords do not match.'); return; }

    setBusy(true);
    setError('');
    try {
      await api('/api/v1/couples/drafts/accept', {
        method: 'POST',
        authenticated: false,
        body: { token: draftToken, password, name: name.trim() },
      });

      // Local breadcrumbs only — there is still no session, because there is
      // still no account.
      localStorage.setItem(COUPLE_STORAGE_KEYS.inviteToken, draftToken);
      localStorage.setItem(COUPLE_STORAGE_KEYS.partnerRole, 'partnerB');
      localStorage.setItem(COUPLE_STORAGE_KEYS.myPartnerName, name.trim());
      localStorage.setItem(COUPLE_STORAGE_KEYS.otherPartnerName, partnerAName);

      navigate('/couple/intake', {
        state: { draftToken, partnerRole: 'partnerB' },
        replace: true,
      });
    } catch (err) {
      setError(err.message || 'Could not accept the invitation. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="teen-intake-page">
      <span className="couple-invite-badge">Couples therapy</span>

      <header className="teen-intake-header">
        <h1>{partnerAName} invited you</h1>
        <p>
          Choose a password and complete your own private intake. {partnerAName} will never see your
          answers. Your account is created once the first session is paid for.
        </p>
      </header>

      <form onSubmit={accept}>
        <section className="couple-form-card">
          <div className="teen-intake-field">
            <label className="teen-intake-label">
              Full name<span className="teen-intake-req"> *</span>
            </label>
            <input
              className="teen-intake-input"
              value={name}
              onChange={(ev) => setName(ev.target.value)}
              placeholder="Your full name"
              required
            />
          </div>

          <div className="teen-intake-field">
            <label className="teen-intake-label">Email</label>
            {/* Fixed: the invitation was addressed to this mailbox, and letting
                it be edited would detach the acceptance from the invite. */}
            <input className="teen-intake-input" value={partnerBEmail} readOnly disabled />
          </div>

          <div className="teen-intake-field">
            <label className="teen-intake-label">
              Password<span className="teen-intake-req"> *</span>
            </label>
            <input
              className="teen-intake-input"
              type="password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
            />
          </div>

          <div className="teen-intake-field">
            <label className="teen-intake-label">
              Confirm password<span className="teen-intake-req"> *</span>
            </label>
            <input
              className="teen-intake-input"
              type="password"
              value={confirm}
              onChange={(ev) => setConfirm(ev.target.value)}
              placeholder="Repeat your password"
              autoComplete="new-password"
              required
            />
          </div>

          {error ? <p className="teen-field-error">{error}</p> : null}
        </section>

        <button type="submit" className="teen-intake-submit" disabled={busy}>
          {busy ? 'Accepting…' : 'Accept and continue'}
        </button>
      </form>
    </div>
  );
}
