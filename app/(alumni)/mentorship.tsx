import React, { useState } from'react';
import { Alert, Modal, Pressable, ScrollView, View } from'react-native';
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

  function handleStartMentorshipCall(studentId: string, studentName: string, department?: string | null) {
    const roomName = getCallRoomName(`mentorship-${studentId}`);
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
          <AppText variant={isDesktop ? 'h2' : 'h3'} weight="bold" numberOfLines={1}>
            Alumni Mentorship Desk
          </AppText>
          <AppText tone="secondary" variant="bodySmall" numberOfLines={2} style={{ marginTop: 2 }}>
            Guide university students, review portfolio code, and conduct 1-on-1 video calls.
          </AppText>
        </View>

        {/* Overview Stats */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
          <StatBox label="Active Mentees" value={mentorships?.filter((m) => m.status === 'active').length ?? 0} icon="people" />
          <StatBox label="Pending Requests" value={mentorships?.filter((m) => m.status === 'pending').length ?? 0} icon="time" />
          <StatBox label="Sessions Done" value={mentorships?.filter((m) => m.status === 'completed').length ?? 0} icon="videocam" />
        </View>

        <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.sm }}>
          Student Mentorship Inquiries ({mentorships?.length ?? 0})
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
                      <AppText variant="bodySmall" weight="bold" numberOfLines={1}>
                        {studentName}
                      </AppText>
                      <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: 11 }}>
                        {m.studentDepartment ? `${m.studentDepartment} • Mentee` : 'Undergraduate Scholar'}
                      </AppText>
                    </View>
                  </View>
                  <Badge label={m.status.toUpperCase()} tone={STATUS_TONE[m.status]} />
                </View>

                {m.focusArea ? (
                  <View style={{ backgroundColor: colors.pastelPrimaryBg, padding: spacing.sm, borderRadius: radius.md, marginVertical: spacing.sm }}>
                    <AppText variant="caption" weight="bold" tone="brand">
                      REQUESTED FOCUS:
                    </AppText>
                    <AppText variant="bodySmall" weight="medium" style={{ marginTop: 2 }}>
                      {m.focusArea}
                    </AppText>
                  </View>
                ) : null}

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
                        onPress={() => handleStartMentorshipCall(m.studentId, studentName, m.studentDepartment)}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppButton
                        label="Message"
                        variant="secondary"
                        fullWidth
                        size="sm"
                        onPress={() => handleOpenChat(m.studentId, studentName)}
                      />
                    </View>
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
        backgroundColor: colors.pastelPrimaryBg,
        borderRadius: radius.md,
        paddingHorizontal: 6,
        paddingVertical: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.brandPrimary,
        minWidth: 0,
      }}
    >
      <Ionicons name={icon} size={16} color={colors.brandPrimary} style={{ marginBottom: 2 }} />
      <AppText variant="h3" weight="bold" tone="brand" numberOfLines={1}>
        {value}
      </AppText>
      <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: 9.5, textAlign: 'center' }}>
        {label}
      </AppText>
    </View>
  );
}
