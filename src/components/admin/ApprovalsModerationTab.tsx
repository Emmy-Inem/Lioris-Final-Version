import React, { useState } from'react';
import { Alert, Modal, Pressable, ScrollView, View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { SolidCard } from'@/components/SolidCard';
import { AppText } from'@/components/AppText';
import { Badge } from'@/components/Badge';
import { AppButton } from'@/components/AppButton';
import { EmptyState } from'@/components/EmptyState';
import { useTheme } from'@/theme/ThemeProvider';
import { listVerificationRequests, respondToVerificationRequest } from'@/api/verification';
import { listWaitlist, respondToWaitlistEntry } from'@/api/institutions';
import { listResources, approveResource, rejectResource } from'@/api/resources';
import { Resource } from'@/api/types';
import { haptics } from'@/utils/haptics';

export function ApprovalsModerationTab() {
 const { colors, spacing, radius, isDark } = useTheme();
 const queryClient = useQueryClient();
 const [section, setSection] = useState<'resources' | 'credentials' | 'nodes'>('resources');
 const [actingId, setActingId] = useState<string | null>(null);
 const [previewResource, setPreviewResource] = useState<Resource | null>(null);

 const { data: allResources = [], isLoading: loadingResources } = useQuery({
 queryKey: ['resources', 'admin-approvals'],
 queryFn: () => listResources({ approvalStatus: 'pending' }),
 });

 const { data: verifications = [], isLoading: loadingVerifications } = useQuery({
 queryKey: ['verification-requests', 'admin-desk'],
 queryFn: listVerificationRequests,
 });

 const { data: waitlist = [], isLoading: loadingWaitlist } = useQuery({
 queryKey: ['waitlist', 'admin-desk'],
 queryFn: listWaitlist,
 });

 const pendingResources = allResources.filter((r) => r.approvalStatus === 'pending');

 async function handleApproveResource(resource: Resource) {
 haptics.medium();
 setActingId(resource.id);
 try {
 await approveResource(resource.id);
 queryClient.invalidateQueries({ queryKey: ['resources'] });
 Alert.alert('Resource Approved & Indexed', `"${resource.title}"has been published to the student catalog.`);
 } finally {
 setActingId(null);
 }
 }

 async function handleRejectResource(resource: Resource) {
 haptics.error();
 setActingId(resource.id);
 try {
 await rejectResource(resource.id, 'File did not meet quality standards.');
 queryClient.invalidateQueries({ queryKey: ['resources'] });
 Alert.alert('Submission Declined', `"${resource.title}"has been returned to the uploader.`);
 } finally {
 setActingId(null);
 }
 }

 async function handleVerificationResponse(id: string, status: 'approved' | 'rejected') {
 haptics.medium();
 setActingId(id);
 try {
 await respondToVerificationRequest(id, status);
 queryClient.invalidateQueries({ queryKey: ['verification-requests'] });
 Alert.alert(
 status === 'approved' ? 'Credential Verified' : 'Application Rejected',
 `Verification request has been marked as ${status}.`,
 );
 } finally {
 setActingId(null);
 }
 }

 async function handleNodeResponse(id: string, status: 'approved' | 'rejected') {
 haptics.medium();
 setActingId(id);
 try {
 await respondToWaitlistEntry(id, status);
 queryClient.invalidateQueries({ queryKey: ['waitlist'] });
 Alert.alert(
 status === 'approved' ? 'Campus Node Approved' : 'Request Declined',
 `Institution federation request has been ${status}.`,
 );
 } finally {
 setActingId(null);
 }
 }

 return (
 <View>
 {/* 3-Way Segmented Control Bar */}
 <ScrollView
 horizontal
 showsHorizontalScrollIndicator={false}
 contentContainerStyle={{ gap: spacing.xs, marginBottom: spacing.md }}
 >
 <Pressable
 onPress={() => {
 haptics.light();
 setSection('resources');
 }}
 style={{
 paddingHorizontal: spacing.md,
 paddingVertical: 8,
 alignItems: 'center',
 borderRadius: radius.pill,
 backgroundColor: section === 'resources' ? colors.brandPrimary : colors.divider,
 }}
 >
 <AppText variant="caption"weight="bold"tone={section === 'resources' ? 'inverse' : 'secondary'}>
 Resource Submissions ({pendingResources.length})
 </AppText>
 </Pressable>

 <Pressable
 onPress={() => {
 haptics.light();
 setSection('credentials');
 }}
 style={{
 paddingHorizontal: spacing.md,
 paddingVertical: 8,
 alignItems: 'center',
 borderRadius: radius.pill,
 backgroundColor: section === 'credentials' ? colors.brandPrimary : colors.divider,
 }}
 >
 <AppText variant="caption"weight="bold"tone={section === 'credentials' ? 'inverse' : 'secondary'}>
 ID Verifications ({verifications.length})
 </AppText>
 </Pressable>

 <Pressable
 onPress={() => {
 haptics.light();
 setSection('nodes');
 }}
 style={{
 paddingHorizontal: spacing.md,
 paddingVertical: 8,
 alignItems: 'center',
 borderRadius: radius.pill,
 backgroundColor: section === 'nodes' ? colors.brandPrimary : colors.divider,
 }}
 >
 <AppText variant="caption"weight="bold"tone={section === 'nodes' ? 'inverse' : 'secondary'}>
 Campus Nodes ({waitlist.length})
 </AppText>
 </Pressable>
 </ScrollView>

 {/* Resource Upload Submissions Queue */}
 {section === 'resources' ? (
 <View>
 {pendingResources.map((res) => (
 <SolidCard key={res.id} radius={18} frosted style={{ marginBottom: spacing.md, borderWidth: 1, borderColor: `${colors.brandPrimary}40` }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs }}>
 <View style={{ flex: 1, marginRight: spacing.sm }}>
 <AppText weight="bold"variant="body">
 {res.title}
 </AppText>
 <AppText tone="brand"variant="caption"weight="bold">
 {res.courseCode} • {res.department} • {res.category} ({res.fileSize})
 </AppText>
 </View>
 <Badge label="Pending Review"tone="warning" />
 </View>

 <AppText tone="secondary"variant="caption"style={{ marginBottom: 4 }}>
 Uploader: <AppText weight="bold">{res.authorName}</AppText> ({res.academicLevel || 'Student'}) • Format: {res.fileType || 'PDF'}
 </AppText>

 <View style={{ backgroundColor: colors.pastelPrimaryBg, padding: spacing.sm, borderRadius: radius.sm, marginVertical: spacing.xs }}>
 <AppText variant="caption"weight="bold"tone="brand"style={{ marginBottom: 2 }}>
 SYLLABUS SUMMARY:
 </AppText>
 <AppText tone="secondary"variant="bodySmall"numberOfLines={2}>
 {res.description}
 </AppText>
 </View>

            <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <AppButton
                  label="Approve & Index"
                  variant="primary"
                  loading={actingId === res.id}
                  onPress={() => handleApproveResource(res)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton
                  label="Decline"
                  variant="secondary"
                  loading={actingId === res.id}
                  onPress={() => handleRejectResource(res)}
                />
              </View>
 <Pressable
 onPress={() => setPreviewResource(res)}
 hitSlop={8}
 style={{
 width: 40,
 height: 40,
 borderRadius: radius.md,
 backgroundColor: colors.divider,
 alignItems: 'center',
 justifyContent: 'center',
 }}
 >
 <Ionicons name="eye-outline"size={18} color={colors.textPrimary} />
 </Pressable>
 </View>
 </SolidCard>
 ))}

 {!loadingResources && pendingResources.length === 0 ? (
 <EmptyState title="All resource submissions reviewed"description="No pending course materials awaiting moderator indexing." />
 ) : null}
 </View>
 ) : null}

 {/* ID & Credential Verifications */}
 {section === 'credentials' ? (
 <View>
 {verifications.map((v) => (
 <SolidCard key={v.id} radius={18} frosted style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs }}>
 <View style={{ flex: 1, marginRight: spacing.sm }}>
 <AppText weight="bold"variant="body">
 {v.applicantName}
 </AppText>
 <AppText tone="brand"variant="caption"weight="bold">
 {v.documentType} • Ref: {v.documentReference}
 </AppText>
 </View>
 <Badge label="Pending Review"tone="warning" />
 </View>

 <AppText tone="secondary"variant="bodySmall"style={{ marginBottom: spacing.md }}>
 Claimed Institution: {v.institutionClaimed}
 </AppText>

 <View style={{ flexDirection: 'row', gap: spacing.sm }}>
 <View style={{ flex: 1 }}>
 <AppButton
 label="Grant Verified Badge"variant="primary"loading={actingId === v.id}
 onPress={() => handleVerificationResponse(v.id, 'approved')}
 />
 </View>
 <View style={{ flex: 1 }}>
 <AppButton
 label="Decline"variant="secondary"loading={actingId === v.id}
 onPress={() => handleVerificationResponse(v.id, 'rejected')}
 />
 </View>
 </View>
 </SolidCard>
 ))}
 {!loadingVerifications && verifications.length === 0 ? (
 <EmptyState title="All credential verifications reviewed"description="No pending student or faculty ID requests." />
 ) : null}
 </View>
 ) : null}

 {/* Campus Node Federations */}
 {section === 'nodes' ? (
 <View>
 {waitlist.map((w) => (
 <SolidCard key={w.id} radius={18} frosted style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs }}>
 <AppText weight="bold"variant="body"style={{ flex: 1 }}>
 {w.universityName}
 </AppText>
 <Badge label="Federation Request"tone="brand" />
 </View>

 <AppText tone="secondary"variant="bodySmall"style={{ marginBottom: spacing.md }}>
 Registrar / Admin Email: {w.email}
 </AppText>

 <View style={{ flexDirection: 'row', gap: spacing.sm }}>
 <View style={{ flex: 1 }}>
 <AppButton
 label="Approve Campus Node"variant="primary"loading={actingId === w.id}
 onPress={() => handleNodeResponse(w.id, 'approved')}
 />
 </View>
 <View style={{ flex: 1 }}>
 <AppButton
 label="Decline"variant="secondary"loading={actingId === w.id}
 onPress={() => handleNodeResponse(w.id, 'rejected')}
 />
 </View>
 </View>
 </SolidCard>
 ))}
 {!loadingWaitlist && waitlist.length === 0 ? (
 <EmptyState title="No pending campus nodes"description="All university federation requests have been processed." />
 ) : null}
 </View>
 ) : null}

 {/* Document Inspector Modal */}
 <Modal visible={!!previewResource} transparent animationType="fade"onRequestClose={() => setPreviewResource(null)}>
 <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: spacing.lg }}>
 <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, maxHeight: '80%' }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
 <AppText variant="h3"weight="bold">
 Resource Submission Preview
 </AppText>
 <Pressable onPress={() => setPreviewResource(null)} hitSlop={8}>
 <Ionicons name="close"size={22} color={colors.textSecondary} />
 </Pressable>
 </View>

 {previewResource ? (
 <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={true}>
 <AppText variant="body"weight="bold"style={{ marginBottom: 4 }}>
 {previewResource.title}
 </AppText>
 <AppText tone="brand"variant="caption"weight="bold"style={{ marginBottom: spacing.md }}>
 {previewResource.courseCode} • {previewResource.department} • {previewResource.fileType} ({previewResource.fileSize})
 </AppText>

 <View style={{ backgroundColor: colors.pastelPrimaryBg, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md }}>
 <AppText variant="caption"weight="bold"tone="brand"style={{ marginBottom: 4 }}>
 AUTHENTICITY & METADATA:
 </AppText>
 <AppText variant="caption">Author: {previewResource.authorName}</AppText>
 <AppText variant="caption">Academic Cohort: {previewResource.academicLevel || 'Undergraduate'}</AppText>
 <AppText variant="caption">Topic: {previewResource.syllabusTopic || 'Core Syllabus'}</AppText>
 </View>

 <AppText variant="caption"weight="bold"tone="secondary"style={{ marginBottom: 4 }}>
 DESCRIPTION & SCOPE:
 </AppText>
 <AppText tone="primary"variant="bodySmall"style={{ lineHeight: 20 }}>
 {previewResource.description}
 </AppText>
 </ScrollView>
 ) : null}

 <View style={{ marginTop: spacing.md }}>
 <AppButton label="Close Preview"onPress={() => setPreviewResource(null)} />
 </View>
 </View>
 </View>
 </Modal>
 </View>
 );
}
