import React, { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from './ScreenContainer';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { EmptyState } from './EmptyState';
import { MarketplaceItemCard } from './MarketplaceItemCard';
import { MarketplaceCardSkeletonGrid } from './Skeleton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { listMyMarketplaceListings } from '@/api/marketplace';

type FilterKey = 'all' | 'active' | 'sold' | 'removed';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'sold', label: 'Sold' },
  { key: 'removed', label: 'Removed' },
];

/**
 * A seller's own listings - active and sold - with the same inline
 * edit/mark-sold/delete controls MarketplaceItemCard already renders for an
 * owned card in the shared feed. Reachable from the Marketplace screen's
 * "My Listings" link; see app/(student)/marketplace-mine.tsx (re-exported
 * for alumni the same way app/(alumni)/marketplace.tsx re-exports the
 * student Marketplace screen).
 */
export function MyListingsScreen() {
  const { colors, spacing } = useTheme();
  const { isDesktop } = useResponsive();
  const [filter, setFilter] = useState<FilterKey>('all');

  // 'marketplace' as the key's first segment so the existing
  // queryClient.invalidateQueries({ queryKey: ['marketplace'] }) calls in
  // MarketplaceItemCard (mark sold / delete) and the main Marketplace screen
  // (publish) already invalidate this list too - no extra wiring needed.
  const { data: listings, isLoading, isError, refetch } = useQuery({
    queryKey: ['marketplace', 'mine'],
    queryFn: () => listMyMarketplaceListings(),
  });

  const visible = (listings ?? []).filter((item) => {
    if (filter === 'removed') return !!(item as any).isRemoved;
    // A removed listing is moderation history, not an active/sold one - keep
    // it out of those two tabs so it only ever shows under "Removed".
    if (filter === 'active') return !(item as any).isSold && !(item as any).isRemoved;
    if (filter === 'sold') return !!(item as any).isSold && !(item as any).isRemoved;
    return true;
  });

  return (
    <ScreenContainer glow={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: isDesktop ? spacing.xs : spacing.sm, marginBottom: spacing.sm }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 }}
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant={isDesktop ? 'h1' : 'h2'} weight="bold">
            My Listings
          </AppText>
          <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 2 }}>
            Everything you have listed on the campus marketplace, sold or still live.
          </AppText>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
        {FILTERS.map((f) => {
          const selected = filter === f.key;
          const count =
            f.key === 'all'
              ? (listings ?? []).length
              : f.key === 'removed'
              ? (listings ?? []).filter((item) => !!(item as any).isRemoved).length
              : (listings ?? []).filter(
                  (item) => (f.key === 'sold') === !!(item as any).isSold && !(item as any).isRemoved,
                ).length;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${f.label}, ${count} listings`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                minHeight: 40,
                paddingHorizontal: spacing.md,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: selected ? colors.brandPrimary : colors.border,
                backgroundColor: selected ? colors.brandPrimary : colors.surface,
              }}
            >
              <AppText variant="bodySmall" weight="bold" tone={selected ? 'inverse' : 'secondary'}>
                {f.label}
              </AppText>
              <AppText variant="caption" weight="bold" tone={selected ? 'inverse' : 'secondary'}>
                {count}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <MarketplaceCardSkeletonGrid count={4} />
      ) : isError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Could not load your listings"
          description="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="pricetag-outline"
          title={filter === 'all' ? "You haven't listed anything yet" : `No ${filter} listings`}
          description="Tap “List an Item” from the Marketplace screen to publish your first listing."
          actionLabel="Browse the marketplace"
          onAction={() => router.back()}
        />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md }}
          contentContainerStyle={{ gap: spacing.md, paddingBottom: isDesktop ? 40 : 130 }}
          renderItem={({ item }) => (
            <View>
              {(item as any).isRemoved ? (
                <View
                  style={{
                    backgroundColor: `${colors.critical}15`,
                    borderRadius: 12,
                    padding: spacing.sm,
                    marginBottom: 6,
                    gap: 4,
                  }}
                >
                  <Badge label="Removed by moderation" tone="critical" />
                  {(item as any).takedownReason ? (
                    <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                      Reason: {(item as any).takedownReason}
                    </AppText>
                  ) : null}
                </View>
              ) : null}
              <MarketplaceItemCard item={item} />
            </View>
          )}
          showsVerticalScrollIndicator={false}
          refreshing={isLoading}
          onRefresh={refetch}
        />
      )}
    </ScreenContainer>
  );
}
