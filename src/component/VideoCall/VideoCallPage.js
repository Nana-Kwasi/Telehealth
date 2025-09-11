import React, { useState, useEffect, useRef, useCallback } from 'react';
import { connect, createLocalTracks, createLocalVideoTrack } from 'twilio-video';
import { useParams } from 'react-router-dom';
import { Phone, PhoneOff, Mic, MicOff, Video as VideoIcon, VideoOff, Monitor, Square } from 'lucide-react';
import './VideoCallPage.css';

const VideoCallPage = () => {
  const { roomName, participantName } = useParams();
  
  // State
  const [room, setRoom] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [error, setError] = useState(null);
  const [callInfo, setCallInfo] = useState(null);
  const [localTracks, setLocalTracks] = useState([]);
  const [isAcquiringLocalTracks, setIsAcquiringLocalTracks] = useState(false);
  
  // Refs for DOM elements
  const localVideoRef = useRef();
  const remoteVideosRef = useRef({});
  
  // Get call info on component mount
  useEffect(() => {
    const storedCallInfo = localStorage.getItem('videoCallInfo');
    if (storedCallInfo) {
      const info = JSON.parse(storedCallInfo);
      setCallInfo(info);
      console.log('Call info loaded:', info);
    } else {
      setError('No call information found. Please start a new call.');
    }
  }, []);

  // Start call when call info is available
  useEffect(() => {
    if (callInfo && callInfo.token) {
      joinRoom(callInfo.token);
    }

    // Cleanup on unmount
    return () => {
      console.log('Component unmounting, cleaning up...');
      cleanup();
    };
  }, [callInfo]);
  
  // Cleanup function
  const cleanup = useCallback(() => {
    console.log('Starting cleanup...');
    
    if (room) {
      console.log('Disconnecting from room...');
      room.disconnect();
      setRoom(null);
    }
    
    // Reset all state
    setIsConnected(false);
    setIsConnecting(false);
    setParticipants([]);
    
    console.log('Cleanup completed');
  }, [room]);
  
  const joinRoom = async (token) => {
    try {
      console.log('Starting to join room...');
      setIsConnecting(true);
      setError(null);
      
      // Connect to room with audio and video enabled
      const connectedRoom = await connect(token, {
        name: roomName,
        audio: true,
        video: { width: 640, height: 480 }
      });
      
      console.log('Successfully connected to room:', connectedRoom.name);
      setRoom(connectedRoom);
      setIsConnected(true);
      setIsConnecting(false);
      
      // Handle local participant
      const localParticipant = connectedRoom.localParticipant;
      console.log('Local participant:', localParticipant.identity);
      
      // Attach local video track
      localParticipant.videoTracks.forEach(publication => {
        if (publication.track && localVideoRef.current) {
          const videoElement = publication.track.attach();
          localVideoRef.current.appendChild(videoElement);
          console.log('Local video track attached');
        }
      });
      
      // Handle existing remote participants
      connectedRoom.participants.forEach(participant => {
        console.log('Existing participant:', participant.identity);
        handleParticipantConnected(participant);
      });
      
      // Set up event listeners
      connectedRoom.on('participantConnected', handleParticipantConnected);
      connectedRoom.on('participantDisconnected', handleParticipantDisconnected);
      
      connectedRoom.once('disconnected', (room, error) => {
        console.log('Disconnected from room:', error);
        handleRoomDisconnected(error);
      });
      
      // Update participants list
      setParticipants(Array.from(connectedRoom.participants.values()));
      
    } catch (error) {
      console.error('Error joining room:', error);
      setError('Failed to join room: ' + error.message);
      setIsConnecting(false);
    }
  };
  
  const handleParticipantConnected = (participant) => {
    console.log('Participant connected:', participant.identity);
    
    setParticipants(prevParticipants => {
      const newParticipants = [...prevParticipants, participant];
      console.log('Updated participants list:', newParticipants.map(p => p.identity));
      return newParticipants;
    });
    
    // Handle existing tracks
    participant.tracks.forEach(publication => {
      if (publication.isSubscribed) {
        handleTrackSubscribed(publication.track, participant);
      }
    });
    
    // Handle new tracks
    participant.on('trackSubscribed', (track) => {
      console.log('Track subscribed:', track.kind);
      handleTrackSubscribed(track, participant);
    });
    
    participant.on('trackUnsubscribed', (track) => {
      console.log('Track unsubscribed:', track.kind);
      handleTrackUnsubscribed(track, participant);
    });
  };
  
  const handleParticipantDisconnected = (participant) => {
    console.log('Participant disconnected:', participant.identity);
    
    setParticipants(prevParticipants => {
      const newParticipants = prevParticipants.filter(p => p !== participant);
      console.log('Updated participants list after disconnect:', newParticipants.map(p => p.identity));
      return newParticipants;
    });
    
    // Remove participant's video elements
    const participantDiv = document.getElementById(`participant-${participant.sid}`);
    if (participantDiv) {
      participantDiv.remove();
    }
  };
  
  const handleTrackSubscribed = (track, participant) => {
    console.log('Handling subscribed track:', track.kind, 'from participant:', participant.identity);
    
    if (track.kind === 'video') {
      const videoElement = track.attach();
      videoElement.style.width = '100%';
      videoElement.style.height = '100%';
      videoElement.style.objectFit = 'cover';
      
      // Create or update participant div
      let participantDiv = document.getElementById(`participant-${participant.sid}`);
      if (!participantDiv) {
        participantDiv = document.createElement('div');
        participantDiv.id = `participant-${participant.sid}`;
        participantDiv.className = 'remote-participant';
        participantDiv.innerHTML = `<div class="video-label">${participant.identity}</div>`;
        
        // Add to remote videos container
        const remoteContainer = document.querySelector('.remote-videos');
        if (remoteContainer) {
          remoteContainer.appendChild(participantDiv);
        }
      }
      
      // Replace existing video or add new one
      const existingVideo = participantDiv.querySelector('video');
      if (existingVideo) {
        existingVideo.remove();
      }
      participantDiv.appendChild(videoElement);
    }
  };
  
  const handleTrackUnsubscribed = (track, participant) => {
    console.log('Handling unsubscribed track:', track.kind, 'from participant:', participant.identity);
    
    if (track.kind === 'video') {
      const attachedElements = track.detach();
      attachedElements.forEach(element => element.remove());
    }
  };
  
  const handleRoomDisconnected = (error) => {
    console.log('Room disconnected:', error);
    
    // Detach local participant tracks
    if (room && room.localParticipant) {
      room.localParticipant.tracks.forEach(publication => {
        const attachedElements = publication.track.detach();
        attachedElements.forEach(element => element.remove());
      });
    }
    
    cleanup();
    
    // Close window after a delay
    setTimeout(() => {
      window.close();
    }, 2000);
  };
  
  const leaveRoom = () => {
    console.log('User initiated disconnect');
    
    if (room) {
      room.disconnect();
    }
    
    setTimeout(() => {
      window.close();
    }, 1000);
  };
  
  const toggleMute = () => {
    if (!room || !room.localParticipant) return;
    
    room.localParticipant.audioTracks.forEach(publication => {
      if (isMuted) {
        publication.track.enable();
        console.log('Audio enabled');
      } else {
        publication.track.disable();
        console.log('Audio disabled');
      }
    });
    
    setIsMuted(!isMuted);
  };
  
  const toggleVideo = () => {
    if (!room || !room.localParticipant) return;
    
    room.localParticipant.videoTracks.forEach(publication => {
      if (isVideoOff) {
        publication.track.enable();
        console.log('Video enabled');
      } else {
        publication.track.disable();
        console.log('Video disabled');
      }
    });
    
    setIsVideoOff(!isVideoOff);
  };
  
  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = stream.getVideoTracks()[0];
        
        // Replace local video track with screen share
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        
        setIsScreenSharing(true);
      } catch (error) {
        console.error('Error starting screen share:', error);
      }
    } else {
      // Stop screen sharing
      const videoTrack = localTracks.find(track => track.kind === 'video');
      if (localVideoRef.current && videoTrack) {
        videoTrack.attach(localVideoRef.current);
      }
      setIsScreenSharing(false);
    }
  };

  
  
  // Render loading state
  if (isConnecting) {
    return (
      <div className="video-call-loading">
        <div className="loading-spinner"></div>
        <h2>Connecting to call...</h2>
        <p>Please wait while we connect you to the video room.</p>
      </div>
    );
  }
  
  // Render error state
  if (error) {
    return (
      <div className="video-call-error">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => window.close()}>Close</button>
      </div>
    );
  }
  
  // Render disconnected state
  if (!isConnected) {
    return (
      <div className="video-call-disconnected">
        <h2>Call Ended</h2>
        <p>The video call has ended.</p>
        <button onClick={() => window.close()}>Close Window</button>
      </div>
    );
  }
  
  return (
    <div className="video-call-page">
      <div className="call-header">
        <h1>Video Call - {roomName}</h1>
        <p>Connected as: {participantName}</p>
        <p>Participants: {participants.length + 1}</p>
      </div>
      
      <div className="video-container">
        <div className="local-video-container">
          <div 
            ref={localVideoRef} 
            className="local-video"
            style={{ 
              width: '300px', 
              height: '200px', 
              position: 'relative',
              transform: 'scaleX(-1)' // Mirror effect for local video
            }}
          />
          <div className="video-label">You {isVideoOff && '(Camera Off)'}</div>
        </div>
        
        <div className="remote-videos">
          {participants.length === 0 && (
            <div className="waiting-participant">
              <div className="waiting-content">
                <Phone size={64} />
                <h3>Waiting for participant to join...</h3>
                <p>Room: <strong>{roomName}</strong></p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="video-controls">
        <button 
          className={`control-btn ${isMuted ? 'muted' : ''}`} 
          onClick={toggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        
        <button 
          className={`control-btn ${isVideoOff ? 'video-off' : ''}`} 
          onClick={toggleVideo}
          title={isVideoOff ? 'Turn On Camera' : 'Turn Off Camera'}
        >
          {isVideoOff ? <VideoOff size={20} /> : <VideoIcon size={20} />}
        </button>
        
        <button 
          className={`control-btn ${isScreenSharing ? 'screen-sharing' : ''}`} 
          onClick={toggleScreenShare}
          title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
        >
          {isScreenSharing ? <Square size={20} /> : <Monitor size={20} />}
        </button>
        
        <button 
          className="control-btn end-call" 
          onClick={leaveRoom}
          title="End Call"
        >
          <PhoneOff size={20} />
        </button>
      </div>
    </div>
  );
};

export default VideoCallPage;



// import React, { useState, useEffect, useRef, useCallback } from 'react';
// import Video, { Room, LocalVideoTrack, LocalAudioTrack } from 'twilio-video';
// import { useParams } from 'react-router-dom';
// import { Phone, PhoneOff, Mic, MicOff, Video as VideoIcon, VideoOff, Monitor, Square } from 'lucide-react';
// import './VideoCallPage.css';

// const VideoCallPage = () => {
//   const { roomName, participantName } = useParams();
  
//   // State
//   const [room, setRoom] = useState(null);
//   const [isConnecting, setIsConnecting] = useState(false);
//   const [isConnected, setIsConnected] = useState(false);
//   const [isMuted, setIsMuted] = useState(false);
//   const [isVideoOff, setIsVideoOff] = useState(false);
//   const [isScreenSharing, setIsScreenSharing] = useState(false);
//   const [participants, setParticipants] = useState([]);
//   const [error, setError] = useState(null);
  
//   // Local tracks state (official Twilio pattern)
//   const [localTracks, setLocalTracks] = useState([]);
//   const [isAcquiringLocalTracks, setIsAcquiringLocalTracks] = useState(false);
  
//   // Refs
//   const localVideoRef = useRef();
//   const remoteVideoRef = useRef();
//   const screenShareRef = useRef();
  
//   // Cleanup function
//   const cleanup = useCallback(() => {
//     console.log('Starting cleanup...');
    
//     if (room) {
//       console.log('Cleaning up room connection');
//       try {
//         room.disconnect();
//       } catch (error) {
//         console.error('Error disconnecting room:', error);
//       }
//       setRoom(null);
//     }
    
//     // Stop all local tracks properly
//     console.log('Stopping local tracks:', localTracks.length);
//     localTracks.forEach(track => {
//       if (track) {
//         try {
//           console.log('Stopping track:', track.kind, track.name);
//           track.stop();
//         } catch (error) {
//           console.error('Error stopping track:', error);
//         }
//       }
//     });
//     setLocalTracks([]);
    
//     // Reset all state
//     setIsConnected(false);
//     setIsConnecting(false);
//     setIsMuted(false);
//     setIsVideoOff(false);
//     setIsScreenSharing(false);
//     setParticipants([]);
    
//     console.log('Cleanup completed');
//   }, [room, localTracks]);
  
//   useEffect(() => {
//     // Get call info from localStorage
//     const callInfo = localStorage.getItem('videoCallInfo');
//     if (callInfo) {
//       const { token } = JSON.parse(callInfo);
//       // First acquire local tracks, then connect
//       acquireLocalTracks().then(() => {
//         joinRoom(token);
//       }).catch(err => {
//         setError('Failed to acquire local media: ' + err.message);
//       });
//     } else {
//       setError('No call information found. Please start a new call.');
//     }
    
//     return cleanup;
//   }, []);
  
//   // Acquire local audio and video tracks (official Twilio pattern)
//   const acquireLocalTracks = async () => {
//     try {
//       setIsAcquiringLocalTracks(true);
//       console.log('Acquiring local tracks...');
      
//       // Use official Twilio method to create local tracks
//       const tracks = await Video.createLocalTracks({
//         audio: true,
//         video: {
//           width: { ideal: 1280 },
//           height: { ideal: 720 }
//         }
//       });
      
//       console.log('Local tracks created:', tracks);
//       setLocalTracks(tracks);
      
//       // Attach video track to local video element immediately
//       const videoTrack = tracks.find(track => track.kind === 'video');
//       if (videoTrack && localVideoRef.current) {
//         videoTrack.attach(localVideoRef.current);
//         console.log('Local video track attached to element');
//       }
      
//       console.log('Local tracks acquired successfully');
      
//     } catch (error) {
//       console.error('Error acquiring local tracks:', error);
//       throw error;
//     } finally {
//       setIsAcquiringLocalTracks(false);
//     }
//   };
  
//   const joinRoom = async (token) => {
//     try {
//       console.log('Joining room with token:', token);
//       setIsConnecting(true);
      
//       // Connect to room with local tracks (official Twilio pattern)
//       const newRoom = await Video.connect(token, {
//         name: roomName,
//         tracks: localTracks
//       });
      
//       console.log('Connected to room:', newRoom);
//       setRoom(newRoom);
//       setIsConnected(true);
//       setIsConnecting(false);
      
//       // Set up room event listeners (official Twilio pattern)
//       newRoom.setMaxListeners(16);
      
//       newRoom.on('participantConnected', handleParticipantConnected);
//       newRoom.on('participantDisconnected', handleParticipantDisconnected);
//       newRoom.on('dominantSpeakerChanged', handleDominantSpeakerChanged);
      
//       // Use once for disconnect (official Twilio pattern)
//       newRoom.once('disconnected', (error) => {
//         console.log('Room disconnected:', error);
//         handleDisconnect(error);
//       });
      
//       // Set track priorities (official Twilio pattern)
//       newRoom.localParticipant.videoTracks.forEach(publication => {
//         publication.setPriority('low');
//       });
      
//       // Handle local participant tracks
//       const localParticipant = newRoom.localParticipant;
//       console.log('Local participant:', localParticipant);
      
//       // Update participants list
//       setParticipants(Array.from(newRoom.participants.values()));
      
//       // Add disconnect listeners for browser events
//       const disconnect = () => newRoom.disconnect();
//       window.addEventListener('beforeunload', disconnect);
      
//     } catch (error) {
//       console.error('Error joining room:', error);
//       setError('Failed to join room: ' + error.message);
//       setIsConnecting(false);
//     }
//   };
  
//   // Room event handlers
//   const handleParticipantConnected = (participant) => {
//     console.log('Participant connected:', participant);
//     setParticipants(prev => [...prev, participant]);
    
//     participant.on('trackSubscribed', (track) => {
//       console.log('Remote track subscribed:', track);
//       if (track.kind === 'video' && remoteVideoRef.current) {
//         track.attach(remoteVideoRef.current);
//       }
//     });
//   };
  
//   const handleParticipantDisconnected = (participant) => {
//     console.log('Participant disconnected:', participant);
//     setParticipants(prev => prev.filter(p => p !== participant));
//   };
  
//   const handleDisconnect = (error) => {
//     console.log('Disconnected from room:', error);
//     console.log('Disconnect reason:', error?.code, error?.message);
    
//     // Clean up everything
//     cleanup();
    
//     // Close window after cleanup
//     setTimeout(() => {
//       window.close();
//     }, 2000);
//   };
  
//   const handleDominantSpeakerChanged = (participant) => {
//     console.log('Dominant speaker changed:', participant);
//   };
  
//   // Leave room
//   const leaveRoom = () => {
//     console.log('User initiated disconnect');
    
//     // Clean up everything first
//     cleanup();
    
//     // Close window after cleanup
//     setTimeout(() => {
//       window.close();
//     }, 1000);
//   };
  
//   // Toggle controls
//   const toggleMute = () => {
//     const audioTrack = localTracks.find(track => track.kind === 'audio');
//     if (audioTrack) {
//       try {
//         if (isMuted) {
//           audioTrack.enable();
//           console.log('Audio track enabled');
//         } else {
//           audioTrack.disable();
//           console.log('Audio track disabled');
//         }
//         setIsMuted(!isMuted);
//       } catch (error) {
//         console.error('Error toggling audio:', error);
//       }
//     } else {
//       console.log('No audio track found');
//     }
//   };
  
//   const toggleVideo = () => {
//     const videoTrack = localTracks.find(track => track.kind === 'video');
//     if (videoTrack) {
//       try {
//         if (isVideoOff) {
//           videoTrack.enable();
//           console.log('Video track enabled');
//         } else {
//           videoTrack.disable();
//           console.log('Video track disabled');
//         }
//         setIsVideoOff(!isVideoOff);
//       } catch (error) {
//         console.error('Error toggling video:', error);
//       }
//     } else {
//       console.log('No video track found');
//     }
//   };
  
//   const toggleScreenShare = async () => {
//     if (!isScreenSharing) {
//       try {
//         const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
//         const screenTrack = stream.getVideoTracks()[0];
        
//         // Replace local video track with screen share
//         if (localVideoRef.current) {
//           localVideoRef.current.srcObject = stream;
//         }
        
//         setIsScreenSharing(true);
//       } catch (error) {
//         console.error('Error starting screen share:', error);
//       }
//     } else {
//       // Stop screen sharing
//       const videoTrack = localTracks.find(track => track.kind === 'video');
//       if (localVideoRef.current && videoTrack) {
//         videoTrack.attach(localVideoRef.current);
//       }
//       setIsScreenSharing(false);
//     }
//   };
  
//   if (error) {
//     return (
//       <div className="video-call-error">
//         <h2>Error</h2>
//         <p>{error}</p>
//         <button onClick={() => window.close()}>Close</button>
//       </div>
//     );
//   }
  
//   if (isConnecting || isAcquiringLocalTracks) {
//     return (
//       <div className="video-call-loading">
//         <div className="loading-spinner"></div>
//         <h2>
//           {isAcquiringLocalTracks ? 'Setting up camera and microphone...' : 'Connecting to call...'}
//         </h2>
//         <p>Please wait while we connect you to the video room.</p>
//       </div>
//     );
//   }
  
//   if (!isConnected) {
//     return (
//       <div className="video-call-disconnected">
//         <h2>Call Ended</h2>
//         <p>The video call has ended.</p>
//         <button onClick={() => window.close()}>Close Window</button>
//       </div>
//     );
//   }
  
//   return (
//     <div className="video-call-page">
//       <div className="call-header">
//         <h1>Video Call - {roomName}</h1>
//         <p>Connected as: {participantName}</p>
//         <p>Participants: {participants.length + 1}</p>
//       </div>
      
//       <div className="video-grid">
//         <div className="local-video">
//           <video 
//             ref={localVideoRef} 
//             autoPlay 
//             muted 
//             playsInline 
//             style={{ transform: 'scaleX(-1)' }} // Mirror effect
//           />
//           <div className="video-label">You</div>
//           {isVideoOff && <div className="video-off-overlay">Camera Off</div>}
//         </div>
        
//         {participants.length > 0 ? (
//           <div className="remote-video">
//             <video ref={remoteVideoRef} autoPlay playsInline />
//             <div className="video-label">Other Participant</div>
//           </div>
//         ) : (
//           <div className="waiting-participant">
//             <div className="waiting-content">
//               <Phone size={64} />
//               <h3>Waiting for participant to join...</h3>
//               <p>Share this room name: <strong>{roomName}</strong></p>
//             </div>
//           </div>
//         )}
        
//         {isScreenSharing && (
//           <div className="screen-share">
//             <video ref={screenShareRef} autoPlay playsInline />
//             <div className="video-label">Screen Share</div>
//           </div>
//         )}
//       </div>
      
//       <div className="video-controls">
//         <button className={`control-btn ${isMuted ? 'active' : ''}`} onClick={toggleMute}>
//           {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
//         </button>
        
//         <button className={`control-btn ${isVideoOff ? 'active' : ''}`} onClick={toggleVideo}>
//           {isVideoOff ? <VideoOff size={20} /> : <VideoIcon size={20} />}
//         </button>
        
//         <button className={`control-btn ${isScreenSharing ? 'active' : ''}`} onClick={toggleScreenShare}>
//           {isScreenSharing ? <Square size={20} /> : <Monitor size={20} />}
//         </button>
        
//         <button className="control-btn end-call" onClick={leaveRoom}>
//           <PhoneOff size={20} />
//           End Call
//         </button>
//       </div>
//     </div>
//   );
// };

// export default VideoCallPage;