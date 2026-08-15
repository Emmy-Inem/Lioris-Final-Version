import React from'react';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { AppText } from'@/components/AppText';
import { ModerationQueue } from'@/components/ModerationQueue';
import { useTheme } from'@/theme/ThemeProvider';

export default function AdminModerationQueueScreen() {
  const { spacing } = useTheme();
  return (
    <ScreenContainer glow={false}>
      <AppHeader />
      <AppText variant="h1"weight="bold"style={{ paddingVertical: spacing.lg }}>
        Moderation Queue
      </AppText>
      <ModerationQueue />
    </ScreenContainer>
  );
}
