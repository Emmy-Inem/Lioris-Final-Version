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
import { listNotifications } from'@/api/notifications';
import { getMyProfile } from'@/api/profile';
import { getInstitutionByCode } from'@/api/institutions';
import { useViewScope } from'@/hooks/useViewScope';
import { haptics } from'@/utils/haptics';

export function AppHeader() {
  const { colors, spacing, radius, isDark, toggleTheme } = useTheme();
  const { user } = useAuth();
  const segments = useSegments();
  const roleGroup = segments[0] || '(student)';
  const [scopeModalOpen, setScopeModalOpen] = useState(false);
  const { scope, setScope, activeCampusCode } = useViewScope();

  const { data: notifications } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => listNotifications({ status: 'unread' }),
  });
  const unreadCount = notifications?.length ?? 0;
  const showWorkspaceSwitcher = true;

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user && showWorkspaceSwitcher,
  });
  const homeInstitutionCode = activeCampusCode || profile?.institutionCode || 'UI';
  const homeInstitutionName = getInstitutionByCode(homeInstitutionCode)?.name ?? profile?.institutionName ?? 'Your Campus';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: spacing.xs,
        paddingBottom: spacing.sm,
        zIndex: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 }}>
        <LiorisLogo size={24} variant="symbol" />
        <LiorisLogo size={36} variant="wordmark" />
        {showWorkspaceSwitcher ? (
          <Pressable
            onPress={() => {
              haptics.light();
              setScopeModalOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Workspace scope: ${scope === 'campus' ? homeInstitutionCode : 'Global'}`}
            accessibilityHint="Opens the workspace scope switcher"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 3,
              backgroundColor: colors.pastelPrimaryBg,
              borderRadius: radius.pill,
              paddingHorizontal: 6,
              paddingVertical: 4,
              marginLeft: 4,
              borderWidth: 1,
              borderColor: `${colors.brandPrimary}25`,
              flexShrink: 0,
            }}
          >
            <Ionicons
              name={scope === 'campus' ? 'school-outline' : 'globe-outline'}
              size={11}
              color={colors.brandPrimary}
            />
            <AppText variant="caption" weight="bold" style={{ color: colors.brandPrimary, fontSize: 10 }}>
              {scope === 'campus' ? homeInstitutionCode : 'Global'}
            </AppText>
            <Ionicons name="chevron-down" size={10} color={colors.brandPrimary} />
          </Pressable>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {/* Theme Toggle Button */}
        <Pressable
          hitSlop={8}
          accessibilityRole="button"accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          onPress={() => {
            haptics.light();
            toggleTheme();
          }}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={18} color={colors.textPrimary} />
        </Pressable>

        {/* Global Search Button */}
        <Pressable
          hitSlop={8}
          accessibilityRole="button"accessibilityLabel="Search"onPress={() => {
            haptics.light();
            router.push(`/${roleGroup}/search` as any);
          }}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="search"size={18} color={colors.textPrimary} />
        </Pressable>

        {/* Notifications Bell Button */}
        <Pressable
          hitSlop={8}
          accessibilityRole="button"accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          onPress={() => {
            haptics.light();
            router.push(`/${roleGroup}/notifications` as any);
          }}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View>
            <Ionicons name="notifications-outline"size={18} color={colors.textPrimary} />
            {unreadCount > 0 ? (
              <View
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -6,
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
          accessibilityRole="button"accessibilityLabel="Open profile"style={{ marginLeft: 2 }}
        >
          <Avatar name={user?.fullName ?? 'You'} size={32} />
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
