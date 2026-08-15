import React, { useState } from'react';
import { Alert, ScrollView, Switch, View } from'react-native';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { AppText } from'@/components/AppText';
import { SolidCard } from'@/components/SolidCard';
import { Badge } from'@/components/Badge';
import { AppButton } from'@/components/AppButton';
import { useTheme } from'@/theme/ThemeProvider';
import { recordAuditLogEntry } from'@/api/auditLog';
import { haptics } from'@/utils/haptics';

interface FeatureFlag {
  key: string;
  label: string;
  category: 'Core' | 'AI & Social' | 'Security' | 'Finance';
  tier: 'P0' | 'P1' | 'P2';
  description: string;
  defaultOn: boolean;
}

const FLAGS: FeatureFlag[] = [
  { key: 'mentorship', label: '1-on-1 Alumni Video Mentorship', category: 'Core', tier: 'P1', description: 'Enables Google Meet link scheduling and mentee applications.', defaultOn: true },
  { key: 'study_squads', label: 'Live Study Squads & Hubs', category: 'Core', tier: 'P1', description: 'Enables campus study circle formation and Senate E-Library check-ins.', defaultOn: true },
  { key: 'discussions', label: 'Interactive Forum & Polls', category: 'Core', tier: 'P0', description: 'Allows students and alumni to publish threads and participate in votes.', defaultOn: true },
  { key: 'push', label: 'Emergency Flash Push Notifications', category: 'Core', tier: 'P0', description: 'Delivers campus-wide high priority flash banners and announcements.', defaultOn: true },
  { key: 'ai_copilot', label: 'AI Campus Study Copilot', category: 'AI & Social', tier: 'P2', description: 'Generates past question study summaries and course note outlines.', defaultOn: true },
  { key: 'marketplace_escrow', label: 'Marketplace Escrow Protection', category: 'Finance', tier: 'P1', description: 'Holds peer-to-peer student textbook & gear payments until pickup confirmation.', defaultOn: true },
  { key: 'e2ee_messaging', label: 'E2EE Direct Messaging Shield', category: 'Security', tier: 'P1', description: 'Secures student-to-alumni direct chat threads with client-side key encryption.', defaultOn: true },
  { key: 'gamification_xp', label: 'Gamification & Reputation Badges', category: 'AI & Social', tier: 'P2', description: 'Awards XP for peer study assistance, verified matriculation, and hackathons.', defaultOn: true },
];

export default function AdminFeatureControlsScreen() {
  const { colors, spacing, radius } = useTheme();
  const [state, setState] = useState<Record<string, boolean>>(
    Object.fromEntries(FLAGS.map((f) => [f.key, f.defaultOn])),
  );

  function handleToggleFlag(key: string, next: boolean, label: string) {
    haptics.medium();
    setState((prev) => ({ ...prev, [key]: next }));

    recordAuditLogEntry({
      action: 'escrow_funds_released',
      summary: `Feature Toggle Changed: "${label}"set to ${next ? 'ENABLED 🟢' : 'DISABLED 🔴'}`,
      targetType: 'user',
      targetId: key,
      reason: 'Administrative runtime feature flag mutation',
    });
  }

  function handleResetDefaults() {
    haptics.light();
    setState(Object.fromEntries(FLAGS.map((f) => [f.key, f.defaultOn])));
    Alert.alert('Flags Reset', 'All feature toggles restored to production baseline.');
  }

  return (
    <ScreenContainer glow={true}>
      <AppHeader />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"nestedScrollEnabled
        contentContainerStyle={{ paddingBottom: 150 }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.md, marginBottom: spacing.xs }}>
          <View>
            <AppText variant="h1"weight="bold">
              Feature Controls 🎛️
            </AppText>
            <AppText tone="secondary">Toggle runtime modules, rollouts, and campus kill switches</AppText>
          </View>
          <AppButton label="Reset Defaults"variant="ghost"onPress={handleResetDefaults} />
        </View>

        <View style={{ height: spacing.md }} />

        {FLAGS.map((flag) => {
          const isEnabled = state[flag.key];
          return (
            <SolidCard key={flag.key} radius={18} style={{ marginBottom: spacing.sm, borderWidth: 1, borderColor: isEnabled ? colors.border : `${colors.critical}40` }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, paddingRight: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 2 }}>
                    <AppText weight="bold"variant="bodySmall">
                      {flag.label}
                    </AppText>
                    <Badge label={flag.category} tone="brand" />
                  </View>
                  <AppText tone="secondary"variant="caption"style={{ lineHeight: 16 }}>
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
          );
        })}
      </ScrollView>
    </ScreenContainer>
  );
}
