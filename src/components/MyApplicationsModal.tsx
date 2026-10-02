import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { AppButton } from './AppButton';
import { EmptyState } from './EmptyState';
import { ErrorStateView } from './ErrorStateView';
import { JOB_APPLICATION_STATUS_META } from './JobCard';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/context/ToastContext';
import { JobApplication } from '@/api/types';
import { listMyApplications, withdrawApplication } from '@/api/jobApplications';
import { haptics } from '@/utils/haptics';

function ApplicationRow({ application, onWithdrawn }: { application: JobApplication; onWithdrawn: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const toast = useToast();
  const [withdrawing, setWithdrawing] = useState(false);

  // Mirrors the RLS policy in job_applications: withdrawing is only allowed
  // while the application is still in its initial, unreviewed state.
  const canWithdraw = application.status === 'applied';
  const meta = JOB_APPLICATION_STATUS_META[application.status];

  async function doWithdraw() {
    setWithdrawing(true);
    try {
      await withdrawApplication(application.id);
      haptics.success();
      toast.success('Application withdrawn.');
      onWithdrawn();
    } catch (err: any) {
      haptics.error();
      toast.error(err?.message || 'Could not withdraw your application.');
    } finally {
      setWithdrawing(false);
    }
  }

  function confirmWithdraw() {
    haptics.light();
    Alert.alert(
      'Withdraw this application?',
      `This removes your application to ${application.jobTitle || 'this job'}${application.company ? ` at ${application.company}` : ''}. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Withdraw', style: 'destructive', onPress: doWithdraw },
      ],
    );
  }

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
            {application.jobTitle || 'Job posting'}
          </AppText>
          {application.company ? (
            <AppText tone="secondary" variant="caption" numberOfLines={1}>
              {application.company}
            </AppText>
          ) : null}
        </View>
        <Badge label={meta.label} tone={meta.tone} />
      </View>

      <AppText tone="secondary" variant="caption">
        Applied {new Date(application.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
      </AppText>

      <AppButton
        label={canWithdraw ? 'Withdraw' : 'Already reviewed'}
        variant="secondary"
        size="sm"
        disabled={!canWithdraw || withdrawing}
        loading={withdrawing}
        onPress={confirmWithdraw}
      />
    </View>
  );
}

export function MyApplicationsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, spacing, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: applications = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['my-applications'],
    queryFn: () => listMyApplications(),
    enabled: visible,
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['my-applications'] });
    void queryClient.invalidateQueries({ queryKey: ['jobs'] });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.6)' }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              width: isDesktop ? 520 : '92%',
              maxHeight: isDesktop ? '85%' : '88%',
              marginBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              padding: spacing.md,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View style={{ flex: 1, minWidth: 0, paddingRight: spacing.sm }}>
              <AppText variant="h3" weight="bold">
                My Applications
              </AppText>
              <AppText tone="secondary" variant="bodySmall">
                {applications.length} submitted - track status or withdraw
              </AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }} showsVerticalScrollIndicator={false}>
            {isLoading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator color={colors.brandPrimary} />
              </View>
            ) : isError ? (
              <ErrorStateView
                title="Could not load your applications"
                error={error}
                onRetry={refetch}
              />
            ) : applications.length === 0 ? (
              <EmptyState
                icon="document-text-outline"
                title="No applications yet"
                description="Jobs you apply to in Lioris show up here, with their review status."
              />
            ) : (
              applications.map((app) => <ApplicationRow key={app.id} application={app} onWithdrawn={refresh} />)
            )}
          </ScrollView>

          <View style={{ padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
            <AppButton label="Close" variant="secondary" fullWidth onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    borderWidth: 1,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
});
