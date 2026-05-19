import React from 'react';
import { Link } from 'react-router-dom';
import './TeenTherapyIntake.css';

export default function TeenIntakeLayout({ step, title, subtitle, children, actions }) {
  return (
    <div className="teen-intake-page">
      <div className="teen-intake-progress" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span key={n} className={`teen-intake-progress-dot ${n <= step ? 'active' : ''}`} />
        ))}
        <span>Step {step} of 3</span>
      </div>

      <header className="teen-intake-header">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </header>

      {children}

      {actions}

      <p style={{ marginTop: '1.5rem', fontSize: '0.85rem', color: '#6b7280' }}>
        <Link to="/">← Back to home</Link>
      </p>
    </div>
  );
}
