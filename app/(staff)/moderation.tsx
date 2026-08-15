import React from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { ModerationQueue } from '@/components/ModerationQueue';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { getMyProfile } from '@/api/profile';

/**
 * Staff moderation is scoped to their own campus only — the actual
 * functional distinction from Admin's cross-university oversight,
 * rather than the two roles sharing an identical, unscoped queue.
 */
export default function StaffModerationScreen() {
  const { spacing } = useTheme();
  const { user } = useAuth();
  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });

  return (
    <ScreenContainer glow={false}>
      <AppHeader />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.lg }}>
        <AppText variant="h1" weight="bold">
          Moderation
        </AppText>
        {profile?.institutionCode ? <Badge label={`${profile.institutionCode} only`} tone="brand" /> : null}
      </View>
      <AppText tone="secondary" style={{ marginBottom: spacing.lg }}>
        Staff moderation covers reports filed on your own campus. Cross-university oversight is
        an Admin-level capability.
      </AppText>
      <ModerationQueue institutionCode={profile?.institutionCode} emptyTitle="Your campus queue is clear" />
    </ScreenContainer>
  );
}
