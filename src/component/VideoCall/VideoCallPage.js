import React, { useState, useEffect, useRef, useCallback } from 'react';
import { connect, createLocalTracks, createLocalVideoTrack, LocalVideoTrack } from 'twilio-video';
import { useParams, useNavigate } from 'react-router-dom';
import { Phone, PhoneOff, Mic, MicOff, Video as VideoIcon, VideoOff, Monitor, Square } from 'lucide-react';
import './VideoCallPage.css';
import SessionTranscriber from './SessionTranscriber';
import CallRingStatus from './CallRingStatus';
import { generateVideoToken } from '../../services/twilioVideoService';
import { getStoredUserId } from '../../services/apiClient';

/**
 * A readable label for a Twilio participant.
 *
 * Twilio identities are the authenticated user's id (a UUID), so using the raw
 * identity puts a UUID on the video tile. The joining screen stores the names it
 * already knows in `videoCallInfo`; fall back to the other party's name for a
 * one-to-one session.
 */
function participantLabel(identity) {
  if (!identity) return 'Participant';
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identity);
  if (!isUuid) return identity;
  try {
    const info = JSON.parse(localStorage.getItem('videoCallInfo') || '{}');
    const t = info.targetPerson;
    // Older callers stored the whole client record here, which rendered as "[object Object]".
    const fallback = t && typeof t === 'object' ? (t.displayName || t.name || t.fullName) : t;
    return (info.displayNames && info.displayNames[identity]) || fallback || 'Participant';
  } catch {
    return 'Participant';
  }
}


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
  const pageRef = useRef(null);
  // The screen-share track, and the camera track it temporarily replaces.
  const screenTrackRef = useRef(null);
  const cameraTrackRef = useRef(null);
  const navigate = useNavigate();

  // window.close() only closes windows that were opened by script. The therapist
  // joins via window.open (closable), but the client navigates in the same tab,
  // where close() is a no-op — the "Close Window" button did nothing at all.
  // iPhones (Safari and in-app web views) have no screen capture API at all, so
  // the share button silently did nothing there. Only offer it where it works.
  const canShareScreen = typeof navigator !== 'undefined'
    && !!navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function';

  const canCloseWindow = typeof window !== 'undefined' && !!window.opener && !window.opener.closed;

  // Inside the phone app the page runs in a web view: window.close() does not
  // close it (it left a half-torn-down page that crashed the dashboard), so ask
  // the app to close its call screen instead.
  const inApp = typeof window !== 'undefined' && !!window.ReactNativeWebView;
  const closeCallWindow = () => {
    if (inApp) {
      window.ReactNativeWebView.postMessage('nessa:call-ended');
      return;
    }
    window.close();
  };

  const leaveCallScreen = () => {
    if (inApp) {
      closeCallWindow();
      return;
    }
    if (canCloseWindow) {
      window.close();
      return;
    }
    navigate('/dashboard/video');
  };


  // Hold on to the camera track: screen sharing unpublishes it, and it has to be
  // republished afterwards or the other side never sees the camera again.
  useEffect(() => {
    if (!room) return;
    const publication = [...room.localParticipant.videoTracks.values()][0];
    if (publication?.track) cameraTrackRef.current = publication.track;
  }, [room]);

  // Show the local camera preview.
  //
  // The local track was attached immediately after connect(), but at that point
  // the component was still rendering the "Connecting to call..." view, so
  // localVideoRef.current was null and the attach silently did nothing — the
  // "You" tile stayed blank for the whole call. Attach once the room view is
  // actually on screen.
  useEffect(() => {
    const container = localVideoRef.current;
    if (!room || !container) return undefined;

    // While sharing, the preview shows the shared screen — that is the only way
    // to confirm the share is actually live.
    const screenTrack = screenTrackRef.current;
    const cameraTrack = [...room.localParticipant.videoTracks.values()]
      .map((publication) => publication.track)
      .find((track) => track && track !== screenTrack) || cameraTrackRef.current;

    const track = (isScreenSharing && screenTrack) || cameraTrack;
    if (!track) return undefined;

    const el = track.attach();
    el.style.width = '100%';
    el.style.height = '100%';
    // A shared screen must not be cropped the way a camera feed can be.
    el.style.objectFit = isScreenSharing ? 'contain' : 'cover';
    container.replaceChildren(el);

    return () => {
      try { track.detach(el); } catch { /* track already stopped */ }
      el.remove();
    };
  }, [room, isConnected, isScreenSharing]);

  // The page sits under the site navbar, so a flat 100vh ran past the bottom of
  // the window and took the call controls with it. Measure the space actually
  // left below the page's top edge and size to that.
  useEffect(() => {
    const el = pageRef.current;
    if (!el) return undefined;
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      el.style.setProperty('--call-height', `${Math.max(360, window.innerHeight - top)}px`);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  });

  const [callInfo, setCallInfo] = useState(null);
  const [localTracks, setLocalTracks] = useState([]);
  const [isAcquiringLocalTracks, setIsAcquiringLocalTracks] = useState(false);
  
  // Refs for DOM elements
  const localVideoRef = useRef();
  const remoteVideosRef = useRef({});
  
  // Get call info on component mount
  // A caller that only knows the room (the phone app after Accept, a Join
  // button) arrives without a token, or with a stale one for another room.
  // Without a token the page went straight to "Call Ended", so mint one here —
  // the identity must be this user's id (TwilioIdentityPolicy).
  useEffect(() => {
    let cancelled = false;
    let info = {};
    try { info = JSON.parse(localStorage.getItem('videoCallInfo') || '{}') || {}; } catch { info = {}; }
    if (info.token && info.roomName === roomName) {
      setCallInfo(info);
      return undefined;
    }
    const identity = getStoredUserId();
    if (!identity || !roomName) {
      setError('No call information found. Please start a new call.');
      return undefined;
    }
    setIsConnecting(true);
    generateVideoToken({ roomName, participantName: identity })
      .then((res) => {
        if (cancelled) return;
        const next = {
          ...(info.roomName === roomName ? info : {}),
          roomName,
          participantName: participantName || info.participantName,
          identity,
          token: res.token,
          displayNames: { ...(info.roomName === roomName ? info.displayNames : {}), [identity]: participantName },
        };
        localStorage.setItem('videoCallInfo', JSON.stringify(next));
        setCallInfo(next);
      })
      .catch((e) => {
        if (cancelled) return;
        setIsConnecting(false);
        setError('Could not join the call: ' + (e?.message || 'please try again.'));
      });
    return () => { cancelled = true; };
  }, [roomName, participantName]);

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

    // Stop the screen capture too, or the browser keeps showing "sharing your
    // screen" after the call is over.
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }

    if (room) {
      console.log('Disconnecting from room...');
      room.disconnect();
      setRoom(null);
    }
    
    document.getElementById('remote-audio-sink')?.remove();

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
      // A shared screen must be seen whole: 'cover' cropped its sides on a
      // portrait phone. Cameras keep 'cover' so faces fill the tile.
      const isScreen = track.name === 'screen';
      videoElement.style.objectFit = isScreen ? 'contain' : 'cover';
      videoElement.style.background = isScreen ? '#000' : '';
      
      // Create or update participant div
      let participantDiv = document.getElementById(`participant-${participant.sid}`);
      if (!participantDiv) {
        participantDiv = document.createElement('div');
        participantDiv.id = `participant-${participant.sid}`;
        participantDiv.className = 'remote-participant';
        // The label is a person's own name: always text, never markup.
        const label = document.createElement('div');
        label.className = 'video-label';
        label.textContent = participantLabel(participant.identity);
        participantDiv.appendChild(label);
        
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

    // Remote audio was never attached, so neither side heard the other.
    // Kept in a hidden container: a participant's audio can arrive before their
    // video tile exists. playsinline + autoplay for iOS web views.
    if (track.kind === 'audio') {
      const audioElement = track.attach();
      audioElement.autoplay = true;
      audioElement.setAttribute('playsinline', '');
      audioElement.dataset.participant = participant.sid;
      let sink = document.getElementById('remote-audio-sink');
      if (!sink) {
        sink = document.createElement('div');
        sink.id = 'remote-audio-sink';
        sink.style.display = 'none';
        document.body.appendChild(sink);
      }
      sink.appendChild(audioElement);
      audioElement.play?.().catch(() => {});
    }
  };
  
  const handleTrackUnsubscribed = (track, participant) => {
    console.log('Handling unsubscribed track:', track.kind, 'from participant:', participant.identity);
    
    if (track.kind === 'video' || track.kind === 'audio') {
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
    setTimeout(closeCallWindow, inApp ? 0 : 2000);
  };
  
  const leaveRoom = () => {
    console.log('User initiated disconnect');
    
    if (room) {
      room.disconnect();
    }
    
    setTimeout(closeCallWindow, inApp ? 0 : 1000);
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
  
  /**
   * Stop sharing: drop the screen track and put the camera back on the room.
   */
  const stopScreenShare = useCallback(async () => {
    const screenTrack = screenTrackRef.current;
    screenTrackRef.current = null;

    if (screenTrack) {
      if (room) {
        try { room.localParticipant.unpublishTrack(screenTrack); } catch { /* already gone */ }
      }
      screenTrack.detach().forEach((el) => el.remove());
      screenTrack.stop();
    }

    const camera = cameraTrackRef.current;
    if (room && camera) {
      try { await room.localParticipant.publishTrack(camera); } catch { /* already published */ }
    }

    setIsScreenSharing(false);
  }, [room]);

  /**
   * Share the screen with the other participant.
   *
   * The previous version captured the display stream and assigned it to
   * `localVideoRef.current.srcObject` — but that ref is a <div>, so nothing was
   * shown locally, and the track was never published to the room, so the other
   * participant never saw the screen at all. The share has to become a Twilio
   * track and be published in the camera's place.
   */
  const toggleScreenShare = async () => {
    if (!room) return;
    if (isScreenSharing) {
      await stopScreenShare();
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch {
      return; // the picker was dismissed — not an error worth reporting
    }

    const mediaStreamTrack = stream.getVideoTracks()[0];
    if (!mediaStreamTrack) return;

    const screenTrack = new LocalVideoTrack(mediaStreamTrack, { name: 'screen' });
    screenTrackRef.current = screenTrack;

    const camera = cameraTrackRef.current;
    if (camera) {
      try { room.localParticipant.unpublishTrack(camera); } catch { /* already gone */ }
    }

    try {
      await room.localParticipant.publishTrack(screenTrack);
    } catch (error) {
      console.error('Failed to publish screen share:', error);
      screenTrackRef.current = null;
      screenTrack.stop();
      if (camera) {
        try { await room.localParticipant.publishTrack(camera); } catch { /* ignore */ }
      }
      return;
    }

    // The browser's own "Stop sharing" bar ends the track without going through
    // our button, so the UI has to follow that too.
    mediaStreamTrack.addEventListener('ended', () => { stopScreenShare(); });

    setIsScreenSharing(true);
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
        <button onClick={leaveCallScreen}>
          {canCloseWindow ? 'Close' : 'Back to Dashboard'}
        </button>
      </div>
    );
  }
  
  // Render disconnected state
  if (!isConnected) {
    return (
      <div className="video-call-disconnected">
        <h2>Call Ended</h2>
        <p>The video call has ended.</p>
        <button onClick={leaveCallScreen}>
          {canCloseWindow ? 'Close Window' : 'Back to Dashboard'}
        </button>
      </div>
    );
  }
  
  return (
    <div className="video-call-page" ref={pageRef}>
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
              // Mirror the camera, but never the shared screen — mirrored text
              // is unreadable.
              transform: isScreenSharing ? 'none' : 'scaleX(-1)'
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
      
      {/* Consented transcription: the clinician asks, the patient allows or
          declines, either can stop. Audio is never stored — only text. */}
      {/* For the caller: ringing / declined / no answer, with Ring again. */}
      {roomName ? <CallRingStatus roomName={roomName} /> : null}
      {room ? <SessionTranscriber room={room} roomName={roomName} /> : null}

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
        
        {canShareScreen ? (
          <button 
            className={`control-btn ${isScreenSharing ? 'screen-sharing' : ''}`} 
            onClick={toggleScreenShare}
            title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
          >
            {isScreenSharing ? <Square size={20} /> : <Monitor size={20} />}
          </button>
        ) : null}
        
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