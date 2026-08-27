import React from'react';
import { View } from'react-native';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { AppText } from'@/components/AppText';
import { ModerationQueue } from'@/components/ModerationQueue';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';

export default function AdminReportsScreen() {
  const { spacing } = useTheme();
  const { isDesktop } = useResponsive();

  return (
    <ScreenContainer glow={true}>
      {!isDesktop && <AppHeader />}
      <View style={{ paddingTop: isDesktop ? spacing.xs : spacing.md, marginBottom: spacing.sm }}>
        <AppText variant="h1" weight="bold">
          Incident Reports & Safety
        </AppText>
        <AppText tone="secondary">
          Review community flagged threads, chat harassment, and policy violations
        </AppText>
      </View>

      <ModerationQueue emptyTitle="No open incident reports" />
    </ScreenContainer>
  );
}
