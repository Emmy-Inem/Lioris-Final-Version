import React, { useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { useTheme } from '@/theme/ThemeProvider';

interface FeatureFlag {
  key: string;
  label: string;
  tier: 'P1' | 'P2';
  defaultOn: boolean;
}

// Mirrors PRD Section 3.2 (MVP Scope): P0 items ship enabled by default
// and aren't toggleable here; P1/P2 items are rollout flags an admin
// can flip once each is ready.
const FLAGS: FeatureFlag[] = [
  { key: 'mentorship', label: 'Mentorship matching', tier: 'P1', defaultOn: true },
  { key: 'discussions', label: 'Community discussions', tier: 'P1', defaultOn: true },
  { key: 'push', label: 'Push notifications', tier: 'P1', defaultOn: true },
  { key: 'directory_search', label: 'Search & filtering in directories', tier: 'P1', defaultOn: true },
  { key: 'ai_summaries', label: 'AI summaries', tier: 'P2', defaultOn: false },
  { key: 'gamification', label: 'Gamification', tier: 'P2', defaultOn: false },
  { key: 'offline_caching', label: 'Offline caching', tier: 'P2', defaultOn: false },
  { key: 'advanced_analytics', label: 'Advanced analytics views', tier: 'P2', defaultOn: false },
];

export default function AdminFeatureControlsScreen() {
  const { colors, spacing } = useTheme();
  const [state, setState] = useState<Record<string, boolean>>(
    Object.fromEntries(FLAGS.map((f) => [f.key, f.defaultOn])),
  );

  return (
    <ScreenContainer glow={false}>
      <AppHeader />
      <ScrollView showsVerticalScrollIndicator={false}>
        <AppText variant="h1" weight="bold" style={{ paddingVertical: spacing.lg }}>
          Feature Controls
        </AppText>
        <AppText tone="secondary" style={{ marginBottom: spacing.lg }}>
          These flags are local to this device in the current build — wire them to a
          real feature-flag or config service before shipping.
        </AppText>

        {FLAGS.map((flag) => (
          <SolidCard key={flag.key} style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
                <AppText weight="semiBold" style={{ flexShrink: 1 }}>
                  {flag.label}
                </AppText>
                <Badge label={flag.tier} tone={flag.tier === 'P1' ? 'brand' : 'neutral'} />
              </View>
              <Switch
                value={state[flag.key]}
                onValueChange={(next) => setState((prev) => ({ ...prev, [flag.key]: next }))}
                trackColor={{ false: colors.divider, true: colors.brandPrimary }}
              />
            </View>
          </SolidCard>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}
