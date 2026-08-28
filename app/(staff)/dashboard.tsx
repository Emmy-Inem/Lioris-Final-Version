import React from 'react';
import { ScrollView, View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { SolidCard } from '@/components/SolidCard';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Avatar } from '@/components/Avatar';
import { AnnouncementsWidget } from '@/components/AnnouncementsWidget';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { listAnnouncements } from '@/api/announcements';

export default function StaffDashboard() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const { user } = useAuth();
  const { data: announcements } = useQuery({ queryKey: ['announcements'], queryFn: listAnnouncements });

  const fullName = user?.fullName ?? 'Dr. Adeyemi Alabi';

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          maxWidth: 1120,
          alignSelf: 'center',
          width: '100%',
          paddingHorizontal: isDesktop ? spacing.lg : spacing.md,
          paddingTop: isDesktop ? spacing.lg : spacing.sm,
          paddingBottom: 80,
          gap: spacing.lg,
        }}
      >
        {/* 1. Hero Faculty Card */}
        <SolidCard
          radius={22}
          style={{
            overflow: 'hidden',
            padding: 0,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={{ height: isDesktop ? 160 : 120, position: 'relative', width: '100%' }}>
            <Image source={require('../../assets/images/campus_students_photo.jpg')} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: isDark ? 'rgba(10, 19, 38, 0.75)' : 'rgba(15, 23, 42, 0.65)',
              }}
            />

            <View style={{ position: 'absolute', top: 14, left: 16 }}>
              <View
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.65)',
                  borderRadius: radius.pill,
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Ionicons name="school" size={14} color="#68D391" />
                <AppText variant="caption" weight="bold" tone="inverse">
                  Faculty of Science • University of Ibadan
                </AppText>
              </View>
            </View>
          </View>

          <View style={{ padding: spacing.lg, backgroundColor: colors.surface }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <Avatar name={fullName} size={52} role="staff" />
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <AppText variant="h2" weight="bold">
                      Welcome, {fullName}
                    </AppText>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
                  </View>
                  <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 2 }}>
                    Department of Computer Science & AI • Faculty Coordinator • Harmattan Term 2026
                  </AppText>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                <Badge label="Faculty Staff" tone="brand" />
                <Badge label="Active Coordinator" tone="success" />
              </View>
            </View>
          </View>
        </SolidCard>

        {/* 2. Official Faculty Broadcasts */}
        <AnnouncementsWidget scope="staff" />

        {/* 3. 3-KPI Executive Metrics Grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <View style={{ flex: 1, minWidth: isDesktop ? 240 : '47%' }}>
            <SolidCard radius={18} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <AppText variant="caption" tone="secondary" weight="bold">
                  ASSIGNED COURSES
                </AppText>
                <Ionicons name="book-outline" size={16} color={colors.brandPrimary} />
              </View>
              <AppText variant="h2" weight="bold" tone="brand">
                3 Active Units
              </AppText>
              <AppText variant="caption" style={{ color: '#10B981', fontWeight: '600', marginTop: 2 }}>
                CSC 301, CSC 411, MEE 305
              </AppText>
            </SolidCard>
          </View>

          <View style={{ flex: 1, minWidth: isDesktop ? 240 : '47%' }}>
            <SolidCard radius={18} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <AppText variant="caption" tone="secondary" weight="bold">
                  ENROLLED STUDENTS
                </AppText>
                <Ionicons name="people-outline" size={16} color="#0284C7" />
              </View>
              <AppText variant="h2" weight="bold" tone="brand">
                342 Students
              </AppText>
              <AppText variant="caption" style={{ color: '#10B981', fontWeight: '600', marginTop: 2 }}>
                ✓ 98% Attendance Recorded
              </AppText>
            </SolidCard>
          </View>

          <View style={{ flex: 1, minWidth: isDesktop ? 240 : '47%' }}>
            <SolidCard radius={18} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <AppText variant="caption" tone="secondary" weight="bold">
                  GRADING PROGRESS
                </AppText>
                <Ionicons name="checkmark-done-circle-outline" size={16} color="#10B981" />
              </View>
              <AppText variant="h2" weight="bold" tone="brand">
                18 Submissions
              </AppText>
              <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
                Midterm Assignment 2
              </AppText>
            </SolidCard>
          </View>
        </View>

        {/* 4. Active Course Desk */}
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <AppText variant="h3" weight="bold">
              Course Management Desk
            </AppText>
            <Pressable onPress={() => router.push('/(staff)/announcements')}>
              <AppText tone="brand" variant="bodySmall" weight="bold">
                Broadcast Notice →
              </AppText>
            </Pressable>
          </View>

          <View style={{ gap: spacing.sm }}>
            {[
              { code: 'CSC 301', title: 'Data Structures & Algorithms II', students: 140, time: 'Mon, Wed 10:00 AM', venue: 'LT 2' },
              { code: 'CSC 411', title: 'Artificial Intelligence & Neural Systems', students: 96, time: 'Tue, Thu 02:00 PM', venue: 'AI Lab' },
              { code: 'MEE 305', title: 'Computational Engineering Mathematics', students: 106, time: 'Fri 08:00 AM', venue: 'Engineering Hall' },
            ].map((course) => (
              <SolidCard key={course.code} radius={18} style={{ padding: spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Badge label={course.code} tone="brand" />
                      <AppText variant="bodySmall" weight="bold">
                        {course.title}
                      </AppText>
                    </View>
                    <AppText tone="secondary" variant="caption">
                      {course.students} Students Enrolled • {course.time} • Venue: {course.venue}
                    </AppText>
                  </View>
                </View>
              </SolidCard>
            ))}
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
