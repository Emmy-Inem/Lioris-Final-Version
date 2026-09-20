import React from 'react';
import { View } from 'react-native';
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
      <View style={{ paddingTop: isDesktop ? spacing.xs : spacing.md, paddingBottom: spacing.md }}>
        <AppText variant={isDesktop ? 'h1' : 'h3'} weight="bold">
          Moderation Queue
        </AppText>
      </View>
      <ModerationQueue />
    </ScreenContainer>
  );
}
