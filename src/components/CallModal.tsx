import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { haptics } from '@/utils/haptics';

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
  const [seconds, setSeconds] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!visible) {
      setSeconds(0);
      setCopied(false);
      return;
    }
    const interval = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [visible]);

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCopyLink = async () => {
    haptics.medium();
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(callUrl);
      } catch {
        // Non-blocking fallback
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleOpenExternal = () => {
    haptics.light();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(callUrl, '_blank');
    } else {
      Linking.openURL(callUrl);
    }
  };

  const handleHangup = () => {
    haptics.error();
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleHangup}>
      <View
        style={{
          flex: 1,
          backgroundColor: '#0F172A',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Top Control Bar */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm + 2,
            backgroundColor: '#1E293B',
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(255,255,255,0.1)',
            zIndex: 10,
          }}
        >
          {/* Partner Info */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, minWidth: 0 }}>
            <Avatar name={partnerName} uri={partnerAvatar} size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AppText weight="bold" variant="bodySmall" tone="inverse" numberOfLines={1}>
                  {partnerName}
                </AppText>
                <Badge
                  label={callType === 'voice' ? 'VOICE' : 'VIDEO'}
                  tone={callType === 'voice' ? 'accent' : 'brand'}
                />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E', flexShrink: 0 }} />
                <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                  {formatTimer(seconds)} • {partnerDepartment || 'Encrypted Campus WebRTC'}
                </AppText>
              </View>
            </View>
          </View>

          {/* Right Action Icons */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 0 }}>
            <Pressable
              onPress={handleCopyLink}
              hitSlop={8}
              style={{
                height: 36,
                paddingHorizontal: 10,
                borderRadius: radius.pill,
                backgroundColor: 'rgba(255,255,255,0.12)',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={15} color="#FFFFFF" />
              {isDesktop && (
                <AppText variant="caption" weight="medium" tone="inverse" style={{ fontSize: 11 }}>
                  {copied ? 'Copied!' : 'Copy Link'}
                </AppText>
              )}
            </Pressable>

            <Pressable
              onPress={handleOpenExternal}
              hitSlop={8}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: 'rgba(255,255,255,0.12)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              accessibilityLabel="Open Full Screen"
            >
              <Ionicons name="open-outline" size={17} color="#FFFFFF" />
            </Pressable>

            {/* End Call Button */}
            <Pressable
              onPress={handleHangup}
              hitSlop={8}
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: colors.critical,
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: 4,
              }}
              accessibilityLabel="End Call"
            >
              <Ionicons name="call" size={18} color="#FFFFFF" style={{ transform: [{ rotate: '135deg' }] }} />
            </Pressable>
          </View>
        </View>

        {/* Live WebRTC Stream Frame */}
        <View style={{ flex: 1, backgroundColor: '#0B0F19', position: 'relative' }}>
          {Platform.OS === 'web' ? (
            React.createElement('iframe', {
              src: callUrl,
              style: {
                width: '100%',
                height: '100%',
                border: 'none',
                backgroundColor: '#0F172A',
              },
              allow: 'camera; microphone; display-capture; autoplay; clipboard-write; fullscreen',
            })
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
              <Avatar name={partnerName} uri={partnerAvatar} size={84} />
              <AppText variant="h2" weight="bold" tone="inverse" style={{ marginTop: spacing.md }}>
                {partnerName}
              </AppText>
              <AppText variant="bodySmall" style={{ color: 'rgba(255,255,255,0.7)', marginTop: spacing.xs }}>
                {callType === 'voice' ? 'Campus Voice Session' : 'Campus Video Room'}
              </AppText>
              <AppText variant="h3" weight="bold" style={{ color: '#22C55E', marginTop: spacing.md }}>
                {formatTimer(seconds)}
              </AppText>

              <Pressable
                onPress={handleOpenExternal}
                style={{
                  marginTop: spacing.xl,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  backgroundColor: colors.brandPrimary,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: 12,
                  borderRadius: radius.pill,
                }}
              >
                <Ionicons name="videocam" size={18} color="#FFFFFF" />
                <AppText weight="bold" tone="inverse">
                  Join in Native Browser
                </AppText>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
