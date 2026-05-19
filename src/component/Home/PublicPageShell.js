import React from 'react';
import { Link } from 'react-router-dom';
import './PublicPages.css';

export default function PublicPageShell({ eyebrow, title, lead, children }) {
  return (
    <div className="public-page">
      <header className="public-page-hero">
        <div className="public-page-hero-inner">
          <Link to="/" className="public-back-link" style={{ color: '#93c5fd' }}>
            ← Back to home
          </Link>
          {eyebrow ? <div className="public-page-eyebrow">{eyebrow}</div> : null}
          <h1 className="public-page-title">{title}</h1>
          {lead ? <p className="public-page-lead">{lead}</p> : null}
        </div>
      </header>
      <div className="public-page-body">{children}</div>
    </div>
  );
}
