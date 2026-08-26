import React, { useState } from'react';
import { ScrollView, View, Pressable, Alert } from'react-native';
import { router } from'expo-router';
import { useQuery } from'@tanstack/react-query';
import { Image } from'expo-image';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { SolidCard } from'@/components/SolidCard';
import { AppText } from'@/components/AppText';
import { AppButton } from'@/components/AppButton';
import { Badge } from'@/components/Badge';
import { Avatar } from'@/components/Avatar';
import { AnnouncementCard } from'@/components/AnnouncementCard';
import { ManagePortalLinksModal } from '@/components/admin/ManagePortalLinksModal';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { listAnnouncements } from '@/api/announcements';
import { listEvents } from '@/api/events';
import { haptics } from '@/utils/haptics';

export default function StaffDashboard() {
 const { colors, spacing, radius } = useTheme();
 const { isDesktop } = useResponsive();
 const { user } = useAuth();
 const [portalModalOpen, setPortalModalOpen] = useState(false);
 const { data: announcements } = useQuery({ queryKey: ['announcements'], queryFn: listAnnouncements });
 const { data: events } = useQuery({ queryKey: ['events', 'staff'], queryFn: () => listEvents({}) });

  return (
    <ScreenContainer glow={true}>
      {!isDesktop && <AppHeader />}
      <ScrollView
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        contentContainerStyle={{ paddingBottom: isDesktop ? 40 : 140, paddingTop: isDesktop ? spacing.md : 0 }}
      >
        {/* Desktop Metric Ribbon */}
        {isDesktop && (
          <View style={{ flexDirection: 'row', gap: 16, marginBottom: spacing.lg }}>
            <SolidCard radius={16} style={{ flex: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.pastelPrimaryBg, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="school-outline" size={22} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="caption" tone="secondary" weight="semiBold" style={{ textTransform: 'uppercase', fontSize: 10 }}>Assigned Courses</AppText>
                <AppText variant="body" weight="bold">3 Active Courses</AppText>
                <AppText variant="caption" tone="brand" weight="semiBold" style={{ fontSize: 10 }}>CSC 301, CSC 411, MEE 305</AppText>
              </View>
            </SolidCard>

            <SolidCard radius={16} style={{ flex: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="people-outline" size={22} color="#0284C7" />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="caption" tone="secondary" weight="semiBold" style={{ textTransform: 'uppercase', fontSize: 10 }}>Total Students</AppText>
                <AppText variant="body" weight="bold">342 Enrolled</AppText>
                <AppText variant="caption" tone="secondary" style={{ fontSize: 10 }}>98% Attendance Recorded</AppText>
              </View>
            </SolidCard>

            <SolidCard radius={16} style={{ flex: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="document-text-outline" size={22} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="caption" tone="secondary" weight="semiBold" style={{ textTransform: 'uppercase', fontSize: 10 }}>Pending Grading</AppText>
                <AppText variant="body" weight="bold">18 Submissions</AppText>
                <AppText variant="caption" tone="secondary" style={{ fontSize: 10 }}>Midterm Assignment 2</AppText>
              </View>
            </SolidCard>

            <SolidCard radius={16} style={{ flex: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="time-outline" size={22} color="#16A34A" />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="caption" tone="secondary" weight="semiBold" style={{ textTransform: 'uppercase', fontSize: 10 }}>Next Lecture</AppText>
                <AppText variant="body" weight="bold">Today, 11:00 AM</AppText>
                <AppText variant="caption" tone="secondary" style={{ fontSize: 10 }}>LT 2 • CSC 301</AppText>
              </View>
            </SolidCard>
          </View>
        )}

        <View style={isDesktop ? { flexDirection: 'row', gap: 24, alignItems: 'flex-start' } : undefined}>
          {/* Main Left/Center Column */}
          <View style={isDesktop ? { flex: 1 } : undefined}>
            {/* Staff Coordinator Banner Header */}
            <View style={{ marginBottom: spacing.md, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface }}>
              <View style={{ width: '100%', height: isDesktop ? 160 : 140, position: 'relative' }}>
                <Image
                  source={require('../../assets/images/campus_students_photo.jpg')}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
                <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(10, 19, 38, 0.75)' }} />

                <View style={{ position: 'absolute', top: 16, left: 16, right: 16, bottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <View style={{ backgroundColor: colors.brandPrimary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill }}>
                        <AppText variant="caption" weight="bold" tone="inverse" style={{ fontSize: 10 }}>
                          FACULTY COORDINATOR
                        </AppText>
                      </View>
                      <AppText variant="caption" tone="inverse" style={{ opacity: 0.9 }}>
                        Department of Computer Science
                      </AppText>
                    </View>
                    <AppText variant="h1" weight="bold" tone="inverse" numberOfLines={1} style={{ fontSize: 22 }}>
                      Welcome, {user?.fullName?.split(' ')[0] ?? 'Prof'}
                    </AppText>
                    <AppText variant="caption" tone="inverse" style={{ opacity: 0.85, marginTop: 2 }}>
                      Semester Term: Harmattan 2026 • University of Ibadan
                    </AppText>
                  </View>

                  <Avatar name={user?.fullName ?? 'Faculty Coordinator'} size={56} role="staff" />
                </View>
              </View>
            </View>

            {/* Live Announcements */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <AppText variant="h3" weight="bold">
                Recent Faculty Notices
              </AppText>
              <AppText tone="brand" weight="bold" variant="bodySmall" onPress={() => router.push('/(staff)/announcements')}>
                Manage →
              </AppText>
            </View>

            {announcements?.slice(0, 3).map((a) => (
              <AnnouncementCard key={a.id} announcement={a} />
            ))}
          </View>

          {/* Right Sticky Column on Desktop */}
          {isDesktop ? (
            <View style={{ width: 360, gap: spacing.md }}>
              {/* Course Milestones & Grading Alert */}
              <SolidCard radius={20} style={{ padding: spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="time" size={18} color="#D97706" />
                    <AppText weight="bold" variant="bodySmall">
                      Academic Deadlines
                    </AppText>
                  </View>
                  <Badge label="In 3 Days" tone="accent" />
                </View>
                <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.sm }}>
                  CSC 301 Midterm Test score entry portal closes on Friday, 11:59 PM.
                </AppText>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <AppButton
                    label="Grades Portal"
                    onPress={() => setPortalModalOpen(true)}
                  />
                  <AppButton
                    label="Timetable"
                    variant="secondary"
                    onPress={() => router.push('/(staff)/events')}
                  />
                </View>
              </SolidCard>

              {/* Faculty Actions & Quick Desk */}
              <SolidCard radius={20} style={{ padding: spacing.md }}>
                <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.sm }}>
                  Faculty Action Tools
                </AppText>
                <View style={{ gap: spacing.xs }}>
                  <Pressable
                    onPress={() => router.push('/(staff)/announcements')}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.sm, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Ionicons name="megaphone" size={20} color={colors.brandPrimary} />
                      <View>
                        <AppText weight="bold" variant="bodySmall">Broadcast Notice</AppText>
                        <AppText tone="secondary" variant="caption">Send push announcement to students</AppText>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </Pressable>

                  <Pressable
                    onPress={() => router.push('/(staff)/moderation')}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.sm, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Ionicons name="shield-checkmark-outline" size={20} color="#10B981" />
                      <View>
                        <AppText weight="bold" variant="bodySmall">Course Approvals Desk</AppText>
                        <AppText tone="secondary" variant="caption">Verify student forms & waivers</AppText>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </Pressable>

                  <Pressable
                    onPress={() => router.push('/(staff)/events')}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.sm, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Ionicons name="calendar-outline" size={20} color="#0284C7" />
                      <View>
                        <AppText weight="bold" variant="bodySmall">Department Calendar</AppText>
                        <AppText tone="secondary" variant="caption">Exams, test venues & meetings</AppText>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </Pressable>
                </View>
              </SolidCard>
            </View>
          ) : (
            /* Mobile Quick Action Section */
            <>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.md }}>
                <Pressable
                  onPress={() => router.push('/(staff)/announcements')}
                  style={{ flex: 1, backgroundColor: colors.pastelPrimaryBg, padding: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: colors.brandPrimary }}
                >
                  <Ionicons name="megaphone" size={22} color={colors.brandPrimary} style={{ marginBottom: 4 }} />
                  <AppText weight="bold" variant="bodySmall" tone="brand">
                    Post Announcement
                  </AppText>
                  <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                    Broadcast to faculty & students
                  </AppText>
                </Pressable>

                <Pressable
                  onPress={() => router.push('/(staff)/moderation')}
                  style={{ flex: 1, backgroundColor: colors.surface, padding: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}
                >
                  <Ionicons name="shield-checkmark-outline" size={22} color={colors.textPrimary} style={{ marginBottom: 4 }} />
                  <AppText weight="bold" variant="bodySmall">
                    Staff Workdesk
                  </AppText>
                  <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                    Reports & course approvals
                  </AppText>
                </Pressable>
              </View>

              <SolidCard radius={20} style={{ marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="time" size={18} color="#D97706" />
                    <AppText weight="bold" variant="bodySmall">
                      Upcoming Academic Deadlines
                    </AppText>
                  </View>
                  <Badge label="In 3 Days" tone="accent" />
                </View>
                <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.sm }}>
                  CSC 301 Midterm Test score entry portal closes on Friday, 11:59 PM.
                </AppText>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <AppButton
                    label="Open Grades Portal"
                    onPress={() => setPortalModalOpen(true)}
                  />
                  <AppButton
                    label="Lecture Timetable"
                    variant="secondary"
                    onPress={() => router.push('/(staff)/events')}
                  />
                </View>
              </SolidCard>
            </>
          )}
        </View>
      </ScrollView>

      <ManagePortalLinksModal
        visible={portalModalOpen}
        onClose={() => setPortalModalOpen(false)}
      />
    </ScreenContainer>
  );
}
