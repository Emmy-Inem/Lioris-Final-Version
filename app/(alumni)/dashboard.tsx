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
import { listFeedPosts } from '@/api/posts';
import { getMyProfile } from '@/api/profile';
import { useMockDataVisible } from '@/api/mockDataSettings';

export default function AlumniDashboard() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const { user } = useAuth();
  const { data: posts } = useQuery({ queryKey: ['feed', 'alumni-dash'], queryFn: () => listFeedPosts({ scope: 'global' }) });
  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });
  // The 3-KPI network/engagement grid below has no real membership-registry
  // backend behind it - it was hardcoded placeholder content shown to every
  // alumni account. Gate it the same way the rest of the app now gates
  // fixture data, via the Mock Data Visibility toggle.
  const mockDataVisible = useMockDataVisible();

  const fullName = profile?.fullName ?? user?.fullName ?? 'Adeola Adeleke';
  const subtitleParts = [
    profile?.graduationYear ? `Class of '${String(profile.graduationYear).slice(-2)}` : null,
    profile?.department,
    'Verified Alumni Fellow',
  ].filter(Boolean);

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: isDesktop ? 0 : spacing.md,
          paddingTop: isDesktop ? spacing.lg : spacing.sm,
          paddingBottom: 80,
          gap: spacing.lg,
        }}
      >
        {/* 1. Hero Alumni Card */}
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
            <Image source={require('../../assets/images/campus_library_study.jpg')} style={{ width: '100%', height: '100%' }} contentFit="cover" />
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
                <Ionicons name="school" size={14} color="#FCD34D" />
                <AppText variant="caption" weight="bold" tone="inverse">
                  Alumni Fellowship • University of Ibadan Chapter
                </AppText>
              </View>
            </View>
          </View>

          <View style={{ padding: spacing.lg, backgroundColor: colors.surface }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <Avatar name={fullName} size={52} role="alumni" />
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <AppText variant="h2" weight="bold">
                      Welcome, {fullName}
                    </AppText>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
                  </View>
                  <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 2 }}>
                    {subtitleParts.length > 0 ? subtitleParts.join(' • ') : 'Verified Alumni Fellow'}
                  </AppText>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                <Badge label="Alumni Fellow" tone="brand" />
                {profile?.graduationYear ? (
                  <Badge label={`Class of '${String(profile.graduationYear).slice(-2)}`} tone="success" />
                ) : null}
              </View>
            </View>
          </View>
        </SolidCard>

        {/* 2. Official Campus Announcements */}
        <AnnouncementsWidget scope="alumni" />

        {/* 3. 3-KPI Executive Metrics Grid */}
        {mockDataVisible && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <View style={{ flex: 1, width: isDesktop ? undefined : 'calc(50% - 6px)' as any, minWidth: isDesktop ? 240 : undefined }}>
            <SolidCard radius={18} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <AppText variant="caption" tone="secondary" weight="bold">
                  ALUMNI NETWORK
                </AppText>
                <Ionicons name="people-outline" size={16} color={colors.brandPrimary} />
              </View>
              <AppText variant="h2" weight="bold" tone="brand">
                2,450+ Verified
              </AppText>
              <AppText variant="caption" style={{ color: '#10B981', fontWeight: '600', marginTop: 2 }}>
                ✓ Global Chapter Active
              </AppText>
            </SolidCard>
          </View>

          <View style={{ flex: 1, width: isDesktop ? undefined : 'calc(50% - 6px)' as any, minWidth: isDesktop ? 240 : undefined }}>
            <SolidCard radius={18} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <AppText variant="caption" tone="secondary" weight="bold">
                  CHAPTER ENGAGEMENT
                </AppText>
                <Ionicons name="ribbon-outline" size={16} color="#0284C7" />
              </View>
              <AppText variant="h2" weight="bold" tone="brand">
                Good Standing
              </AppText>
              <AppText variant="caption" style={{ color: '#10B981', fontWeight: '600', marginTop: 2 }}>
                ✓ Verified Alum
              </AppText>
            </SolidCard>
          </View>

          <View style={{ flex: 1, width: isDesktop ? undefined : 'calc(50% - 6px)' as any, minWidth: isDesktop ? 240 : undefined }}>
            <SolidCard radius={18} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <AppText variant="caption" tone="secondary" weight="bold">
                  UPCOMING REUNIONS
                </AppText>
                <Ionicons name="calendar-outline" size={16} color="#16A34A" />
              </View>
              <AppText variant="h2" weight="bold" tone="brand">
                2 Events
              </AppText>
              <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
                Annual Homecoming & Gala
              </AppText>
            </SolidCard>
          </View>
        </View>
        )}

        {/* 4. Live Campus & Alumni Pulse Feed */}
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <AppText variant="h3" weight="bold">
              Campus Pulse & Discussions
            </AppText>
            <Pressable onPress={() => router.push('/(alumni)/forum')}>
              <AppText tone="brand" variant="bodySmall" weight="bold">
                View Global Forum →
              </AppText>
            </Pressable>
          </View>

          <View style={{ gap: spacing.sm }}>
            {(posts ?? []).slice(0, 3).map((post: any) => (
              <Pressable
                key={post.id}
                onPress={() => router.push(`/(alumni)/post/${post.id}` as any)}
              >
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

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="heart-outline" size={14} color={colors.textSecondary} />
                      <AppText variant="caption" tone="secondary">
                        {post.upvotesCount ?? 0}
                      </AppText>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="chatbubble-outline" size={14} color={colors.textSecondary} />
                      <AppText variant="caption" tone="secondary">
                        {post.commentsCount ?? 0} replies
                      </AppText>
                    </View>
                  </View>
                </SolidCard>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
