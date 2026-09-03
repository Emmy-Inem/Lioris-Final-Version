import React from 'react';
import { Alert, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useFeatureFlags, FEATURE_CATALOG, FeatureKey } from '@/context/FeatureFlagsContext';
import { haptics } from '@/utils/haptics';

export function FeatureFlagsTab() {
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const { flags, isFeatureEnabled, setFeature, resetDefaults } = useFeatureFlags();

  async function handleToggleFlag(key: FeatureKey, next: boolean, label: string) {
    haptics.medium();
    await setFeature(key, next);
  }

  async function handleResetDefaults() {
    haptics.light();
    await resetDefaults();
    Alert.alert('Feature Flags Reset', 'All campus feature toggles restored to production baseline.');
  }

  return (
    <View>
      <SolidCard
        backgroundColor={colors.pastelPrimaryBg}
        style={{ marginBottom: spacing.md, borderWidth: 1, borderColor: `${colors.brandPrimary}30` }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1, paddingRight: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <Ionicons name="toggle-outline" size={18} color={colors.brandPrimary} />
              <AppText weight="bold" tone="brand">
                Campus Feature Visibility & Kill Switches
              </AppText>
            </View>
            <AppText tone="secondary" variant="caption">
              Toggle any module to instantly show or hide its pages in the side menu and cards on student/alumni dashboards.
            </AppText>
          </View>
          <AppButton label="Reset Defaults" variant="ghost" onPress={handleResetDefaults} />
        </View>
      </SolidCard>

      <View style={isDesktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: 14 } : undefined}>
        {FEATURE_CATALOG.map((flag) => {
          const isEnabled = isFeatureEnabled(flag.key);
          return (
            <View key={flag.key} style={isDesktop ? { flexGrow: 1, flexBasis: 0, minWidth: 260 } : undefined}>
              <SolidCard
                radius={16}
                style={{
                  marginBottom: spacing.sm,
                  borderWidth: 1,
                  borderColor: isEnabled ? colors.border : `${colors.critical}50`,
                  backgroundColor: isEnabled ? colors.surface : `${colors.critical}06`,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <AppText weight="bold" variant="bodySmall">
                        {flag.label}
                      </AppText>
                      <Badge
                        label={isEnabled ? 'Visible / Active' : 'Hidden'}
                        tone={isEnabled ? 'success' : 'critical'}
                      />
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
    </View>
  );
}
