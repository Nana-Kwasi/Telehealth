import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import './Terms.css';

export default function Terms() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();

  return (
    <div className="page-container terms-page">
      <div className="page-header">
        <button onClick={() => navigate('/')} className="back-button">
          <ArrowLeft size={20} />
          Back to Home
        </button>
        <h1 className="page-title">Terms and Conditions</h1>
      </div>

      <div className="terms-content">
        <p className="last-updated"><strong>Last updated:</strong> {new Date().toLocaleDateString()}</p>
        
        <section className="terms-section">
          <h2>Acceptance of Terms</h2>
          <p>By accessing and using our services, you accept and agree to be bound by the terms and provision of this agreement.</p>
        </section>

        <section className="terms-section">
          <h2>Services Description</h2>
          <p>Our platform connects you with licensed mental health professionals for therapy sessions conducted online.</p>
        </section>

        <section className="terms-section">
          <h2>User Responsibilities</h2>
          <p>You are responsible for maintaining the confidentiality of your account information and for all activities that occur under your account.</p>
        </section>

        <section className="terms-section">
          <h2>Professional Relationship</h2>
          <p>The therapeutic relationship is between you and your assigned therapist. We facilitate the connection but do not provide therapy services directly.</p>
        </section>

        <section className="terms-section">
          <h2>Limitation of Liability</h2>
          <p>Our liability is limited to the maximum extent permitted by law. We are not liable for any indirect, incidental, or consequential damages.</p>
        </section>

        <section className="terms-section">
          <h2>Contact Us</h2>
          <p>For questions about these Terms and Conditions, please contact us at legal@therapyconnect.com</p>
        </section>
      </div>
    </div>
  );
}
