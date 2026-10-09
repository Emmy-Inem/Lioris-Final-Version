import React, { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { haptics } from '@/utils/haptics';

export interface AmbassadorBadgeProps {
  size?: number;
  label?: string;
  showModalOnPress?: boolean;
}

/**
 * Campus Ambassador Badge.
 * Highlights students appointed by university administration and campus leads.
 * Tapping opens an official verification credential modal.
 */
export function AmbassadorBadge({
  size = 13,
  label = 'Ambassador',
  showModalOnPress = true,
}: AmbassadorBadgeProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const [modalOpen, setModalOpen] = useState(false);

  function handlePress(e: any) {
    e?.stopPropagation?.();
    if (showModalOnPress) {
      haptics.light();
      setModalOpen(true);
    }
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Campus Ambassador credential. Tap for details."
        onPress={handlePress}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 3.5,
          backgroundColor: isDark ? 'rgba(217, 119, 6, 0.22)' : 'rgba(245, 158, 11, 0.15)',
          borderWidth: 1,
          borderColor: isDark ? '#D97706' : '#F59E0B',
          paddingHorizontal: 6,
          paddingVertical: 1.5,
          borderRadius: radius.pill,
          alignSelf: 'center',
        }}
      >
        <Ionicons name="star" size={size} color="#F59E0B" />
        {label ? (
          <AppText
            variant="caption"
            weight="bold"
            style={{
              color: isDark ? '#FCD34D' : '#B45309',
              fontSize: 10,
              letterSpacing: 0.2,
              textTransform: 'uppercase',
            }}
          >
            {label}
          </AppText>
        ) : null}
      </Pressable>

      {/* Campus Ambassador Credential Explainer Modal */}
      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModalOpen(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: spacing.lg,
          }}
          onPress={() => setModalOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 380,
              backgroundColor: colors.surface,
              borderRadius: radius.xl,
              padding: spacing.xl,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.3,
              shadowRadius: 16,
              elevation: 10,
            }}
          >
            {/* Header Icon */}
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: isDark ? 'rgba(217, 119, 6, 0.25)' : 'rgba(245, 158, 11, 0.18)',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: spacing.md,
                borderWidth: 1.5,
                borderColor: '#F59E0B',
              }}
            >
              <Ionicons name="star" size={30} color="#F59E0B" />
            </View>

            <AppText variant="h3" weight="bold" style={{ textAlign: 'center', marginBottom: 4 }}>
              Campus Ambassador
            </AppText>

            <AppText
              variant="caption"
              tone="secondary"
              weight="semiBold"
              style={{ textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.md }}
            >
              Official Campus Student Leader
            </AppText>

            <View
              style={{
                backgroundColor: colors.divider,
                borderRadius: radius.md,
                padding: spacing.md,
                width: '100%',
                marginBottom: spacing.lg,
                gap: spacing.sm,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" style={{ marginTop: 2 }} />
                <AppText variant="bodySmall" style={{ flex: 1, lineHeight: 18 }}>
                  Appointed by university leadership and student development councils.
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" style={{ marginTop: 2 }} />
                <AppText variant="bodySmall" style={{ flex: 1, lineHeight: 18 }}>
                  Curates and proposes official university discussion spaces.
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" style={{ marginTop: 2 }} />
                <AppText variant="bodySmall" style={{ flex: 1, lineHeight: 18 }}>
                  Facilitates peer academic onboarding and resource sharing.
                </AppText>
              </View>
            </View>

            <AppButton
              label="Understood"
              variant="primary"
              fullWidth
              onPress={() => setModalOpen(false)}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
