import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './CoupleTherapyIntake.css';

export default function CouplePartnerBWelcome() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const {
    coupleId,
    token,
    draftToken,
    partnerAName = 'Your partner',
    partnerBEmail = '',
    partnerBName = '',
  } = state || {};

  // A draft invite has no couple record and no account yet — B is being asked
  // to join a sign-up nobody has paid for. They set a password and do their
  // intake; both accounts are created when partner A completes payment.
  const isDraft = Boolean(draftToken || (!coupleId && token));
  const inviteToken = draftToken || token;

  if (!coupleId && !isDraft) {
    return (
      <div className="teen-intake-page">
        <p>Invalid invitation. <Link to="/couple/join">Enter your code</Link></p>
      </div>
    );
  }

  return (
    <div className="teen-intake-page">
      <span className="couple-invite-badge">Couples therapy invitation</span>

      <header className="teen-intake-header">
        <h1>Join {partnerAName}</h1>
        <p>
          <strong>{partnerAName}</strong> has started couples therapy on NessaHub and invited you to join them.
        </p>
        <p>
          {isDraft
            ? 'You will choose a password and complete a short private intake form. Your account is created once the first session is paid for.'
            : 'You will create your own account with your own email and password. Then you will complete a short private intake form.'}
        </p>
      </header>

      <div className="couple-privacy-box">
        <strong>Completely confidential</strong>
        <p>
          Your answers are private. {partnerAName} will never see what you write. Only your shared therapist can read
          your individual responses.
        </p>
      </div>

      <button
        type="button"
        className="teen-intake-submit"
        onClick={() => {
          if (isDraft) {
            navigate('/couple/accept', {
              state: { draftToken: inviteToken, partnerBEmail, partnerBName, partnerAName },
            });
            return;
          }
          navigate('/signup', {
            state: {
              clientData: {
                therapyType: 'couples',
                coupleId,
                couplePartnerRole: 'partnerB',
                email: partnerBEmail,
                displayName: partnerBName,
                name: partnerBName,
                inviteToken: token,
                lockEmail: true,
                invitePartnerName: partnerAName,
              },
            },
          });
        }}
      >
        {isDraft ? 'Accept invitation' : 'Create my account'}
      </button>

      <p className="couple-ghost-link">
        <Link to="/login" state={{ returnTo: '/couple/intake' }}>
          Already have an account? Log in
        </Link>
      </p>
    </div>
  );
}
