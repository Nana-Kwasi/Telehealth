import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';
import individualIcon from '../../../src/Images /v.jpg';
import couplesIcon from '../../../src/Images /v2.jpg';
import teenIcon from '../../../src/Images /v1.jpg';

const therapyTypes = [
  {
    key: 'individual',
    title: 'Individual',
    desc: 'For myself',
    iconSrc: individualIcon,
    bgColor: '#4a7c59'
  },
  {
    key: 'couples',
    title: 'Couples',
    desc: 'For me and my partner',
    iconSrc: couplesIcon,
    bgColor: '#5d8aa8'
  },
  {
    key: 'teen',
    title: 'Teen',
    desc: 'For my child',
    iconSrc: teenIcon,
    bgColor: '#b8860b'
  }
];

export default function Home() {
  const navigate = useNavigate();
  const [counters, setCounters] = useState({
    therapists: 0,
    sessions: 0,
    clients: 0,
    messages: 0  // Added missing property
  });
  const [showModal, setShowModal] = useState(false);
  const [modalContent, setModalContent] = useState({ title: '', content: '' });

  const finalValues = {
    therapists: 150,
    sessions: 278000000,
    clients: 1000000,
    messages: 50000000  // Added missing property
  };

  const currentYear = new Date().getFullYear();

  useEffect(() => {
    const duration = 3000;
    const steps = 60;
    const stepDuration = duration / steps;

    Object.keys(finalValues).forEach(key => {
      const increment = finalValues[key] / steps;
      let currentValue = 0;
      let stepCount = 0;
      
      const interval = setInterval(() => {
        stepCount++;
        currentValue += increment;
        
        if (stepCount >= steps || currentValue >= finalValues[key]) {
          currentValue = finalValues[key];
          clearInterval(interval);
        }
        
        setCounters(prev => ({
          ...prev,
          [key]: Math.floor(currentValue)
        }));
      }, stepDuration);
    });
  }, []);

  const formatNumber = (num) => {
    // Add null/undefined check
    if (num == null) return '0';
    
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M+';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(0) + 'K+';
    }
    return num.toLocaleString() + '+';
  };

  const start = (type) => {
    // Clear any existing data and start fresh
    localStorage.removeItem('th.onboard');
    localStorage.removeItem('th.subscription');
    localStorage.removeItem('th.match');
    
    const data = { therapyType: type, startedAt: new Date().toISOString() };
    localStorage.setItem('th.onboard', JSON.stringify(data));
    navigate('/questionnaire');
  };

  const openModal = (type) => {
    const content = {
      privacy: {
        title: 'Privacy Policy',
        content: `
          <h3>Privacy Policy</h3>
          <p><strong>Last updated:</strong> ${new Date().toLocaleDateString()}</p>
          
          <h4>Information We Collect</h4>
          <p>We collect information you provide directly to us, such as when you create an account, use our services, or contact us for support.</p>
          
          <h4>How We Use Your Information</h4>
          <p>We use the information we collect to provide, maintain, and improve our services, process transactions, and communicate with you.</p>
          
          <h4>Information Sharing</h4>
          <p>We do not sell, trade, or otherwise transfer your personal information to third parties without your consent, except as described in this policy.</p>
          
          <h4>Data Security</h4>
          <p>We implement appropriate security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.</p>
          
          <h4>Contact Us</h4>
          <p>If you have any questions about this Privacy Policy, please contact us at privacy@therapyconnect.com</p>
        `
      },
      terms: {
        title: 'Terms and Conditions',
        content: `
          <h3>Terms and Conditions</h3>
          <p><strong>Last updated:</strong> ${new Date().toLocaleDateString()}</p>
          
          <h4>Acceptance of Terms</h4>
          <p>By accessing and using our services, you accept and agree to be bound by the terms and provision of this agreement.</p>
          
          <h4>Services Description</h4>
          <p>Our platform connects you with licensed mental health professionals for therapy sessions conducted online.</p>
          
          <h4>User Responsibilities</h4>
          <p>You are responsible for maintaining the confidentiality of your account information and for all activities that occur under your account.</p>
          
          <h4>Professional Relationship</h4>
          <p>The therapeutic relationship is between you and your assigned therapist. We facilitate the connection but do not provide therapy services directly.</p>
          
          <h4>Limitation of Liability</h4>
          <p>Our liability is limited to the maximum extent permitted by law. We are not liable for any indirect, incidental, or consequential damages.</p>
          
          <h4>Contact Us</h4>
          <p>For questions about these Terms and Conditions, please contact us at legal@therapyconnect.com</p>
        `
      }
    };
    
    setModalContent(content[type]);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalContent({ title: '', content: '' });
  };

  return (
    <div className="page-container">
      {/* Hero Section with Background Image */}
      <div className="hero-section">
        <div className="home-container">
          <h1 className="home-title">You deserve to be happy.</h1>
          <p className="home-subtitle">What type of therapy are you looking for?</p>
          <div className="cards-grid">
            {therapyTypes.map(({ key, title, desc, iconSrc, bgColor }) => (
              <div 
                key={key} 
                className="therapy-card" 
                onClick={() => start(key)}
                style={{ backgroundColor: bgColor }}
              >
                <div className="card-content">
                  <h3 className="therapy-title">{title}</h3>
                  <p className="therapy-description">{desc}</p>
                  <div className="therapy-arrow">→</div>
                </div>
                <div className="therapy-icon">
                  <img src={iconSrc} alt={`${title} icon`} className="therapy-icon-img" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Statistics Section */}
      <div className="stats-section">
        <div className="stats-container">
          <h2 className="stats-title">The world's largest therapy service.</h2>
          <p className="stats-subtitle">100% online.</p>
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-number">{formatNumber(counters.therapists)}</div>
              <div className="stat-label">Licensed therapists</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">{formatNumber(counters.sessions)}</div>
              <div className="stat-label">Therapy sessions completed</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">{formatNumber(counters.clients)}</div>
              <div className="stat-label">People helped</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">{formatNumber(counters.messages)}</div>
              <div className="stat-label">Messages, chat, audio, video sessions</div>
            </div>
          </div>
        </div>
      </div>

      {/* Therapists Section */}
      <div className="therapists-section">
        <div className="therapists-container">
          <h2 className="therapists-title">Professional and qualified therapists who you can trust</h2>
          <div className="therapists-grid">
            <div className="therapist-feature">
              <div className="feature-icon">🎓</div>
              <h3>Licensed & Credentialed</h3>
              <p>All therapists are licensed, trained, experienced, and accredited psychologists, marriage and family therapists, clinical social workers or professional counselors.</p>
            </div>
            <div className="therapist-feature">
              <div className="feature-icon">🔒</div>
              <h3>Private & Secure</h3>
              <p>Your sessions are completely confidential and secure. We use encryption and follow strict privacy guidelines to protect your information.</p>
            </div>
            <div className="therapist-feature">
              <div className="feature-icon">💬</div>
              <h3>Multiple Ways to Communicate</h3>
              <p>Communicate with your therapist through video, phone, live chat, or messaging - whatever works best for your schedule and comfort level.</p>
            </div>
            <div className="therapist-feature">
              <div className="feature-icon">📱</div>
              <h3>Accessible Anywhere</h3>
              <p>Access therapy from the comfort of your home, office, or anywhere you have a private space and internet connection.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="site-footer">
        <div className="footer-container">
          <div className="footer-content">
            <div className="footer-section">
              <h4>Navigation</h4>
              <ul>
                <li><a href="#advice">Advice</a></li>
                <li><a href="#about">About</a></li>
                <li><a href="#login">Login</a></li>
                <li><a href="#faqs">FAQs</a></li>
                <li><a href="#contact">Contact</a></li>
              </ul>
            </div>
            <div className="footer-section">
              <h4>Support</h4>
              <ul>
                <li><a href="#help">Help Center</a></li>
                <li><a href="#safety">Safety</a></li>
                <li><a href="#resources">Resources</a></li>
                <li><a href="#crisis">Crisis Support</a></li>
              </ul>
            </div>
            <div className="footer-section">
              <h4>Legal</h4>
              <ul>
                <li><button onClick={() => openModal('terms')} className="footer-link-button">Terms of Service</button></li>
                <li><button onClick={() => openModal('privacy')} className="footer-link-button">Privacy Policy</button></li>
                <li><a href="#cookies">Cookie Policy</a></li>
                <li><a href="#disclaimer">Disclaimer</a></li>
              </ul>
            </div>
            <div className="footer-section">
              <h4>Connect</h4>
              <ul>
                <li><a href="#facebook">Facebook</a></li>
                <li><a href="#twitter">Twitter</a></li>
                <li><a href="#instagram">Instagram</a></li>
                <li><a href="#linkedin">LinkedIn</a></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <p>We accept <strong>HSA/FSA</strong> for Individual and Teen therapy</p>
            <p>&copy; {currentYear} TherapyConnect. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{modalContent.title}</h2>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>
            <div className="modal-body" dangerouslySetInnerHTML={{ __html: modalContent.content }}></div>
          </div>
        </div>
      )}
    </div>
  );
}