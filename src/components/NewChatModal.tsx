import React, { useState } from 'react';
import { FlatList, Modal, Pressable, TextInput, View, Platform, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { searchUsersToMessage, UserToMessage } from '@/api/messaging';
import { useCampusScope } from '@/hooks/useCampusScope';
import { haptics } from '@/utils/haptics';

interface NewChatModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectUser: (user: UserToMessage) => void;
}

export function NewChatModal({ visible, onClose, onSelectUser }: NewChatModalProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const { campusCode } = useCampusScope();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: users, isLoading } = useQuery({
    queryKey: ['users-to-message', searchQuery, campusCode],
    queryFn: () => searchUsersToMessage(searchQuery, campusCode),
    enabled: visible,
  });

  const handleSelect = (user: UserToMessage) => {
    haptics.light();
    onSelectUser(user);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          alignItems: 'center',
          justifyContent: isDesktop ? 'center' : 'flex-end',
          paddingTop: isDesktop ? spacing.lg : Math.max(insets.top, 16),
          paddingBottom: isDesktop ? spacing.lg : 0,
        }}
      >
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          onPress={onClose}
        />
        <View
          style={{
            width: isDesktop ? 480 : '100%',
            maxHeight: isDesktop ? '80%' : '88%',
            height: isDesktop ? 560 : '85%',
            backgroundColor: colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderBottomLeftRadius: isDesktop ? 24 : 0,
            borderBottomRightRadius: isDesktop ? 24 : 0,
            borderWidth: 1,
            borderColor: colors.border,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Mobile Grab Handle */}
          {!isDesktop && (
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.divider,
                alignSelf: 'center',
                marginTop: spacing.sm,
              }}
            />
          )}

          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              borderBottomWidth: 1,
              borderBottomColor: colors.divider,
            }}
          >
            <View>
              <AppText variant="h3" weight="bold">
                New Conversation
              </AppText>
              <AppText tone="secondary" variant="caption">
                Search campus classmates, staff & mentors
              </AppText>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Search Input */}
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: spacing.md,
                height: 42,
              }}
            >
              <Ionicons name="search" size={16} color={colors.textSecondary} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search by name..."
                placeholderTextColor={colors.textSecondary}
                autoFocus
                style={{ flex: 1, color: colors.textPrimary, fontSize: 13, outlineStyle: 'none' as any }}
              />
              {searchQuery ? (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Users List */}
          <FlatList
            data={users ?? []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handleSelect(item)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingVertical: spacing.sm + 2,
                  paddingHorizontal: spacing.sm,
                  borderRadius: radius.md,
                  backgroundColor: pressed
                    ? isDark
                      ? 'rgba(255,255,255,0.06)'
                      : '#F1F5F9'
                    : 'transparent',
                })}
              >
                <Avatar name={item.fullName} uri={item.avatarUrl} size={44} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <AppText weight="bold" variant="bodySmall" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {item.fullName}
                    </AppText>
                    <Badge
                      label={item.role.toUpperCase()}
                      tone={
                        item.role === 'staff'
                          ? 'success'
                          : item.role === 'admin'
                          ? 'critical'
                          : item.role === 'alumni'
                          ? 'warning'
                          : 'brand'
                      }
                    />
                  </View>
                  <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2 }}>
                    {item.department || `${item.campusCode || 'Campus'} Member`}
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </Pressable>
            )}
            ListEmptyComponent={
              !isLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
                  <Ionicons name="person-outline" size={36} color={colors.textSecondary} />
                  <AppText variant="bodySmall" weight="bold" style={{ marginTop: spacing.sm }}>
                    {searchQuery ? 'No campus members found' : 'No contacts found'}
                  </AppText>
                  <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                    {searchQuery ? 'Try searching for a different name' : 'Campus members will appear here'}
                  </AppText>
                </View>
              ) : null
            }
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
