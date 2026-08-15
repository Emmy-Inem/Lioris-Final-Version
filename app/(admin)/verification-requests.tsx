import React from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { AppButton } from '@/components/AppButton';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { listVerificationRequests, respondToVerificationRequest } from '@/api/verification';
import { grantVerification, markVerificationRejected } from '@/api/profile';

export default function VerificationRequestsScreen() {
  const { spacing } = useTheme();
  const queryClient = useQueryClient();
  const { data: requests, isLoading } = useQuery({ queryKey: ['verification-requests'], queryFn: listVerificationRequests });

  async function respond(id: string, userId: string, status: 'approved' | 'rejected') {
    await respondToVerificationRequest(id, status);
    if (status === 'approved') {
      grantVerification(userId);
    } else {
      markVerificationRejected(userId);
    }
    queryClient.invalidateQueries({ queryKey: ['verification-requests'] });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  return (
    <ScreenContainer glow={false}>
      <AppHeader />
      <AppText variant="h1" weight="bold" style={{ paddingTop: spacing.lg, marginBottom: spacing.xs }}>
        Verify Credentials
      </AppText>
      <AppText tone="secondary" style={{ marginBottom: spacing.lg }}>
        Applications from users whose registration email didn't match a launch university —
        review the submitted document reference and approve or reject the verified tick.
      </AppText>

      {requests?.map((req) => (
        <SolidCard key={req.id} style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs }}>
            <AppText weight="bold">{req.applicantName}</AppText>
            <Badge label={req.documentType} tone="neutral" />
          </View>
          <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: 2 }}>
            Claims: {req.institutionClaimed}
          </AppText>
          <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
            Reference: {req.documentReference}
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <AppButton label="Approve" onPress={() => respond(req.id, req.userId, 'approved')} />
            <AppButton label="Reject" variant="secondary" onPress={() => respond(req.id, req.userId, 'rejected')} />
          </View>
        </SolidCard>
      ))}
      {!isLoading && (requests?.length ?? 0) === 0 ? (
        <EmptyState title="No pending applications" description="New verification requests will show up here." />
      ) : null}
    </ScreenContainer>
  );
}
