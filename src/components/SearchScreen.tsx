import React, { useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from './ScreenContainer';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { EmptyState } from './EmptyState';
import { PostCard } from './PostCard';
import { EventCard } from './EventCard';
import { ResourceCard } from './ResourceCard';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { listFeedPosts } from '@/api/posts';
import { listEvents } from '@/api/events';
import { listResources } from '@/api/resources';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

type SearchTab = 'posts' | 'events' | 'resources';

export function SearchScreen() {
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<SearchTab>('posts');
  const trimmed = query.trim();
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

  const { data: resources, isLoading: resourcesLoading } = useQuery({
    queryKey: ['search', 'resources', debouncedTrimmed],
    queryFn: () => listResources({ q: debouncedTrimmed }),
    enabled: tab === 'resources' && debouncedTrimmed.length > 0,
  });

  const isLoading = tab === 'posts' ? postsLoading : tab === 'events' ? eventsLoading : resourcesLoading;

  return (
    <ScreenContainer glow={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: isDesktop ? spacing.xs : spacing.lg, marginBottom: spacing.md }}>
        {!isDesktop && (
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close search"
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <AppTextField
            label=""
            placeholder="Search threads, events, study resources..."
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
        {(['posts', 'events', 'resources'] as const).map((t) => {
          const selected = tab === t;
          const label = t === 'posts' ? 'Threads' : t === 'events' ? 'Events' : 'Resources';
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radius.pill,
                backgroundColor: selected ? colors.brandPrimary : colors.surface,
                borderWidth: 1,
                borderColor: selected ? colors.brandPrimary : colors.border,
              }}
            >
              <AppText variant="bodySmall" weight="semiBold" tone={selected ? 'inverse' : 'secondary'}>
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {trimmed.length === 0 ? (
        <EmptyState title="Search Campus Knowledge" description="Find forum threads, campus events, and academic past questions." />
      ) : tab === 'posts' ? (
        <FlatList
          data={posts ?? []}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={true}
          contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 130 }}
          renderItem={({ item }) => <PostCard post={item} />}
          ListEmptyComponent={!isLoading ? <EmptyState title="No posts found" description={`No results for "${debouncedTrimmed}".`} /> : null}
        />
      ) : tab === 'events' ? (
        <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 130 }}>
          <View style={isDesktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: 16 } : undefined}>
            {(events ?? []).map((item) => (
              <View key={item.id} style={isDesktop ? { width: 'calc(50% - 8px)' as any, minWidth: 320, maxWidth: 580 } : { marginBottom: spacing.sm }}>
                <EventCard event={item} />
              </View>
            ))}
          </View>
          {(events ?? []).length === 0 && !isLoading ? (
            <EmptyState title="No events found" description={`No results for "${debouncedTrimmed}".`} />
          ) : null}
        </ScrollView>
      ) : (
        <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 130 }}>
          <View style={isDesktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: 16 } : undefined}>
            {(resources ?? []).map((item) => (
              <View key={item.id} style={isDesktop ? { width: 'calc(50% - 8px)' as any, minWidth: 320, maxWidth: 580 } : { marginBottom: spacing.sm }}>
                <ResourceCard resource={item} />
              </View>
            ))}
          </View>
          {(resources ?? []).length === 0 && !isLoading ? (
            <EmptyState title="No resources found" description={`No results for "${debouncedTrimmed}".`} />
          ) : null}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}
