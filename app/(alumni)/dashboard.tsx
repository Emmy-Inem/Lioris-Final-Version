import React from'react';
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
import { PostCard } from'@/components/PostCard';
import { EventCard } from'@/components/EventCard';
import { AnnouncementsWidget } from'@/components/AnnouncementsWidget';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { useRealtimeChannel } from '@/realtime/useRealtimeChannel';
import { listEvents } from '@/api/events';
import { listFeedPosts } from '@/api/posts';
import { listMentorships } from '@/api/mentorship';
import { haptics } from '@/utils/haptics';

export default function AlumniDashboard() {
 const { colors, spacing, radius } = useTheme();
 const { isDesktop } = useResponsive();
 const { user } = useAuth();
 useRealtimeChannel();

 const { data: events } = useQuery({ queryKey: ['events', 'alumni'], queryFn: () => listEvents({ scope: 'alumni' }) });
 const { data: posts } = useQuery({ queryKey: ['feed', 'alumni'], queryFn: () => listFeedPosts({ scope: 'global' }) });
 const { data: mentorships } = useQuery({ queryKey: ['mentorships'], queryFn: listMentorships });

 const activeMenteesCount = mentorships?.filter((m) => m.status === 'active').length ?? 2;
 const pendingRequestsCount = mentorships?.filter((m) => m.status === 'pending').length ?? 1;

 const { isFeatureEnabled } = useFeatureFlags();

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
                <AppText variant="caption" tone="secondary" weight="semiBold" style={{ textTransform: 'uppercase', fontSize: 10 }}>Alumni Network</AppText>
                <AppText variant="body" weight="bold">2,450+ Verified</AppText>
                <AppText variant="caption" tone="brand" weight="semiBold" style={{ fontSize: 10 }}>Global Chapter Active</AppText>
              </View>
            </SolidCard>

            <SolidCard radius={16} style={{ flex: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="people-outline" size={22} color="#0284C7" />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="caption" tone="secondary" weight="semiBold" style={{ textTransform: 'uppercase', fontSize: 10 }}>Mentorship Impact</AppText>
                <AppText variant="body" weight="bold">{activeMenteesCount} Mentees Active</AppText>
                <AppText variant="caption" tone="secondary" style={{ fontSize: 10 }}>{pendingRequestsCount} Pending Inquiries</AppText>
              </View>
            </SolidCard>

            <SolidCard radius={16} style={{ flex: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="trophy-outline" size={22} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="caption" tone="secondary" weight="semiBold" style={{ textTransform: 'uppercase', fontSize: 10 }}>Endowment Grants</AppText>
                <AppText variant="body" weight="bold">₦1.8M Contributed</AppText>
                <AppText variant="caption" tone="secondary" style={{ fontSize: 10 }}>12 Student Scholarships</AppText>
              </View>
            </SolidCard>

            <SolidCard radius={16} style={{ flex: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="calendar-outline" size={22} color="#16A34A" />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="caption" tone="secondary" weight="semiBold" style={{ textTransform: 'uppercase', fontSize: 10 }}>Upcoming Reunions</AppText>
                <AppText variant="body" weight="bold">2 Events This Month</AppText>
                <AppText variant="caption" tone="secondary" style={{ fontSize: 10 }}>Annual Alumni Gala</AppText>
              </View>
            </SolidCard>
          </View>
        )}

        <View style={isDesktop ? { flexDirection: 'row', gap: 24, alignItems: 'flex-start' } : undefined}>
          {/* Main Left/Center Column */}
          <View style={isDesktop ? { flex: 1 } : undefined}>
            {/* Executive Alumni Banner Header */}
            <View style={{ marginBottom: spacing.md, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface }}>
              <View style={{ width: '100%', height: isDesktop ? 160 : 140, position: 'relative' }}>
                <Image
                  source={require('../../assets/images/campus_library_study.jpg')}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
                <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(10, 19, 38, 0.72)' }} />

                <View style={{ position: 'absolute', top: 16, left: 16, right: 16, bottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <AppText variant="caption" weight="bold" tone="inverse" style={{ fontSize: 11, letterSpacing: 0.5, color: '#FCD34D' }}>
                        ALUMNI FELLOW
                      </AppText>
                      <AppText variant="caption" tone="inverse" style={{ opacity: 0.9 }}>
                        • Class of '20 (UI Node)
                      </AppText>
                    </View>
                    <AppText variant="h1" weight="bold" tone="inverse" numberOfLines={1} style={{ fontSize: 22 }}>
                      Welcome, {user?.fullName?.split(' ')[0] ?? 'Alumni'}
                    </AppText>
                    <AppText variant="caption" tone="inverse" style={{ opacity: 0.85, marginTop: 2 }}>
                      Empowering the next generation of campus builders
                    </AppText>
                  </View>

                  <Avatar name={user?.fullName ?? 'Alumni Founder'} size={56} role="alumni" />
                </View>
              </View>
            </View>

            {/* Official Campus Announcements & Broadcasts */}
            <AnnouncementsWidget scope="alumni" />

            {/* Recent Global Updates */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm, marginTop: spacing.sm }}>
              <AppText variant="h3" weight="bold">
                Campus Pulse & Discussions
              </AppText>
              <AppText tone="brand" weight="bold" variant="bodySmall" onPress={() => router.push('/(alumni)/forum')}>
                See all →
              </AppText>
            </View>

            {posts?.slice(0, 2).map((post) => (
              <PostCard key={post.id} post={post} />
            ))}

            {/* Upcoming Executive Alumni Events */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.sm }}>
              <AppText variant="h3" weight="bold">
                Executive Masterclasses & Gatherings
              </AppText>
              <AppText tone="brand" weight="bold" variant="bodySmall" onPress={() => router.push('/(alumni)/events')}>
                See all →
              </AppText>
            </View>

            {events?.slice(0, 2).map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </View>

          {/* Right Sticky Column on Desktop */}
          {isDesktop ? (
            <View style={{ width: 360, gap: spacing.md }}>
              {/* Live Mentee Pulse Card */}
              {isFeatureEnabled('alumni_mentorship') && (
                <SolidCard radius={20} style={{ padding: spacing.md }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="videocam" size={18} color={colors.brandPrimary} />
                      <AppText weight="bold" variant="bodySmall">
                        Upcoming 1-on-1 Student Calls
                      </AppText>
                    </View>
                    <Badge label="Google Meet" tone="brand" />
                  </View>

                  <View style={{ backgroundColor: colors.pastelPrimaryBg, padding: spacing.sm, borderRadius: 12, marginBottom: spacing.sm }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                        <Avatar name="Diana Prince" size={32} role="student" />
                        <View>
                          <AppText weight="bold" variant="bodySmall">
                            Diana Prince (300L CS)
                          </AppText>
                          <AppText tone="secondary" variant="caption">
                            Topic: Mobile Architecture & Resume Review
                          </AppText>
                        </View>
                      </View>
                      <AppButton
                        label="Join"
                        onPress={() => Alert.alert('Launching Meeting', 'Opening Google Meet session: https://meet.google.com/lio-csc-demo')}
                      />
                    </View>
                  </View>

                  <AppButton
                    label="Open Mentorship Desk →"
                    variant="secondary"
                    onPress={() => router.push('/(alumni)/mentorship')}
                    fullWidth
                  />
                </SolidCard>
              )}

              {/* Quick Alumni Actions Grid */}
              <SolidCard radius={20} style={{ padding: spacing.md }}>
                <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.sm }}>
                  Alumni Portals & Actions
                </AppText>
                <View style={{ gap: spacing.xs }}>
                  <Pressable
                    onPress={() => router.push('/(alumni)/alumni-hub')}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.sm, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Ionicons name="trophy-outline" size={20} color="#D97706" />
                      <View>
                        <AppText weight="bold" variant="bodySmall">Legacy & Giving</AppText>
                        <AppText tone="secondary" variant="caption">Active student grants & scholarships</AppText>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </Pressable>

                  <Pressable
                    onPress={() => router.push('/(alumni)/directory')}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.sm, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Ionicons name="people-outline" size={20} color={colors.brandPrimary} />
                      <View>
                        <AppText weight="bold" variant="bodySmall">Alumni Directory</AppText>
                        <AppText tone="secondary" variant="caption">Search alumni across classes & industries</AppText>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </Pressable>

                  <Pressable
                    onPress={() => router.push('/(alumni)/jobs')}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.sm, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Ionicons name="briefcase-outline" size={20} color="#0284C7" />
                      <View>
                        <AppText weight="bold" variant="bodySmall">Post / Find Opportunities</AppText>
                        <AppText tone="secondary" variant="caption">Hire top campus interns & graduates</AppText>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </Pressable>

                  <Pressable
                    onPress={() => router.push('/(alumni)/marketplace')}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.sm, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Ionicons name="cart-outline" size={20} color="#16A34A" />
                      <View>
                        <AppText weight="bold" variant="bodySmall">Marketplace & Gear</AppText>
                        <AppText tone="secondary" variant="caption">Campus merchandise and verified books</AppText>
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
                {isFeatureEnabled('alumni_mentorship') && (
                  <Pressable
                    onPress={() => router.push('/(alumni)/mentorship')}
                    style={{ flex: 1, backgroundColor: colors.pastelPrimaryBg, padding: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: colors.brandPrimary }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Ionicons name="school" size={22} color={colors.brandPrimary} />
                      {pendingRequestsCount > 0 && (
                        <View style={{ backgroundColor: colors.critical, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill }}>
                          <AppText variant="caption" weight="bold" tone="inverse" style={{ fontSize: 10 }}>
                            {pendingRequestsCount} new
                          </AppText>
                        </View>
                      )}
                    </View>
                    <AppText weight="bold" variant="bodySmall" tone="brand">
                      Mentorship Hub
                    </AppText>
                    <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                      {activeMenteesCount} active students
                    </AppText>
                  </Pressable>
                )}

                <Pressable
                  onPress={() => router.push('/(alumni)/alumni-hub')}
                  style={{ flex: 1, backgroundColor: colors.surface, padding: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Ionicons name="trophy-outline" size={22} color="#D97706" />
                    <Badge label="Endowment" tone="accent" />
                  </View>
                  <AppText weight="bold" variant="bodySmall">
                    Legacy & Giving
                  </AppText>
                  <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                    Active student grants
                  </AppText>
                </Pressable>
              </View>

              <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
                {[
                  { key: 'career_page', icon: 'briefcase-outline' as const, label: 'Post Job', route: '/(alumni)/jobs' },
                  { key: 'directory', icon: 'people-outline' as const, label: 'Directory', route: '/(alumni)/directory' },
                  { key: 'marketplace', icon: 'cart-outline' as const, label: 'Marketplace', route: '/(alumni)/marketplace' },
                  { key: 'campus_events', icon: 'calendar-outline' as const, label: 'Reunions', route: '/(alumni)/events' },
                ]
                  .filter((item) => item.key === 'directory' || isFeatureEnabled(item.key as any))
                  .map((item) => (
                    <Pressable
                      key={item.label}
                      onPress={() => router.push(item.route as any)}
                      style={{
                        flex: 1,
                        backgroundColor: colors.surface,
                        paddingVertical: 10,
                        borderRadius: 12,
                        alignItems: 'center',
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <Ionicons name={item.icon} size={18} color={colors.textPrimary} style={{ marginBottom: 2 }} />
                      <AppText variant="caption" weight="bold" style={{ fontSize: 11 }}>
                        {item.label}
                      </AppText>
                    </Pressable>
                  ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
