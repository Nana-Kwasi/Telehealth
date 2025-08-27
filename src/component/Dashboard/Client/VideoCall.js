import React from 'react';
import VideoCall from '../../VideoCall/VideoCall';

const ClientVideoCall = ({ profile }) => {
  return <VideoCall user={profile} />;
};

export default ClientVideoCall;
