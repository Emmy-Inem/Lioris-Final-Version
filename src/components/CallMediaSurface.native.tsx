import React from 'react';
import { RTCView } from 'react-native-webrtc';
import type { CallMediaSurfaceProps } from './CallMediaSurfaceTypes';

export type { CallMediaSurfaceProps };

/** Native (iOS/Android): renders a video track via react-native-webrtc's RTCView.
 * Voice calls render nothing here - audio plays automatically through whatever route
 * react-native-incall-manager (started in WebRTCCallSession) configured once the track
 * is attached to the peer connection; there is no view to mount for it. */
export function CallMediaSurface({ kind, stream, isVideo, mirrored, style }: CallMediaSurfaceProps) {
  if (!isVideo || !stream) return null;
  const streamURL = typeof stream.toURL === 'function' ? stream.toURL() : null;
  if (!streamURL) return null;

  return (
    <RTCView
      streamURL={streamURL}
      style={[{ width: '100%', height: '100%', backgroundColor: '#0F172A' }, style]}
      objectFit="cover"
      mirror={!!mirrored}
      zOrder={kind === 'local' ? 1 : 0}
    />
  );
}
