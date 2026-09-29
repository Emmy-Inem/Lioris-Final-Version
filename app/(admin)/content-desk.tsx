import React, { useState } from 'react';
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
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { haptics } from '@/utils/haptics';

/**
 * Everything members publish, in one place. Each tab is the full management surface for that kind of
 * content (create / edit / approve / pin / delete), replacing the copies that used to live on the
 * Command Desk, the Overview dashboard and a separate delete-only list.
 */
const TABS = [
  { key: 'threads', label: 'Threads & Communities', icon: 'chatbubbles-outline' as const },
  { key: 'events', label: 'Events', icon: 'calendar-outline' as const },
  { key: 'resources', label: 'Resources', icon: 'folder-open-outline' as const },
  { key: 'jobs', label: 'Jobs', icon: 'briefcase-outline' as const },
  { key: 'donations', label: 'Donations', icon: 'heart-outline' as const },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function ContentDeskScreen() {
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const [tab, setTab] = useState<TabKey>('threads');

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
            Content
          </AppText>
          <AppText tone="secondary" variant="caption">
            Manage what members publish: threads, events and resources
          </AppText>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.xs, paddingRight: spacing.md }}
          style={{ marginBottom: spacing.md, flexGrow: 0 }}
          {...({ 'data-horizontal-scroll': 'true' } as any)}
        >
          {TABS.map((t) => {
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
                <Ionicons name={t.icon} size={15} color={selected ? '#FFFFFF' : colors.textSecondary} />
                <AppText variant="bodySmall" weight={selected ? 'bold' : 'semiBold'} tone={selected ? 'inverse' : 'secondary'}>
                  {t.label}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        {tab === 'threads' ? <ForumsModerationTab /> : null}
        {tab === 'events' ? <EventsModerationTab /> : null}
        {tab === 'resources' ? <ResourcesModerationTab /> : null}
        {tab === 'jobs' ? <JobsModerationTab /> : null}
        {tab === 'donations' ? <DonationsModerationTab /> : null}
      </ScrollView>
    </ScreenContainer>
  );
}

