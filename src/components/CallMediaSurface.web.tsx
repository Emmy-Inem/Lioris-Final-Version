import React from 'react';
import type { CallMediaSurfaceProps } from './CallMediaSurfaceTypes';

export type { CallMediaSurfaceProps };

/** Web: renders the given MediaStream onto a DOM `<video>`/`<audio>` element. Local
 * preview is always rendered muted (prevents mic echo); remote audio muting is handled
 * at the track level by WebRTCCallSession.setRemoteAudioMuted, not here. */
export function CallMediaSurface({ kind, stream, isVideo, mirrored, style }: CallMediaSurfaceProps) {
  const elRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (elRef.current) {
      elRef.current.srcObject = stream ?? null;
    }
  }, [stream]);

  if (isVideo) {
    return React.createElement('video', {
      ref: elRef,
      autoPlay: true,
      playsInline: true,
      muted: kind === 'local',
      style: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        backgroundColor: '#0F172A',
        ...(mirrored ? { transform: 'scaleX(-1)' } : null),
        ...style,
      },
    });
  }

  return React.createElement('audio', { ref: elRef, autoPlay: true, playsInline: true });
}
