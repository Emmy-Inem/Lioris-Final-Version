import React from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../AppText';
import { SolidCard } from '../SolidCard';
import { useTheme } from '@/theme/ThemeProvider';
import { listAuditLogEntriesPage } from '@/api/auditLog';

const ACTION_ICON: Record<string, { icon: keyof typeof Ionicons.glyphMap; tone: 'ok' | 'warn' | 'bad' }> = {
  institution_provisioned: { icon: 'add-circle-outline', tone: 'ok' },
  institution_updated: { icon: 'create-outline', tone: 'ok' },
  institution_reactivated: { icon: 'power-outline', tone: 'ok' },
  institution_deactivated: { icon: 'pause-circle-outline', tone: 'warn' },
  institution_deleted: { icon: 'trash-outline', tone: 'bad' },
};

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Recent campus changes (add, edit, switch on/off, delete) from the audit trail, so a Super Admin can see who changed what. */
export function CampusActivityFeed() {
  const { colors, spacing } = useTheme();
  const feed = useQuery({
    queryKey: ['campus-activity'],
    queryFn: async () => {
      const page = await listAuditLogEntriesPage({ targetType: 'institution', pageSize: 12 });
      return page.entries;
    },
    staleTime: 30_000,
  });
  const entries = feed.data ?? [];

  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="h3" weight="bold">Campus activity</AppText>
      <SolidCard radius={18} style={{ borderWidth: 1, borderColor: colors.border, gap: spacing.sm }}>
        {feed.isLoading ? (
          <AppText variant="caption" tone="secondary">Loading recent changes…</AppText>
        ) : feed.isError ? (
          <AppText variant="caption" tone="critical">Could not load recent campus changes. Pull to refresh or try again shortly.</AppText>
        ) : entries.length === 0 ? (
          <AppText variant="caption" tone="secondary">No campus changes recorded yet. Adding, editing, switching off or deleting a campus shows up here.</AppText>
        ) : (
          entries.map((e, i) => {
            const meta = ACTION_ICON[e.action as string] ?? { icon: 'ellipse-outline' as const, tone: 'ok' as const };
            const color = meta.tone === 'bad' ? colors.critical : meta.tone === 'warn' ? colors.warning : colors.brandPrimary;
            return (
              <View key={e.id ?? `${e.createdAt}-${i}`} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', paddingTop: i === 0 ? 0 : spacing.xs, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.divider }}>
                <Ionicons name={meta.icon} size={18} color={color} style={{ marginTop: 1 }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText variant="bodySmall" weight="semiBold">{e.summary}</AppText>
                  <AppText variant="caption" tone="secondary">{e.actorName} · {ago(e.createdAt)}</AppText>
                </View>
              </View>
            );
          })
        )}
      </SolidCard>
    </View>
  );
}
