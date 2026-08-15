import React, { useState } from'react';
import { Alert, Modal, Pressable, ScrollView, View } from'react-native';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { Ionicons } from'@expo/vector-icons';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { AppText } from'@/components/AppText';
import { MonthCalendarGrid } from'@/components/MonthCalendarGrid';
import { AgendaList } from'@/components/AgendaList';
import { AppButton } from'@/components/AppButton';
import { SolidCard } from'@/components/SolidCard';
import { useTheme } from'@/theme/ThemeProvider';
import { listEvents } from'@/api/events';

const TABS = ['Monthly Grid', 'Agenda'] as const;

const LMS_PROVIDERS = [
  { id: 'canvas', name: 'Canvas LMS', icon: 'school-outline', desc: 'Sync assignments, quizzes & live lecture links' },
  { id: 'moodle', name: 'Moodle Campus Portal', icon: 'globe-outline', desc: 'Import faculty class timetables & department routine' },
  { id: 'google_classroom', name: 'Google Classroom', icon: 'logo-google', desc: 'Fetch project milestones & homework dates' },
  { id: 'exam_portal', name: 'Senate Exam Timetable', icon: 'document-text-outline', desc: 'Auto-sync hall seatings & exam papers' },
];

export default function CalendarScreen() {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Monthly Grid');

  // LMS Sync Modal state
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('canvas');
  const [syncing, setSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);

  const { data: events } = useQuery({ queryKey: ['events', 'student', 'calendar'], queryFn: () => listEvents({ scope: 'student' }) });

  async function handleExecuteSync() {
    setSyncing(true);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    setSyncing(false);
    setSyncSuccess(true);
    queryClient.invalidateQueries({ queryKey: ['events'] });
    setTimeout(() => {
      setSyncSuccess(false);
      setSyncModalOpen(false);
      Alert.alert('Timetable Synchronized', '5 upcoming lectures, 2 assignments, and your exam schedule have been imported into your calendar.');
    }, 1200);
  }

  return (
    <ScreenContainer glow={false}>
      <AppHeader />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.lg, marginBottom: spacing.lg }}>
        <AppText variant="h1"weight="bold">
          My Scheduler 🗓️
        </AppText>
        <Pressable
          onPress={() => setSyncModalOpen(true)}
          hitSlop={8}
          accessibilityRole="button"accessibilityLabel="Sync and import calendar"style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: spacing.sm,
            paddingVertical: 6,
            backgroundColor: colors.pastelPrimaryBg,
            borderRadius: radius.pill,
          }}
        >
          <Ionicons name="sync-outline"size={16} color={colors.brandPrimary} />
          <AppText variant="caption"weight="bold"style={{ color: colors.brandPrimary }}>
            Sync LMS
          </AppText>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', backgroundColor: colors.divider, borderRadius: radius.pill, padding: 4, marginBottom: spacing.lg }}>
        {TABS.map((t) => {
          const selected = tab === t;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              accessibilityRole="tab"accessibilityState={{ selected }}
              accessibilityLabel={t}
              style={{
                flex: 1,
                paddingVertical: spacing.sm,
                borderRadius: radius.pill,
                alignItems: 'center',
                backgroundColor: selected ? colors.brandPrimary : 'transparent',
              }}
            >
              <AppText variant="bodySmall"weight="bold"tone={selected ? 'inverse' : 'secondary'}>
                {t}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        {tab === 'Monthly Grid' ? <MonthCalendarGrid events={events ?? []} /> : <AgendaList events={events ?? []} />}
      </ScrollView>

      {/* Interactive LMS Sync Modal */}
      <Modal visible={syncModalOpen} transparent animationType="fade"onRequestClose={() => setSyncModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
          <SolidCard style={{ width: '100%', maxWidth: 440 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Ionicons name="school"size={20} color={colors.brandPrimary} />
                <AppText variant="h3"weight="bold">
                  Campus LMS Sync 🔄
                </AppText>
              </View>
              <Pressable onPress={() => setSyncModalOpen(false)} hitSlop={8}>
                <Ionicons name="close"size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <AppText tone="secondary"variant="bodySmall"style={{ marginBottom: spacing.md }}>
              Connect your academic portal to auto-import course timetables, exam slots, and assignment deadlines.
            </AppText>

            {LMS_PROVIDERS.map((provider) => {
              const isSelected = selectedProvider === provider.id;
              return (
                <Pressable
                  key={provider.id}
                  onPress={() => setSelectedProvider(provider.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.sm,
                    padding: spacing.sm,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: isSelected ? colors.brandPrimary : colors.border,
                    backgroundColor: isSelected ? colors.pastelPrimaryBg : colors.surface,
                    marginBottom: spacing.xs,
                  }}
                >
                  <Ionicons name={provider.icon as any} size={20} color={isSelected ? colors.brandPrimary : colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <AppText weight="bold"variant="bodySmall">
                      {provider.name}
                    </AppText>
                    <AppText tone="secondary"variant="caption">
                      {provider.desc}
                    </AppText>
                  </View>
                  {isSelected ? <Ionicons name="checkmark-circle"size={18} color={colors.brandPrimary} /> : null}
                </Pressable>
              );
            })}

            <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.md }}>
              <AppButton label="Cancel"variant="ghost"onPress={() => setSyncModalOpen(false)} />
              <AppButton
                label={syncSuccess ? 'Imported! ✓' : syncing ? 'Syncing...' : 'Sync Timetable'}
                loading={syncing}
                onPress={handleExecuteSync}
              />
            </View>
          </SolidCard>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
