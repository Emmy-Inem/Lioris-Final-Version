/**
 * Pure WebRTC Calling Engine powered by Supabase Realtime signaling, public STUN
 * and (when configured) a Cloudflare TURN relay. Zero iframes, native Lioris UI.
 * Web implementation - see webrtc.native.ts for the iOS/Android counterpart
 * (Metro picks whichever file matches the build target; CallModal just imports
 * `from '@/api/webrtc'`).
 */
import { supabase } from '@/api/supabase';
import type { WebRTCConfig, IWebRTCCallSession } from '@/api/webrtcTypes';
import {
  getIceServers,
  isValidSenderId,
  isValidSessionDescription,
  isValidIceCandidate,
  signalingChannelName,
} from '@/api/webrtcSignaling';

export type { WebRTCConfig };

export class WebRTCCallSession implements IWebRTCCallSession {
  private config: WebRTCConfig;
  private peerConnection: any = null;
  private localStream: any = null;
  private remoteStream: any = null;
  private channel: any = null;
  private isInitiator: boolean = false;
  private pendingCandidates: any[] = [];
  private isCleanedUp: boolean = false;

  constructor(config: WebRTCConfig) {
    this.config = config;
  }

  public async start(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      this.config.onConnectionStateChange?.('connecting');

      // 1. Acquire Local Media Stream
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: this.config.isVideo
              ? {
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                  facingMode: 'user',
                }
              : false,
          });
          this.config.onLocalStream?.(this.localStream);
        } catch (mediaErr: any) {
          console.warn('[WebRTC] Media permission error:', mediaErr);
          // Try audio-only fallback if video failed
          if (this.config.isVideo) {
            try {
              this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
              this.config.onLocalStream?.(this.localStream);
            } catch (audioErr) {
              console.warn('[WebRTC] Audio fallback also failed');
            }
          }
        }
      }

      // 2. Setup RTCPeerConnection
      const RTCPC = (window as any).RTCPeerConnection || (window as any).webkitRTCPeerConnection;
      if (!RTCPC) {
        throw new Error('WebRTC RTCPeerConnection is not supported in this runtime environment.');
      }

      // STUN + (when configured) TURN relay credentials; STUN-only on any failure.
      const iceServers = await getIceServers();
      this.peerConnection = new RTCPC({
        iceServers,
        iceCandidatePoolSize: 4,
      });

      // Attach local tracks to peer connection
      if (this.localStream) {
        this.localStream.getTracks().forEach((track: any) => {
          this.peerConnection.addTrack(track, this.localStream);
        });
      }

      // Setup Remote Track Listener
      this.peerConnection.ontrack = (event: any) => {
        if (event.streams && event.streams[0]) {
          this.remoteStream = event.streams[0];
          this.config.onRemoteStream?.(this.remoteStream);
          this.config.onConnectionStateChange?.('connected');
        }
      };

      // Connection State Listener
      this.peerConnection.onconnectionstatechange = () => {
        const state = this.peerConnection.connectionState;
        if (state === 'connected') {
          this.config.onConnectionStateChange?.('connected');
        } else if (state === 'disconnected' || state === 'closed') {
          this.config.onConnectionStateChange?.('disconnected');
        } else if (state === 'failed') {
          this.config.onConnectionStateChange?.('failed');
        }
      };

      // ICE Candidate Listener
      this.peerConnection.onicecandidate = (event: any) => {
        if (event.candidate && this.channel) {
          this.channel.send({
            type: 'broadcast',
            event: 'signal:candidate',
            payload: {
              senderId: this.config.userId,
              candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
            },
          });
        }
      };

      // 3. Connect to Supabase Realtime Signaling Channel
      this.channel = supabase.channel(signalingChannelName(this.config.roomName), {
        // Private channel: access is enforced by realtime.messages RLS for `webrtc:*` topics.
        config: { broadcast: { self: false }, private: true },
      });

      this.channel
        .on('broadcast', { event: 'signal:join' }, async (data: any) => {
          if (isValidSenderId(data.payload?.senderId) && data.payload.senderId !== this.config.userId) {
            if (__DEV__) console.log('[WebRTC] Remote peer joined. Creating offer as initiator.');
            this.isInitiator = true;
            await this.createAndSendOffer();
          }
        })
        .on('broadcast', { event: 'signal:offer' }, async (data: any) => {
          if (
            isValidSenderId(data.payload?.senderId) &&
            data.payload.senderId !== this.config.userId &&
            isValidSessionDescription(data.payload.sdp, 'offer')
          ) {
            if (__DEV__) console.log('[WebRTC] Received remote offer. Creating answer.');
            await this.handleRemoteOffer(data.payload.sdp);
          }
        })
        .on('broadcast', { event: 'signal:answer' }, async (data: any) => {
          if (
            isValidSenderId(data.payload?.senderId) &&
            data.payload.senderId !== this.config.userId &&
            isValidSessionDescription(data.payload.sdp, 'answer')
          ) {
            if (__DEV__) console.log('[WebRTC] Received remote answer.');
            await this.handleRemoteAnswer(data.payload.sdp);
          }
        })
        .on('broadcast', { event: 'signal:candidate' }, async (data: any) => {
          if (
            isValidSenderId(data.payload?.senderId) &&
            data.payload.senderId !== this.config.userId &&
            isValidIceCandidate(data.payload.candidate)
          ) {
            await this.handleRemoteCandidate(data.payload.candidate);
          }
        })
        .on('broadcast', { event: 'signal:hangup' }, () => {
          if (__DEV__) console.log('[WebRTC] Remote peer hung up.');
          this.config.onRemoteHangup?.();
        });

      await this.channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          if (__DEV__) console.log('[WebRTC] Signaling channel subscribed. Broadcasting join.');
          this.channel.send({
            type: 'broadcast',
            event: 'signal:join',
            payload: {
              senderId: this.config.userId,
              userName: this.config.userName,
            },
          });
        }
      });
    } catch (err: any) {
      console.error('[WebRTC] Failed to initialize call session:', err);
      this.releaseLocalStream();
      this.config.onError?.(err);
      this.config.onConnectionStateChange?.('failed');
    }
  }

  private async createAndSendOffer() {
    if (!this.peerConnection) return;
    try {
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await this.peerConnection.setLocalDescription(offer);

      this.channel.send({
        type: 'broadcast',
        event: 'signal:offer',
        payload: {
          senderId: this.config.userId,
          sdp: offer,
        },
      });
    } catch (err) {
      console.error('[WebRTC] Error creating offer:', err);
    }
  }

  private async handleRemoteOffer(remoteSdp: any) {
    if (!this.peerConnection) return;
    try {
      const RTCDesc = (window as any).RTCSessionDescription;
      await this.peerConnection.setRemoteDescription(new RTCDesc(remoteSdp));

      // Flush pending ICE candidates if any
      while (this.pendingCandidates.length > 0) {
        const candidate = this.pendingCandidates.shift();
        await this.peerConnection.addIceCandidate(candidate);
      }

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      this.channel.send({
        type: 'broadcast',
        event: 'signal:answer',
        payload: {
          senderId: this.config.userId,
          sdp: answer,
        },
      });
    } catch (err) {
      console.error('[WebRTC] Error handling offer and sending answer:', err);
    }
  }

  private async handleRemoteAnswer(remoteSdp: any) {
    if (!this.peerConnection) return;
    try {
      const RTCDesc = (window as any).RTCSessionDescription;
      await this.peerConnection.setRemoteDescription(new RTCDesc(remoteSdp));

      while (this.pendingCandidates.length > 0) {
        const candidate = this.pendingCandidates.shift();
        await this.peerConnection.addIceCandidate(candidate);
      }
    } catch (err) {
      console.error('[WebRTC] Error setting remote answer description:', err);
    }
  }

  private async handleRemoteCandidate(candidateInit: any) {
    if (!this.peerConnection) return;
    try {
      const RTCCand = (window as any).RTCIceCandidate;
      const candidate = new RTCCand(candidateInit);
      if (this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
        await this.peerConnection.addIceCandidate(candidate);
      } else {
        this.pendingCandidates.push(candidate);
      }
    } catch (err) {
      console.warn('[WebRTC] Error adding remote candidate:', err);
    }
  }

  public toggleAudio(): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return audioTrack.enabled;
    }
    return false;
  }

  public toggleVideo(): boolean {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      return videoTrack.enabled;
    }
    return false;
  }

  public isAudioActive(): boolean {
    if (!this.localStream) return false;
    const track = this.localStream.getAudioTracks()[0];
    return track ? track.enabled : false;
  }

  public isVideoActive(): boolean {
    if (!this.localStream) return false;
    const track = this.localStream.getVideoTracks()[0];
    return track ? track.enabled : false;
  }

  public setRemoteAudioMuted(muted: boolean): void {
    this.remoteStream?.getAudioTracks().forEach((t: any) => {
      t.enabled = !muted;
    });
  }

  private releaseLocalStream(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((t: any) => t.stop());
      this.localStream = null;
    }
  }

  public hangup(): void {
    if (this.isCleanedUp) return;
    this.isCleanedUp = true;

    try {
      if (this.channel) {
        this.channel.send({
          type: 'broadcast',
          event: 'signal:hangup',
          payload: { senderId: this.config.userId },
        });
        supabase.removeChannel(this.channel);
      }
    } catch {}

    this.releaseLocalStream();

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.config.onConnectionStateChange?.('idle');
  }
}
