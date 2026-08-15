import React, { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { ChipSelect } from '@/components/ChipSelect';
import { MarketplaceItemCard } from '@/components/MarketplaceItemCard';
import { EmptyState } from '@/components/EmptyState';
import { AuthHeroBackground } from '@/components/AuthHeroBackground';
import { SellItemModal } from '@/components/SellItemModal';
import { useTheme } from '@/theme/ThemeProvider';
import { listMarketplaceListings, createListing } from '@/api/marketplace';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const CATEGORIES = ['All Categories', 'Wishlist', 'Electronics', 'Books/Academic', 'Furniture/Room Accessories'];
const CONDITIONS = ['All Conditions', 'New', 'Like New', 'Fair'];

export default function MarketplaceScreen() {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query);
  const [category, setCategory] = useState('All Categories');
  const [condition, setCondition] = useState('All Conditions');
  const [sellModalOpen, setSellModalOpen] = useState(false);

  const { data: listings, isLoading } = useQuery({
    queryKey: ['marketplace', debouncedQuery, category, condition],
    queryFn: () => listMarketplaceListings({ q: debouncedQuery || undefined, category: category as any, condition: condition as any }),
  });

  async function handlePublish(payload: Parameters<typeof createListing>[0]) {
    await createListing(payload);
    queryClient.invalidateQueries({ queryKey: ['marketplace'] });
  }

  return (
    <ScreenContainer noPadding glow={false}>
      <View style={{ paddingHorizontal: spacing.lg }}>
        <AppHeader />
      </View>

      <AuthHeroBackground height={84}>
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg }}>
          <AppText variant="h2" weight="bold" tone="inverse">
            Campus Marketplace 🛍️
          </AppText>
          <Pressable
            onPress={() => setSellModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Sell an item"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: 'rgba(255,255,255,0.2)',
              borderRadius: radius.pill,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            <Ionicons name="add-circle" size={16} color="#FFFFFF" />
            <AppText weight="bold" tone="inverse" variant="bodySmall">
              Sell
            </AppText>
          </Pressable>
        </View>
      </AuthHeroBackground>

      <View style={{ flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
        <AppTextField label="" placeholder="Search products, books, gear..." value={query} onChangeText={setQuery} />
        <View style={{ marginBottom: spacing.sm }}>
          <ChipSelect options={CATEGORIES} selected={[category]} onToggle={setCategory} />
        </View>
        <View style={{ marginBottom: spacing.lg }}>
          <ChipSelect options={CONDITIONS} selected={[condition]} onToggle={setCondition} />
        </View>

        <FlatList
          data={listings ?? []}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md }}
          contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xxl }}
          renderItem={({ item }) => <MarketplaceItemCard item={item} />}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
          ListEmptyComponent={!isLoading ? <EmptyState title="No listings found" description="Try a different search or filter." /> : null}
        />
      </View>

      <Pressable
        onPress={() => setSellModalOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Sell an item"
        style={{
          position: 'absolute',
          bottom: spacing.xl,
          right: spacing.lg,
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: colors.brandPrimary,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 8,
          elevation: 4,
        }}
      >
        <Ionicons name="add" size={26} color="#FFFFFF" />
      </Pressable>

      <SellItemModal visible={sellModalOpen} onClose={() => setSellModalOpen(false)} onPublish={handlePublish} />
    </ScreenContainer>
  );
}
