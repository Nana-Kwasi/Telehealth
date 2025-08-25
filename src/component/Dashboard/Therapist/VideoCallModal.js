import React, { useState } from 'react';
import './VideoCallModal.css';

export default function VideoCallModal({ client, onClose }) {
  const [callStatus, setCallStatus] = useState('connecting'); // connecting, connected, ended
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  // Mock call duration timer
  React.useEffect(() => {
    if (callStatus === 'connected') {
      const timer = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [callStatus]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEndCall = () => {
    setCallStatus('ended');
    setTimeout(() => {
      onClose();
    }, 2000);
  };

  const handleAcceptCall = () => {
    setCallStatus('connected');
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const toggleVideo = () => {
    setIsVideoOff(!isVideoOff);
  };

  return (
    <div className="modal-overlay video-call-overlay">
      <div className="modal-content video-call-modal">
        <div className="video-call-header">
          <div className="call-info">
            <h2>Video Call with {client.name || 'Client'}</h2>
            {callStatus === 'connected' && (
              <p className="call-duration">{formatTime(callDuration)}</p>
            )}
          </div>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="video-call-body">
          {callStatus === 'connecting' && (
            <div className="connecting-state">
              <div className="connecting-icon">📞</div>
              <h3>Connecting to {client.name || 'Client'}...</h3>
              <p>Please wait while we establish the connection</p>
              <div className="connecting-animation">
                <div className="dot"></div>
                <div className="dot"></div>
                <div className="dot"></div>
              </div>
              <button className="accept-call-button" onClick={handleAcceptCall}>
                Accept Call
              </button>
            </div>
          )}

          {callStatus === 'connected' && (
            <div className="video-call-active">
              <div className="video-container">
                <div className="main-video">
                  <div className="video-placeholder">
                    {isVideoOff ? '📹' : '🎥'}
                    <p>{isVideoOff ? 'Video Off' : 'Client Video'}</p>
                  </div>
                </div>
                <div className="self-video">
                  <div className="video-placeholder small">
                    {isVideoOff ? '📹' : '🎥'}
                  </div>
                </div>
              </div>
              
              <div className="call-controls">
                <button 
                  className={`control-button ${isMuted ? 'active' : ''}`}
                  onClick={toggleMute}
                >
                  {isMuted ? '🔇' : '🎤'}
                </button>
                <button 
                  className={`control-button ${isVideoOff ? 'active' : ''}`}
                  onClick={toggleVideo}
                >
                  {isVideoOff ? '📹' : '🎥'}
                </button>
                <button 
                  className="control-button end-call"
                  onClick={handleEndCall}
                >
                  📞
                </button>
              </div>
            </div>
          )}

          {callStatus === 'ended' && (
            <div className="call-ended">
              <div className="ended-icon">✅</div>
              <h3>Call Ended</h3>
              <p>Duration: {formatTime(callDuration)}</p>
              <p>Thank you for the session!</p>
            </div>
          )}
        </div>

        <div className="video-call-footer">
          <div className="session-notes">
            <h4>Session Notes</h4>
            <textarea 
              className="notes-textarea"
              placeholder="Add session notes here..."
              rows="3"
            />
            <button className="save-notes-button">
              Save Notes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
