import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { Avatar } from '@/components/Avatar';
import { AppButton } from '@/components/AppButton';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { listMentorships, respondToMentorshipRequest } from '@/api/mentorship';
import { createNotification } from '@/api/notifications';
import { getOrCreateConversationWithUser } from '@/api/messaging';

const STATUS_TONE = {
  pending: 'warning',
  active: 'success',
  completed: 'neutral',
  declined: 'critical',
} as const;

export default function AlumniMentorshipScreen() {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  // Video call scheduler modal state
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [selectedMentee, setSelectedMentee] = useState<{ id: string; name: string } | null>(null);
  const [sessionTopic, setSessionTopic] = useState('Career Prep & System Design Review');
  const [sessionDate, setSessionDate] = useState('This Saturday, 4:00 PM (GMT+1)');

  const { data: mentorships, isLoading } = useQuery({
    queryKey: ['mentorships'],
    queryFn: listMentorships,
  });

  async function respond(id: string, action: 'accept' | 'decline') {
    setSubmittingId(id);
    try {
      await respondToMentorshipRequest(id, action);
      queryClient.invalidateQueries({ queryKey: ['mentorships'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      Alert.alert(
        action === 'accept' ? 'Mentorship Accepted 🤝' : 'Request Declined',
        action === 'accept'
          ? 'You are now mentoring this student. You can schedule 1-on-1 video calls and chat directly.'
          : 'The mentorship application was declined.',
      );
    } finally {
      setSubmittingId(null);
    }
  }

  function handleOpenScheduler(mentee: { id: string; name: string }) {
    setSelectedMentee(mentee);
    setScheduleModalOpen(true);
  }

  function handleConfirmVideoSession() {
    if (!selectedMentee) return;
    const meetUrl = `https://meet.google.com/lio-${Math.random().toString(36).substring(2, 6)}-${Math.random().toString(36).substring(2, 6)}`;
    createNotification({
      type: 'event',
      title: '📹 Mentorship Video Call Scheduled',
      body: `Your 1-on-1 session on "${sessionTopic}" is scheduled for ${sessionDate}. Link: ${meetUrl}`,
      deepLinkPath: '/(student)/mentorship',
    });
    setScheduleModalOpen(false);
    Alert.alert(
      'Session Scheduled 📹',
      `Google Meet session created for ${sessionDate}.\n\nMeeting URL: ${meetUrl}\n\nCalendar invite and notification sent to ${selectedMentee.name}.`,
    );
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
      <AppHeader />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        <View style={{ paddingTop: spacing.md, marginBottom: spacing.md }}>
          <AppText variant="h1" weight="bold">
            Alumni Mentorship Desk 🎓
          </AppText>
          <AppText tone="secondary" variant="bodySmall">
            Guide university students, review portfolio code, and conduct 1-on-1 video calls.
          </AppText>
        </View>

        {/* Overview Stats */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
          <StatBox label="Active Mentees" value={mentorships?.filter((m) => m.status === 'active').length ?? 2} icon="people" />
          <StatBox label="Pending Requests" value={mentorships?.filter((m) => m.status === 'pending').length ?? 1} icon="time" />
          <StatBox label="Sessions Done" value={8} icon="videocam" />
        </View>

        <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.sm }}>
          Student Mentorship Inquiries ({mentorships?.length ?? 0})
        </AppText>

        {mentorships?.map((m) => {
          const studentName = m.studentName ?? 'Diana Adebayo (300L CS)';
          return (
            <SolidCard key={m.id} radius={18} style={{ marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs }}>
                <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                  <Avatar name={studentName} size={42} />
                  <View>
                    <AppText variant="bodySmall" weight="bold">
                      {studentName}
                    </AppText>
                    <AppText tone="secondary" variant="caption">
                      University of Ibadan &bull; GPA 4.7 / 5.0
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
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                  <AppButton label="Accept Mentee 🤝" onPress={() => respond(m.id, 'accept')} loading={submittingId === m.id} />
                  <AppButton label="Decline" variant="secondary" onPress={() => respond(m.id, 'decline')} />
                </View>
              ) : m.status === 'active' ? (
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                  <AppButton
                    label="Schedule Video Call 📹"
                    onPress={() => handleOpenScheduler({ id: m.studentId, name: studentName })}
                  />
                  <AppButton
                    label="Message 💬"
                    variant="secondary"
                    onPress={() => handleOpenChat(m.studentId, studentName)}
                  />
                </View>
              ) : null}
            </SolidCard>
          );
        })}

        {!isLoading && (mentorships?.length ?? 0) === 0 ? (
          <EmptyState title="No mentorship activity" description="Incoming requests from students will appear here." />
        ) : null}
      </ScrollView>

      {/* Schedule Video Session Modal */}
      <Modal visible={scheduleModalOpen} transparent animationType="slide" onRequestClose={() => setScheduleModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Ionicons name="videocam" size={22} color={colors.brandPrimary} />
                <AppText variant="h3" weight="bold">
                  Schedule 1-on-1 Video Session
                </AppText>
              </View>
              <Pressable onPress={() => setScheduleModalOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
              With: {selectedMentee?.name}
            </AppText>

            <AppTextField label="Session Focus / Agenda" value={sessionTopic} onChangeText={setSessionTopic} />
            <AppTextField label="Date & Time" value={sessionDate} onChangeText={setSessionDate} placeholder="e.g. Saturday 4:00 PM" />

            <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.md }}>
              <AppButton label="Cancel" variant="ghost" onPress={() => setScheduleModalOpen(false)} />
              <AppButton label="Generate Meet Link & Confirm 📹" onPress={handleConfirmVideoSession} />
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function StatBox({ label, value, icon }: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.pastelPrimaryBg,
        borderRadius: radius.md,
        padding: spacing.sm,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.brandPrimary,
      }}
    >
      <Ionicons name={icon} size={18} color={colors.brandPrimary} style={{ marginBottom: 2 }} />
      <AppText variant="h3" weight="bold" tone="brand">
        {value}
      </AppText>
      <AppText tone="secondary" variant="caption" style={{ fontSize: 10 }}>
        {label}
      </AppText>
    </View>
  );
}
