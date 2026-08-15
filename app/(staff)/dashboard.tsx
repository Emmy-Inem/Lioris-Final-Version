import React from 'react';
import { ScrollView, View, Pressable, Alert } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { SolidCard } from '@/components/SolidCard';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { AnnouncementCard } from '@/components/AnnouncementCard';
import { StaffAdminBoardCard } from '@/components/StaffAdminBoardCard';
import { AuthHeroBackground } from '@/components/AuthHeroBackground';
import { Avatar } from '@/components/Avatar';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { listAnnouncements } from '@/api/announcements';
import { listEvents } from '@/api/events';

export default function StaffDashboard() {
  const { spacing, radius } = useTheme();
  const { user } = useAuth();
  const { data: announcements } = useQuery({ queryKey: ['announcements'], queryFn: listAnnouncements });
  const { data: events } = useQuery({ queryKey: ['events', 'staff'], queryFn: () => listEvents({}) });

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
                    STAFF DESK 🏫
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
                      Staff
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

        <StaffAdminBoardCard
          role="staff"
          onOpenAdminWorkdesk={() => router.push('/(staff)/moderation')}
          onManagePortalLinks={() => Alert.alert('Portal Links', 'Would open portal link management here.')}
        />

        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
          <SolidCard style={{ flex: 1 }}>
            <AppText variant="h2" weight="bold">
              {announcements?.length ?? 0}
            </AppText>
            <AppText tone="secondary" variant="caption" style={{ marginTop: spacing.xs }}>
              Published
            </AppText>
          </SolidCard>
          <Pressable
            style={{ flex: 1 }}
            onPress={() => router.push('/(staff)/events')}
            accessibilityRole="button"
            accessibilityLabel={`${events?.length ?? 0} upcoming events`}
          >
            <SolidCard>
              <AppText variant="h2" weight="bold">
                {events?.length ?? 0}
              </AppText>
              <AppText tone="secondary" variant="caption" style={{ marginTop: spacing.xs }}>
                Upcoming events
              </AppText>
            </SolidCard>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <AppButton label="Publish announcement" onPress={() => router.push('/(staff)/announcements')} />
          <AppButton label="View events" variant="secondary" onPress={() => router.push('/(staff)/events')} />
        </View>

        <AppText variant="h3" weight="bold" style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>
          Recent announcements
        </AppText>
        {announcements?.slice(0, 3).map((a) => (
          <AnnouncementCard key={a.id} announcement={a} />
        ))}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </ScreenContainer>
  );
}
