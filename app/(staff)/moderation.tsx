import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { ModerationQueue } from '@/components/ModerationQueue';
import { ApprovalsModerationTab } from '@/components/admin/ApprovalsModerationTab';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { getMyProfile } from '@/api/profile';
import { haptics } from '@/utils/haptics';

export default function StaffModerationScreen() {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'reports' | 'approvals'>('reports');
  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });

  return (
    <ScreenContainer glow={false}>
      <AppHeader />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.md, marginBottom: spacing.xs }}>
        <AppText variant="h1" weight="bold">
          Staff Workdesk
        </AppText>
        {profile?.institutionCode ? <Badge label={`${profile.institutionCode} Node`} tone="brand" /> : null}
      </View>
      <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
        Faculty moderation covers reports, student matric verifications, and resource catalog approvals.
      </AppText>

      {/* Tab Switcher */}
      <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
        <Pressable
          onPress={() => {
            haptics.light();
            setActiveTab('reports');
          }}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: radius.pill,
            alignItems: 'center',
            backgroundColor: activeTab === 'reports' ? colors.brandPrimary : colors.surface,
            borderWidth: 1,
            borderColor: activeTab === 'reports' ? colors.brandPrimary : colors.border,
          }}
        >
          <AppText weight="bold" variant="bodySmall" tone={activeTab === 'reports' ? 'inverse' : 'secondary'}>
            Reports Queue 🛡️
          </AppText>
        </Pressable>

        <Pressable
          onPress={() => {
            haptics.light();
            setActiveTab('approvals');
          }}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: radius.pill,
            alignItems: 'center',
            backgroundColor: activeTab === 'approvals' ? colors.brandPrimary : colors.surface,
            borderWidth: 1,
            borderColor: activeTab === 'approvals' ? colors.brandPrimary : colors.border,
          }}
        >
          <AppText weight="bold" variant="bodySmall" tone={activeTab === 'approvals' ? 'inverse' : 'secondary'}>
            Verifications & Approvals 📋
          </AppText>
        </Pressable>
      </View>

      {activeTab === 'reports' ? (
        <ModerationQueue institutionCode={profile?.institutionCode} emptyTitle="Your campus queue is clear" />
      ) : (
        <ApprovalsModerationTab />
      )}
    </ScreenContainer>
  );
}
