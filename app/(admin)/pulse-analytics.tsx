import React from 'react';
import { View } from 'react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { useTheme } from '@/theme/ThemeProvider';

export default function PulseAnalyticsScreen() {
  const { spacing } = useTheme();

  return (
    <ScreenContainer glow={false}>
      <AppHeader />
      <AppText variant="h1" weight="bold" style={{ paddingTop: spacing.lg, marginBottom: spacing.lg }}>
        University Pulse Analytics
      </AppText>

      <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
        <SolidCard style={{ flex: 1 }}>
          <AppText tone="secondary" variant="caption">
            DAU / MAU
          </AppText>
          <AppText variant="h2" weight="bold">
            24K / 89K
          </AppText>
        </SolidCard>
        <SolidCard style={{ flex: 1 }}>
          <AppText tone="secondary" variant="caption">
            Cost of acquisition
          </AppText>
          <AppText variant="h2" weight="bold">
            $1.42
          </AppText>
        </SolidCard>
      </View>

      <SolidCard style={{ height: 180, alignItems: 'center', justifyContent: 'center' }}>
        <AppText tone="secondary">User retention graph (chart placeholder)</AppText>
      </SolidCard>
    </ScreenContainer>
  );
}
