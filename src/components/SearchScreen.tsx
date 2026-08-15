import React, { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from './ScreenContainer';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { EmptyState } from './EmptyState';
import { PostCard } from './PostCard';
import { EventCard } from './EventCard';
import { useTheme } from '@/theme/ThemeProvider';
import { listFeedPosts } from '@/api/posts';
import { listEvents } from '@/api/events';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

type SearchTab = 'posts' | 'events';

/**
 * Backs the search icon in AppHeader — previously wired to
 * `onPress={() => {}}` on every single screen across every role, a
 * true no-op. Both `listFeedPosts` and `listEvents` already support a
 * real `q` text-search param (PRD Section 16); this screen is the
 * first thing that actually calls it from a dedicated search UI rather
 * than only the inline search bar already on the Forum tab.
 */
export function SearchScreen() {
  const { colors, spacing, radius } = useTheme();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<SearchTab>('posts');
  const trimmed = query.trim();
  // Debounced separately from `trimmed` so clearing the box still
  // instantly reverts to the welcome placeholder below, while the
  // actual network-triggering queries wait for typing to settle.
  const debouncedTrimmed = useDebouncedValue(trimmed);

  const { data: posts, isLoading: postsLoading } = useQuery({
    queryKey: ['search', 'posts', debouncedTrimmed],
    queryFn: () => listFeedPosts({ q: debouncedTrimmed }),
    enabled: tab === 'posts' && debouncedTrimmed.length > 0,
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['search', 'events', debouncedTrimmed],
    queryFn: () => listEvents({ q: debouncedTrimmed }),
    enabled: tab === 'events' && debouncedTrimmed.length > 0,
  });

  const isLoading = tab === 'posts' ? postsLoading : eventsLoading;

  return (
    <ScreenContainer glow={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.lg, marginBottom: spacing.md }}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close search"
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppTextField
            label=""
            placeholder="Search posts and events..."
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
        {(['posts', 'events'] as const).map((t) => {
          const selected = tab === t;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={t === 'posts' ? 'Posts' : 'Events'}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radius.pill,
                backgroundColor: selected ? colors.brandPrimary : colors.divider,
              }}
            >
              <AppText variant="bodySmall" weight="semiBold" tone={selected ? 'inverse' : 'secondary'}>
                {t === 'posts' ? 'Posts' : 'Events'}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {trimmed.length === 0 ? (
        <EmptyState title="Search Lioris" description="Find posts and events by title, content, or category." />
      ) : tab === 'posts' ? (
        <FlatList
          data={posts ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PostCard post={item} />}
          ListEmptyComponent={!isLoading ? <EmptyState title="No posts found" description={`No results for "${debouncedTrimmed}".`} /> : null}
        />
      ) : (
        <FlatList
          data={events ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <EventCard event={item} />}
          ListEmptyComponent={!isLoading ? <EmptyState title="No events found" description={`No results for "${debouncedTrimmed}".`} /> : null}
        />
      )}
    </ScreenContainer>
  );
}
