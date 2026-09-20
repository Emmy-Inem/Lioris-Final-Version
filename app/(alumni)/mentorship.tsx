import React, { useState } from'react';
import { Alert, Linking, Modal, Pressable, ScrollView, View } from'react-native';
import { router } from'expo-router';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { Ionicons } from'@expo/vector-icons';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { AppText } from'@/components/AppText';
import { AppTextField } from'@/components/AppTextField';
import { SolidCard } from'@/components/SolidCard';
import { Badge } from'@/components/Badge';
import { Avatar } from'@/components/Avatar';
import { AppButton } from'@/components/AppButton';
import { EmptyState } from'@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { listMentorships, respondToMentorshipRequest } from '@/api/mentorship';
import { createNotification } from '@/api/notifications';
import { getOrCreateConversationWithUser } from '@/api/messaging';
import { CallModal } from '@/components/CallModal';
import { getCallRoomName, getCallUrl } from '@/api/calling';

const STATUS_TONE = {
  pending: 'warning',
  active: 'success',
  completed: 'neutral',
  declined: 'critical',
} as const;

export default function AlumniMentorshipScreen() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const { isFeatureEnabled } = useFeatureFlags();
  const queryClient = useQueryClient();
  const { data: mentorships, isLoading } = useQuery({
    queryKey: ['mentorships'],
    queryFn: listMentorships,
  });
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [activeCall, setActiveCall] = useState<{
    roomName: string;
    callUrl: string;
    partnerName: string;
    partnerDepartment?: string | null;
  } | null>(null);

  function handleStartMentorshipCall(mentorshipId: string, studentName: string, department?: string | null) {
    // Room is derived from the mentorship record id (not the student's id) so that only its
    // two participants can join: the realtime policy authorises against public.mentorships.
    const roomName = getCallRoomName(mentorshipId);
    const callUrl = getCallUrl(roomName, false);
    setActiveCall({ roomName, callUrl, partnerName: studentName, partnerDepartment: department });
  }

  async function respond(id: string, action: 'accept' | 'decline') {
    setSubmittingId(id);
    try {
      await respondToMentorshipRequest(id, action);
      queryClient.invalidateQueries({ queryKey: ['mentorships'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      Alert.alert(
        action === 'accept' ? 'Mentorship Accepted' : 'Request Declined',
        action === 'accept'
          ? 'You are now mentoring this student. You can chat directly.'
          : 'The mentorship application was declined.',
      );
    } finally {
      setSubmittingId(null);
    }
  }

  async function handleOpenChat(menteeId: string, menteeName: string) {
    try {
      const conv = await getOrCreateConversationWithUser(menteeId, menteeName, 'avatar_male');
      router.push(`/(alumni)/messages/${conv.id}` as any);
    } catch {
      Alert.alert('Chat Initiated', `Opening chat thread with ${menteeName}`);
    }
  }

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <ScrollView style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: isDesktop ? 40 : 130 }}
      >
        <View style={{ paddingTop: isDesktop ? spacing.md : spacing.xs, marginBottom: spacing.sm }}>
          <AppText variant={isDesktop ? 'h2' : 'h3'} weight="bold">
            Alumni Mentorship Desk
          </AppText>
          <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 2 }}>
            Guide university students, review portfolio code, and conduct 1-on-1 video calls.
          </AppText>
        </View>

        {/* Overview Stats */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
          <StatBox label="Active Mentees" value={mentorships?.filter((m) => m.status === 'active').length ?? 0} icon="people" />
          <StatBox label="Pending Requests" value={mentorships?.filter((m) => m.status === 'pending').length ?? 0} icon="time" />
          <StatBox label="Sessions Done" value={mentorships?.filter((m) => m.status === 'completed').length ?? 0} icon="videocam" />
        </View>

        <AppText
          weight="bold"
          style={{ fontSize: isDesktop ? 18 : 15, lineHeight: isDesktop ? 24 : 20, letterSpacing: -0.2, marginBottom: spacing.xs }}
        >
          Mentorship Inquiries ({mentorships?.length ?? 0})
        </AppText>

        <View style={isDesktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: 16 } : undefined}>
          {mentorships?.map((m) => {
            const studentName = m.studentName || 'Student Mentee';
            return (
              <SolidCard key={m.id} radius={18} style={isDesktop ? { flexGrow: 1, flexBasis: 0, minWidth: 300, marginBottom: spacing.md } : { marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: spacing.xs }}>
                  <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flex: 1, minWidth: 0 }}>
                    <Avatar name={studentName} size={40} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText variant="bodySmall" weight="bold">
                        {studentName}
                      </AppText>
                      <AppText tone="secondary" variant="caption" style={{ fontSize: 11 }}>
                        {m.studentDepartment ? `${m.studentDepartment} • Mentee` : 'Undergraduate Scholar'}
                      </AppText>
                    </View>
                  </View>
                  <Badge label={m.status.toUpperCase()} tone={STATUS_TONE[m.status]} />
                </View>

                {/* Proposal & Focus Details */}
                <View style={{ backgroundColor: colors.divider, padding: spacing.sm, borderRadius: radius.md, marginVertical: spacing.sm, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <AppText variant="caption" weight="bold" tone="secondary">
                        TRACK:
                      </AppText>
                      <AppText variant="caption" weight="bold" tone="brand">
                        {m.focusArea || 'Academic Guidance'}
                      </AppText>
                    </View>
                    {m.academicLevel ? (
                      <Badge label={m.academicLevel} tone="neutral" />
                    ) : null}
                  </View>

                  {m.pitch ? (
                    <View style={{ marginTop: 2 }}>
                      <AppText variant="caption" weight="bold" tone="secondary">
                        STUDENT STATEMENT:
                      </AppText>
                      <AppText variant="bodySmall" style={{ marginTop: 2 }}>
                        {m.pitch}
                      </AppText>
                    </View>
                  ) : null}

                  {m.goals ? (
                    <View style={{ marginTop: 2 }}>
                      <AppText variant="caption" weight="bold" tone="secondary">
                        KEY GOALS:
                      </AppText>
                      <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
                        {m.goals}
                      </AppText>
                    </View>
                  ) : null}

                  {m.cadence ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                      <AppText variant="caption" tone="secondary">
                        Proposed Cadence: <AppText variant="caption" weight="bold">{m.cadence}</AppText>
                      </AppText>
                    </View>
                  ) : null}

                  {m.planOutline ? (
                    <View style={{ marginTop: 2 }}>
                      <AppText variant="caption" weight="bold" tone="secondary">
                        PROPOSED ROADMAP:
                      </AppText>
                      <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
                        {m.planOutline}
                      </AppText>
                    </View>
                  ) : null}

                  {/* Supporting Attached Document */}
                  {m.documentUrl ? (
                    <Pressable
                      onPress={() => {
                        if (m.documentUrl) Linking.openURL(m.documentUrl);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="View student attached document"
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 8,
                        borderRadius: radius.sm,
                        backgroundColor: colors.brandPrimary + '15',
                        borderWidth: 1,
                        borderColor: colors.brandPrimary + '35',
                        marginTop: 4,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <Ionicons name="document-text" size={18} color={colors.brandPrimary} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <AppText variant="caption" weight="bold">
                            {m.documentName || 'Student Proposal / CV'}
                          </AppText>
                          <AppText variant="caption" tone="secondary" style={{ fontSize: 10 }}>
                            Click to view attached document ↗
                          </AppText>
                        </View>
                      </View>
                      <Ionicons name="open-outline" size={16} color={colors.brandPrimary} />
                    </Pressable>
                  ) : null}
                </View>

                {m.status === 'pending' ? (
                  <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs }}>
                    <View style={{ flex: 1 }}>
                      <AppButton label="Accept Mentee" fullWidth size="sm" onPress={() => respond(m.id, 'accept')} loading={submittingId === m.id} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppButton label="Decline" variant="secondary" fullWidth size="sm" onPress={() => respond(m.id, 'decline')} />
                    </View>
                  </View>
                ) : m.status === 'active' ? (
                  <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs }}>
                    <View style={{ flex: 1 }}>
                      <AppButton
                        label="Video Call"
                        variant="primary"
                        fullWidth
                        size="sm"
                        onPress={() => handleStartMentorshipCall(m.id, studentName, m.studentDepartment)}
                      />
                    </View>
                    {isFeatureEnabled('e2ee_messaging') && (
                      <View style={{ flex: 1 }}>
                        <AppButton
                          label="Message"
                          variant="secondary"
                          fullWidth
                          size="sm"
                          onPress={() => handleOpenChat(m.studentId, studentName)}
                        />
                      </View>
                    )}
                  </View>
                ) : null}
              </SolidCard>
            );
          })}
        </View>

        {!isLoading && (mentorships?.length ?? 0) === 0 ? (
          <EmptyState title="No mentorship activity" description="Incoming requests from students will appear here." />
        ) : null}
      </ScrollView>

      {/* Live Video Call Modal */}
      {activeCall && (
        <CallModal
          visible={!!activeCall}
          onClose={() => setActiveCall(null)}
          callType="video"
          roomName={activeCall.roomName}
          callUrl={activeCall.callUrl}
          partnerName={activeCall.partnerName}
          partnerDepartment={activeCall.partnerDepartment}
        />
      )}
    </ScreenContainer>
  );
}

function StatBox({ label, value, icon }: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap }) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.divider,
        borderRadius: radius.md,
        paddingHorizontal: 6,
        paddingVertical: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
        minWidth: 0,
      }}
    >
      <Ionicons name={icon} size={16} color={colors.textSecondary} style={{ marginBottom: 2 }} />
      <AppText variant="h3" weight="bold">
        {value}
      </AppText>
      <AppText tone="secondary" variant="caption" style={{ fontSize: 9.5, textAlign: 'center' }}>
        {label}
      </AppText>
    </View>
  );
}
