import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';

interface StaffAdminBoardCardProps {
  role: 'staff' | 'admin';
  onOpenAdminWorkdesk: () => void;
  onManagePortalLinks: () => void;
}

/**
 * Ported from the "STAFF EXECUTIVE DASHBOARD" / "Administrative
 * Workdesk Overview" card in DashboardScreen. The reference source
 * hardcodes "STAFF" here even on the shared staff/admin branch — fixed
 * to actually reflect the signed-in account's role, since an admin
 * seeing "STAFF EXECUTIVE DASHBOARD" on their own Home screen is a real
 * role-distinction bug, not a cosmetic one.
 */
export function StaffAdminBoardCard({ role, onOpenAdminWorkdesk, onManagePortalLinks }: StaffAdminBoardCardProps) {
  const { colors, spacing } = useTheme();
  const label = role === 'admin' ? 'ADMIN EXECUTIVE DASHBOARD' : 'STAFF EXECUTIVE DASHBOARD';
  const description =
    role === 'admin'
      ? 'Full root access: platform-wide moderation, configuration, and university onboarding.'
      : 'Authorized access matches administrative senate channels, registration locks, and portal configuration rights only. General peer student flows are locked.';

  return (
    <SolidCard radius={20} style={{ marginBottom: spacing.lg, borderWidth: 1, borderColor: `${colors.critical}59` }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="shield-outline" size={18} color={colors.critical} />
        <AppText variant="caption" weight="bold" style={{ color: colors.critical, letterSpacing: 1 }}>
          {label}
        </AppText>
      </View>

      <AppText variant="h3" weight="bold" style={{ marginTop: spacing.sm }}>
        Administrative Workdesk Overview
      </AppText>
      <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 4, marginBottom: spacing.md }}>
        {description}
      </AppText>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <AppButton label="Open admin workdesk" onPress={onOpenAdminWorkdesk} />
        <AppButton label="Manage portal links" variant="secondary" onPress={onManagePortalLinks} />
      </View>
    </SolidCard>
  );
}
