import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { SolidCard } from './SolidCard';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useAuth } from '@/auth/AuthContext';
import { haptics } from '@/utils/haptics';

export interface QuickViewUser {
  id?: string;
  name: string;
  department?: string;
  level?: string;
  role?: 'student' | 'alumni' | 'staff' | 'admin';
  bio?: string;
  avatarUrl?: string;
}

interface UserProfileQuickViewModalProps {
  user: QuickViewUser | null;
  visible: boolean;
  onClose: () => void;
}

export function UserProfileQuickViewModal({
  user,
  visible,
  onClose,
}: UserProfileQuickViewModalProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const { user: currentUser } = useAuth();
  const roleGroup = currentUser?.role ? `(${currentUser.role})` : '(student)';

  if (!user) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[
            styles.modalContent,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              width: isDesktop ? 440 : '90%',
              borderRadius: 24,
              padding: spacing.lg,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header row with close button */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md }}>
            <Avatar name={user.name} size={64} role={user.role ?? 'student'} />
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* User Info */}
          <View style={{ gap: 4, marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AppText variant="h2" weight="bold">
                {user.name}
              </AppText>
              <Badge label="Verified" tone="brand" />
            </View>
            <AppText tone="secondary" variant="bodySmall">
              {user.department ?? 'Faculty of Science • University of Ibadan'}
            </AppText>
            {user.level && (
              <AppText tone="secondary" variant="caption" style={{ color: colors.brandPrimary, fontWeight: '600' }}>
                {user.level} Level
              </AppText>
            )}
          </View>

          {/* Bio / Summary */}
          <SolidCard radius={16} style={{ padding: spacing.md, marginBottom: spacing.lg, backgroundColor: colors.pastelPrimaryBg }}>
            <AppText variant="caption" tone="secondary" style={{ fontStyle: 'italic', lineHeight: 18 }}>
              {user.bio ?? 'Active student scholar engaged in departmental seminars, study sessions, and campus academic collaboration.'}
            </AppText>
          </SolidCard>

          {/* Action Buttons */}
          <View style={{ gap: spacing.sm }}>
            <AppButton
              label="Send Direct Message"
              icon="chatbubble-ellipses-outline"
              variant="primary"
              fullWidth
              onPress={() => {
                haptics.light();
                onClose();
                router.push(`/${roleGroup}/messages/conv-1` as any);
              }}
            />
            <AppButton
              label="Dismiss"
              variant="ghost"
              fullWidth
              onPress={onClose}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
});
