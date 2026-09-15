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

  // Bulk selection state - lets an admin approve/reject many pending
  // requests at once instead of one card at a time.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRejectModalOpen, setBulkRejectModalOpen] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  function toggleSelected(id: string) {
    haptics.light();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function invalidateVerificationQueries() {
    queryClient.invalidateQueries({ queryKey: ['verification-requests'] });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  // Core mutation logic shared by both the single-item and bulk approve
  // flows - throws on failure so callers can decide how to surface it
  // (an Alert for a single item, a tallied summary for a bulk run).
  async function approveRequestCore(req: VerificationRequest) {
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

    const targetRole = req.documentType === 'Staff ID' ? 'staff' : req.documentType === 'Alumni Certificate' ? 'alumni' : 'student';

    createNotification({
      recipientId: req.userId,
      type: 'system',
      title: 'Campus Verification Approved',
      body: 'Congratulations! Your identity has been verified. The official verified badge is now active on your profile.',
      deepLinkPath: `/(${targetRole})/profile`,
    });
  }

  // Core mutation logic shared by both the single-item and bulk reject
  // flows.
  async function rejectRequestCore(req: VerificationRequest, finalReason: string) {
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

    const targetRole = req.documentType === 'Staff ID' ? 'staff' : req.documentType === 'Alumni Certificate' ? 'alumni' : 'student';

    createNotification({
      recipientId: req.userId,
      type: 'system',
      title: 'Verification Request Update',
      body: `Your verification submission was not approved: ${finalReason}. You may re-apply with clear documentation.`,
      deepLinkPath: `/(${targetRole})/profile`,
    });
  }

  async function handleApprove(req: VerificationRequest) {
    haptics.medium();
    setProcessingId(req.id);
    try {
      await approveRequestCore(req);
      invalidateVerificationQueries();
      Alert.alert('Verification Granted', `${req.applicantName}'s verified identity badge has been activated.`);
    } catch (err: any) {
      // Without this the rejection was unhandled: the spinner cleared and
      // the row stayed put, so the admin couldn't tell an approval had
      // failed from one that simply hadn't refreshed yet.
      haptics.error();
      Alert.alert(
        'Could not approve request',
        err?.message || `${req.applicantName}'s verification could not be approved. Please try again.`,
      );
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
      await rejectRequestCore(req, finalReason);
      invalidateVerificationQueries();

      setRejectModalRequest(null);
      setCustomRejectNote('');
      Alert.alert('Request Rejected', `Rejection notice dispatched to ${req.applicantName}.`);
    } catch (err: any) {
      // `catch {}` here meant a failed rejection did nothing at all - the
      // modal stayed open with no error, so "Confirm" read as a dead button.
      haptics.error();
      Alert.alert(
        'Could not reject request',
        err?.message || `${req.applicantName}'s verification could not be rejected. Please try again.`,
      );
    }
  }

  function getSelectedRequests(): VerificationRequest[] {
    return (requests ?? []).filter((r) => selectedIds.has(r.id));
  }

  async function handleBulkApprove() {
    const targets = getSelectedRequests();
    if (targets.length === 0 || bulkProcessing) return;
    haptics.medium();
    setBulkProcessing(true);

    let succeeded = 0;
    let failed = 0;
    // Sequential (not Promise.all) so we don't hammer Supabase with a
    // burst of concurrent writes, and so a failure on one item doesn't
    // obscure whether the others made it through.
    for (const req of targets) {
      try {
        await approveRequestCore(req);
        succeeded += 1;
      } catch (err) {
        failed += 1;
      }
    }

    invalidateVerificationQueries();
    setBulkProcessing(false);
    clearSelection();

    if (failed > 0) haptics.error();
    else haptics.success();

    Alert.alert(
      'Bulk Approve Complete',
      failed > 0 ? `${succeeded} approved, ${failed} failed. Retry the failed ones individually.` : `${succeeded} verification request${succeeded === 1 ? '' : 's'} approved.`,
    );
  }

  async function handleConfirmBulkReject() {
    const targets = getSelectedRequests();
    if (targets.length === 0 || bulkProcessing) return;
    haptics.medium();
    const finalReason = customRejectNote.trim() ? `${selectedRejectReason}: ${customRejectNote.trim()}` : selectedRejectReason;
    setBulkProcessing(true);

    let succeeded = 0;
    let failed = 0;
    for (const req of targets) {
      try {
        await rejectRequestCore(req, finalReason);
        succeeded += 1;
      } catch (err) {
        failed += 1;
      }
    }

    invalidateVerificationQueries();
    setBulkProcessing(false);
    setBulkRejectModalOpen(false);
    setCustomRejectNote('');
    clearSelection();

    if (failed > 0) haptics.error();
    else haptics.success();

    Alert.alert(
      'Bulk Reject Complete',
      failed > 0 ? `${succeeded} rejected, ${failed} failed. Retry the failed ones individually.` : `${succeeded} verification request${succeeded === 1 ? '' : 's'} rejected.`,
    );
  }

  return (
    <ScreenContainer glow={true}>
      {!isDesktop && <AppHeader />}
      <ScrollView style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 150 }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', rowGap: spacing.sm, paddingTop: isDesktop ? spacing.xs : spacing.md, marginBottom: spacing.xs, gap: spacing.sm }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant={isDesktop ? 'h1' : 'h3'} weight="bold" numberOfLines={1}>
              Verify Credentials
            </AppText>
            <AppText tone="secondary" variant="caption" numberOfLines={1}>Review student matriculation records & IDs</AppText>
          </View>
          <View style={{ flexShrink: 0 }}>
            <Badge label={`${requests?.length ?? 0} Pending`} tone="neutral" />
          </View>
        </View>

        <View style={{ height: spacing.md }} />

        {/* Bulk Action Bar - only appears once the admin has checked at least one request */}
        {selectedIds.size > 0 && (
          <SolidCard radius={16} style={{ marginBottom: spacing.md, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: colors.pastelPrimaryBg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
              <View style={{ flex: 1, minWidth: 120 }}>
                <AppText weight="bold" variant="bodySmall">{selectedIds.size} selected</AppText>
              </View>
              <View style={{ flexShrink: 0 }}>
                <AppButton label="Clear" variant="ghost" size="sm" onPress={clearSelection} disabled={bulkProcessing} />
              </View>
              <View style={{ flexShrink: 0, minWidth: 110 }}>
                <AppButton label="Bulk Reject" variant="secondary" size="sm" loading={bulkProcessing} onPress={() => setBulkRejectModalOpen(true)} />
              </View>
              <View style={{ flexShrink: 0, minWidth: 130 }}>
                <AppButton label="Bulk Approve" size="sm" loading={bulkProcessing} onPress={handleBulkApprove} />
              </View>
            </View>
          </SolidCard>
        )}

        <View style={isDesktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: 16 } : undefined}>
          {requests?.map((req) => (
            <View key={req.id} style={isDesktop ? { flexGrow: 1, flexBasis: 0, minWidth: 320, maxWidth: 580 } : undefined}>
              <SolidCard radius={20} style={{ marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs, gap: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, minWidth: 0 }}>
                    <Pressable
                      onPress={() => toggleSelected(req.id)}
                      hitSlop={8}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selectedIds.has(req.id) }}
                      accessibilityLabel={`Select ${req.applicantName}`}
                      style={{ flexShrink: 0 }}
                    >
                      <Ionicons
                        name={selectedIds.has(req.id) ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={selectedIds.has(req.id) ? colors.brandPrimary : colors.textSecondary}
                      />
                    </Pressable>
                    <View style={{ flexShrink: 0 }}>
                      <Avatar name={req.applicantName} size={42} role="student" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
                        {req.applicantName}
                      </AppText>
                      <AppText tone="secondary" variant="caption" numberOfLines={1}>
                        Institution: {req.institutionClaimed}
                      </AppText>
                    </View>
                  </View>
                  <View style={{ flexShrink: 0 }}>
                    <Badge label={req.documentType.toUpperCase()} tone="accent" />
                  </View>
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

                <View style={{ flexDirection: 'row', gap: 6, marginTop: spacing.xs }}>
                  <View style={{ flex: 1 }}>
                    <AppButton
                      label="Inspect"
                      variant="ghost"
                      size="sm"
                      onPress={() => setInspectDocRequest(req)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppButton
                      label="Approve"
                      size="sm"
                      loading={processingId === req.id}
                      onPress={() => handleApprove(req)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppButton
                      label="Reject"
                      variant="secondary"
                      size="sm"
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
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1, minWidth: 0 }}>
                  <View style={{ flexShrink: 0 }}>
                    <Ionicons name="document-text" size={20} color={colors.brandPrimary} />
                  </View>
                  <AppText variant={isDesktop ? 'h2' : 'h3'} weight="bold" numberOfLines={1}>
                    Credential Verification
 </AppText>
 </View>
 <Pressable onPress={() => setInspectDocRequest(null)} hitSlop={8} style={{ flexShrink: 0 }}>
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
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm }}>
 <View style={{ flex: 1, minWidth: 0 }}>
 <AppText variant={isDesktop ? 'h2' : 'h3'} weight="bold" numberOfLines={1}>
 Decline Verification Submission
 </AppText>
 </View>
 <Pressable onPress={() => setRejectModalRequest(null)} hitSlop={8} style={{ flexShrink: 0 }}>
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

      {/* Bulk Rejection Reason Modal - same reason picker, applied to every selected request */}
      <Modal visible={bulkRejectModalOpen} transparent animationType="slide" onRequestClose={() => setBulkRejectModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setBulkRejectModalOpen(false)} />
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant={isDesktop ? 'h2' : 'h3'} weight="bold" numberOfLines={1}>
                  Decline {selectedIds.size} Verification Submission{selectedIds.size === 1 ? '' : 's'}
                </AppText>
              </View>
              <Pressable onPress={() => setBulkRejectModalOpen(false)} hitSlop={8} style={{ flexShrink: 0 }}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
              Select an official rejection reason to send to all {selectedIds.size} selected applicant{selectedIds.size === 1 ? '' : 's'}:
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
                  <AppText variant="bodySmall" weight={isSelected ? 'bold' : 'regular'} tone={isSelected ? 'brand' : 'primary'} style={{ flex: 1 }}>
                    {reason}
                  </AppText>
                </Pressable>
              );
            })}

            <AppTextField
              label="Additional Guidance Note (Optional)"
              placeholder="e.g. Please take a clear photo showing matric number and expiration year."
              value={customRejectNote}
              onChangeText={setCustomRejectNote}
            />

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <View style={{ flex: 1 }}>
                <AppButton label="Cancel" variant="ghost" onPress={() => setBulkRejectModalOpen(false)} disabled={bulkProcessing} fullWidth />
              </View>
              <View style={{ flex: 2 }}>
                <AppButton label="Confirm Bulk Rejection & Notify" variant="secondary" loading={bulkProcessing} onPress={handleConfirmBulkReject} fullWidth />
              </View>
            </View>
          </View>
        </View>
      </Modal>
 </ScreenContainer>
 );
}
