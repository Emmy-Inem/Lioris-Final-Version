import React, { useState } from 'react';
import { FlatList, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { ChipSelect } from '@/components/ChipSelect';
import { SolidCard } from '@/components/SolidCard';
import { MarketplaceItemCard } from '@/components/MarketplaceItemCard';
import { EmptyState } from '@/components/EmptyState';
import { SellItemModal } from '@/components/SellItemModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/context/ToastContext';
import { listMarketplaceListings, createListing } from '@/api/marketplace';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useCampusScope } from '@/hooks/useCampusScope';

const CATEGORIES = [
 { id: 'All Categories', label: 'All Categories', icon: 'grid-outline' as const },
 { id: 'Wishlist', label: 'Wishlist & Requests', icon: 'heart-outline' as const },
 { id: 'Electronics', label: 'Electronics & Tech', icon: 'laptop-outline' as const },
 { id: 'Books/Academic', label: 'Books & Notes', icon: 'book-outline' as const },
 { id: 'Furniture/Room Accessories', label: 'Hostel & Furniture', icon: 'bed-outline' as const },
];

const CONDITIONS = ['All Conditions', 'New', 'Like New', 'Fair'];

export default function MarketplaceScreen() {
 const { colors, spacing, radius, isDark } = useTheme();
 const { isDesktop } = useResponsive();
 const toast = useToast();
 const queryClient = useQueryClient();
 const [query, setQuery] = useState('');
 const debouncedQuery = useDebouncedValue(query);
 const [category, setCategory] = useState('All Categories');
 const [condition, setCondition] = useState('All Conditions');
 const [sellModalOpen, setSellModalOpen] = useState(false);
 const { campusCode } = useCampusScope();

 const { data: listings, isLoading } = useQuery({
 queryKey: ['marketplace', debouncedQuery, category, condition, campusCode],
 queryFn: () => listMarketplaceListings({ q: debouncedQuery || undefined, category: category as any, condition: condition as any, campusCode }),
 });

 async function handlePublish(payload: Parameters<typeof createListing>[0]) {
 await createListing(payload);
 queryClient.invalidateQueries({ queryKey: ['marketplace'] });
 toast.success('Your listing is live on the campus marketplace!');
 }

 return (
    <ScreenContainer glow={false}>
      {isDesktop ? (
        <ScrollView style={{ flex: 1, width: '100%' }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: 60 }}
        >
          {/* Top Header Bar */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <View>
              <AppText variant="h1" weight="bold">
                Campus Marketplace
              </AppText>
              <AppText tone="secondary" variant="bodySmall">
                Buy, sell, and swap gadgets, textbooks, and hostel essentials with verified campus escrow
              </AppText>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.pastelPrimaryBg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill }}>
                <Ionicons name="shield-checkmark" size={16} color={colors.brandPrimary} />
                <AppText variant="caption" weight="bold" tone="brand">Campus Escrow Protected</AppText>
              </View>

              <Pressable
                onPress={() => setSellModalOpen(true)}
                style={{
                  backgroundColor: colors.brandPrimary,
                  borderRadius: radius.pill,
                  paddingHorizontal: 18,
                  paddingVertical: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Ionicons name="add" size={18} color="#FFFFFF" />
                <AppText variant="bodySmall" weight="bold" tone="inverse">
                  List an Item
                </AppText>
              </Pressable>
            </View>
          </View>

          {/* Filter & Search Toolbar */}
          <SolidCard radius={18} style={{ padding: spacing.md, marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' }}>
              {/* Search Field */}
              <View
                style={{
                  flex: 1,
                  minWidth: 260,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.background,
                  borderRadius: radius.pill,
                  paddingHorizontal: spacing.md,
                  height: 40,
                  borderWidth: 1,
                  borderColor: colors.border,
                  gap: spacing.sm,
                }}
              >
                <Ionicons name="search" size={16} color={colors.textSecondary} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search items, laptops, textbooks, furniture..."
                  placeholderTextColor={colors.textSecondary}
                  style={{ flex: 1, color: colors.textPrimary, fontSize: 13, outlineStyle: 'none' as any }}
                />
                {query ? (
                  <Pressable onPress={() => setQuery('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                  </Pressable>
                ) : null}
              </View>

              {/* Category Pills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, minWidth: 0 }} contentContainerStyle={{ gap: 8 }}>
                {CATEGORIES.map((cat) => {
                  const isSelected = category === cat.id;
                  return (
                    <Pressable
                      key={cat.id}
                      onPress={() => setCategory(cat.id)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: radius.pill,
                        backgroundColor: isSelected ? colors.brandPrimary : colors.background,
                        borderWidth: 1,
                        borderColor: isSelected ? colors.brandPrimary : colors.border,
                      }}
                    >
                      <Ionicons
                        name={cat.icon}
                        size={14}
                        color={isSelected ? '#FFFFFF' : colors.textSecondary}
                      />
                      <AppText
                        variant="bodySmall"
                        weight={isSelected ? 'bold' : 'medium'}
                        style={{ color: isSelected ? '#FFFFFF' : colors.textPrimary, fontSize: 12 }}
                      >
                        {cat.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </SolidCard>

          {/* Listings Count */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <AppText variant="h3" weight="bold">
              Available Listings ({(listings ?? []).length})
            </AppText>
          </View>

          {/* Multi-Column Responsive Grid with Non-Stretching Items */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            {(listings ?? []).map((item) => (
              <View key={item.id} style={{ flexGrow: 1, flexBasis: 0, minWidth: 280, maxWidth: 380 }}>
                <MarketplaceItemCard item={item} />
              </View>
            ))}
          </View>

          {(listings ?? []).length === 0 && !isLoading ? (
            <EmptyState title="No listings found" description="Try a different search keyword or category filter." />
          ) : null}
        </ScrollView>
      ) : (
 /* Mobile Layout */
 <>
 <AppHeader />

 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm, marginBottom: spacing.md }}>
        <View style={{ flex: 1, minWidth: 0, marginRight: spacing.sm }}>
          <AppText variant="h1" weight="bold" numberOfLines={1}>
            Campus Marketplace
          </AppText>
          <AppText tone="secondary" variant="bodySmall" numberOfLines={1}>
            Buy & sell books, gadgets, and campus gear with escrow
          </AppText>
        </View>
        <Pressable
          onPress={() => setSellModalOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Sell an item"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: colors.brandPrimary,
            borderRadius: radius.pill,
            paddingHorizontal: spacing.md,
            paddingVertical: 8,
            flexShrink: 0,
          }}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <AppText weight="bold" tone="inverse" variant="caption">
            List Item
          </AppText>
        </Pressable>
      </View>

 <View style={{ flex: 1 }}>
 <View
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 gap: spacing.sm,
 backgroundColor: colors.surface,
 borderRadius: radius.pill,
 borderWidth: 1,
 borderColor: colors.border,
 paddingHorizontal: spacing.md,
 height: 42,
 marginBottom: spacing.sm,
 }}
 >
 <Ionicons name="search" size={16} color={colors.textSecondary} />
 <TextInput
 value={query}
 onChangeText={setQuery}
 placeholder="Search textbooks, tech, appliances..."
 placeholderTextColor={colors.textSecondary}
 style={{ flex: 1, color: colors.textPrimary, fontSize: 13 }}
 />
 </View>
 <View style={{ marginBottom: spacing.sm }}>
 <ChipSelect options={CATEGORIES.map((c) => c.id)} selected={[category]} onToggle={setCategory} />
 </View>
 <View style={{ marginBottom: spacing.lg }}>
 <ChipSelect options={CONDITIONS} selected={[condition]} onToggle={setCondition} />
 </View>

 <FlatList
 data={listings ?? []}
 keyExtractor={(item) => item.id}
 numColumns={2}
 columnWrapperStyle={{ gap: spacing.md }}
 contentContainerStyle={{ gap: spacing.md, paddingBottom: 130 }}
 renderItem={({ item }) => <MarketplaceItemCard item={item} />}
 showsVerticalScrollIndicator={false}
 initialNumToRender={10}
 maxToRenderPerBatch={10}
 windowSize={7}
 removeClippedSubviews
 ListEmptyComponent={!isLoading ? <EmptyState title="No listings found" description="Try a different search or filter." /> : null}
 />
 </View>
 </>
 )}

 <SellItemModal visible={sellModalOpen} onClose={() => setSellModalOpen(false)} onPublish={handlePublish} />
 </ScreenContainer>
 );
}
