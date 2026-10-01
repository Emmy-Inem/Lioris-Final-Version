/** Shared config contract for the web (src/api/webrtc.web.ts) and native (src/api/webrtc.native.ts)
 * WebRTC call engines. CallModal imports `WebRTCCallSession` from `@/api/webrtc`, which Metro resolves
 * to the right platform file automatically (no `.web.ts`/`.native.ts` branching needed at the call site).
 */
export interface WebRTCConfig {
  roomName: string;
  userId: string;
  userName: string;
  isVideo: boolean;
  onLocalStream?: (stream: any) => void;
  onRemoteStream?: (stream: any) => void;
  onConnectionStateChange?: (state: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed') => void;
  onError?: (error: Error) => void;
  onRemoteHangup?: () => void;
}

export interface IWebRTCCallSession {
  start(): Promise<void>;
  toggleAudio(): boolean;
  toggleVideo(): boolean;
  isAudioActive(): boolean;
  isVideoActive(): boolean;
  /** Locally silences incoming audio (toggles `.enabled` on the remote stream's
   * audio track(s) - a pure receive-side effect, nothing is signaled to the peer). */
  setRemoteAudioMuted(muted: boolean): void;
  hangup(): void;
}
