import React, { useState } from'react';
import { Alert, Modal, Pressable, ScrollView, View } from'react-native';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { Ionicons } from'@expo/vector-icons';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { AppText } from'@/components/AppText';
import { AppTextField } from'@/components/AppTextField';
import { SolidCard } from'@/components/SolidCard';
import { AppButton } from'@/components/AppButton';
import { Badge } from'@/components/Badge';
import { Avatar } from'@/components/Avatar';
import { EmptyState } from'@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { listVerificationRequests, respondToVerificationRequest, VerificationRequest } from '@/api/verification';
import { grantVerification, markVerificationRejected } from '@/api/profile';
import { recordAuditLogEntry } from '@/api/auditLog';
import { createNotification } from '@/api/notifications';
import { haptics } from '@/utils/haptics';

const REJECTION_REASONS = [
  'Document photo is blurry / unreadable',
  'Matriculation number does not match university database',
  'Expired student identity card',
  'Name does not match academic registrar records',
  'Invalid document type submitted',
];

export default function VerificationRequestsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const queryClient = useQueryClient();
  const { data: requests, isLoading } = useQuery({ queryKey: ['verification-requests'], queryFn: listVerificationRequests });

  const [inspectDocRequest, setInspectDocRequest] = useState<VerificationRequest | null>(null);
  const [rejectModalRequest, setRejectModalRequest] = useState<VerificationRequest | null>(null);
  const [selectedRejectReason, setSelectedRejectReason] = useState(REJECTION_REASONS[0]);
  const [customRejectNote, setCustomRejectNote] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function handleApprove(req: VerificationRequest) {
    haptics.medium();
    setProcessingId(req.id);
    try {
      await respondToVerificationRequest(req.id, 'approved');
      grantVerification(req.userId);

      recordAuditLogEntry({
        action: 'verification_approved',
        summary: `Approved verified badge for ${req.applicantName} (${req.institutionClaimed} - ${req.documentReference})`,
        targetType: 'verification_request',
        targetId: req.id,
        institutionCode: req.institutionClaimed,
        reason: 'Document verified against registrar criteria',
      });

      createNotification({
        recipientId: req.userId,
        type: 'system',
        title: 'Campus Verification Approved',
        body: 'Congratulations! Your identity has been verified. The official verified badge is now active on your profile.',
        deepLinkPath: '/(student)/profile',
      });

      queryClient.invalidateQueries({ queryKey: ['verification-requests'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });

      Alert.alert('Verification Granted', `${req.applicantName}'s verified identity badge has been activated.`);
    } finally {
      setProcessingId(null);
    }
  }

  async function handleConfirmReject() {
    if (!rejectModalRequest) return;
    haptics.medium();
    const req = rejectModalRequest;
    const finalReason = customRejectNote.trim() ? `${selectedRejectReason}: ${customRejectNote.trim()}` : selectedRejectReason;

    try {
      await respondToVerificationRequest(req.id, 'rejected');
      markVerificationRejected(req.userId);

      recordAuditLogEntry({
        action: 'verification_rejected',
        summary: `Rejected verification for ${req.applicantName} (${req.institutionClaimed}): ${finalReason}`,
        targetType: 'verification_request',
        targetId: req.id,
        institutionCode: req.institutionClaimed,
        reason: finalReason,
      });

      createNotification({
        recipientId: req.userId,
        type: 'system',
        title: 'Verification Request Update',
        body: `Your verification submission was not approved: ${finalReason}. You may re-apply with clear documentation.`,
        deepLinkPath: '/(student)/profile',
      });

      queryClient.invalidateQueries({ queryKey: ['verification-requests'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });

      setRejectModalRequest(null);
      setCustomRejectNote('');
      Alert.alert('Request Rejected', `Rejection notice dispatched to ${req.applicantName}.`);
    } catch {}
  }

  return (
    <ScreenContainer glow={true}>
      {!isDesktop && <AppHeader />}
      <ScrollView
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 150 }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: isDesktop ? spacing.xs : spacing.md, marginBottom: spacing.xs }}>
          <View>
            <AppText variant="h1" weight="bold">
              Verify Credentials
            </AppText>
            <AppText tone="secondary">Review student matriculation records & government ID certificates</AppText>
          </View>
          <Badge label={`${requests?.length ?? 0} Pending`} tone="brand" />
        </View>

        <View style={{ height: spacing.md }} />

        <View style={isDesktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: 16 } : undefined}>
          {requests?.map((req) => (
            <View key={req.id} style={isDesktop ? { width: 'calc(50% - 8px)' as any, minWidth: 320, maxWidth: 580 } : undefined}>
              <SolidCard radius={20} style={{ marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Avatar name={req.applicantName} size={42} role="student" />
                    <View>
                      <AppText weight="bold" variant="bodySmall">
                        {req.applicantName}
                      </AppText>
                      <AppText tone="secondary" variant="caption">
                        Institution: {req.institutionClaimed}
                      </AppText>
                    </View>
                  </View>
                  <Badge label={req.documentType.toUpperCase()} tone="accent" />
                </View>

                {/* Document Reference Box */}
                <View style={{ backgroundColor: colors.pastelPrimaryBg, padding: spacing.md, borderRadius: 14, marginVertical: spacing.sm, borderWidth: 1, borderColor: colors.brandPrimary }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <AppText variant="caption" tone="secondary">Matric / Certificate Ref</AppText>
                    <AppText variant="caption" weight="bold" tone="brand">{req.documentReference}</AppText>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <AppText variant="caption" tone="secondary">Status</AppText>
                    <AppText variant="caption" weight="bold">Awaiting Admin Verification</AppText>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs, flexWrap: 'wrap' }}>
                  <View style={{ flex: 1, minWidth: 100 }}>
                    <AppButton
                      label="Inspect"
                      variant="ghost"
                      onPress={() => setInspectDocRequest(req)}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 90 }}>
                    <AppButton
                      label="Approve"
                      loading={processingId === req.id}
                      onPress={() => handleApprove(req)}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 80 }}>
                    <AppButton
                      label="Reject"
                      variant="secondary"
                      onPress={() => setRejectModalRequest(req)}
                    />
                  </View>
                </View>
              </SolidCard>
            </View>
          ))}
        </View>

        {!isLoading && (requests?.length ?? 0) === 0 ? (
          <EmptyState title="All applications reviewed" description="There are no pending identity verification requests right now." />
        ) : null}
      </ScrollView>

      {/* Inspect ID Card Modal */}
      <Modal visible={!!inspectDocRequest} transparent animationType="fade" onRequestClose={() => setInspectDocRequest(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg }}>
          {inspectDocRequest && (
            <SolidCard radius={24} style={{ width: '100%', maxWidth: 440 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Ionicons name="document-text" size={20} color={colors.brandPrimary} />
                  <AppText variant="h2" weight="bold">
                    Credential Verification
 </AppText>
 </View>
 <Pressable onPress={() => setInspectDocRequest(null)} hitSlop={8}>
 <Ionicons name="close"size={22} color={colors.textSecondary} />
 </Pressable>
 </View>

 {/* Simulated ID Card Mockup */}
 <View style={{ backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.brandPrimary, borderRadius: 16, padding: spacing.lg, marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.divider, paddingBottom: spacing.sm, marginBottom: spacing.md }}>
 <View>
 <AppText weight="bold"tone="brand"style={{ fontSize: 13, textTransform: 'uppercase' }}>
 {inspectDocRequest.institutionClaimed} UNIVERSITY
 </AppText>
 <AppText tone="secondary"style={{ fontSize: 10 }}>OFFICIAL IDENTITY CARD</AppText>
 </View>
 <Ionicons name="school"size={28} color={colors.brandPrimary} />
 </View>

 <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', marginBottom: spacing.md }}>
 <Avatar name={inspectDocRequest.applicantName} size={58} role="student" />
 <View style={{ flex: 1 }}>
 <AppText weight="bold"style={{ fontSize: 15 }}>{inspectDocRequest.applicantName}</AppText>
 <AppText tone="secondary"variant="caption">Matric: {inspectDocRequest.documentReference}</AppText>
 <AppText tone="secondary"variant="caption">Faculty of Technology</AppText>
 </View>
 </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.xs }}>
                    <AppText tone="secondary" style={{ fontSize: 10 }}>Valid Through: 2026/2027 Session</AppText>
                    <AppText tone="brand" weight="bold" style={{ fontSize: 10 }}>SECURE EMBED</AppText>
                  </View>
 </View>

 <View style={{ flexDirection: 'row', gap: spacing.sm }}>
 <View style={{ flex: 1 }}>
 <AppButton
 label="Grant Verified Status"onPress={() => {
 const req = inspectDocRequest;
 setInspectDocRequest(null);
 handleApprove(req);
 }}
 fullWidth
 />
 </View>
 </View>
 </SolidCard>
 )}
 </View>
 </Modal>

 {/* Rejection Reason Modal */}
 <Modal visible={!!rejectModalRequest} transparent animationType="slide"onRequestClose={() => setRejectModalRequest(null)}>
 <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
 <Pressable style={{ flex: 1 }} onPress={() => setRejectModalRequest(null)} />
 <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
 <AppText variant="h2"weight="bold">
 Decline Verification Submission
 </AppText>
 <Pressable onPress={() => setRejectModalRequest(null)} hitSlop={8}>
 <Ionicons name="close"size={22} color={colors.textSecondary} />
 </Pressable>
 </View>

 <AppText tone="secondary"variant="bodySmall"style={{ marginBottom: spacing.md }}>
 Select an official rejection reason to inform {rejectModalRequest?.applicantName}:
 </AppText>

 {REJECTION_REASONS.map((reason) => {
 const isSelected = selectedRejectReason === reason;
 return (
 <Pressable
 key={reason}
 onPress={() => setSelectedRejectReason(reason)}
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 gap: spacing.sm,
 paddingVertical: 10,
 paddingHorizontal: spacing.md,
 borderRadius: radius.md,
 backgroundColor: isSelected ? colors.pastelPrimaryBg : colors.surface,
 borderWidth: 1,
 borderColor: isSelected ? colors.brandPrimary : colors.border,
 marginBottom: spacing.xs,
 }}
 >
 <Ionicons
 name={isSelected ? 'radio-button-on' : 'radio-button-off'}
 size={16}
 color={isSelected ? colors.brandPrimary : colors.textSecondary}
 />
 <AppText variant="bodySmall"weight={isSelected ? 'bold' : 'regular'} tone={isSelected ? 'brand' : 'primary'} style={{ flex: 1 }}>
 {reason}
 </AppText>
 </Pressable>
 );
 })}

 <AppTextField
 label="Additional Guidance Note (Optional)"placeholder="e.g. Please take a clear photo showing matric number and expiration year."value={customRejectNote}
 onChangeText={setCustomRejectNote}
 />

 <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
 <View style={{ flex: 1 }}>
 <AppButton label="Cancel"variant="ghost"onPress={() => setRejectModalRequest(null)} fullWidth />
 </View>
 <View style={{ flex: 2 }}>
 <AppButton label="Confirm Rejection & Notify"variant="secondary"onPress={handleConfirmReject} fullWidth />
 </View>
 </View>
 </View>
 </View>
 </Modal>
 </ScreenContainer>
 );
}
