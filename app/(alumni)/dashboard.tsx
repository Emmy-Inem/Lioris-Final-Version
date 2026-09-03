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
import { EmptyState } from '@/components/EmptyState';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { listFeedPosts } from '@/api/posts';
import { getMyProfile } from '@/api/profile';

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
          paddingTop: isDesktop ? spacing.lg : spacing.sm,
          paddingBottom: isDesktop ? 60 : 130,
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 1, minWidth: 0 }}>
                <Avatar name={fullName} size={52} role="alumni" />
                <View style={{ flexShrink: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <AppText variant="h2" weight="bold" style={{ flexShrink: 1 }}>
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
            {(posts ?? []).length === 0 ? (
              <SolidCard radius={18} style={{ padding: 0 }}>
                <EmptyState
                  icon="chatbubbles-outline"
                  title="No discussions yet"
                  description="Be the first to start a conversation on the global forum."
                  actionLabel="Open Forum"
                  onAction={() => router.push('/(alumni)/forum')}
                />
              </SolidCard>
            ) : null}
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
