import React, { useState } from 'react';
import { AdminSectionTabs } from '@/components/admin/AdminSectionTabs';
import { useAdminBadges } from '@/components/admin/useAdminBadges';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  View,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { Avatar } from '@/components/Avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import {
  getAllSupportTickets,
  updateSupportTicket,
  deleteSupportTicket,
  SupportTicket,
  SupportTicketCategory,
  SupportTicketStatus,
} from '@/api/supportTickets';
import { adminDirectVerifyUser } from '@/api/verification';
import { adminTriggerPasswordReset, adminUpdateUserProfile } from '@/api/auth';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '@/utils/haptics';
import { useToast } from '@/hooks/useToast';

const CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  account_issue: 'Account / Login',
  matric_id_correction: 'Matric / ID Correction',
  campus_transfer: 'Campus Transfer',
  verification_appeal: 'Verification Appeal',
  content_issue: 'Content Flag',
  bug_report: 'Bug Report',
  general: 'General Inquiry',
};

const STATUS_TONES: Record<SupportTicketStatus, 'warning' | 'brand' | 'success' | 'neutral'> = {
  open: 'warning',
  in_progress: 'brand',
  resolved: 'success',
  closed: 'neutral',
};

export default function SupportDeskScreen() {
  const adminBadges = useAdminBadges();
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<'all' | SupportTicketStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | SupportTicketCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);

  // Remediation states inside modal
  const [adminNotes, setAdminNotes] = useState('');
  const [newMatricInput, setNewMatricInput] = useState('');
  const [newCampusInput, setNewCampusInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const { data: tickets, isLoading, refetch } = useQuery({
    queryKey: ['support_tickets', statusFilter, categoryFilter, searchQuery],
    queryFn: () =>
      getAllSupportTickets({
        status: statusFilter,
        category: categoryFilter,
        q: searchQuery.trim() || undefined,
      }),
  });

  const openCount = (tickets ?? []).filter((t) => t.status === 'open').length;
  const inProgressCount = (tickets ?? []).filter((t) => t.status === 'in_progress').length;
  const resolvedCount = (tickets ?? []).filter((t) => t.status === 'resolved').length;

  function openTicketDetail(ticket: SupportTicket) {
    setSelectedTicket(ticket);
    setAdminNotes(ticket.adminNotes || '');
    setNewMatricInput(ticket.userMatric || '');
    setNewCampusInput(ticket.userCampus || '');
  }

  async function handleUpdateStatus(newStatus: SupportTicketStatus) {
    if (!selectedTicket) return;
    haptics.medium();
    setActionLoading(true);
    try {
      const ok = await updateSupportTicket(selectedTicket.id, {
        status: newStatus,
        adminNotes: adminNotes.trim(),
      });
      if (ok) {
        toast.success(`Ticket status updated to ${newStatus.replace('_', ' ')}.`);
        queryClient.invalidateQueries({ queryKey: ['support_tickets'] });
        setSelectedTicket(null);
      } else {
        toast.error('Failed to update ticket status.');
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReassignMatric() {
    if (!selectedTicket || !newMatricInput.trim()) {
      Alert.alert('Validation', 'Please enter a valid Matric Number.');
      return;
    }
    haptics.medium();
    setActionLoading(true);
    try {
      const res = await adminUpdateUserProfile(selectedTicket.userId, {
        student_id_number: newMatricInput.trim(),
      });
      if (res.success) {
        toast.success(`Matric number updated to "${newMatricInput.trim()}" for ${selectedTicket.userName}.`);
        await updateSupportTicket(selectedTicket.id, {
          status: 'resolved',
          adminNotes: (adminNotes ? adminNotes + '\n' : '') + `[Remediation] Matric reassigned to ${newMatricInput.trim()}.`,
        });
        queryClient.invalidateQueries({ queryKey: ['support_tickets'] });
        setSelectedTicket(null);
      } else {
        toast.error(res.error || 'Failed to update student ID.');
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleTransferCampus() {
    if (!selectedTicket || !newCampusInput.trim()) {
      Alert.alert('Validation', 'Please enter a valid campus code (e.g. UNILAG, UI, CU).');
      return;
    }
    haptics.medium();
    setActionLoading(true);
    try {
      const res = await adminUpdateUserProfile(selectedTicket.userId, {
        campus_code: newCampusInput.trim().toUpperCase(),
      });
      if (res.success) {
        toast.success(`Campus affiliation transferred to "${newCampusInput.trim().toUpperCase()}".`);
        await updateSupportTicket(selectedTicket.id, {
          status: 'resolved',
          adminNotes: (adminNotes ? adminNotes + '\n' : '') + `[Remediation] Transferred campus to ${newCampusInput.trim().toUpperCase()}.`,
        });
        queryClient.invalidateQueries({ queryKey: ['support_tickets'] });
        setSelectedTicket(null);
      } else {
        toast.error(res.error || 'Failed to transfer campus.');
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleGrantVerification() {
    if (!selectedTicket) return;
    haptics.medium();
    setActionLoading(true);
    try {
      const ok = await adminDirectVerifyUser(selectedTicket.userId, true);
      if (ok) {
        toast.success(`Verification badge granted to ${selectedTicket.userName}.`);
        await updateSupportTicket(selectedTicket.id, {
          status: 'resolved',
          adminNotes: (adminNotes ? adminNotes + '\n' : '') + '[Remediation] Verification badge approved by admin.',
        });
        queryClient.invalidateQueries({ queryKey: ['support_tickets'] });
        setSelectedTicket(null);
      } else {
        toast.error('Failed to grant verification badge.');
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSendPasswordReset() {
    if (!selectedTicket?.userEmail) {
      toast.error('No email address linked to this user account.');
      return;
    }
    haptics.medium();
    setActionLoading(true);
    try {
      const res = await adminTriggerPasswordReset(selectedTicket.userEmail);
      if (res.success) {
        toast.success(res.message);
        await updateSupportTicket(selectedTicket.id, {
          status: 'resolved',
          adminNotes: (adminNotes ? adminNotes + '\n' : '') + `[Remediation] Password reset email dispatched to ${selectedTicket.userEmail}.`,
        });
        queryClient.invalidateQueries({ queryKey: ['support_tickets'] });
        setSelectedTicket(null);
      } else {
        toast.error(res.message);
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteTicket() {
    if (!selectedTicket) return;
    Alert.alert(
      'Delete Support Ticket',
      'Are you sure you want to permanently delete this support ticket?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              const ok = await deleteSupportTicket(selectedTicket.id);
              if (ok) {
                toast.success('Ticket deleted.');
                queryClient.invalidateQueries({ queryKey: ['support_tickets'] });
                setSelectedTicket(null);
              } else {
                toast.error('Failed to delete ticket.');
              }
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
  }

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <View style={{ paddingTop: isDesktop ? 4 : 8 }}>
        <AdminSectionTabs group="people" badges={{ verification: adminBadges.verification, support: adminBadges.support }} />
      </View>

      {/* Screen Header */}
      <View style={{ paddingTop: isDesktop ? spacing.xs : spacing.md, paddingBottom: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <View>
            <AppText variant={isDesktop ? 'h1' : 'h2'} weight="bold">
              Support & Resolution Desk
            </AppText>
            <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 2 }}>
              Industry-standard support console: triage requests, fix user issues, and apply 1-click remedies.
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Badge label={`${openCount} Open`} tone="warning" />
            <Badge label={`${inProgressCount} In Progress`} tone="neutral" />
            <Badge label={`${resolvedCount} Resolved`} tone="success" />
          </View>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={{ flexDirection: 'row', gap: spacing.xs, marginVertical: spacing.sm, flexWrap: 'wrap' }}>
        {(['all', 'open', 'in_progress', 'resolved'] as const).map((st) => (
          <Pressable
            key={st}
            onPress={() => setStatusFilter(st)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: radius.pill,
              backgroundColor: statusFilter === st ? colors.brandPrimary : colors.surface,
              borderWidth: 1,
              borderColor: statusFilter === st ? colors.brandPrimary : colors.border,
            }}
          >
            <AppText
              variant="caption"
              weight="bold"
              style={{ color: statusFilter === st ? '#FFFFFF' : colors.textSecondary }}
            >
              {st === 'all' ? 'All Tickets' : st.replace('_', ' ').toUpperCase()}
            </AppText>
          </Pressable>
        ))}
      </View>

      {/* Search Bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: spacing.md,
          paddingVertical: 10,
          marginBottom: spacing.md,
          gap: spacing.sm,
        }}
      >
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search tickets"
          placeholderTextColor={colors.textSecondary}
          style={{ flex: 1, color: colors.textPrimary, fontSize: 14, padding: 0 }}
        />
        {searchQuery.length > 0 && (
          <Ionicons
            name="close-circle"
            size={18}
            color={colors.textSecondary}
            onPress={() => setSearchQuery('')}
          />
        )}
      </View>

      {/* Tickets List */}
      {isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : (
        <FlatList
          data={tickets ?? []}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 150, gap: spacing.sm }}
          renderItem={({ item }) => (
            <SolidCard frosted style={{ padding: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <Avatar name={item.userName} size={38} role={(item.userRole as any) || 'student'} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                      <AppText weight="bold" style={{ fontSize: 14 }}>
                        {item.userName}
                      </AppText>
                      {item.userMatric && (
                        <Badge label={item.userMatric} tone="neutral" />
                      )}
                      <Badge label={(item.userRole || 'student').toUpperCase()} tone="neutral" />
                      {item.userCampus && <Badge label={item.userCampus} tone="neutral" />}
                    </View>
                    <AppText tone="secondary" variant="caption">
                      {item.userEmail || 'No email registered'} • {new Date(item.createdAt).toLocaleDateString()}
                    </AppText>
                  </View>
                </View>
                <Badge label={item.status.replace('_', ' ').toUpperCase()} tone={STATUS_TONES[item.status]} />
              </View>

              {/* Title & Category */}
              <View style={{ marginTop: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Badge label={CATEGORY_LABELS[item.category] || item.category} tone="neutral" />
                  <AppText weight="bold" style={{ fontSize: 14.5, flex: 1 }}>
                    {item.title}
                  </AppText>
                </View>
                <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 4 }}>
                  {item.description}
                </AppText>
              </View>

              {item.adminNotes && (
                <View style={{ marginTop: 6, padding: 8, backgroundColor: isDark ? '#1F2937' : '#F3F4F6', borderRadius: radius.sm }}>
                  <AppText variant="caption" tone="secondary">
                    Admin Note: {item.adminNotes}
                  </AppText>
                </View>
              )}

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: spacing.sm }}>
                <AppButton
                  label="Triage & Resolve"
                  size="sm"
                  onPress={() => openTicketDetail(item)}
                />
              </View>
            </SolidCard>
          )}
          ListEmptyComponent={
            <EmptyState
              title="No support tickets"
              description="No user help requests match the current filters."
            />
          }
        />
      )}

      {/* Ticket Remediation Modal */}
      {selectedTicket && (
        <Modal
          visible={!!selectedTicket}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedTicket(null)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.6)',
              justifyContent: 'center',
              alignItems: 'center',
              padding: spacing.md,
            }}
          >
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: radius.lg,
                width: isDesktop ? 650 : '100%',
                maxHeight: '90%',
                padding: spacing.lg,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Modal Header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                  <View>
                    <AppText variant="h2" weight="bold">Ticket Resolution</AppText>
                    <AppText tone="secondary" variant="caption">
                      ID: {selectedTicket.id.slice(0, 12)}... • Submitted {new Date(selectedTicket.createdAt).toLocaleString()}
                    </AppText>
                  </View>
                  <Ionicons
                    name="close"
                    size={24}
                    color={colors.textSecondary}
                    onPress={() => setSelectedTicket(null)}
                  />
                </View>

                {/* User Info Card */}
                <SolidCard style={{ padding: spacing.md, marginBottom: spacing.md, backgroundColor: isDark ? '#18181B' : '#F4F4F5' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Avatar name={selectedTicket.userName} size={42} role={(selectedTicket.userRole as any) || 'student'} />
                    <View style={{ flex: 1 }}>
                      <AppText weight="bold" style={{ fontSize: 15 }}>{selectedTicket.userName}</AppText>
                      <AppText tone="secondary" variant="caption">Email: {selectedTicket.userEmail || 'N/A'}</AppText>
                      <AppText tone="secondary" variant="caption">Current Matric: {selectedTicket.userMatric || 'None'}</AppText>
                      <AppText tone="secondary" variant="caption">Campus: {selectedTicket.userCampus || 'GLOBAL'}</AppText>
                    </View>
                  </View>
                </SolidCard>

                {/* Ticket Details */}
                <View style={{ marginBottom: spacing.md }}>
                  <AppText weight="bold" style={{ fontSize: 16 }}>{selectedTicket.title}</AppText>
                  <View style={{ flexDirection: 'row', gap: 6, marginVertical: 6 }}>
                    <Badge label={CATEGORY_LABELS[selectedTicket.category] || selectedTicket.category} tone="neutral" />
                    <Badge label={selectedTicket.priority.toUpperCase()} tone={selectedTicket.priority === 'urgent' ? 'warning' : 'neutral'} />
                    <Badge label={selectedTicket.status.toUpperCase()} tone={STATUS_TONES[selectedTicket.status]} />
                  </View>
                  <AppText tone="primary" style={{ fontSize: 14, lineHeight: 20 }}>
                    {selectedTicket.description}
                  </AppText>
                </View>

                {/* 1-Click Remediation Actions Box */}
                <View style={{ marginBottom: spacing.md, padding: spacing.md, backgroundColor: isDark ? '#1C1917' : '#FEF3C7', borderRadius: radius.md, borderWidth: 1, borderColor: isDark ? '#44403C' : '#FDE68A' }}>
                  <AppText weight="bold" style={{ color: isDark ? '#FDE68A' : '#92400E', fontSize: 13.5, marginBottom: 8 }}>
                    ⚡ 1-Click Remediation Actions
                  </AppText>

                  {/* Remediation 1: Reassign Matric */}
                  <View style={{ marginBottom: 10 }}>
                    <AppText variant="caption" weight="bold" tone="secondary">Reassign Matric / Student ID:</AppText>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                      <TextInput
                        value={newMatricInput}
                        onChangeText={setNewMatricInput}
                        placeholder="Enter corrected Matric No..."
                        placeholderTextColor={colors.textSecondary}
                        style={{
                          flex: 1,
                          backgroundColor: colors.surface,
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: radius.sm,
                          paddingHorizontal: 8,
                          paddingVertical: 6,
                          fontSize: 13,
                          color: colors.textPrimary,
                        }}
                      />
                      <AppButton
                        label="Apply Matric"
                        size="sm"
                        onPress={handleReassignMatric}
                        loading={actionLoading}
                      />
                    </View>
                  </View>

                  {/* Remediation 2: Campus Transfer */}
                  <View style={{ marginBottom: 10 }}>
                    <AppText variant="caption" weight="bold" tone="secondary">Transfer Campus Affiliation:</AppText>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                      <TextInput
                        value={newCampusInput}
                        onChangeText={setNewCampusInput}
                        placeholder="Campus Code (UNILAG, UI, CU, OAU, FUNAAB, UNN)..."
                        placeholderTextColor={colors.textSecondary}
                        style={{
                          flex: 1,
                          backgroundColor: colors.surface,
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: radius.sm,
                          paddingHorizontal: 8,
                          paddingVertical: 6,
                          fontSize: 13,
                          color: colors.textPrimary,
                        }}
                      />
                      <AppButton
                        label="Transfer"
                        size="sm"
                        onPress={handleTransferCampus}
                        loading={actionLoading}
                      />
                    </View>
                  </View>

                  {/* Remediation 3 & 4: Quick Action Buttons */}
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    <AppButton
                      label="Grant Verified Badge"
                      variant="secondary"
                      size="sm"
                      onPress={handleGrantVerification}
                      loading={actionLoading}
                    />
                    <AppButton
                      label="Dispatch Password Reset"
                      variant="secondary"
                      size="sm"
                      onPress={handleSendPasswordReset}
                      loading={actionLoading}
                    />
                  </View>
                </View>

                {/* Admin Internal Resolution Notes */}
                <View style={{ marginBottom: spacing.md }}>
                  <AppText variant="caption" weight="bold" tone="secondary">Resolution Notes & Reply to User:</AppText>
                  <TextInput
                    value={adminNotes}
                    onChangeText={setAdminNotes}
                    placeholder="Enter resolution details or instructions for the user..."
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    numberOfLines={3}
                    style={{
                      marginTop: 4,
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: radius.md,
                      padding: 10,
                      fontSize: 13,
                      color: colors.textPrimary,
                      minHeight: 70,
                      textAlignVertical: 'top',
                    }}
                  />
                </View>

                {/* Action Buttons */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: spacing.sm }}>
                  <AppButton
                    label="Delete Ticket"
                    variant="ghost"
                    size="sm"
                    onPress={handleDeleteTicket}
                    loading={actionLoading}
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {selectedTicket.status !== 'in_progress' && (
                      <AppButton
                        label="In Progress"
                        variant="secondary"
                        size="sm"
                        onPress={() => handleUpdateStatus('in_progress')}
                        loading={actionLoading}
                      />
                    )}
                    {selectedTicket.status !== 'resolved' && (
                      <AppButton
                        label="Mark Resolved"
                        size="sm"
                        onPress={() => handleUpdateStatus('resolved')}
                        loading={actionLoading}
                      />
                    )}
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </ScreenContainer>
  );
}
