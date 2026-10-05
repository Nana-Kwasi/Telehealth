import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { RELATIONSHIP_TYPES, COUPLE_STORAGE_KEYS } from '../../utils/coupleTherapyConfig';
import { api } from '../../services/apiClient';
import ChipSelect from './ChipSelect';
import { beginTherapySession } from '../../utils/patientSessionIntent';
import './CoupleTherapyIntake.css';

function Field({ label, required, error, children }) {
  return (
    <div className="teen-intake-field">
      {label ? (
        <label className="teen-intake-label">
          {label}
          {required ? <span className="teen-intake-req"> *</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <p className="teen-field-error">{error}</p> : null}
    </div>
  );
}

export default function CoupleInitiation() {
  const navigate = useNavigate();

  useEffect(() => {
    beginTherapySession('couples');
  }, []);
  const [relationshipType, setRelationshipType] = useState('');
  const [partnerAName, setPartnerAName] = useState('');
  const [partnerAEmail, setPartnerAEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [partnerBName, setPartnerBName] = useState('');
  const [partnerBEmail, setPartnerBEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const validate = () => {
    if (!relationshipType) return 'Select your relationship type';
    if (!partnerAName.trim()) return 'Enter your full name';
    if (!partnerAEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(partnerAEmail)) {
      return 'Enter a valid email for yourself';
    }
    if (!password || password.length < 6) return 'Password must be at least 6 characters';
    if (password !== confirmPassword) return 'Passwords do not match';
    if (!partnerBName.trim()) return "Enter your partner's full name";
    if (!partnerBEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(partnerBEmail)) {
      return "Enter a valid email for your partner";
    }
    if (partnerAEmail.trim().toLowerCase() === partnerBEmail.trim().toLowerCase()) {
      return 'Partner emails must be different';
    }
    return null;
  };

  const onContinue = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      setError(err);
      return;
    }

    setLoading(true);
    setError('');
    try {
      // NO ACCOUNT IS CREATED HERE ANY MORE.
      //
      // This used to call createUserWithEmailAndPassword first, because the old
      // POST /api/v1/couples was authenticated and needed partnerAId. That meant
      // a couple who abandoned the sign-up — or never paid — still left two real
      // accounts, a couple record and a client profile behind. The individual and
      // teen flows have always deferred account creation until payment; this
      // brings couples in line.
      //
      // Instead the whole sign-up lives on a draft, keyed by an invite token,
      // until partner A pays for the first session. Only then are both accounts
      // created, together.
      const draft = await api('/api/v1/couples/drafts', {
        method: 'POST',
        authenticated: false,
        body: {
          relationshipType,
          partnerA: { name: partnerAName.trim(), email: partnerAEmail.trim().toLowerCase() },
          partnerB: { name: partnerBName.trim(), email: partnerBEmail.trim().toLowerCase() },
          password,
        },
      });

      if (!draft?.inviteToken) throw new Error('Could not start the couple sign-up.');

      // Local breadcrumbs only. There is no session, because there is no account
      // — the token is what identifies this sign-up from here on.
      localStorage.setItem(COUPLE_STORAGE_KEYS.inviteToken, draft.inviteToken);
      localStorage.setItem(COUPLE_STORAGE_KEYS.partnerRole, 'partnerA');
      localStorage.setItem(COUPLE_STORAGE_KEYS.myIntakeComplete, 'false');
      localStorage.setItem(COUPLE_STORAGE_KEYS.otherPartnerName, partnerBName.trim());
      localStorage.setItem(COUPLE_STORAGE_KEYS.myRegistrationEmail, partnerAEmail.trim().toLowerCase());
      localStorage.setItem(COUPLE_STORAGE_KEYS.myPartnerName, partnerAName.trim());
      localStorage.setItem(
        'th.onboard',
        JSON.stringify({ therapyType: 'couples', startedAt: new Date().toISOString() }),
      );

      navigate('/couple/intake', {
        state: { draftToken: draft.inviteToken, partnerRole: 'partnerA' },
        replace: true,
      });
    } catch (e) {
      console.error(e);
      setError(e.message || 'Could not start couple registration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="teen-intake-page">
      <header className="teen-intake-header">
        <h1>Couple therapy</h1>
        <p>
          Set up your details, then complete your private intake. We email your partner their invitation
          immediately — they never see your answers. Both accounts are created once your first session
          is paid for.
        </p>
      </header>

      <form onSubmit={onContinue}>
        <section className="couple-form-card">
          <h2 className="couple-form-section">Relationship</h2>
          <Field label="Relationship type" required>
            <ChipSelect options={RELATIONSHIP_TYPES} value={relationshipType} onChange={setRelationshipType} />
          </Field>
        </section>

        <section className="couple-form-card">
          <h2 className="couple-form-section">Your account (Partner A)</h2>
          <Field label="Full name" required>
            <input
              className="teen-intake-input"
              placeholder="Jane Doe"
              value={partnerAName}
              onChange={(e) => setPartnerAName(e.target.value)}
              required
            />
          </Field>
          <Field label="Email" required>
            <input
              className="teen-intake-input"
              type="email"
              placeholder="you@example.com"
              value={partnerAEmail}
              onChange={(e) => setPartnerAEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </Field>
          <Field label="Password" required>
            <input
              className="teen-intake-input"
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirm password" required>
            <input
              className="teen-intake-input"
              type="password"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </Field>
        </section>

        <section className="couple-form-card">
          <h2 className="couple-form-section">Your partner (Partner B)</h2>
          <p className="couple-page-note">
            We will email your partner a private invitation. They create their own account and complete a separate intake.
          </p>
          <Field label="Partner's full name" required>
            <input
              className="teen-intake-input"
              placeholder="Partner's name"
              value={partnerBName}
              onChange={(e) => setPartnerBName(e.target.value)}
              required
            />
          </Field>
          <Field label="Partner's email" required>
            <input
              className="teen-intake-input"
              type="email"
              placeholder="partner@example.com"
              value={partnerBEmail}
              onChange={(e) => setPartnerBEmail(e.target.value)}
              required
            />
          </Field>
        </section>

        {error ? <p className="teen-intake-error">{error}</p> : null}

        <div className="couple-form-actions">
          <button type="submit" className="teen-intake-submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account & start intake'}
          </button>
        </div>
      </form>

      <p style={{ marginTop: '1.25rem', fontSize: '0.85rem', color: '#6b7280', textAlign: 'center' }}>
        <Link to="/">← Back to home</Link>
      </p>
    </div>
  );
}
