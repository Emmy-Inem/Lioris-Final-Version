import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useSegments } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { LiorisLogo } from './LiorisLogo';
import { ChangeWorkspaceScopeModal } from './ChangeWorkspaceScopeModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { listNotifications } from '@/api/notifications';
import { getMyProfile } from '@/api/profile';
import { getInstitutionByCode } from '@/api/institutions';
import { useViewScope } from '@/hooks/useViewScope';

/**
 * The persistent top bar shown on every screen in the screenshot
 * reference (logo+wordmark, search, bell+badge, avatar) — not just on
 * the dashboard. Previously only the dashboard had a header; Forum,
 * Event, and Library screens had a plain text title instead.
 *
 * The workspace-scope pill (e.g. "UI ▾") controls the shared
 * Global/Campus content toggle (`useViewScope`) — shown for every
 * role, since content scoping applies to all of them, not just
 * alumni/staff/admin.
 */
export function AppHeader() {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const segments = useSegments();
  const roleGroup = segments[0];
  const [scopeModalOpen, setScopeModalOpen] = useState(false);
  const { scope, setScope } = useViewScope();

  const { data: notifications } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => listNotifications({ status: 'unread' }),
  });
  const unreadCount = notifications?.length ?? 0;
  // Previously hidden for students on the assumption only non-students
  // needed a workspace switcher — but the Global/Campus content toggle
  // this pill controls needs to work for every role, students included.
  const showWorkspaceSwitcher = true;

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user && showWorkspaceSwitcher,
  });
  const homeInstitutionCode = profile?.institutionCode ?? 'UI';
  const homeInstitutionName = getInstitutionByCode(homeInstitutionCode)?.name ?? profile?.institutionName ?? 'Your Campus';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: spacing.sm,
        paddingBottom: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 }}>
        <LiorisLogo size={26} />
        <AppText variant="h3" weight="bold" tone="brand" style={{ letterSpacing: 0.5 }}>
          LIORIS
        </AppText>
        {showWorkspaceSwitcher ? (
          <Pressable
            onPress={() => setScopeModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Workspace scope: ${scope === 'campus' ? homeInstitutionCode : 'Global'}`}
            accessibilityHint="Opens the workspace scope switcher"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 2,
              backgroundColor: colors.pastelPrimaryBg,
              borderRadius: radius.pill,
              paddingHorizontal: spacing.sm,
              paddingVertical: 4,
              marginLeft: spacing.xs,
            }}
          >
            <AppText variant="caption" weight="bold" style={{ color: colors.brandPrimary }}>
              {scope === 'campus' ? homeInstitutionCode : 'Global'} {scope === 'campus' ? '🎓' : '🌍'}
            </AppText>
            <Ionicons name="chevron-down" size={11} color={colors.brandPrimary} />
          </Pressable>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Search"
          onPress={() => router.push(`/${roleGroup}/search` as any)}
        >
          <Ionicons name="search" size={20} color={colors.textPrimary} />
        </Pressable>
        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          onPress={() => router.push(`/${roleGroup}/notifications` as any)}
        >
          <View>
            <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
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
        <Pressable
          onPress={() => router.push(`/${roleGroup}/profile` as any)}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
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
