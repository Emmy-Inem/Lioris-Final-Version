import React from 'react';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { ModerationQueue } from '@/components/ModerationQueue';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';

export default function AdminModerationQueueScreen() {
  const { spacing } = useTheme();
  const { isDesktop } = useResponsive();
  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <AppText variant="h1" weight="bold" style={{ paddingTop: isDesktop ? spacing.xs : spacing.md, paddingBottom: spacing.md }}>
        Moderation Queue
      </AppText>
      <ModerationQueue />
    </ScreenContainer>
  );
}
