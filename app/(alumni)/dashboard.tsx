import React from 'react';
import { ScrollView, View, Pressable, Alert } from 'react-native';
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
import { PostCard } from '@/components/PostCard';
import { EventCard } from '@/components/EventCard';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useRealtimeChannel } from '@/realtime/useRealtimeChannel';
import { listEvents } from '@/api/events';
import { listFeedPosts } from '@/api/posts';
import { listMentorships } from '@/api/mentorship';
import { haptics } from '@/utils/haptics';

export default function AlumniDashboard() {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  useRealtimeChannel();

  const { data: events } = useQuery({ queryKey: ['events', 'alumni'], queryFn: () => listEvents({ scope: 'alumni' }) });
  const { data: posts } = useQuery({ queryKey: ['feed', 'alumni'], queryFn: () => listFeedPosts({ scope: 'global' }) });
  const { data: mentorships } = useQuery({ queryKey: ['mentorships'], queryFn: listMentorships });

  const activeMenteesCount = mentorships?.filter((m) => m.status === 'active').length ?? 2;
  const pendingRequestsCount = mentorships?.filter((m) => m.status === 'pending').length ?? 1;

  return (
    <ScreenContainer glow={true}>
      <AppHeader />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        {/* Executive Alumni Banner Header */}
        <View style={{ marginTop: spacing.md, marginBottom: spacing.md, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface }}>
          <View style={{ width: '100%', height: 140, position: 'relative' }}>
            <Image
              source={require('../../assets/images/campus_library_study.jpg')}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            />
            <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(10, 19, 38, 0.72)' }} />

            <View style={{ position: 'absolute', top: 16, left: 16, right: 16, bottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <View style={{ backgroundColor: '#D97706', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill }}>
                    <AppText variant="caption" weight="bold" tone="inverse" style={{ fontSize: 10 }}>
                      ⭐ ALUMNI FELLOW
                    </AppText>
                  </View>
                  <AppText variant="caption" tone="inverse" style={{ opacity: 0.9 }}>
                    Class of '20 &bull; UI Node
                  </AppText>
                </View>
                <AppText variant="h1" weight="bold" tone="inverse" numberOfLines={1} style={{ fontSize: 22 }}>
                  Welcome, {user?.fullName?.split(' ')[0] ?? 'Alumni'} 💼
                </AppText>
                <AppText variant="caption" tone="inverse" style={{ opacity: 0.85, marginTop: 2 }}>
                  Empowering the next generation of campus builders
                </AppText>
              </View>

              <Avatar name={user?.fullName ?? 'Alumni Founder'} size={56} role="alumni" />
            </View>
          </View>
        </View>

        {/* Quick Alumni Action Grid */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
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

        {/* Secondary Executive Actions */}
        <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
          {[
            { icon: 'briefcase-outline' as const, label: 'Post Job', route: '/(alumni)/jobs' },
            { icon: 'people-outline' as const, label: 'Directory', route: '/(alumni)/directory' },
            { icon: 'cart-outline' as const, label: 'Marketplace', route: '/(alumni)/marketplace' },
            { icon: 'calendar-outline' as const, label: 'Reunions', route: '/(alumni)/events' },
          ].map((item) => (
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

        {/* Live Mentee Pulse Card */}
        <SolidCard radius={20} style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="videocam" size={18} color={colors.brandPrimary} />
              <AppText weight="bold" variant="bodySmall">
                Upcoming 1-on-1 Student Calls
              </AppText>
            </View>
            <Badge label="Google Meet" tone="brand" />
          </View>

          <View style={{ backgroundColor: colors.pastelPrimaryBg, padding: spacing.sm, borderRadius: 12, marginBottom: spacing.xs }}>
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
                label="Join 📹"
                onPress={() => Alert.alert('Launching Meeting', 'Opening Google Meet session: https://meet.google.com/lio-csc-demo')}
              />
            </View>
          </View>
        </SolidCard>

        {/* Recent Global Updates */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
          <AppText variant="h3" weight="bold">
            Campus Pulse & Discussions 💬
          </AppText>
          <AppText tone="brand" weight="bold" variant="bodySmall" onPress={() => router.push('/(alumni)/forum')}>
            See all
          </AppText>
        </View>

        {posts?.slice(0, 2).map((post) => (
          <PostCard key={post.id} post={post} />
        ))}

        {/* Upcoming Executive Alumni Events */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.sm }}>
          <AppText variant="h3" weight="bold">
            Executive Masterclasses & Gatherings 🎟️
          </AppText>
          <AppText tone="brand" weight="bold" variant="bodySmall" onPress={() => router.push('/(alumni)/events')}>
            See all
          </AppText>
        </View>

        {events?.slice(0, 2).map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}
