import React, { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View, ScrollView } from 'react-native';
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
import { getOrCreateConversationWithUser } from '@/api/messaging';
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
  const [startingChat, setStartingChat] = useState(false);

  /**
   * Opens the real conversation with this person. This used to push a
   * hardcoded `messages/conv-1`, so "Send Direct Message" always dropped
   * the user into the same empty thread regardless of whose profile it was.
   */
  async function handleSendDirectMessage(target: QuickViewUser) {
    haptics.light();
    if (!target.id) {
      Alert.alert('Direct message', 'This profile is not linked to a messageable account yet.');
      return;
    }
    setStartingChat(true);
    try {
      const conversation = await getOrCreateConversationWithUser(
        target.id,
        target.name,
        target.avatarUrl ?? null,
      );
      onClose();
      router.push(`/${roleGroup}/messages/${conversation.id}` as any);
    } catch {
      Alert.alert('Couldn’t start conversation', 'Please try again.');
    } finally {
      setStartingChat(false);
    }
  }

  if (!user) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityViewIsModal accessible={false} importantForAccessibility="no" style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[
            styles.modalContent,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              width: '100%',
              maxWidth: 440,
              maxHeight: '90%',
              borderRadius: 24,
              padding: spacing.lg,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header row with close button */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md }}>
              <Avatar name={user.name} size={64} role={user.role ?? 'student'} />
              <Pressable accessibilityRole="button" accessibilityLabel="Close"
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
                <Badge label="Verified" tone="neutral" />
              </View>
              <AppText tone="secondary" variant="bodySmall">
                {user.department ?? 'Faculty of Science • University of Ibadan'}
              </AppText>
              {user.level && (
                <AppText tone="secondary" variant="caption" style={{ fontWeight: '600' }}>
                  {user.level} Level
                </AppText>
              )}
            </View>

            {/* Bio / Summary */}
            <SolidCard radius={16} style={{ padding: spacing.md, marginBottom: spacing.lg, backgroundColor: colors.divider }}>
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
                loading={startingChat}
                onPress={() => handleSendDirectMessage(user)}
              />
              <AppButton
                label="Dismiss"
                variant="ghost"
                fullWidth
                onPress={onClose}
              />
            </View>
          </ScrollView>
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
    padding: 16,
  },
  modalContent: {
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
});
