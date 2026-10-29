import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { router, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenContainer } from './ScreenContainer';
import { AppHeader } from './AppHeader';
import { AppText } from './AppText';
import { SolidCard } from './SolidCard';
import { EmptyState } from './EmptyState';
import { ErrorStateView } from './ErrorStateView';
import { queryErrorMode } from '@/utils/queryError';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { getFeedRoute } from '@/utils/notificationRouter';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/context/ToastContext';
import { listSavedItems, toggleSavedItem, SAVED_ITEMS_KEY, SavedKind, SavedItem } from '@/api/bookmarks';

type FilterKey = 'all' | SavedKind;

const FILTERS: { key: FilterKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all', label: 'All', icon: 'bookmark' },
  { key: 'post', label: 'Posts', icon: 'chatbubbles-outline' },
  { key: 'resource', label: 'Resources', icon: 'folder-open-outline' },
  { key: 'event', label: 'Events', icon: 'calendar-outline' },
  { key: 'job', label: 'Jobs', icon: 'briefcase-outline' },
  { key: 'marketplace', label: 'Marketplace', icon: 'pricetag-outline' },
];

const KIND_ICON: Record<SavedKind, keyof typeof Ionicons.glyphMap> = {
  post: 'chatbubbles-outline',
  resource: 'folder-open-outline',
  event: 'calendar-outline',
  job: 'briefcase-outline',
  marketplace: 'pricetag-outline',
};

const KIND_LABEL: Record<SavedKind, string> = {
  post: 'Thread',
  resource: 'Resource',
  event: 'Event',
  job: 'Opportunity',
  marketplace: 'Marketplace',
};

function savedAtLabel(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'Saved just now';
  if (mins < 60) return `Saved ${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Saved ${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `Saved ${days} day${days === 1 ? '' : 's'} ago`;
  return `Saved on ${new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

export function SavedItemsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const { isDesktop } = useResponsive();
  const toast = useToast();
  const queryClient = useQueryClient();
  const segments = useSegments();
  const roleGroup = segments[0] || '(student)';

  const [filter, setFilter] = useState<FilterKey>('all');

  const { data: items, isLoading, isError, error, refetch } = useQuery({
    queryKey: SAVED_ITEMS_KEY(),
    queryFn: () => listSavedItems(),
  });

  const unsave = useMutation({
    mutationFn: (item: SavedItem) => toggleSavedItem(item.kind, item.itemId, false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SAVED_ITEMS_KEY() });
      toast.success('Removed from your saved items.');
    },
    onError: (err: any) => toast.error(err?.message || 'Could not remove that saved item.'),
  });

  const visible = (items ?? []).filter((i) => filter === 'all' || i.kind === filter);
  // A failed load is an error state (or a notice above the cached list), never "Nothing saved yet".
  const errorMode = queryErrorMode({ isError, data: items });

  function openItem(item: SavedItem) {
    switch (item.kind) {
      case 'post':
        router.push(`/${roleGroup}/post/${item.itemId}` as any);
        break;
      case 'event':
        router.push(`/${roleGroup}/events/${item.itemId}` as any);
        break;
      case 'resource':
        if (roleGroup === '(admin)') {
          router.push({ pathname: '/(admin)/content-desk', params: { tab: 'resources' } } as any);
        } else if (roleGroup === '(student)') {
          router.push({ pathname: '/(student)/resources', params: { resourceId: item.itemId } } as any);
        } else {
          // Only the student portal has a resource library; the other portals have no such screen to open.
          Alert.alert('Not Available', 'The resource library is available to students.');
        }
        break;
      case 'job':
        if (roleGroup === '(admin)') {
          router.push({ pathname: '/(admin)/content-desk', params: { tab: 'jobs' } } as any);
        } else if (roleGroup === '(alumni)') {
          router.push('/(alumni)/jobs' as any);
        } else {
          Alert.alert('Not Available', 'The career board is available to alumni.');
        }
        break;
      case 'marketplace':
        if (roleGroup === '(admin)') {
          router.push({ pathname: '/(admin)/content-desk', params: { tab: 'marketplace' } } as any);
        } else if (roleGroup === '(student)') {
          router.push('/(student)/marketplace' as any);
        } else {
          Alert.alert('Student Marketplace', 'The campus marketplace is exclusive to enrolled students.');
        }
        break;
    }
  }

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: isDesktop ? spacing.xs : 0, marginBottom: spacing.sm }}>
        {!isDesktop && (
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 }}
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant={isDesktop ? 'h1' : 'h2'} weight="bold" style={{ flexShrink: 1 }}>
            Saved
          </AppText>
          <AppText tone="secondary" variant="bodySmall" style={{ flexShrink: 1, marginTop: 2 }}>
            Everything you bookmarked across threads, resources, events and opportunities.
          </AppText>
        </View>
      </View>

      {/* Kind filter - horizontally scrollable so long labels never get clipped */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.xs, paddingVertical: 4, paddingRight: spacing.lg }}
        style={{ flexGrow: 0, marginBottom: spacing.sm }}
      >
        {FILTERS.map((f) => {
          const selected = filter === f.key;
          const count = f.key === 'all' ? (items ?? []).length : (items ?? []).filter((i) => i.kind === f.key).length;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              aria-pressed={selected}
              accessibilityLabel={`${f.label}, ${count} saved`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                minHeight: 44,
                paddingHorizontal: spacing.md,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: selected ? colors.brandPrimary : colors.border,
                backgroundColor: selected ? colors.brandPrimary : colors.surface,
              }}
            >
              <Ionicons name={f.icon} size={15} color={selected ? '#FFFFFF' : colors.textSecondary} />
              <AppText variant="bodySmall" weight="bold" tone={selected ? 'inverse' : 'secondary'}>
                {f.label}
              </AppText>
              {count > 0 ? (
                <AppText variant="caption" weight="bold" tone={selected ? 'inverse' : 'secondary'}>
                  {count}
                </AppText>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: isDesktop ? 40 : 130, gap: spacing.sm }}
      >
        {isLoading ? (
          <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
            <ActivityIndicator color={colors.brandPrimary} />
            <AppText tone="secondary" variant="bodySmall" style={{ marginTop: spacing.sm }}>
              Loading your saved items...
            </AppText>
          </View>
        ) : errorMode === 'blocking' ? (
          <ErrorStateView subject="your saved items" error={error} onRetry={refetch} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="bookmark-outline"
            title={filter === 'all' ? 'Nothing saved yet' : `No saved ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()}`}
            description="Tap the bookmark icon on any thread, resource, event or opportunity and it will show up here for later."
            actionLabel="Browse the forum"
            onAction={() => router.push(getFeedRoute(user?.role) as any)}
          />
        ) : (
          <View style={isDesktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: 16 } : { gap: spacing.sm }}>
          {errorMode === 'inline' ? (
            <ErrorStateView compact subject="your latest saved items" error={error} onRetry={refetch} style={isDesktop ? { flexBasis: '100%' } : undefined} />
          ) : null}
          {visible.map((item) => (
            <SolidCard key={item.id} radius={18} style={{ padding: spacing.md, ...(isDesktop ? { flexGrow: 1, flexBasis: '48%', minWidth: 340 } : {}) }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    backgroundColor: colors.divider,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name={KIND_ICON[item.kind]} size={18} color={colors.brandPrimary} />
                </View>

                <Pressable
                  onPress={() => openItem(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${KIND_LABEL[item.kind]}: ${item.title}`}
                  style={{ flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center' }}
                >
                  <AppText variant="caption" weight="bold" tone="brand" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    {KIND_LABEL[item.kind]}
                  </AppText>
                  <AppText weight="bold" style={{ flexShrink: 1, flexWrap: 'wrap', marginTop: 2, lineHeight: 20 }}>
                    {item.title}
                  </AppText>
                  {item.subtitle ? (
                    <AppText tone="secondary" variant="bodySmall" style={{ flexShrink: 1, flexWrap: 'wrap', marginTop: 2, lineHeight: 18 }}>
                      {item.subtitle}
                    </AppText>
                  ) : null}
                  <AppText tone="secondary" variant="caption" style={{ marginTop: 4 }}>
                    {savedAtLabel(item.savedAt)}
                  </AppText>
                </Pressable>

                <Pressable
                  onPress={() => unsave.mutate(item)}
                  disabled={unsave.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.title} from saved`}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.divider,
                  }}
                >
                  <Ionicons name="bookmark" size={18} color={colors.brandPrimary} />
                </Pressable>
              </View>
            </SolidCard>
          ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
