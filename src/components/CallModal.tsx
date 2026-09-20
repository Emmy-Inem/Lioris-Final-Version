import React, { useEffect, useState, useRef } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useAuth } from '@/auth/AuthContext';
import { haptics } from '@/utils/haptics';
import { WebRTCCallSession } from '@/api/webrtc';

interface CallModalProps {
  visible: boolean;
  onClose: () => void;
  callType: 'voice' | 'video';
  roomName: string;
  callUrl: string;
  partnerName: string;
  partnerAvatar?: string | null;
  partnerDepartment?: string | null;
}

export function CallModal({
  visible,
  onClose,
  callType,
  roomName,
  callUrl,
  partnerName,
  partnerAvatar,
  partnerDepartment,
}: CallModalProps) {
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [seconds, setSeconds] = useState(0);
  const [copied, setCopied] = useState(false);
  const [connectionState, setConnectionState] = useState<'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed'>('idle');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState(callType === 'voice');
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);

  const sessionRef = useRef<WebRTCCallSession | null>(null);
  const localVideoRef = useRef<any>(null);
  const remoteVideoRef = useRef<any>(null);

  useEffect(() => {
    if (!visible) {
      if (sessionRef.current) {
        sessionRef.current.hangup();
        sessionRef.current = null;
      }
      setSeconds(0);
      setConnectionState('idle');
      return;
    }

    const session = new WebRTCCallSession({
      roomName,
      userId: user?.id || 'guest-' + Math.random().toString(36).substring(2, 7),
      userName: user?.fullName || 'Campus Student',
      isVideo: callType === 'video',
      onLocalStream: (stream) => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      },
      onRemoteStream: (stream) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      },
      onConnectionStateChange: (state) => {
        setConnectionState(state);
      },
      onRemoteHangup: () => {
        haptics.error();
        handleHangup();
      },
      onError: (err) => {
        console.warn('[CallModal] WebRTC error:', err);
      },
    });

    sessionRef.current = session;
    session.start();

    const timer = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);

    return () => {
      clearInterval(timer);
      if (sessionRef.current) {
        sessionRef.current.hangup();
        sessionRef.current = null;
      }
    };
  }, [visible, roomName, callType]);

  useEffect(() => {
    if (visible && sessionRef.current) {
      const t = setTimeout(() => {
        if (localVideoRef.current && (sessionRef.current as any)?.localStream) {
          localVideoRef.current.srcObject = (sessionRef.current as any).localStream;
        }
        if (remoteVideoRef.current && (sessionRef.current as any)?.remoteStream) {
          remoteVideoRef.current.srcObject = (sessionRef.current as any).remoteStream;
        }
      }, 300);
      return () => clearTimeout(t);
    }
  }, [visible, connectionState]);

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
  };

  const handleToggleMic = () => {
    haptics.medium();
    if (sessionRef.current) {
      const active = sessionRef.current.toggleAudio();
      setIsMicMuted(!active);
    }
  };

  const handleToggleVideo = () => {
    haptics.medium();
    if (sessionRef.current) {
      const active = sessionRef.current.toggleVideo();
      setIsVideoDisabled(!active);
    }
  };

  const handleToggleSpeaker = () => {
    haptics.light();
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = !isSpeakerMuted;
    }
    setIsSpeakerMuted(!isSpeakerMuted);
  };

  const handleCopyLink = async () => {
    haptics.medium();
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(callUrl);
      } catch {}
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleHangup = () => {
    haptics.error();
    if (sessionRef.current) {
      sessionRef.current.hangup();
      sessionRef.current = null;
    }
    onClose();
  };

  if (!visible) return null;

  const isWeb = Platform.OS === 'web';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleHangup}>
      <View accessibilityViewIsModal style={styles.container}>
        {/* TOP APP HEADER */}
        <View style={[styles.topHeader, { paddingTop: Math.max(insets.top, 12) }]}>
          <View style={styles.partnerInfo}>
            <Avatar name={partnerName} uri={partnerAvatar} size={38} />
            <View style={{ flex: 1, minWidth: 0, marginLeft: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AppText weight="bold" variant="bodySmall" tone="inverse">
                  {partnerName}
                </AppText>
                <Badge
                  label={callType === 'voice' ? 'DIRECT VOICE' : 'HD VIDEO'}
                  tone={callType === 'voice' ? 'accent' : 'brand'}
                />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor:
                        connectionState === 'connected'
                          ? '#22C55E'
                          : connectionState === 'connecting'
                          ? '#F59E0B'
                          : '#64748B',
                    },
                  ]}
                />
                <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                  {connectionState === 'connected'
                    ? formatTimer(seconds) + ' • Encrypted P2P'
                    : connectionState === 'connecting'
                    ? 'Connecting direct WebRTC...' 
                    : 'Campus WebRTC'}
                </AppText>
              </View>
            </View>
          </View>

          <Pressable
            onPress={handleCopyLink}
            hitSlop={8}
            style={[styles.topIconBtn, { backgroundColor: 'rgba(255,255,255,0.12)' }]}
          >
            <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={15} color="#FFFFFF" />
            {isDesktop && (
              <AppText variant="caption" tone="inverse" style={{ fontSize: 11, marginLeft: 4 }}>
                {copied ? 'Copied' : 'Share'}
              </AppText>
            )}
          </Pressable>
        </View>

        {/* MAIN CALL VIEWPORT (Zero Iframes) */}
        <View style={styles.viewport}>
          {callType === 'video' ? (
            <View style={StyleSheet.absoluteFill}>
              {isWeb && (
                React.createElement('video', {
                  ref: remoteVideoRef,
                  autoPlay: true,
                  playsInline: true,
                  style: {
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    backgroundColor: '#0F172A',
                  },
                })
              )}

              {connectionState !== 'connected' && (
                <View style={styles.waitingOverlay}>
                  <Avatar name={partnerName} uri={partnerAvatar} size={88} />
                  <AppText variant="h3" weight="bold" tone="inverse" style={{ marginTop: spacing.md }}>
                    {partnerName}
                  </AppText>
                  <AppText variant="caption" style={{ color: '#94A3B8', marginTop: 4 }}>
                    Connecting direct peer-to-peer WebRTC video stream...
                  </AppText>
                  <View style={styles.radarPulse}>
                    <Ionicons name="radio" size={24} color={colors.brandPrimary} />
                  </View>
                </View>
              )}

              {isWeb && (
                <View style={[styles.localPipTile, { borderColor: colors.brandPrimary }]}>
                  {React.createElement('video', {
                    ref: localVideoRef,
                    autoPlay: true,
                    playsInline: true,
                    muted: true,
                    style: {
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transform: 'scaleX(-1)',
                    },
                  })}
                  {isVideoDisabled && (
                    <View style={styles.camOffTile}>
                      <Ionicons name="videocam-off" size={20} color="#94A3B8" />
                    </View>
                  )}
                  <View style={styles.pipBadge}>
                    <AppText variant="caption" weight="bold" tone="inverse" style={{ fontSize: 9 }}>
                      You
                    </AppText>
                  </View>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.voiceModeContainer}>
              {isWeb && React.createElement('audio', { ref: remoteVideoRef, autoPlay: true, playsInline: true })}

              <View style={styles.voiceAvatarWrapper}>
                <View style={[styles.outerWaveRing, { borderColor: colors.brandPrimary + '40' }]}>
                  <View style={[styles.innerWaveRing, { borderColor: colors.brandPrimary + '70' }]}>
                    <Avatar name={partnerName} uri={partnerAvatar} size={100} />
                  </View>
                </View>
              </View>

              <AppText variant="h2" weight="bold" tone="inverse" style={{ marginTop: spacing.lg }}>
                {partnerName}
              </AppText>
              <AppText variant="bodySmall" style={{ color: '#94A3B8', marginTop: 4 }}>
                {partnerDepartment || 'Direct Campus Audio Session'}
              </AppText>

              <View style={styles.securePill}>
                <Ionicons name="lock-closed" size={12} color="#22C55E" />
                <AppText variant="caption" style={{ color: '#22C55E', fontSize: 11, marginLeft: 4 }}>
                  Direct P2P Encrypted Audio
                </AppText>
              </View>

              <AppText variant="h1" weight="bold" style={styles.voiceTimer}>
                {formatTimer(seconds)}
              </AppText>
            </View>
          )}
        </View>

        {/* FLOATING NATIVE CONTROL BAR */}
        <View style={[styles.controlsBar, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
            onPress={handleToggleMic}
            style={[
              styles.controlBtn,
              { backgroundColor: isMicMuted ? colors.critical : 'rgba(255,255,255,0.15)' },
            ]}
          >
            <Ionicons name={isMicMuted ? 'mic-off' : 'mic'} size={22} color="#FFFFFF" />
          </Pressable>

          <Pressable accessibilityRole="button" accessibilityLabel={isVideoDisabled ? 'Turn camera on' : 'Turn camera off'}
            onPress={handleToggleVideo}
            style={[
              styles.controlBtn,
              { backgroundColor: isVideoDisabled ? 'rgba(255,255,255,0.15)' : colors.brandPrimary },
            ]}
          >
            <Ionicons name={isVideoDisabled ? 'videocam-off' : 'videocam'} size={22} color="#FFFFFF" />
          </Pressable>

          <Pressable accessibilityRole="button" accessibilityLabel={isSpeakerMuted ? 'Unmute speaker' : 'Mute speaker'}
            onPress={handleToggleSpeaker}
            style={[
              styles.controlBtn,
              { backgroundColor: isSpeakerMuted ? colors.critical : 'rgba(255,255,255,0.15)' },
            ]}
          >
            <Ionicons name={isSpeakerMuted ? 'volume-mute' : 'volume-high'} size={22} color="#FFFFFF" />
          </Pressable>

          <Pressable accessibilityRole="button" accessibilityLabel="Call" onPress={handleHangup} style={[styles.hangupBtn, { backgroundColor: colors.critical }]}>
            <Ionicons name="call" size={24} color="#FFFFFF" style={{ transform: [{ rotate: '135deg' }] }} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1D',
    display: 'flex',
    flexDirection: 'column',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#131D33',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    zIndex: 20,
  },
  partnerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  topIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
  },
  viewport: {
    flex: 1,
    backgroundColor: '#0A0F1D',
    position: 'relative',
    overflow: 'hidden',
  },
  waitingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0F1D',
    zIndex: 5,
    padding: 24,
  },
  radarPulse: {
    marginTop: 24,
    padding: 12,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  localPipTile: {
    position: 'absolute',
    bottom: 24,
    right: 18,
    width: 120,
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    backgroundColor: '#000000',
    zIndex: 15,
  },
  camOffTile: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pipBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  voiceModeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  voiceAvatarWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerWaveRing: {
    padding: 14,
    borderRadius: 100,
    borderWidth: 2,
  },
  innerWaveRing: {
    padding: 10,
    borderRadius: 80,
    borderWidth: 2,
  },
  securePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 10,
  },
  voiceTimer: {
    fontSize: 34,
    color: '#F8FAFC',
    marginTop: 20,
    letterSpacing: 1,
  },
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: '#131D33',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    zIndex: 20,
  },
  controlBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hangupBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
});
