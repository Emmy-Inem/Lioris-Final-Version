import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { OnboardingShell } from '@/components/OnboardingShell';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { useAdvanceOnboarding } from '@/auth/useAdvanceOnboarding';
import { useAuth } from '@/auth/AuthContext';
import { listCommunities } from '@/api/communities';
import { joinCommunity, leaveCommunity, listMyJoinedCommunityIds } from '@/api/forumMemberships';
import { useToast } from '@/context/ToastContext';
import { useTheme } from '@/theme/ThemeProvider';
import { haptics } from '@/utils/haptics';

/** The legacy route name is retained so paused onboarding sessions still resume safely. */
export default function JoinDiscussionSpacesScreen() {
  const { user } = useAuth();
  const { colors, spacing, radius, minTouchTarget } = useTheme();
  const advance = useAdvanceOnboarding('/(auth)/onboarding/select-interests');
  const toast = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [initialIds, setInitialIds] = useState<Set<string>>(new Set());
  const [hasHydratedSelection, setHasHydratedSelection] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const spacesQuery = useQuery({
    queryKey: ['onboarding', 'discussion-spaces', user?.campusCode || 'GLOBAL'],
    queryFn: () => listCommunities(user?.campusCode ?? undefined),
    enabled: !!user,
  });
  const joinedQuery = useQuery({
    queryKey: ['forum-memberships', user?.id],
    queryFn: () => listMyJoinedCommunityIds(user?.id),
    enabled: !!user?.id,
  });
  const spaces = useMemo(
    () => (spacesQuery.data ?? []).filter((space) => space.approvalStatus === 'approved'),
    [spacesQuery.data],
  );

  useEffect(() => {
    if (hasHydratedSelection || !spacesQuery.isSuccess || !joinedQuery.isSuccess) return;
    const joined = new Set(joinedQuery.data ?? []);
    const selected = new Set(
      spaces
        .filter(
          (space) =>
            joined.has(space.id) ||
            joined.has(space.category.toLowerCase()) ||
            joined.has(space.slug.replace(/^c\//, '')),
        )
        .map((space) => space.id),
    );
    setSelectedIds(selected);
    setInitialIds(new Set(selected));
    setHasHydratedSelection(true);
  }, [hasHydratedSelection, joinedQuery.data, joinedQuery.isSuccess, spaces, spacesQuery.isSuccess]);

  function toggle(spaceId: string) {
    haptics.light();
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(spaceId)) next.delete(spaceId);
      else next.add(spaceId);
      return next;
    });
  }

  async function handleContinue() {
    setSubmitting(true);
    try {
      const joins = spaces.filter((space) => selectedIds.has(space.id) && !initialIds.has(space.id));
      const leaves = spaces.filter((space) => !selectedIds.has(space.id) && initialIds.has(space.id));
      await Promise.all([
        ...joins.map((space) => joinCommunity(space.id, user?.id)),
        ...leaves.map((space) => leaveCommunity(space.id, user?.id)),
      ]);
      if (selectedIds.size > 0) {
        toast.success(`You joined ${selectedIds.size} discussion ${selectedIds.size === 1 ? 'space' : 'spaces'}.`);
      }
      await advance();
    } catch {
      toast.warning('Your space choices could not all be saved. You can update them later from the Forum.');
      await advance();
    } finally {
      setSubmitting(false);
    }
  }

  const loading = spacesQuery.isLoading || joinedQuery.isLoading || !hasHydratedSelection;

  return (
    <OnboardingShell
      currentPath="/(auth)/onboarding/select-interests"
      title="Join discussion spaces"
      subtitle="Choose campus spaces where you can ask course questions, find useful updates, and meet students with shared goals."
      footer={
        <AppButton
          label={selectedIds.size > 0 ? `Continue with ${selectedIds.size} selected` : 'Skip for now'}
          onPress={handleContinue}
          loading={submitting}
          disabled={loading}
          fullWidth
        />
      }
    >
      {loading ? (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Loading discussion spaces"
          style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}
        >
          <ActivityIndicator color={colors.brandPrimary} />
          <AppText tone="secondary">Finding spaces for your campus…</AppText>
        </View>
      ) : spaces.length === 0 ? (
        <SolidCard frosted style={{ alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="chatbubbles-outline" size={28} color={colors.brandPrimary} />
          <AppText weight="bold">Spaces are being prepared</AppText>
          <AppText tone="secondary" style={{ textAlign: 'center' }}>
            You can continue now and explore new campus spaces from the Forum later.
          </AppText>
        </SolidCard>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {spaces.map((space) => {
            const selected = selectedIds.has(space.id);
            return (
              <Pressable
                key={space.id}
                onPress={() => toggle(space.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                aria-checked={selected}
                accessibilityLabel={`${space.label}. ${space.description}`}
                style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
              >
                <SolidCard
                  pointerEvents="none"
                  frosted
                  radius={radius.lg}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.md,
                    padding: spacing.md,
                    borderColor: selected ? colors.brandPrimary : colors.border,
                    borderWidth: selected ? 2 : 1,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: `${space.accentColor}18`,
                    }}
                  >
                    <Ionicons name={space.icon} size={23} color={space.accentColor} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <AppText weight="bold">{space.label}</AppText>
                    <AppText variant="bodySmall" tone="secondary" numberOfLines={2}>
                      {space.description}
                    </AppText>
                  </View>
                  <View
                    style={{
                      width: minTouchTarget - 12,
                      height: minTouchTarget - 12,
                      borderRadius: radius.pill,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: selected ? colors.brandPrimary : colors.divider,
                      borderWidth: selected ? 0 : 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Ionicons
                      name={selected ? 'checkmark' : 'add'}
                      size={20}
                      color={selected ? '#FFFFFF' : colors.textSecondary}
                    />
                  </View>
                </SolidCard>
              </Pressable>
            );
          })}
        </View>
      )}
    </OnboardingShell>
  );
}
