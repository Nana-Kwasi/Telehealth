import React from 'react';
import './ClientProfileModal.css';

export default function ClientProfileModal({ client, onClose, onMessage, onVideoCall, onViewProfile }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <button className="close-button" onClick={onClose}>×</button>
          <h2>Client Options</h2>
          <p>Choose an action for {client.name || 'Client'}</p>
        </div>

        <div className="modal-body">
          <div className="client-preview">
            <div className="client-avatar">
              {client.photoURL ? (
                <img src={client.photoURL} alt={client.name} />
              ) : (
                <div className="avatar-placeholder">👤</div>
              )}
            </div>
            <div className="client-info">
              <h3>{client.name || 'Client'}</h3>
              <p className="client-status">Active Client</p>
              {client.therapyType && (
                <p className="client-therapy-type">{client.therapyType}</p>
              )}
            </div>
          </div>

          <div className="action-buttons">
            <button 
              className="action-button primary"
              onClick={onMessage}
            >
              <span className="button-icon">💬</span>
              <div className="button-content">
                <h4>Message</h4>
                <p>Send secure direct messages</p>
              </div>
            </button>

            <button 
              className="action-button secondary"
              onClick={onVideoCall}
            >
              <span className="button-icon">📞</span>
              <div className="button-content">
                <h4>Video Call</h4>
                <p>Start a therapy session</p>
              </div>
            </button>

            <button 
              className="action-button tertiary"
              onClick={onViewProfile}
            >
              <span className="button-icon">👁️</span>
              <div className="button-content">
                <h4>View Profile</h4>
                <p>See client details & progress</p>
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
