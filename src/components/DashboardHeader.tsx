import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useSegments } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { listNotifications } from '@/api/notifications';

interface DashboardHeaderProps {
  greetingOverride?: string;
  notificationsPath: string;
}

export function DashboardHeader({ greetingOverride, notificationsPath }: DashboardHeaderProps) {
  const { colors, spacing } = useTheme();
  const { user } = useAuth();
  const segments = useSegments();
  const roleGroup = segments[0];

  const { data: notifications } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => listNotifications({ status: 'unread' }),
  });

  const unreadCount = notifications?.length ?? 0;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: spacing.md,
        paddingBottom: spacing.lg,
      }}
    >
      <Pressable
        onPress={() => router.push(`/${roleGroup}/profile` as any)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 }}
        accessibilityRole="button"
        accessibilityLabel="Open profile"
      >
        <Avatar name={user?.fullName ?? 'You'} />
        <View>
          <AppText tone="secondary" variant="bodySmall">
            {greetingOverride ?? 'Welcome back'}
          </AppText>
          <AppText variant="h3" weight="bold">
            {user?.fullName ?? 'There'}
          </AppText>
        </View>
      </Pressable>

      <Pressable
        onPress={() => router.push(notificationsPath as any)}
        hitSlop={12}
        style={{ padding: spacing.sm }}
        accessibilityRole="button"
        accessibilityLabel="Notifications"
      >
        <View>
          <Ionicons name="notifications-outline" size={24} color={colors.textPrimary} />
          {unreadCount > 0 ? (
            <View
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                width: 9,
                height: 9,
                borderRadius: 5,
                backgroundColor: '#FF7A1A',
              }}
            />
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}
