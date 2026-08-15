import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SolidCard } from '@/components/SolidCard';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { Badge } from '@/components/Badge';
import { ChipSelect } from '@/components/ChipSelect';
import { useTheme } from '@/theme/ThemeProvider';

const WORKSPACES = ['Tech Hub', 'Housing', 'Social', 'Lost & Found'];

interface ModeratorRow {
  name: string;
  username: string;
  role: 'STAFF' | 'STUDENT' | 'ALUMNI';
  isMod: boolean;
}

const MODERATORS: Record<string, ModeratorRow[]> = {
  'Tech Hub': [
    { name: 'Lioris Admin', username: '@admin_lioris', role: 'STAFF', isMod: true },
    { name: 'Chioma Nwosu', username: '@chioma_n', role: 'STUDENT', isMod: true },
  ],
  Housing: [{ name: 'Tunde Adebayo', username: '@tundea', role: 'STUDENT', isMod: false }],
  Social: [{ name: 'Priya Nair', username: '@priyan', role: 'ALUMNI', isMod: true }],
  'Lost & Found': [],
};

export function ForumsModerationTab() {
  const { colors, spacing, radius } = useTheme();
  const [workspace, setWorkspace] = useState('Tech Hub');
  const [query, setQuery] = useState('');
  const [modState, setModState] = useState<Record<string, boolean>>(
    Object.fromEntries(Object.values(MODERATORS).flat().map((m) => [m.username, m.isMod])),
  );

  const rows = (MODERATORS[workspace] ?? []).filter((r) => r.name.toLowerCase().includes(query.toLowerCase()));
  const activeModCount = (MODERATORS[workspace] ?? []).filter((r) => modState[r.username]).length;

  return (
    <View>
      <SolidCard style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
          <Ionicons name="shield" size={18} color={colors.brandPrimary} />
          <AppText variant="h3" weight="bold">
            Workspace Direct Moderator Manager 🛡️
          </AppText>
        </View>
        <AppText tone="secondary" variant="bodySmall">
          Select a discussion workspace below to monitor, search, and toggle active user
          moderator credentials instantaneously using the reactive matrix table.
        </AppText>
      </SolidCard>

      <AppText weight="bold" variant="bodySmall" style={{ marginBottom: spacing.sm }}>
        Active Discussion Workspace
      </AppText>
      <View style={{ marginBottom: spacing.lg }}>
        <ChipSelect options={WORKSPACES} selected={[workspace]} onToggle={setWorkspace} />
      </View>
      <View
        style={{
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: colors.pastelPrimaryBg,
          borderRadius: radius.pill,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          marginBottom: spacing.lg,
        }}
      >
        <Ionicons name="checkmark-circle" size={14} color={colors.brandPrimary} />
        <AppText variant="bodySmall" weight="bold" tone="brand">
          Active Mods: {activeModCount}
        </AppText>
      </View>

      <AppTextField label="" placeholder="Search users to moderate by name, username" value={query} onChangeText={setQuery} />

      <AppText weight="bold" style={{ marginBottom: spacing.sm }}>
        Workspace Permission Matrix 📋
      </AppText>
      <View style={{ flexDirection: 'row', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
        <AppText variant="caption" weight="bold" tone="secondary" style={{ flex: 2 }}>
          USER NODE
        </AppText>
        <AppText variant="caption" weight="bold" tone="secondary" style={{ flex: 1 }}>
          CAMPUS ROLE
        </AppText>
        <AppText variant="caption" weight="bold" tone="secondary" style={{ flex: 1, textAlign: 'right' }}>
          MOD STATUS
        </AppText>
      </View>
      {rows.map((row) => (
        <View
          key={row.username}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: colors.divider,
          }}
        >
          <View style={{ flex: 2 }}>
            <AppText weight="bold" variant="bodySmall">
              {row.name}
            </AppText>
            <AppText tone="secondary" variant="caption">
              {row.username}
            </AppText>
          </View>
          <View style={{ flex: 1 }}>
            <Badge label={row.role} tone="neutral" />
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Switch
              value={modState[row.username]}
              onValueChange={(v) => setModState((prev) => ({ ...prev, [row.username]: v }))}
              trackColor={{ false: colors.divider, true: colors.brandPrimary }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
