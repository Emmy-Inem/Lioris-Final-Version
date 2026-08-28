import React from 'react';
import { Alert, ScrollView, Switch, View } from 'react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { AppButton } from '@/components/AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useFeatureFlags, FEATURE_CATALOG, FeatureKey } from '@/context/FeatureFlagsContext';
import { haptics } from '@/utils/haptics';

export default function AdminFeatureControlsScreen() {
  const { colors, spacing } = useTheme();
  const { isDesktop } = useResponsive();
  const { flags, isFeatureEnabled, setFeature, resetDefaults } = useFeatureFlags();

  async function handleToggleFlag(key: FeatureKey, next: boolean, label: string) {
    haptics.medium();
    await setFeature(key, next);
  }

  async function handleResetDefaults() {
    haptics.light();
    await resetDefaults();
    Alert.alert('Flags Reset', 'All feature toggles restored to production baseline.');
  }

  return (
    <ScreenContainer glow={true}>
      {!isDesktop && <AppHeader />}
      <ScrollView style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 150 }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: isDesktop ? spacing.xs : spacing.md, marginBottom: spacing.xs }}>
          <View style={{ flex: 1, paddingRight: spacing.sm }}>
            <AppText variant="h1" weight="bold">
              Feature Controls
            </AppText>
            <AppText tone="secondary" variant="caption">
              Temporarily enable or disable any non-major feature across campus
            </AppText>
          </View>
          <AppButton label="Reset All" variant="ghost" onPress={handleResetDefaults} />
        </View>

        <View style={{ height: spacing.md }} />

        <View style={isDesktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: 16 } : undefined}>
          {FEATURE_CATALOG.map((flag) => {
            const isEnabled = isFeatureEnabled(flag.key);
            return (
              <View key={flag.key} style={isDesktop ? { width: '48.5%' } : undefined}>
                <SolidCard
                  radius={18}
                  style={{
                    marginBottom: spacing.sm,
                    borderWidth: 1,
                    borderColor: isEnabled ? colors.border : `${colors.critical}40`,
                    backgroundColor: isEnabled ? colors.surface : `${colors.critical}08`,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, paddingRight: spacing.sm }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 2 }}>
                        <AppText weight="bold" variant="bodySmall">
                          {flag.label}
                        </AppText>
                        <Badge label={flag.category} tone={isEnabled ? 'brand' : 'critical'} />
                      </View>
                      <AppText tone="secondary" variant="caption" style={{ lineHeight: 16 }}>
                        {flag.description}
                      </AppText>
                    </View>

                    <Switch
                      value={isEnabled}
                      onValueChange={(next) => handleToggleFlag(flag.key, next, flag.label)}
                      trackColor={{ false: colors.divider, true: colors.brandPrimary }}
                    />
                  </View>
                </SolidCard>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
