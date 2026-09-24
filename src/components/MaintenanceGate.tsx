import React from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { isMaintenanceModeOn } from '@/api/platformSettings';

/**
 * Enforces the "Maintenance mode" switch (Admin > Platform > Campuses & Security).
 *
 * While it is on, signed-in members see a maintenance screen instead of the app; admins keep full
 * access and get a reminder banner so they never forget it is switched on. It is a front-end gate -
 * it does not stop the database accepting writes from a modified client.
 */
export function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { colors, spacing } = useTheme();

  const { data: maintenance, refetch, isFetching } = useQuery({
    queryKey: ['platform', 'maintenance-mode'],
    queryFn: () => isMaintenanceModeOn(true),
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });

  if (!user || !maintenance) return <>{children}</>;

  if (user.actualRole === 'admin') {
    return (
      <>
        <View
          accessibilityRole="alert"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            backgroundColor: colors.critical,
            paddingVertical: 6,
            paddingHorizontal: spacing.md,
          }}
        >
          <Ionicons name="construct" size={14} color="#FFFFFF" />
          <AppText variant="caption" weight="bold" tone="inverse" numberOfLines={2} style={{ flexShrink: 1, textAlign: 'center' }}>
            Maintenance mode is ON - members cannot use the app. Turn it off in Platform &gt; Campuses & Security.
          </AppText>
        </View>
        {children}
      </>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
        gap: spacing.md,
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: colors.pastelPrimaryBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="construct-outline" size={34} color={colors.brandPrimary} />
      </View>
      <AppText variant="h2" weight="bold" style={{ textAlign: 'center' }}>
        Lioris is being updated
      </AppText>
      <AppText tone="secondary" style={{ textAlign: 'center', maxWidth: 360 }}>
        We are doing some maintenance and will be back shortly. Your account and data are safe.
      </AppText>
      <AppButton label="Check again" variant="secondary" onPress={() => refetch()} loading={isFetching} />
    </View>
  );
}
