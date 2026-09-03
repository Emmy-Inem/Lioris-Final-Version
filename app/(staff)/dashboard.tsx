import React from 'react';
import { ScrollView, View, Pressable, Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { SolidCard } from '@/components/SolidCard';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { Badge } from '@/components/Badge';
import { Avatar } from '@/components/Avatar';
import { AnnouncementsWidget } from '@/components/AnnouncementsWidget';
import { EventCard } from '@/components/EventCard';
import { EmptyState } from '@/components/EmptyState';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { useCampusScope } from '@/hooks/useCampusScope';
import { listAnnouncements } from '@/api/announcements';
import { listReports } from '@/api/moderation';
import { listEvents } from '@/api/events';
import { listFeedPosts } from '@/api/posts';
import { listResources } from '@/api/resources';
import { getMyProfile } from '@/api/profile';
import { haptics } from '@/utils/haptics';

export default function StaffDashboard() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const { user } = useAuth();
  const { campusCode } = useCampusScope();

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });

  const { data: openReports } = useQuery({
    queryKey: ['reports', 'open'],
    queryFn: () => listReports({ status: 'open' }),
  });

  const { data: pendingResources } = useQuery({
    queryKey: ['resources', 'pending-review'],
    queryFn: () => listResources({ approvalStatus: 'pending' }),
  });

  const { data: events } = useQuery({
    queryKey: ['events', 'staff-dash', campusCode],
    queryFn: () => listEvents({ scope: 'global', campusCode }),
  });

  const { data: studentPosts } = useQuery({
    queryKey: ['posts', 'staff-student-pulse'],
    queryFn: () => listFeedPosts({ scope: 'student' }),
  });

  const fullName = profile?.fullName ?? user?.fullName ?? 'Dr. Faculty Member';
  const openReportsCount = openReports?.length ?? 0;
  const pendingResourcesCount = pendingResources?.length ?? 0;
  const upcomingEvents = (events ?? []).slice(0, 2);

  function handleOpenPortal(url: string) {
    haptics.light();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {});
    }
  }

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: isDesktop ? spacing.lg : spacing.sm,
          paddingBottom: isDesktop ? 60 : 130,
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
            <Image
              source={require('../../assets/images/campus_students_photo.jpg')}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            />
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
                  Faculty Console • {profile?.institutionName ?? 'University of Ibadan'}
                </AppText>
              </View>
            </View>
          </View>

          <View style={{ padding: spacing.lg, backgroundColor: colors.surface }}>
            <View style={{ flexDirection: isDesktop ? 'row' : 'column', justifyContent: 'space-between', alignItems: isDesktop ? 'center' : 'flex-start', gap: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1, minWidth: 0 }}>
                <Avatar name={fullName} size={52} role="staff" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <AppText variant="h2" weight="bold" numberOfLines={1}>
                      Welcome, {fullName}
                    </AppText>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
                  </View>
                  <AppText tone="secondary" variant="bodySmall" numberOfLines={1} style={{ marginTop: 2 }}>
                    {profile?.department || 'Department of Computer Science'} • Faculty Member • {profile?.institutionCode || 'UI Node'}
                  </AppText>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', alignItems: 'center' }}>
                <Badge label="Faculty Staff" tone="brand" />
                <Badge label="Harmattan Term 2026" tone="success" />
              </View>
            </View>
          </View>
        </SolidCard>

        {/* 2. Urgent Safety & Content Moderation Alerts */}
        {openReportsCount > 0 && (
          <Pressable onPress={() => router.push('/(staff)/moderation')}>
            <SolidCard
              radius={16}
              style={{
                padding: 14,
                backgroundColor: isDark ? '#2A1810' : '#FFF7ED',
                borderWidth: 1,
                borderColor: '#F97316',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#EA580C', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="shield-half" size={20} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodySmall" weight="bold" style={{ color: '#EA580C' }}>
                    {openReportsCount} Pending Content Flag{openReportsCount > 1 ? 's' : ''}
                  </AppText>
                  <AppText variant="caption" tone="secondary" numberOfLines={1}>
                    Requires faculty review on the moderation desk
                  </AppText>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#EA580C" />
            </SolidCard>
          </Pressable>
        )}

        {/* 3. Faculty Command Actions Grid */}
        <View>
          <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.sm }}>
            Faculty Command Actions
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Pressable
              onPress={() => router.push('/(staff)/announcements')}
              style={{ flexGrow: 1, flexBasis: 0, minWidth: isDesktop ? 160 : 140 }}
            >
              <SolidCard radius={16} style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.pastelPrimaryBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="megaphone" size={18} color={colors.brandPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodySmall" weight="bold">Broadcast</AppText>
                  <AppText variant="caption" tone="secondary">Post notices</AppText>
                </View>
              </SolidCard>
            </Pressable>

            <Pressable
              onPress={() => router.push('/(staff)/moderation')}
              style={{ flexGrow: 1, flexBasis: 0, minWidth: isDesktop ? 160 : 140 }}
            >
              <SolidCard radius={16} style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: isDark ? '#2E1F1A' : '#FEF2F2', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="shield-checkmark" size={18} color="#EF4444" />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodySmall" weight="bold">Moderation</AppText>
                  <AppText variant="caption" tone="secondary">
                    {openReportsCount > 0 ? `${openReportsCount} flags` : 'Queue clear'}
                  </AppText>
                </View>
              </SolidCard>
            </Pressable>

            <Pressable
              onPress={() => router.push('/(staff)/events-list' as any)}
              style={{ flexGrow: 1, flexBasis: 0, minWidth: isDesktop ? 160 : 140 }}
            >
              <SolidCard radius={16} style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: isDark ? '#1E293B' : '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="calendar" size={18} color="#3B82F6" />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodySmall" weight="bold">Academic Events</AppText>
                  <AppText variant="caption" tone="secondary">Seminars & talks</AppText>
                </View>
              </SolidCard>
            </Pressable>

            <Pressable
              onPress={() => router.push('/(staff)/forum')}
              style={{ flexGrow: 1, flexBasis: 0, minWidth: isDesktop ? 160 : 140 }}
            >
              <SolidCard radius={16} style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: isDark ? '#2E1F30' : '#FDF2F8', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="chatbubbles" size={18} color="#EC4899" />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodySmall" weight="bold">Faculty Forum</AppText>
                  <AppText variant="caption" tone="secondary">Academic feed</AppText>
                </View>
              </SolidCard>
            </Pressable>
          </View>
        </View>

        {/* 4. Official Faculty Broadcasts & Announcements */}
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="megaphone-outline" size={18} color={colors.brandPrimary} />
              <AppText variant="h3" weight="bold">
                Official Campus Bulletins
              </AppText>
            </View>
            <Pressable onPress={() => router.push('/(staff)/announcements')}>
              <AppText tone="brand" variant="bodySmall" weight="bold">
                + New Notice →
              </AppText>
            </Pressable>
          </View>
          <AnnouncementsWidget scope="staff" />
        </View>

        {/* 5. Academic Symposiums & Faculty Events */}
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="calendar-outline" size={18} color="#3B82F6" />
              <AppText variant="h3" weight="bold">
                Academic Symposiums & Events
              </AppText>
            </View>
            <Pressable onPress={() => router.push('/(staff)/events-list' as any)}>
              <AppText tone="brand" variant="bodySmall" weight="bold">
                All Events ({events?.length ?? 0}) →
              </AppText>
            </Pressable>
          </View>

          {upcomingEvents.length === 0 ? (
            <SolidCard radius={18} style={{ padding: spacing.lg, alignItems: 'center' }}>
              <Ionicons name="calendar-outline" size={32} color={colors.textSecondary} style={{ marginBottom: 8 }} />
              <AppText weight="bold" variant="bodySmall">No upcoming faculty seminars</AppText>
              <AppText tone="secondary" variant="caption" style={{ textAlign: 'center', marginTop: 2, marginBottom: spacing.md }}>
                Academic symposiums, faculty meetings, and guest lectures will appear here.
              </AppText>
              <AppButton label="Browse Calendar" variant="secondary" onPress={() => router.push('/(staff)/events-list' as any)} />
            </SolidCard>
          ) : (
            <View style={{ gap: spacing.md }}>
              {upcomingEvents.map((evt: any) => (
                <EventCard key={evt.id} event={evt} />
              ))}
            </View>
          )}
        </View>

        {/* 6. Trending Campus Inquiries & Academic Discussions */}
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="chatbubbles-outline" size={18} color="#EC4899" />
              <AppText variant="h3" weight="bold">
                Student & Faculty Pulse
              </AppText>
            </View>
            <Pressable onPress={() => router.push('/(staff)/forum')}>
              <AppText tone="brand" variant="bodySmall" weight="bold">
                View Forum →
              </AppText>
            </Pressable>
          </View>

          <View style={{ gap: spacing.sm }}>
            {(studentPosts ?? []).slice(0, 3).map((post: any) => (
              <Pressable key={post.id} onPress={() => router.push(`/(staff)/post/${post.id}` as any)}>
                <SolidCard radius={18} style={{ padding: spacing.md }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Avatar name={post.authorName ?? 'Student'} size={28} />
                      <View>
                        <AppText variant="caption" weight="bold">
                          {post.authorName ?? 'Student'}
                        </AppText>
                        <AppText variant="caption" tone="secondary" style={{ fontSize: 10 }}>
                          {post.department ?? 'Computer Science'}
                        </AppText>
                      </View>
                    </View>
                    <Badge label={post.category ?? 'Discussion'} tone="brand" />
                  </View>

                  <AppText variant="bodySmall" weight="semiBold" style={{ marginTop: 4, marginBottom: 2 }}>
                    {post.title}
                  </AppText>
                  <AppText tone="secondary" variant="caption" numberOfLines={2}>
                    {post.content}
                  </AppText>
                </SolidCard>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 7. Official Faculty & Academic Institutional Portals */}
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm }}>
            <Ionicons name="school-outline" size={18} color={colors.brandPrimary} />
            <AppText variant="h3" weight="bold">
              Official Faculty Services
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {[
              { id: 'staff-1', title: 'Academic Senate & Grading Desk', category: 'Senate', url: 'https://portal.ui.edu.ng/staff', icon: 'ribbon-outline' as const },
              { id: 'staff-2', title: 'TETFUND & Research Grants', category: 'Research', url: 'https://tetfund.gov.ng/', icon: 'document-text-outline' as const },
              { id: 'staff-3', title: 'Kenneth Dike e-Library Catalog', category: 'Library', url: 'https://library.ui.edu.ng/', icon: 'book-outline' as const },
              { id: 'staff-4', title: 'Staff Payroll & Bursary Desk', category: 'Finance', url: 'https://bursary.ui.edu.ng/', icon: 'card-outline' as const },
            ].map((portal) => (
              <Pressable
                key={portal.id}
                onPress={() => handleOpenPortal(portal.url)}
                style={{ flexGrow: 1, flexBasis: 0, minWidth: isDesktop ? 220 : 150 }}
              >
                <SolidCard radius={16} style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.pastelPrimaryBg, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={portal.icon} size={18} color={colors.brandPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodySmall" weight="bold" numberOfLines={1}>
                      {portal.title}
                    </AppText>
                    <AppText variant="caption" tone="secondary">
                      {portal.category} • Official
                    </AppText>
                  </View>
                  <Ionicons name="open-outline" size={14} color={colors.textSecondary} />
                </SolidCard>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
