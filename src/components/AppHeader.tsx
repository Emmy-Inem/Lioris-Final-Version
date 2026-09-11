import React, { useState } from'react';
import { Platform, Pressable, View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { router, useSegments } from'expo-router';
import { useQuery } from'@tanstack/react-query';
import { AppText } from'./AppText';
import { Avatar } from'./Avatar';
import { LiorisLogo } from'./LiorisLogo';
import { ChangeWorkspaceScopeModal } from'./ChangeWorkspaceScopeModal';
import { useTheme } from'@/theme/ThemeProvider';
import { useAuth } from'@/auth/AuthContext';
import { listNotifications } from '@/api/notifications';
import { listConversations } from '@/api/messaging';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { getMyProfile } from '@/api/profile';
import { getInstitutionByCode } from '@/api/institutions';
import { useResponsive } from '@/hooks/useResponsive';
import { useViewScope } from '@/hooks/useViewScope';
import { haptics } from '@/utils/haptics';

export function AppHeader() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const { isFeatureEnabled } = useFeatureFlags();
  const { user } = useAuth();

 if (isDesktop) return null;

 const segments = useSegments();
 const roleGroup = segments[0] || '(student)';
 const [scopeModalOpen, setScopeModalOpen] = useState(false);
 const { scope, setScope, activeCampusCode } = useViewScope();

  const { data: notifications } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => listNotifications({ status: 'unread' }),
  });
  const unreadCount = notifications?.length ?? 0;

  const messagingEnabled = isFeatureEnabled('e2ee_messaging');
  const { data: conversations } = useQuery({
    queryKey: ['conversations', 'unread-count'],
    queryFn: () => listConversations(),
    enabled: !!user && messagingEnabled,
  });
  const unreadMessagesCount = (conversations ?? []).reduce(
    (sum, c) => sum + (c.unreadCount || 0),
    0,
  );
  const showWorkspaceSwitcher = true;

 const { data: profile } = useQuery({
 queryKey: ['profile', 'me', user?.id],
 queryFn: () => getMyProfile(user!),
 enabled: !!user && showWorkspaceSwitcher,
 });
  const homeInstitutionCode =
    (activeCampusCode && activeCampusCode !== 'GLOBAL')
      ? activeCampusCode
      : (profile?.institutionCode && profile.institutionCode !== 'GLOBAL')
      ? profile.institutionCode
      : 'UI';
  const homeInstitutionName = getInstitutionByCode(homeInstitutionCode)?.name ?? 'University of Ibadan';

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: spacing.xs,
          paddingBottom: spacing.sm,
          zIndex: 10,
        },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 0, overflow: 'hidden' }}>
        <LiorisLogo size={26} variant="symbol" />
        <View style={{ marginLeft: 3 }}>
          <LiorisLogo size={18} variant="wordmark" />
        </View>
        {showWorkspaceSwitcher ? (
          <Pressable
            onPress={() => {
              haptics.light();
              setScopeModalOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Workspace scope: ${scope === 'campus' ? homeInstitutionCode : 'Global'}`}
            accessibilityHint="Opens the workspace scope switcher"
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: isDark ? 'rgba(124, 58, 237, 0.18)' : 'rgba(124, 58, 237, 0.10)',
                borderRadius: radius.pill,
                paddingHorizontal: 9,
                paddingVertical: 4,
                marginLeft: 8,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(167, 139, 250, 0.35)' : 'rgba(124, 58, 237, 0.25)',
                flexShrink: 0,
              },
              Platform.OS === 'web' &&
                ({
                  backdropFilter: 'blur(16px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                  boxShadow: isDark
                    ? 'none'
                    : 'inset 0 1px 1px rgba(255, 255, 255, 0.60)',
                } as any),
            ]}
          >
            <Ionicons
              name={scope === 'campus' ? 'school' : 'globe'}
              size={12}
              color={colors.brandPrimary}
            />
            <AppText variant="caption" weight="bold" style={{ color: colors.brandPrimary, fontSize: 10.5 }}>
              {scope === 'campus' ? homeInstitutionCode : 'Global'}
            </AppText>
            <Ionicons name="chevron-down" size={10} color={colors.brandPrimary} />
          </Pressable>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {/* Direct Messages Button */}
        {messagingEnabled && (
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={unreadMessagesCount > 0 ? `Messages, ${unreadMessagesCount} unread` : 'Messages'}
            onPress={() => {
              haptics.light();
              router.push(`/${roleGroup}/messages` as any);
            }}
            style={[
              {
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: isDark ? 'rgba(30, 41, 59, 0.70)' : 'rgba(255, 255, 255, 0.75)',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.08)',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              },
              Platform.OS === 'web' &&
                ({
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  boxShadow: isDark
                    ? 'none'
                    : 'inset 0 1px 1px #fff',
                } as any),
            ]}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={17} color={colors.textPrimary} />
            {unreadMessagesCount > 0 && (
              <View
                style={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  minWidth: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: colors.brandPrimary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 2,
                  borderWidth: 1.5,
                  borderColor: colors.surface,
                }}
              >
                <AppText
                  variant="caption"
                  weight="bold"
                  tone="inverse"
                  style={{ fontSize: 8, lineHeight: 10 }}
                >
                  {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
                </AppText>
              </View>
            )}
          </Pressable>
        )}

        {/* Global Search Button */}
        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Search"
          onPress={() => {
            haptics.light();
            router.push(`/${roleGroup}/search` as any);
          }}
          style={[
            {
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: isDark ? 'rgba(30, 41, 59, 0.70)' : 'rgba(255, 255, 255, 0.75)',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.08)',
              alignItems: 'center',
              justifyContent: 'center',
            },
            Platform.OS === 'web' &&
              ({
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                boxShadow: isDark
                  ? 'none'
                  : 'inset 0 1px 1px #fff',
              } as any),
          ]}
        >
          <Ionicons name="search" size={17} color={colors.textPrimary} />
        </Pressable>

        {/* Notifications Bell Button */}
        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          onPress={() => {
            haptics.light();
            router.push(`/${roleGroup}/notifications` as any);
          }}
          style={[
            {
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: isDark ? 'rgba(30, 41, 59, 0.70)' : 'rgba(255, 255, 255, 0.75)',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.08)',
              alignItems: 'center',
              justifyContent: 'center',
            },
            Platform.OS === 'web' &&
              ({
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                boxShadow: isDark
                  ? 'none'
                  : 'inset 0 1px 1px #fff',
              } as any),
          ]}
        >
          <View>
            <Ionicons name="notifications-outline" size={17} color={colors.textPrimary} />
            {unreadCount > 0 ? (
              <View
                style={{
                  position: 'absolute',
                  top: -3,
                  right: -3,
                  minWidth: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: colors.critical,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 3,
                }}
              >
                <AppText style={{ fontSize: 9, color: '#FFFFFF' }} weight="bold">
                  {unreadCount}
                </AppText>
              </View>
            ) : null}
          </View>
        </Pressable>

        {/* Profile Avatar Pill */}
        <Pressable
          onPress={() => {
            haptics.light();
            router.push(`/${roleGroup}/profile` as any);
          }}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
          style={{ marginLeft: 2 }}
        >
          <Avatar name={user?.fullName ?? 'You'} uri={profile?.avatarUrl} size={32} />
        </Pressable>
      </View>

 <ChangeWorkspaceScopeModal
 visible={scopeModalOpen}
 onClose={() => setScopeModalOpen(false)}
 homeInstitution={homeInstitutionName}
 homeInstitutionCode={homeInstitutionCode}
 scope={scope}
 onSelectScope={setScope}
 />
 </View>
 );
}
