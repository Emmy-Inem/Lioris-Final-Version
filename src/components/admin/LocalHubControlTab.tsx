import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { SolidCard } from '@/components/SolidCard';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import {
  listDashboardShortcuts,
  createDashboardShortcut,
  updateDashboardShortcut,
  deleteDashboardShortcut,
  DashboardShortcut,
} from '@/api/adminShortcuts';
import { EditShortcutModal } from './EditShortcutModal';
import { ThemeColors } from '@/theme/colors';

function colorPairFor(colors: ThemeColors, tone: DashboardShortcut['iconColor']): { bg: string; fg: string } {
  const map: Record<DashboardShortcut['iconColor'], { bg: string; fg: string }> = {
    sage: { bg: colors.sageBg, fg: colors.sageText },
    rose: { bg: colors.roseBg, fg: colors.roseText },
    mint: { bg: colors.mintBg, fg: colors.mintText },
    lavender: { bg: colors.lavenderBg, fg: colors.lavenderText },
  };
  return map[tone];
}

/**
 * Ported from "Local Hub Options & Utilities Control Desk" — this is
 * what the reference app's "Utility Hub" tab actually shows (a CMS for
 * the dashboard shortcut tiles), not the 14-item config-modal list an
 * earlier pass wrongly placed here. That list now lives in its own
 * Super Admin Configuration screen.
 *
 * Note: this manages the *listing data* for shortcut tiles with full
 * CRUD. Wiring it so edits here immediately change what a live student
 * session sees on their Home screen would need a shared backend/cache
 * layer — out of scope for this mock-data build, flagged here rather
 * than silently implied.
 */
export function LocalHubControlTab() {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const [hubType, setHubType] = useState<'student' | 'alumni'>('student');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editing, setEditing] = useState<DashboardShortcut | undefined>(undefined);

  const { data: shortcuts } = useQuery({
    queryKey: ['admin-shortcuts', hubType],
    queryFn: () => listDashboardShortcuts(hubType),
  });

  function openAdd() {
    setEditing(undefined);
    setEditModalOpen(true);
  }

  function openEdit(shortcut: DashboardShortcut) {
    setEditing(shortcut);
    setEditModalOpen(true);
  }

  async function handleSave(payload: Omit<DashboardShortcut, 'id' | 'active'>) {
    if (editing) {
      await updateDashboardShortcut(editing.id, payload);
    } else {
      await createDashboardShortcut({ ...payload, active: true });
    }
    queryClient.invalidateQueries({ queryKey: ['admin-shortcuts'] });
  }

  function confirmDelete(shortcut: DashboardShortcut) {
    Alert.alert('Remove listing', `Remove "${shortcut.title}" from the ${hubType} hub?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteDashboardShortcut(shortcut.id);
          queryClient.invalidateQueries({ queryKey: ['admin-shortcuts'] });
        },
      },
    ]);
  }

  return (
    <View>
      <SolidCard backgroundColor={colors.pastelPrimaryBg} style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
          <Ionicons name="settings" size={16} color={colors.brandPrimary} />
          <AppText weight="bold" tone="brand">
            Local Hub Options & Utilities Control Desk ⚙️
          </AppText>
        </View>
        <AppText tone="secondary" variant="bodySmall">
          Dynamically control what utility action cards (such as portals, careers, course
          material, past questions, or custom institutional links) appear on the student and
          alumni dashboards with precision campus-targeting, active-state toggles, department
          matching, and Level-gated security.
        </AppText>
      </SolidCard>

      <View style={{ flexDirection: 'row', backgroundColor: colors.divider, borderRadius: radius.pill, padding: 4, marginBottom: spacing.lg }}>
        {(['student', 'alumni'] as const).map((h) => {
          const selected = hubType === h;
          return (
            <Pressable
              key={h}
              onPress={() => setHubType(h)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={h === 'student' ? 'Student Hub' : 'Alumni Hub'}
              style={{
                flex: 1,
                paddingVertical: spacing.sm,
                borderRadius: radius.pill,
                alignItems: 'center',
                backgroundColor: selected ? colors.brandPrimary : 'transparent',
              }}
            >
              <AppText variant="bodySmall" weight="bold" tone={selected ? 'inverse' : 'secondary'}>
                {h === 'student' ? 'Student Hub' : 'Alumni Hub'}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
        <AppText variant="h3" weight="bold">
          Active Listings ({shortcuts?.length ?? 0})
        </AppText>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <AppButton label="+ Quick Portal" variant="secondary" onPress={() => openAdd()} />
          <AppButton label="+ Add Option" onPress={openAdd} />
        </View>
      </View>

      {shortcuts?.map((shortcut) => {
        const colorPair = colorPairFor(colors, shortcut.iconColor);
        return (
          <SolidCard key={shortcut.id} style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: colorPair.bg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={shortcut.icon as any} size={20} color={colorPair.fg} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <AppText weight="bold" style={{ flex: 1 }}>
                    {shortcut.title}
                  </AppText>
                  <View style={{ flexDirection: 'row', gap: spacing.md }}>
                    <Pressable
                      onPress={() => openEdit(shortcut)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${shortcut.title}`}
                    >
                      <Ionicons name="pencil" size={16} color={colors.brandPrimary} />
                    </Pressable>
                    <Pressable
                      onPress={() => confirmDelete(shortcut)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${shortcut.title}`}
                    >
                      <Ionicons name="trash" size={16} color={colors.critical} />
                    </Pressable>
                  </View>
                </View>
                <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: 4 }}>
                  {shortcut.description}
                </AppText>
                <AppText variant="caption" weight="semiBold" tone="brand" style={{ marginBottom: 2 }}>
                  Internal Action: {shortcut.internalAction}
                </AppText>
                <AppText variant="caption" tone="secondary">
                  Campus: {shortcut.campusScope} {'\u00b7'} Min Lvl: {shortcut.minLevel} {'\u00b7'} Dept: {shortcut.department}
                </AppText>
              </View>
            </View>
          </SolidCard>
        );
      })}

      <EditShortcutModal
        visible={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        hubType={hubType}
        initial={editing}
        onSave={handleSave}
      />
    </View>
  );
}
