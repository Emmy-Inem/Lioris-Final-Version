import React, { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { haptics } from '@/utils/haptics';
import { getVerificationDetails } from '@/api/verificationBadge';
import { UserRole } from '@/api/types';

export interface VerifiedBadgeProps {
  size?: number;
  color?: string;
  role?: UserRole;
  name?: string;
  institution?: string;
  showModalOnPress?: boolean;
}

/**
 * Authentic Social Media Verification Badge (Twitter / Instagram / Threads style).
 * Features the official 8-scallop rosette starburst with crisp interior checkmark.
 */
export function VerifiedBadge({
  size = 15,
  color,
  role = 'student',
  name,
  institution,
  showModalOnPress = true,
}: VerifiedBadgeProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const [modalOpen, setModalOpen] = useState(false);

  const details = getVerificationDetails({ role, fullName: name });
  const badgeColor = color || (role === 'admin' ? '#EAB308' : '#1D9BF0');

  function handlePress(e: any) {
    e?.stopPropagation?.();
    if (showModalOnPress) {
      haptics.light();
      setModalOpen(true);
    }
  }

  const badgeIcon = (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Official 8-scalloped rosette starburst contour */}
      <Path
        fill={badgeColor}
        d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z"
      />
      {/* Crisp white checkmark */}
      <Path
        d="M7 12.3l3.2 3.3L17.2 8.5"
        stroke="#FFFFFF"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );

  if (!showModalOnPress) {
    return <View style={{ flexShrink: 0, justifyContent: 'center', alignItems: 'center' }}>{badgeIcon}</View>;
  }

  return (
    <>
      <Pressable
        onPress={handlePress}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Verified account badge"
        style={{ flexShrink: 0, justifyContent: 'center', alignItems: 'center' }}
      >
        {badgeIcon}
      </Pressable>

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <Pressable accessibilityViewIsModal
          onPress={() => setModalOpen(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: spacing.lg,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.surface,
              borderRadius: 20,
              padding: spacing.xl,
              maxWidth: 360,
              width: '100%',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: colors.border,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.1,
              shadowRadius: 10,
              elevation: 3,
            }}
          >
            <View style={{ marginBottom: spacing.md, transform: [{ scale: 1.6 }] }}>
              {badgeIcon}
            </View>

            <AppText variant="h2" weight="bold" style={{ textAlign: 'center', marginBottom: 4 }}>
              Verified Account
            </AppText>

            {name && (
              <AppText tone="secondary" variant="bodySmall" weight="semiBold" style={{ marginBottom: spacing.sm }}>
                {name}
              </AppText>
            )}

            <AppText
              tone="secondary"
              variant="bodySmall"
              style={{ textAlign: 'center', lineHeight: 20, marginBottom: spacing.md }}
            >
              {details.explanation}
            </AppText>

            <View
              style={{
                width: '100%',
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                borderRadius: 12,
                padding: spacing.sm,
                marginBottom: spacing.lg,
                gap: 6,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                <AppText variant="caption" weight="semiBold">
                  Verified Institutional Standing
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="shield-checkmark" size={14} color="#1D9BF0" />
                <AppText variant="caption" tone="secondary">
                  Official University Identity Confirmed
                </AppText>
              </View>
            </View>

            <AppButton label="Got it" variant="secondary" size="sm" onPress={() => setModalOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
