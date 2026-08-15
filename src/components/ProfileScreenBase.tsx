import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from './ScreenContainer';
import { AppHeader } from './AppHeader';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { SolidCard } from './SolidCard';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { getMyProfile, markVerificationPending } from '@/api/profile';
import { submitVerificationRequest } from '@/api/verification';
import { ApplyForVerificationModal } from './ApplyForVerificationModal';
import { AuthHeroBackground } from './AuthHeroBackground';

const ROLE_STATUS_COPY: Record<string, { title: string; description: string }> = {
  student: {
    title: 'Active Academic Student 🎓',
    description:
      'Engages in study collaboration, peer matchmaking, event attendance, and department past material exchanges.',
  },
  alumni: {
    title: 'Verified Alumni Member 🎓',
    description: 'Mentors current students, shares career opportunities, and gives back to the campus community.',
  },
  staff: {
    title: 'Campus Staff Member 🏫',
    description: 'Manages announcements, moderates campus channels, and coordinates official events.',
  },
  admin: {
    title: 'Platform Administrator 🛡️',
    description: 'Oversees platform-wide moderation, configuration, and university onboarding.',
  },
};

/** Matches the confirmed profile screenshots — no XP/level/streak UI shown here, unlike an earlier assumption from the Kotlin source. */
export function ProfileScreen({ extraRows }: { extraRows?: React.ReactNode }) {
  const { colors, spacing, radius } = useTheme();
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });

  async function handleLogout() {
    await logout();
    router.replace('/(auth)/login');
  }

  async function handleSubmitVerification(payload: {
    institutionClaimed: string;
    documentType: any;
    documentReference: string;
    documentPhotoUri?: string | null;
  }) {
    if (!user || !profile) return;
    await submitVerificationRequest({ userId: user.id, applicantName: profile.fullName, ...payload });
    markVerificationPending(user.id);
    queryClient.invalidateQueries({ queryKey: ['profile', 'me', user.id] });
  }

  if (!profile || !user) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <AppText tone="secondary">Loading profile...</AppText>
        </View>
      </ScreenContainer>
    );
  }

  const statusCopy = ROLE_STATUS_COPY[profile.userType] ?? ROLE_STATUS_COPY.student;

  return (
    <ScreenContainer noPadding glow={false}>
      <View style={{ paddingHorizontal: 16 }}>
        <AppHeader />
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Cover photo with edit affordance */}
        {profile.coverUrl ? (
          <View style={{ height: 160 }}>
            <Image source={{ uri: profile.coverUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
          </View>
        ) : (
          <AuthHeroBackground height={160} />
        )}

        <View style={{ paddingHorizontal: spacing.lg, marginTop: -44 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View>
              <View
                style={{
                  width: 94,
                  height: 94,
                  borderRadius: 47,
                  backgroundColor: colors.background,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Avatar name={profile.fullName} uri={profile.avatarUrl} size={88} />
              </View>
              <View
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: colors.divider,
                  borderWidth: 2,
                  borderColor: colors.background,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="camera" size={13} color={colors.textSecondary} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
              <Pressable
                onPress={() => router.push('./settings' as any)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Open settings"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="settings-outline" size={18} color={colors.textPrimary} />
              </Pressable>
              <AppButton
                label="Edit Profile"
                variant="secondary"
                onPress={() =>
                  Alert.alert(
                    'Not available yet',
                    'Editing your profile fields isn\u2019t built in this preview \u2014 your Academic Bio can already be edited from Settings.',
                  )
                }
              />
            </View>
          </View>

          <AppText variant="h2" weight="bold" style={{ marginTop: spacing.md }}>
            {profile.fullName}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <AppText tone="brand" weight="semiBold" variant="bodySmall">
              @{profile.username}
            </AppText>
            {profile.verificationStatus === 'verified' ? (
              <Ionicons name="checkmark-circle" size={14} color={colors.brandPrimary} />
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm }}>
            <Ionicons name="business-outline" size={14} color={colors.textSecondary} />
            <AppText tone="secondary" variant="bodySmall">
              {profile.institutionName}
            </AppText>
          </View>

          {profile.verificationStatus === 'pending' ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                backgroundColor: colors.pastelPrimaryBg,
                borderRadius: radius.md,
                padding: spacing.md,
                marginTop: spacing.lg,
              }}
            >
              <Ionicons name="time" size={18} color={colors.brandPrimary} />
              <View style={{ flex: 1 }}>
                <AppText weight="bold" tone="brand">
                  Verification Pending
                </AppText>
                <AppText tone="secondary" variant="caption">
                  Your documents are under review. We'll notify you once a decision is made.
                </AppText>
              </View>
            </View>
          ) : profile.verificationStatus === 'none' ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                backgroundColor: `${colors.critical}0F`,
                borderWidth: 1,
                borderColor: `${colors.critical}40`,
                borderRadius: radius.md,
                padding: spacing.md,
                marginTop: spacing.lg,
              }}
            >
              <Ionicons name="shield-outline" size={18} color={colors.critical} />
              <View style={{ flex: 1 }}>
                <AppText weight="bold" style={{ color: colors.critical }}>
                  Not Verified
                </AppText>
                <AppText tone="secondary" variant="caption">
                  Apply with supporting documents to unlock the verified tick on your profile.
                </AppText>
              </View>
              <AppButton label="Apply" variant="accent" onPress={() => setVerificationModalOpen(true)} />
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
            <StatPill value={String(profile.followersCount)} label="Followers" />
            <StatPill value={String(profile.followingCount)} label="Following" />
          </View>

          <SolidCard style={{ marginTop: spacing.lg }}>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <DetailColumn label="Department / Major" value={profile.department ?? 'Not Specified'} />
              <DetailColumn label="Academic Level" value="Not Specified" />
            </View>
            <View style={{ flexDirection: 'row', marginTop: spacing.md, gap: spacing.md }}>
              <DetailColumn label="Est. Graduation" value={profile.graduationYear ? String(profile.graduationYear) : 'Not Specified'} />
              <DetailColumn label="Campus" value={profile.institutionCode ?? 'Not Specified'} icon="location" />
            </View>
          </SolidCard>

          <SolidCard backgroundColor={colors.pastelPrimaryBg} style={{ marginTop: spacing.lg }}>
            <AppText weight="bold" style={{ color: colors.brandPrimary, marginBottom: 4 }}>
              {statusCopy.title}
            </AppText>
            <AppText tone="secondary" variant="bodySmall">
              {statusCopy.description}
            </AppText>
          </SolidCard>

          <AppText variant="caption" weight="bold" tone="secondary" style={{ letterSpacing: 1, marginTop: spacing.lg }}>
            INTERESTS
          </AppText>
          <AppText variant="bodySmall" style={{ marginTop: 4, marginBottom: spacing.lg }}>
            {profile.interests && profile.interests.length > 0 ? profile.interests.join(', ') : 'Not Specified'}
          </AppText>

          <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
            <GridStatCard icon="document-text-outline" label="Posts" value={profile.postsCount} />
            <GridStatCard icon="book-outline" label="Resources" value={profile.resourcesCount} />
            <GridStatCard icon="calendar-outline" label="Events" value={profile.eventsCount} />
          </View>

          {profile.postsCount === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
              <Ionicons name="document-text-outline" size={32} color={colors.textSecondary} style={{ marginBottom: spacing.sm }} />
              <AppText weight="bold">No published posts yet</AppText>
              <AppText tone="secondary">When you share a post, it will appear here.</AppText>
            </View>
          ) : null}

          {extraRows}

          <AppButton label="Sign out" variant="secondary" onPress={handleLogout} fullWidth />
          <View style={{ height: spacing.xxl }} />
        </View>
      </ScrollView>
      <ApplyForVerificationModal
        visible={verificationModalOpen}
        onClose={() => setVerificationModalOpen(false)}
        onSubmit={handleSubmitVerification}
      />
    </ScreenContainer>
  );
}

function StatPill({ value, label }: { value: string; label: string }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 4,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.pill,
        paddingVertical: spacing.sm,
      }}
    >
      <AppText weight="bold" variant="bodySmall">
        {value}
      </AppText>
      <AppText tone="secondary" variant="bodySmall">
        {label}
      </AppText>
    </View>
  );
}

function DetailColumn({ label, value, icon }: { label: string; value: string; icon?: keyof typeof Ionicons.glyphMap }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <AppText variant="caption" weight="bold" tone="secondary" style={{ letterSpacing: 1 }}>
        {label.toUpperCase()}
      </AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
        {icon ? <Ionicons name={icon} size={12} color={colors.textSecondary} /> : null}
        <AppText variant="bodySmall" weight="semiBold">
          {value}
        </AppText>
      </View>
    </View>
  );
}

function GridStatCard({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number }) {
  const { colors, spacing } = useTheme();
  return (
    <SolidCard style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.sm }}>
        <Ionicons name={icon} size={14} color={colors.textSecondary} />
        <AppText tone="secondary" variant="caption">
          {label}
        </AppText>
      </View>
      <AppText variant="h2" weight="bold">
        {value}
      </AppText>
    </SolidCard>
  );
}
