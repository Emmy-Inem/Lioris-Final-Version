import React from 'react';
import { AdminSectionTabs } from '@/components/admin/AdminSectionTabs';
import { useAdminBadges } from '@/components/admin/useAdminBadges';
import { View } from 'react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { ModerationQueue } from '@/components/ModerationQueue';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';

export default function AdminModerationQueueScreen() {
  const adminBadges = useAdminBadges();
  const { spacing } = useTheme();
  const { isDesktop } = useResponsive();
  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <View style={{ paddingTop: isDesktop ? 4 : 8 }}>
        <AdminSectionTabs group="safety" badges={{ reports: adminBadges.reports, takedowns: adminBadges.takedowns }} />
      </View>
      <View style={{ paddingTop: isDesktop ? spacing.xs : spacing.md, paddingBottom: spacing.md }}>
        <AppText variant={isDesktop ? 'h1' : 'h3'} weight="bold">
          Reports
        </AppText>
        <AppText tone="secondary" variant="caption">
          Content and members flagged by the community, waiting for a decision
        </AppText>
      </View>
      <ModerationQueue />
    </ScreenContainer>
  );
}
