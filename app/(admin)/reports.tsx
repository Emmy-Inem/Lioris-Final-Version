import React from 'react';
import { FlatList, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { listReports } from '@/api/moderation';
import { Report } from '@/api/types';

const STATUS_TONE: Record<Report['status'], 'warning' | 'brand' | 'success' | 'neutral'> = {
  open: 'warning',
  under_review: 'brand',
  resolved: 'success',
  dismissed: 'neutral',
};

export default function AdminReportsScreen() {
  const { spacing } = useTheme();
  const { data: reports, isLoading } = useQuery({ queryKey: ['reports', 'all'], queryFn: () => listReports() });

  return (
    <ScreenContainer glow={false}>
      <AppHeader />
      <AppText variant="h1" weight="bold" style={{ paddingVertical: spacing.lg }}>
        Reports
      </AppText>
      <FlatList
        data={reports ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SolidCard style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }}>
              <Badge label={item.targetType} tone="neutral" />
              <Badge label={item.status.replace('_', ' ')} tone={STATUS_TONE[item.status]} />
            </View>
            <AppText tone="secondary">{item.reason}</AppText>
            <AppText tone="secondary" variant="caption" style={{ marginTop: spacing.sm }}>
              Filed {new Date(item.createdAt).toLocaleDateString()}
            </AppText>
          </SolidCard>
        )}
        ListEmptyComponent={!isLoading ? <EmptyState title="No reports on file" /> : null}
      />
    </ScreenContainer>
  );
}
