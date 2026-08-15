import React from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AlumniWorkspaceCard } from '@/components/AlumniWorkspaceCard';
import { ActionCenterRow } from '@/components/ActionCenterRow';
import { SolidCard } from '@/components/SolidCard';
import { AppText } from '@/components/AppText';
import { EventCard } from '@/components/EventCard';
import { PostCard } from '@/components/PostCard';
import { DirectoryCard } from '@/components/DirectoryCard';
import { AuthHeroBackground } from '@/components/AuthHeroBackground';
import { Avatar } from '@/components/Avatar';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useRealtimeChannel } from '@/realtime/useRealtimeChannel';
import { listEvents } from '@/api/events';
import { listFeedPosts } from '@/api/posts';
import { searchAlumniDirectory } from '@/api/connections';
import { listMentorships } from '@/api/mentorship';

export default function AlumniDashboard() {
  const { spacing, radius } = useTheme();
  const { user } = useAuth();
  useRealtimeChannel();

  const { data: events } = useQuery({ queryKey: ['events', 'alumni'], queryFn: () => listEvents({ scope: 'alumni' }) });
  const { data: posts } = useQuery({ queryKey: ['feed', 'alumni'], queryFn: () => listFeedPosts({ scope: 'global' }) });
  const { data: directory } = useQuery({ queryKey: ['directory', 'spotlight'], queryFn: () => searchAlumniDirectory() });
  const { data: mentorships } = useQuery({ queryKey: ['mentorships'], queryFn: listMentorships });

  return (
    <ScreenContainer glow={false}>
      <AppHeader />
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ marginTop: spacing.lg, marginBottom: spacing.lg, borderRadius: radius.glass, overflow: 'hidden' }}>
          <AuthHeroBackground height={128} radius={radius.glass}>
            <View style={{ flex: 1, padding: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
                  <AppText variant="caption" weight="bold" tone="inverse" style={{ letterSpacing: 1, opacity: 0.85 }}>
                    ALUMNI CIRCLE 🎓
                  </AppText>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      backgroundColor: 'rgba(255,255,255,0.2)',
                      borderRadius: radius.pill,
                      paddingHorizontal: 10,
                      paddingVertical: 3,
                    }}
                  >
                    <Ionicons name="checkmark-circle" size={12} color="#FFFFFF" />
                    <AppText variant="caption" weight="bold" tone="inverse">
                      Alumni
                    </AppText>
                  </View>
                </View>
                <AppText variant="h1" weight="bold" tone="inverse" numberOfLines={1}>
                  Welcome, {user?.fullName?.split(' ')[0] ?? 'there'} 👋
                </AppText>
              </View>
              <Avatar name={user?.fullName ?? 'You'} size={64} />
            </View>
          </AuthHeroBackground>
        </View>

        <AlumniWorkspaceCard />

        <View style={{ marginBottom: spacing.lg }}>
          <ActionCenterRow
            actions={[
              { icon: 'people-outline', label: 'Directory', onPress: () => router.push('/(alumni)/directory') },
              { icon: 'school-outline', label: 'Mentorship', onPress: () => router.push('/(alumni)/mentorship') },
              { icon: 'cart-outline', label: 'Marketplace', onPress: () => router.push('/(alumni)/marketplace') },
              { icon: 'briefcase-outline', label: 'Post a job', onPress: () => router.push('/(alumni)/jobs') },
            ]}
          />
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
          <StatTile label="Active connections" value="12" />
          <StatTile label="Events registered" value={String(events?.filter((e) => e.isRsvpd).length ?? 0)} />
          <StatTile
            label="Mentorship matches"
            value={String(mentorships?.filter((m) => m.status === 'active').length ?? 0)}
            onPress={() => router.push('/(alumni)/mentorship')}
          />
        </View>

        <SectionHeader title="Recent campus updates" onSeeAll={() => router.push('/(alumni)/forum')} />
        {posts?.slice(0, 2).map((post) => (
          <PostCard key={post.id} post={post} />
        ))}

        <SectionHeader title="Upcoming alumni events" onSeeAll={() => router.push('/(alumni)/events')} />
        {events?.slice(0, 2).map((event) => (
          <EventCard key={event.id} event={event} />
        ))}

        <SectionHeader title="Networking spotlight" onSeeAll={() => router.push('/(alumni)/alumni-hub')} />
        {directory?.slice(0, 1).map((entry) => (
          <DirectoryCard key={entry.id} entry={entry} />
        ))}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </ScreenContainer>
  );
}

function StatTile({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  const { spacing } = useTheme();
  const content = (
    <SolidCard style={{ flex: 1 }}>
      <AppText variant="h2" weight="bold">
        {value}
      </AppText>
      <AppText tone="secondary" variant="caption" style={{ marginTop: spacing.xs }}>
        {label}
      </AppText>
    </SolidCard>
  );
  return content;
}

function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll: () => void }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.md }}>
      <AppText variant="h3" weight="bold">
        {title}
      </AppText>
      <AppText tone="brand" weight="semiBold" variant="bodySmall" onPress={onSeeAll}>
        See all
      </AppText>
    </View>
  );
}
