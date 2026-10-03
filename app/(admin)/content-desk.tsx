import React, { useState, useEffect, useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { ForumsModerationTab } from '@/components/admin/ForumsModerationTab';
import { EventsModerationTab } from '@/components/admin/EventsModerationTab';
import { ResourcesModerationTab } from '@/components/admin/ResourcesModerationTab';
import { JobsModerationTab } from '@/components/admin/JobsModerationTab';
import { DonationsModerationTab } from '@/components/admin/DonationsModerationTab';
import { MentorshipModerationTab } from '@/components/admin/MentorshipModerationTab';
import { MarketplaceModerationTab } from '@/components/admin/MarketplaceModerationTab';
import { StudyPodsModerationTab } from '@/components/admin/StudyPodsModerationTab';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useFeatureFlags, FeatureKey } from '@/context/FeatureFlagsContext';
import { haptics } from '@/utils/haptics';

/**
 * Everything members publish, in one place. Each tab is the full management surface for that kind of
 * content (create / edit / approve / pin / delete). Tabs are strictly gated by their respective feature
 * flags so that disabled features (such as Donations, Marketplace, Study Pods) never appear.
 */
interface ContentTabDef {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  featureKey: FeatureKey;
}

const ALL_CONTENT_TABS: ContentTabDef[] = [
  { key: 'threads', label: 'Communities & Spaces', icon: 'chatbubbles-outline', featureKey: 'discussion_workspaces' },
  { key: 'events', label: 'Events', icon: 'calendar-outline', featureKey: 'campus_events' },
  { key: 'resources', label: 'Resources', icon: 'folder-open-outline', featureKey: 'academic_resources' },
  { key: 'jobs', label: 'Jobs', icon: 'briefcase-outline', featureKey: 'career_page' },
  { key: 'marketplace', label: 'Marketplace', icon: 'pricetag-outline', featureKey: 'marketplace' },
  { key: 'studypods', label: 'Study Pods', icon: 'school-outline', featureKey: 'study_groups' },
  { key: 'donations', label: 'Donations', icon: 'heart-outline', featureKey: 'donations' },
  { key: 'mentorship', label: 'Mentorship', icon: 'people-outline', featureKey: 'alumni_mentorship' },
];

export default function ContentDeskScreen() {
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const { isFeatureEnabled } = useFeatureFlags();

  const visibleTabs = useMemo(() => {
    return ALL_CONTENT_TABS.filter((t) => isFeatureEnabled(t.featureKey));
  }, [isFeatureEnabled]);

  const [tab, setTab] = useState<string>('threads');

  // Auto-switch to first available tab if active tab's feature flag is turned off
  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some((t) => t.key === tab)) {
      setTab(visibleTabs[0].key);
    }
  }, [visibleTabs, tab]);

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 150 }}
      >
        <View style={{ paddingTop: isDesktop ? spacing.xs : spacing.md, paddingBottom: spacing.sm }}>
          <AppText variant={isDesktop ? 'h1' : 'h3'} weight="bold">
            Content Moderation Desk
          </AppText>
          <AppText tone="secondary" variant="caption">
            Manage what members publish: communities, events, academic archives and opportunities
          </AppText>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.xs, paddingRight: spacing.md }}
          style={{ marginBottom: spacing.md, flexGrow: 0 }}
          {...({ 'data-horizontal-scroll': 'true' } as any)}
        >
          {visibleTabs.map((t) => {
            const selected = tab === t.key;
            return (
              <Pressable
                key={t.key}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => {
                  haptics.light();
                  setTab(t.key);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 38,
                  paddingHorizontal: 14,
                  borderRadius: radius.pill,
                  backgroundColor: selected ? colors.brandPrimary : colors.surface,
                  borderWidth: 1,
                  borderColor: selected ? colors.brandPrimary : colors.border,
                }}
              >
                <Ionicons name={t.icon as any} size={15} color={selected ? '#FFFFFF' : colors.textSecondary} />
                <AppText variant="bodySmall" weight={selected ? 'bold' : 'semiBold'} tone={selected ? 'inverse' : 'secondary'}>
                  {t.label}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        {tab === 'threads' && isFeatureEnabled('discussion_workspaces') ? <ForumsModerationTab /> : null}
        {tab === 'events' && isFeatureEnabled('campus_events') ? <EventsModerationTab /> : null}
        {tab === 'resources' && isFeatureEnabled('academic_resources') ? <ResourcesModerationTab /> : null}
        {tab === 'jobs' && isFeatureEnabled('career_page') ? <JobsModerationTab /> : null}
        {tab === 'marketplace' && isFeatureEnabled('marketplace') ? <MarketplaceModerationTab /> : null}
        {tab === 'studypods' && isFeatureEnabled('study_groups') ? <StudyPodsModerationTab /> : null}
        {tab === 'donations' && isFeatureEnabled('donations') ? <DonationsModerationTab /> : null}
        {tab === 'mentorship' && isFeatureEnabled('alumni_mentorship') ? <MentorshipModerationTab /> : null}
      </ScrollView>
    </ScreenContainer>
  );
}
