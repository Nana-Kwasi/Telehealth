import React from 'react';
import './TherapistProfileModal.css';
import { resolveFileUrl } from '../../../utils/fileUrl';

export default function TherapistProfileModal({ therapist, onClose, onSendMessage, onViewProfile }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <button className="close-button" onClick={onClose}>×</button>
          <h2>Colleague Options</h2>
          <p>Choose an action for {therapist.name}</p>
        </div>

        <div className="modal-body">
          <div className="therapist-preview">
            <div className="therapist-avatar">
              {therapist.photoURL ? (
                <img src={resolveFileUrl(therapist.photoURL)} alt={therapist.name} />
              ) : (
                <div className="avatar-placeholder">🧑‍⚕️</div>
              )}
            </div>
            <div className="therapist-info">
              <h3>{therapist.name}</h3>
              <p className="therapist-type">{therapist.type}</p>
              {therapist.username && (
                <p className="therapist-username">@{therapist.username}</p>
              )}
              {therapist.yearsExperience && (
                <p className="therapist-experience">{therapist.yearsExperience} years experience</p>
              )}
              {therapist.specialties && therapist.specialties.length > 0 && (
                <p className="therapist-specialties">Specialties: {Array.isArray(therapist.specialties) ? therapist.specialties.join(', ') : therapist.specialties}</p>
              )}
              {therapist.languagesSpoken && therapist.languagesSpoken.length > 0 && (
                <p className="therapist-languages">Languages: {Array.isArray(therapist.languagesSpoken) ? therapist.languagesSpoken.join(', ') : therapist.languagesSpoken}</p>
              )}
            </div>
          </div>

          <div className="action-buttons">
            <button 
              className="action-button primary"
              onClick={onSendMessage}
            >
              <span className="button-icon">💬</span>
              <div className="button-content">
                <h4>Send Message</h4>
                <p>Start a private conversation</p>
              </div>
            </button>

            <button 
              className="action-button secondary"
              onClick={onViewProfile}
            >
              <span className="button-icon">👁️</span>
              <div className="button-content">
                <h4>View Profile</h4>
                <p>See detailed information</p>
              </div>
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button className="cancel-button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
