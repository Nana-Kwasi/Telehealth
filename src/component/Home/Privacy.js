import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import './Privacy.css';

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <div className="page-container privacy-page">
      <div className="page-header">
        <button onClick={() => navigate('/')} className="back-button">
          <ArrowLeft size={20} />
          Back to Home
        </button>
        <h1 className="page-title">Privacy Policy</h1>
      </div>

      <div className="privacy-content">
        <p className="last-updated"><strong>Last updated:</strong> {new Date().toLocaleDateString()}</p>
        
        <section className="privacy-section">
          <h2>Information We Collect</h2>
          <p>We collect information you provide directly to us, such as when you create an account, use our services, or contact us for support.</p>
        </section>

        <section className="privacy-section">
          <h2>How We Use Your Information</h2>
          <p>We use the information we collect to provide, maintain, and improve our services, process transactions, and communicate with you.</p>
        </section>

        <section className="privacy-section">
          <h2>Information Sharing</h2>
          <p>We do not sell, trade, or otherwise transfer your personal information to third parties without your consent, except as described in this policy.</p>
        </section>

        <section className="privacy-section">
          <h2>Data Security</h2>
          <p>We implement appropriate security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.</p>
        </section>

        <section className="privacy-section">
          <h2>Contact Us</h2>
          <p>If you have any questions about this Privacy Policy, please contact us at privacy@therapyconnect.com</p>
        </section>
      </div>
    </div>
  );
}
