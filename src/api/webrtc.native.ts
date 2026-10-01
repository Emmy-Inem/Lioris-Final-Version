/**
 * Pure WebRTC Calling Engine powered by Supabase Realtime signaling, public STUN
 * and (when configured) a Cloudflare TURN relay. Native (iOS/Android) implementation
 * backed by react-native-webrtc - see webrtc.web.ts for the browser counterpart
 * (Metro picks whichever file matches the build target; CallModal just imports
 * `from '@/api/webrtc'`). react-native-incall-manager owns the native audio session
 * (speaker/earpiece routing, proximity sensor) for the lifetime of the call.
 */
import { Platform, PermissionsAndroid } from 'react-native';
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
} from 'react-native-webrtc';
import InCallManager from 'react-native-incall-manager';
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

async function ensureAndroidPermissions(wantsVideo: boolean): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const permissions = wantsVideo
      ? [PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]
      : [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
    const results = await PermissionsAndroid.requestMultiple(permissions);
    return permissions.every((p) => results[p] === PermissionsAndroid.RESULTS.GRANTED);
  } catch (err) {
    console.warn('[WebRTC/native] Android permission request failed:', err);
    return false;
  }
}

export class WebRTCCallSession implements IWebRTCCallSession {
  private config: WebRTCConfig;
  private peerConnection: any = null;
  private localStream: any = null;
  private remoteStream: any = null;
  private channel: any = null;
  private isInitiator: boolean = false;
  private pendingCandidates: any[] = [];
  private isCleanedUp: boolean = false;
  private inCallManagerStarted: boolean = false;

  constructor(config: WebRTCConfig) {
    this.config = config;
  }

  public async start(): Promise<void> {
    try {
      this.config.onConnectionStateChange?.('connecting');

      // 1. Permissions + local media. iOS prompts automatically off the
      // NSCameraUsageDescription/NSMicrophoneUsageDescription strings the first
      // time getUserMedia runs; Android needs an explicit runtime request first.
      const granted = await ensureAndroidPermissions(this.config.isVideo);
      if (!granted) {
        throw new Error('Camera/microphone permission was not granted.');
      }

      try {
        this.localStream = await mediaDevices.getUserMedia({
          audio: true,
          video: this.config.isVideo
            ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
            : false,
        });
        this.config.onLocalStream?.(this.localStream);
      } catch (mediaErr: any) {
        console.warn('[WebRTC/native] Media permission error:', mediaErr);
        if (this.config.isVideo) {
          try {
            this.localStream = await mediaDevices.getUserMedia({ audio: true });
            this.config.onLocalStream?.(this.localStream);
          } catch (audioErr) {
            console.warn('[WebRTC/native] Audio fallback also failed');
          }
        }
      }

      // Owns the native audio session for the call: routes video calls to the
      // loudspeaker and voice calls to the earpiece by default, and enables the
      // proximity sensor (screen off near the ear) for voice calls.
      try {
        InCallManager.start({ media: this.config.isVideo ? 'video' : 'audio', auto: true });
        this.inCallManagerStarted = true;
      } catch (icmErr) {
        console.warn('[WebRTC/native] InCallManager failed to start:', icmErr);
      }

      // 2. Setup RTCPeerConnection
      const iceServers = await getIceServers();
      this.peerConnection = new RTCPeerConnection({
        iceServers,
        iceCandidatePoolSize: 4,
      });

      if (this.localStream) {
        this.localStream.getTracks().forEach((track: any) => {
          this.peerConnection.addTrack(track, this.localStream);
        });
      }

      this.peerConnection.ontrack = (event: any) => {
        if (event.streams && event.streams[0]) {
          this.remoteStream = event.streams[0];
          this.config.onRemoteStream?.(this.remoteStream);
          this.config.onConnectionStateChange?.('connected');
        }
      };

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

      this.peerConnection.onicecandidate = (event: any) => {
        if (event.candidate && this.channel) {
          this.channel.send({
            type: 'broadcast',
            event: 'signal:candidate',
            payload: {
              senderId: this.config.userId,
              candidate: {
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex,
              },
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
            if (__DEV__) console.log('[WebRTC/native] Remote peer joined. Creating offer as initiator.');
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
            if (__DEV__) console.log('[WebRTC/native] Received remote offer. Creating answer.');
            await this.handleRemoteOffer(data.payload.sdp);
          }
        })
        .on('broadcast', { event: 'signal:answer' }, async (data: any) => {
          if (
            isValidSenderId(data.payload?.senderId) &&
            data.payload.senderId !== this.config.userId &&
            isValidSessionDescription(data.payload.sdp, 'answer')
          ) {
            if (__DEV__) console.log('[WebRTC/native] Received remote answer.');
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
          if (__DEV__) console.log('[WebRTC/native] Remote peer hung up.');
          this.config.onRemoteHangup?.();
        });

      await this.channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          if (__DEV__) console.log('[WebRTC/native] Signaling channel subscribed. Broadcasting join.');
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
      console.error('[WebRTC/native] Failed to initialize call session:', err);
      this.releaseLocalStream();
      this.stopInCallManager();
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
      console.error('[WebRTC/native] Error creating offer:', err);
    }
  }

  private async handleRemoteOffer(remoteSdp: any) {
    if (!this.peerConnection) return;
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(remoteSdp));

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
      console.error('[WebRTC/native] Error handling offer and sending answer:', err);
    }
  }

  private async handleRemoteAnswer(remoteSdp: any) {
    if (!this.peerConnection) return;
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(remoteSdp));

      while (this.pendingCandidates.length > 0) {
        const candidate = this.pendingCandidates.shift();
        await this.peerConnection.addIceCandidate(candidate);
      }
    } catch (err) {
      console.error('[WebRTC/native] Error setting remote answer description:', err);
    }
  }

  private async handleRemoteCandidate(candidateInit: any) {
    if (!this.peerConnection) return;
    try {
      const candidate = new RTCIceCandidate(candidateInit);
      if (this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
        await this.peerConnection.addIceCandidate(candidate);
      } else {
        this.pendingCandidates.push(candidate);
      }
    } catch (err) {
      console.warn('[WebRTC/native] Error adding remote candidate:', err);
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

  private stopInCallManager(): void {
    if (this.inCallManagerStarted) {
      try {
        InCallManager.stop();
      } catch {}
      this.inCallManagerStarted = false;
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
    this.stopInCallManager();

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.config.onConnectionStateChange?.('idle');
  }
}
